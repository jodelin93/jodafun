import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SessionUser } from '../auth/session';
import { RoomStore } from '../game/room-store';
import { generateRoomCode, normalizeRoomCode } from '../game/game.utils';
import { presenceName } from '../game/presence';
import type { SeatListener, TeamRoomGame } from '../game/team-room';
import { secureRandomInt, type RandomInt } from '../lib/random';
import { createMatch, forfeitMatch, parseMove, pass, playTile, playersFor, privateView, publicView, teamOf } from './engine/match';
import { DEFAULT_TARGET_SCORE, MAX_TARGET_SCORE, MIN_TARGET_SCORE } from './engine/rules';
import type { Mode, RuleResult } from './engine/types';
import { DominoResults } from './dominoes-results';
import {
  DOMINOES_GAME_TYPE,
  type DominoAck,
  type DominoErrorCode,
  type DominoOutcome,
  type DominoPlayer,
  type DominoPrivateView,
  type DominoRoom,
  type DominoRoomView,
  type ProcessedRequest,
} from './dominoes.types';

// How the service reaches sockets; the gateway backs this with the Socket.IO server
export interface DominoEmitter {
  toRoom(roomId: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
  join(socketId: string, roomId: string): void;
  leave(socketId: string, roomId: string): void;
}

type Failure = Extract<DominoAck, { ok: false }>;

const STALE_SOCKET_PREFIX = 'stale:';
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PROCESSED_KEPT = 30;
const SAVE_ATTEMPTS = 4;

// How long an absent player keeps their seat
const graceMs = (room: DominoRoom) =>
  room.status === 'playing'
    ? Number(process.env.ROOM_GRACE_DOMINOES_MS) || 3 * 60_000
    : Number(process.env.ROOM_GRACE_LOBBY_MS) || 5 * 60_000;

const fail = (code: DominoErrorCode, extra: Partial<Omit<Failure, 'ok' | 'code'>> = {}): DominoAck<never> => ({
  ok: false,
  code,
  ...extra,
});

const validKey = (key: unknown): key is string => typeof key === 'string' && key.length >= 8 && key.length <= 100;
const isMode = (mode: unknown): mode is Mode => mode === 'head-to-head' || mode === 'partners';
const validTarget = (target: number) => Number.isInteger(target) && target >= MIN_TARGET_SCORE && target <= MAX_TARGET_SCORE;

/**
 * Dominoes rooms: seats and teams, readiness, the match, reconnection and results.
 * Every change to a room runs through serialize(), one at a time per room; the gateway only parses
 * input and resolves who is asking. The process that owns the RoomStore owns every room.
 * There is no turn timer: nobody is ever passed automatically (a pass is only legal when the player
 * has no tile that fits, and only they may make it). A player who stays away loses the seat when
 * the grace period ends, which forfeits a started match for their side.
 */
@Injectable()
export class DominoesService implements OnModuleInit, OnModuleDestroy, TeamRoomGame {
  private emitter: DominoEmitter | null = null;
  private queues = new Map<string, Promise<unknown>>();
  private graceTimers = new Map<string, { timer: NodeJS.Timeout; endsAt: number }>(); // by player id
  private saving = new Set<string>(); // match ids being written
  seatListener: SeatListener | null = null;
  random: RandomInt = secureRandomInt;

  constructor(
    private rooms: RoomStore,
    private results: DominoResults,
  ) {}

  attach(emitter: DominoEmitter) {
    this.emitter = emitter;
  }

  // Rooms restored from Redis come back with everyone disconnected until they rejoin
  async onModuleInit() {
    let restored: DominoRoom[] = [];
    try {
      restored = (await this.rooms.loadAll()).filter((r): r is DominoRoom => r.gameType === DOMINOES_GAME_TYPE);
    } catch (error) {
      console.error('Failed to restore Dominoes rooms:', error);
      return;
    }
    const now = Date.now();
    for (const room of restored) {
      room.pendingResults ??= [];
      room.processed ??= {};
      if (room.players.length === 0) {
        // An empty room is only kept for results it still has to write
        if (room.pendingResults.length === 0) this.rooms.delete(room.id);
        else this.flushResults(room);
        continue;
      }
      for (const p of room.players) {
        if (!p.socketId.startsWith(STALE_SOCKET_PREFIX)) p.socketId = STALE_SOCKET_PREFIX + p.socketId;
        if (p.connected) {
          p.connected = false;
          p.disconnectedAt = now;
        }
        this.startGraceTimer(room, p);
      }
      this.rooms.save(room);
      this.flushResults(room);
    }
  }

  onModuleDestroy() {
    this.graceTimers.forEach(({ timer }) => clearTimeout(timer));
  }

  // --- Lobby ---

  create(socketId: string, user: SessionUser | null, input: { name?: unknown; playerKey?: unknown; mode?: unknown; targetScore?: unknown }) {
    if (!user) return Promise.resolve(fail('AUTH_REQUIRED'));
    if (!validKey(input.playerKey)) return Promise.resolve(fail('BAD_REQUEST'));
    if (!isMode(input.mode)) return Promise.resolve(fail('INVALID_MODE'));
    if (this.seatOf(socketId)) return Promise.resolve(fail('ALREADY_SEATED'));
    const target = input.targetScore === undefined ? DEFAULT_TARGET_SCORE : Number(input.targetScore);
    if (!validTarget(target)) return Promise.resolve(fail('INVALID_TARGET'));

    const now = Date.now();
    const player = this.newPlayer(socketId, user, input.name, input.playerKey, 0);
    const room: DominoRoom = {
      gameType: DOMINOES_GAME_TYPE,
      id: generateRoomCode(code => this.rooms.has(code)),
      hostId: player.id,
      mode: input.mode,
      capacity: playersFor(input.mode) as 2 | 4,
      targetScore: target,
      players: [player],
      status: 'lobby',
      match: null,
      matchStartedAt: null,
      matchPlayers: null,
      outcome: null,
      pendingResults: [],
      processed: {},
      createdAt: now,
      updatedAt: now,
    };
    this.rooms.save(room);
    this.emitter?.join(socketId, room.id);
    this.seatListener?.seated(socketId);
    this.broadcast(room);
    console.log(`Dominoes room ${room.id} created (${room.mode})`);
    return Promise.resolve({ ok: true as const, roomId: room.id, playerId: player.id });
  }

  // Joins a free seat, or takes back this player's own seat (refresh, reconnect, another tab)
  join(socketId: string, user: SessionUser | null, input: { roomId?: unknown; name?: unknown; playerKey?: unknown }) {
    const other = this.otherGame(input.roomId);
    if (other) return Promise.resolve(other);
    return this.inRoom(input.roomId, room => {
      if (!user) return fail('AUTH_REQUIRED');
      if (!validKey(input.playerKey)) return fail('BAD_REQUEST');
      const own = this.ownSeat(room, user, input.playerKey);
      if (own === 'taken') return fail('ALREADY_SEATED');
      if (own) return this.reclaim(room, own, socketId);

      const elsewhere = this.seatOf(socketId);
      if (elsewhere && elsewhere.room !== room) return fail('ALREADY_SEATED');
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      const seat = this.freeSeats(room)[0];
      if (seat === undefined) return fail('ROOM_FULL');

      const player = this.newPlayer(socketId, user, input.name, input.playerKey, seat);
      room.players.push(player);
      this.rooms.save(room);
      this.emitter?.join(socketId, room.id);
      this.seatListener?.seated(socketId);
      this.broadcast(room);
      return { ok: true as const, roomId: room.id, playerId: player.id, rejoined: false };
    });
  }

  // Only takes back an existing seat (with its hand, mid-match too); never sits a newcomer down
  rejoin(socketId: string, user: SessionUser | null, input: { roomId?: unknown; playerKey?: unknown }) {
    const other = this.otherGame(input.roomId);
    if (other) return Promise.resolve(other);
    return this.inRoom(input.roomId, room => {
      if (!user) return fail('AUTH_REQUIRED');
      const own = this.ownSeat(room, user, input.playerKey);
      if (!own || own === 'taken') return fail('NOT_SEATED');
      return this.reclaim(room, own, socketId);
    });
  }

  // Seats (and so teams) can only change in the lobby
  chooseSeat(socketId: string, input: { roomId?: unknown; seat?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      const seat = Number(input.seat);
      if (seat === player.seat) return { ok: true as const };
      if (!this.freeSeats(room).includes(seat)) return fail('SEAT_TAKEN');
      player.seat = seat;
      player.isReady = false;
      this.changed(room);
      return { ok: true as const };
    });
  }

  setTarget(socketId: string, input: { roomId?: unknown; targetScore?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.hostId !== player.id) return fail('NOT_HOST');
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      const target = Number(input.targetScore);
      if (!validTarget(target)) return fail('INVALID_TARGET');
      if (target !== room.targetScore) {
        room.targetScore = target;
        room.players.forEach(p => (p.isReady = false));
        this.changed(room);
      }
      return { ok: true as const };
    });
  }

  ready(socketId: string, input: { roomId?: unknown; ready?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      player.isReady = input.ready === true;
      this.changed(room);
      return { ok: true as const };
    });
  }

  // The host starts the match once every seat is taken and every player is connected and ready
  start(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.hostId !== player.id) return fail('NOT_HOST');
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      const full = room.players.length === room.capacity;
      if (!full || !room.players.every(p => p.isReady && p.connected)) return fail('NOT_READY');
      this.startMatch(room);
      this.changed(room);
      return { ok: true as const };
    });
  }

  // After a finished match, everyone goes back to the lobby (same seats) to ready up again
  rematch(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, room => {
      if (room.status !== 'finished') return fail('NOT_FINISHED');
      room.status = 'lobby';
      room.match = null;
      room.players.forEach(p => (p.isReady = false));
      room.processed = {};
      this.changed(room);
      return { ok: true as const };
    });
  }

  leave(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      this.removePlayer(room, player, false);
      return { ok: true as const };
    });
  }

  // --- Play ---

  play(socketId: string, input: { roomId?: unknown; version?: unknown; requestId?: unknown; tile?: unknown; end?: unknown }) {
    return this.move(socketId, input, (room, seat) => {
      const parsed = parseMove({ tile: input.tile, end: input.end });
      if (!parsed.ok) return { ok: false, error: { code: 'BAD_MOVE' } };
      return playTile(room.match!, seat, parsed.move, this.random);
    });
  }

  // Only accepted when nothing in the player's hand fits (the engine checks)
  pass(socketId: string, input: { roomId?: unknown; version?: unknown; requestId?: unknown }) {
    return this.move(socketId, input, (room, seat) => pass(room.match!, seat, this.random));
  }

  // --- Connections ---

  disconnected(socketId: string) {
    for (const room of this.rooms.dominoRooms()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (!player) continue;
      void this.serialize(room.id, () => {
        if (player.socketId !== socketId || !room.players.includes(player)) return;
        player.connected = false;
        player.disconnectedAt = Date.now();
        this.startGraceTimer(room, player);
        this.changed(room);
      });
    }
  }

  // Used by invitations: whether the inviter can bring someone into their room
  inviteRoom(socketId: string, roomId: unknown): { room: DominoRoom; freeSeats: number } | null {
    const found = this.findPlayer(socketId, roomId);
    if (!found || found.room.status !== 'lobby') return null;
    return { room: found.room, freeSeats: this.freeSeats(found.room).length };
  }

  seatedSocket(socketId: string): boolean {
    return this.seatOf(socketId) !== null;
  }

  // --- Views ---

  roomView(room: DominoRoom): DominoRoomView {
    return {
      id: room.id,
      gameType: DOMINOES_GAME_TYPE,
      mode: room.mode,
      capacity: room.capacity,
      targetScore: room.targetScore,
      status: room.status,
      seats: Array.from({ length: room.capacity }, (_, seat) => {
        const p = room.players.find(x => x.seat === seat);
        return {
          seat,
          team: room.capacity === 4 ? seat % 2 : seat,
          player: p
            ? {
                id: p.id,
                name: p.name,
                connected: p.connected,
                graceEndsAt: p.connected ? null : (this.graceTimers.get(p.id)?.endsAt ?? null),
                isReady: p.isReady,
                isHost: room.hostId === p.id,
              }
            : null,
        };
      }),
      match: room.match ? publicView(room.match) : null,
      outcome: room.outcome,
    };
  }

  privateViewOf(room: DominoRoom, player: DominoPlayer): DominoPrivateView {
    return {
      roomId: room.id,
      playerId: player.id,
      seat: player.seat,
      match: room.match ? privateView(room.match, player.seat) : null,
    };
  }

  // --- Internals ---

  // A versioned, idempotent move: a retried request id gets its first answer and changes nothing
  private move(
    socketId: string,
    input: { roomId?: unknown; version?: unknown; requestId?: unknown },
    apply: (room: DominoRoom, seat: number) => RuleResult,
  ) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId)) return fail('BAD_REQUEST_ID');
      const previous = room.processed[player.id]?.find(r => r.requestId === input.requestId);
      if (previous) return previous.ack;

      const match = room.match;
      if (room.status !== 'playing' || !match) return fail('NOT_PLAYING');
      if (input.version !== match.version) return fail('STALE_STATE', { version: match.version });
      let ack: DominoAck<{ version: number }>;
      const result = apply(room, player.seat);
      if (result.ok) {
        room.match = result.state;
        if (result.state.status === 'finished') this.finishMatch(room);
        ack = { ok: true, version: result.state.version };
      } else {
        ack = fail(result.error.code, result.error.params ? { params: { ...result.error.params } } : {});
      }
      this.remember(room, player.id, { requestId: input.requestId, ack });
      if (ack.ok) this.changed(room);
      else this.rooms.save(room);
      return ack;
    });
  }

  private startMatch(room: DominoRoom) {
    room.status = 'playing';
    room.matchStartedAt = Date.now();
    room.match = createMatch({ mode: room.mode, targetScore: room.targetScore }, this.random, randomUUID());
    room.matchPlayers = room.players.map(p => ({ id: p.id, name: p.name, userId: p.userId, seat: p.seat }));
    room.outcome = null;
    room.processed = {};
    room.players.forEach(p => (p.isReady = false));
    console.log(`Dominoes match ${room.match.matchId} started in room ${room.id}`);
  }

  private outcomeOf(room: DominoRoom, forfeitTeam: number | null): DominoOutcome {
    const match = room.match!;
    return {
      matchId: match.matchId,
      winnerTeam: match.winnerTeam,
      scores: [...match.scores],
      forfeit: forfeitTeam !== null,
      forfeitTeam,
      results: structuredClone(match.results),
      finishedAt: Date.now(),
    };
  }

  private finishMatch(room: DominoRoom) {
    room.status = 'finished';
    room.outcome = this.outcomeOf(room, null);
    this.recordResult(room);
  }

  // Leaving a started match (or staying away past the grace period) forfeits it for that side once
  // a tile has been played; before that the room just goes back to the lobby. The seat is freed
  // either way.
  private removePlayer(room: DominoRoom, player: DominoPlayer, lost: boolean) {
    this.clearGraceTimer(player);
    const match = room.match;
    if (room.status === 'playing' && match) {
      if (match.turnsPlayed > 0) {
        room.match = forfeitMatch(match, teamOf(match, player.seat));
        room.status = 'finished';
        room.outcome = this.outcomeOf(room, teamOf(match, player.seat));
        this.recordResult(room);
      } else {
        room.status = 'lobby';
        room.match = null;
      }
    }
    room.players = room.players.filter(p => p !== player);
    if (lost) this.emitter?.toSocket(player.socketId, 'dominoes:seatLost', { roomId: room.id });
    this.emitter?.leave(player.socketId, room.id);
    this.seatListener?.unseated(player.socketId);
    room.players.forEach(p => (p.isReady = false));
    if (room.players.length === 0) {
      // Keep the room only until its unsaved results are written
      if (room.pendingResults.length === 0) this.rooms.delete(room.id);
      else this.rooms.save(room);
      return;
    }
    if (room.hostId === player.id) room.hostId = [...room.players].sort((a, b) => a.seat - b.seat)[0].id;
    this.changed(room);
  }

  // Queues the room's outcome for the database. The queue is saved with the room, so a result
  // survives a rematch and a restart until it is written.
  private recordResult(room: DominoRoom) {
    const outcome = room.outcome;
    const match = room.match;
    if (!outcome || !match || !room.matchPlayers || room.matchStartedAt === null) return;
    if (room.pendingResults.some(r => r.outcome.matchId === outcome.matchId)) return;
    room.pendingResults.push({
      outcome: structuredClone(outcome),
      players: structuredClone(room.matchPlayers),
      mode: match.config.mode,
      capacity: match.config.players,
      targetScore: match.config.targetScore,
      rulesVersion: match.rulesVersion,
      startedAt: room.matchStartedAt,
    });
    this.rooms.save(room);
    this.flushResults(room);
  }

  // Writes every queued result with a few retries (the write itself is idempotent); a result still
  // unwritten after that is retried at the next restart or the next finished match in the room
  private flushResults(room: DominoRoom) {
    for (const pending of room.pendingResults) {
      const matchId = pending.outcome.matchId;
      if (this.saving.has(matchId)) continue;
      this.saving.add(matchId);
      const attempt = async (n: number): Promise<void> => {
        try {
          await this.results.save(pending);
          this.saving.delete(matchId);
          await this.serialize(room.id, () => {
            room.pendingResults = room.pendingResults.filter(r => r.outcome.matchId !== matchId);
            if (room.players.length === 0 && room.pendingResults.length === 0) this.rooms.delete(room.id);
            else if (this.rooms.getDominoes(room.id) === room) this.rooms.save(room);
          });
        } catch (error) {
          console.error(`Failed to save Dominoes match ${matchId} (attempt ${n}):`, error);
          if (n < SAVE_ATTEMPTS) setTimeout(() => void attempt(n + 1), 2000 * n).unref?.();
          else this.saving.delete(matchId);
        }
      };
      void attempt(1);
    }
  }

  private reclaim(room: DominoRoom, player: DominoPlayer, socketId: string) {
    this.clearGraceTimer(player);
    if (player.socketId !== socketId) {
      // Another tab of the same browser had the seat: it no longer does
      this.emitter?.toSocket(player.socketId, 'dominoes:seatLost', { roomId: room.id });
      this.emitter?.leave(player.socketId, room.id);
      this.seatListener?.unseated(player.socketId);
    }
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    this.emitter?.join(socketId, room.id);
    this.seatListener?.seated(socketId);
    this.changed(room);
    return { ok: true as const, roomId: room.id, playerId: player.id, rejoined: true };
  }

  // This player's seat: same signed-in account and same browser key. Another device of the same
  // account never takes a seat over; it is told the account is already seated.
  private ownSeat(room: DominoRoom, user: SessionUser, playerKey: unknown): DominoPlayer | 'taken' | null {
    const mine = room.players.filter(p => p.userId === user.id);
    const exact = mine.find(p => p.playerKey === playerKey);
    if (exact) return exact;
    return mine.length > 0 ? 'taken' : null;
  }

  private newPlayer(socketId: string, user: SessionUser, name: unknown, playerKey: string, seat: number): DominoPlayer {
    return {
      id: randomUUID(),
      name: presenceName(name, user.name),
      seat,
      userId: user.id,
      playerKey,
      socketId,
      connected: true,
      disconnectedAt: null,
      isReady: false,
    };
  }

  private freeSeats(room: DominoRoom): number[] {
    const taken = new Set(room.players.map(p => p.seat));
    return Array.from({ length: room.capacity }, (_, i) => i).filter(i => !taken.has(i));
  }

  private seatOf(socketId: string): { room: DominoRoom; player: DominoPlayer } | null {
    for (const room of this.rooms.dominoRooms()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) return { room, player };
    }
    return null;
  }

  private findPlayer(socketId: string, roomId: unknown) {
    const room = this.rooms.getDominoes(normalizeRoomCode(roomId));
    const player = room?.players.find(p => p.socketId === socketId);
    return room && player ? { room, player } : null;
  }

  // A code that belongs to another game's room: the client opens that game instead
  private otherGame(roomId: unknown): DominoAck<never> | null {
    const gameType = this.rooms.gameTypeOf(normalizeRoomCode(roomId));
    return gameType && gameType !== DOMINOES_GAME_TYPE ? fail('WRONG_GAME', { params: { gameType } }) : null;
  }

  private inRoom<T>(roomId: unknown, fn: (room: DominoRoom) => T): Promise<T | DominoAck<never>> {
    const code = normalizeRoomCode(roomId);
    return this.serialize(code, () => {
      const room = this.rooms.getDominoes(code);
      return room ? fn(room) : fail('ROOM_NOT_FOUND');
    });
  }

  private asPlayer<T>(socketId: string, roomId: unknown, fn: (room: DominoRoom, player: DominoPlayer) => T) {
    return this.inRoom(roomId, room => {
      const player = room.players.find(p => p.socketId === socketId);
      return player ? fn(room, player) : fail('NOT_SEATED');
    });
  }

  // Runs room changes one at a time per room
  private serialize<T>(roomId: string, fn: () => T | Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(roomId, tail);
    void tail.then(() => {
      if (this.queues.get(roomId) === tail) this.queues.delete(roomId);
    });
    return next;
  }

  private remember(room: DominoRoom, playerId: string, entry: ProcessedRequest) {
    const list = (room.processed[playerId] ??= []);
    list.push(entry);
    if (list.length > PROCESSED_KEPT) list.splice(0, list.length - PROCESSED_KEPT);
  }

  private changed(room: DominoRoom) {
    this.rooms.save(room);
    this.broadcast(room);
  }

  // Public state to the room, then each player's own hand to that player only
  private broadcast(room: DominoRoom) {
    if (!this.emitter) return;
    this.emitter.toRoom(room.id, 'dominoes:room', this.roomView(room));
    for (const p of room.players) {
      if (p.connected) this.emitter.toSocket(p.socketId, 'dominoes:private', this.privateViewOf(room, p));
    }
  }

  private startGraceTimer(room: DominoRoom, player: DominoPlayer) {
    this.clearGraceTimer(player);
    const ms = graceMs(room);
    const timer = setTimeout(() => {
      this.graceTimers.delete(player.id);
      void this.serialize(room.id, () => {
        if (this.rooms.getDominoes(room.id) === room && room.players.includes(player) && !player.connected) {
          console.log(`Dominoes seat in room ${room.id} expired`);
          this.removePlayer(room, player, true);
        }
      });
    }, ms);
    timer.unref?.();
    this.graceTimers.set(player.id, { timer, endsAt: Date.now() + ms });
  }

  private clearGraceTimer(player: DominoPlayer) {
    const entry = this.graceTimers.get(player.id);
    if (entry) clearTimeout(entry.timer);
    this.graceTimers.delete(player.id);
  }
}
