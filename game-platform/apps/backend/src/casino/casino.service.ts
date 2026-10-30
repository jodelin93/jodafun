import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SessionUser } from '../auth/session';
import { RoomStore } from '../game/room-store';
import { generateRoomCode, normalizeRoomCode } from '../game/game.utils';
import { presenceName } from '../game/presence';
import { canResume, pauseView, type SeatListener, type TeamRoomGame } from '../game/team-room';
import { secureRandomInt, shuffle, type RandomInt } from './engine/cards';
import {
  createMatch,
  DEFAULT_TARGET_POINTS,
  findLegalTurn,
  legalTurns,
  MAX_TARGET_POINTS,
  MIN_TARGET_POINTS,
  playTurn,
  privateView,
  publicView,
  requestHold,
  startNextHand,
} from './engine/match';
import { applyForcedDiscard, applyPileTake, applyTurn, buildCards, parseTurn, teamOf } from './engine/turn';
import type { MatchState, RuleError, TurnProposal } from './engine/types';
import { CasinoResults } from './casino-results';
import {
  CASINO_GAME_TYPE,
  type CasinoAck,
  type CasinoErrorCode,
  type CasinoPlayer,
  type CasinoPrivateView,
  type CasinoRoom,
  type CasinoRoomView,
  type ProcessedRequest,
} from './casino.types';

// How the service reaches sockets; the gateway backs this with the Socket.IO server
export interface CasinoEmitter {
  toRoom(roomId: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
  join(socketId: string, roomId: string): void;
  leave(socketId: string, roomId: string): void;
}

const STALE_SOCKET_PREFIX = 'stale:';
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PROCESSED_KEPT = 30;
const SAVE_ATTEMPTS = 4;

// How long an absent player keeps their seat
const graceMs = (room: CasinoRoom) =>
  room.status === 'playing'
    ? Number(process.env.ROOM_GRACE_CASINO_MS) || 3 * 60_000
    : Number(process.env.ROOM_GRACE_LOBBY_MS) || 5 * 60_000;

const fail = (code: CasinoErrorCode, extra: Partial<Extract<CasinoAck, { ok: false }>> = {}): CasinoAck<never> => ({
  ok: false,
  code,
  ...extra,
});

const validKey = (key: unknown): key is string => typeof key === 'string' && key.length >= 8 && key.length <= 100;

/**
 * Casino rooms: seats and teams, readiness, the match, reconnection and results.
 * Every change to a room runs through serialize(), one at a time per room; the gateway only parses
 * input and resolves who is asking. The process that owns the RoomStore owns every room.
 */
@Injectable()
export class CasinoService implements OnModuleInit, OnModuleDestroy, TeamRoomGame {
  private emitter: CasinoEmitter | null = null;
  private queues = new Map<string, Promise<unknown>>();
  private graceTimers = new Map<string, NodeJS.Timeout>(); // by player id
  private saving = new Set<string>(); // match ids being written
  // Tells the rest of the platform (presence, invitations) when a socket takes or leaves a seat
  seatListener: SeatListener | null = null;
  random: RandomInt = secureRandomInt;

  constructor(
    private rooms: RoomStore,
    private results: CasinoResults,
  ) {}

  attach(emitter: CasinoEmitter) {
    this.emitter = emitter;
  }

  // Rooms restored from Redis come back with everyone disconnected until they rejoin
  async onModuleInit() {
    let restored: CasinoRoom[] = [];
    try {
      restored = (await this.rooms.loadAll()).filter((r): r is CasinoRoom => r.gameType === CASINO_GAME_TYPE);
    } catch (error) {
      console.error('Failed to restore Casino rooms:', error);
      return;
    }
    const now = Date.now();
    for (const room of restored) {
      room.pendingResults ??= [];
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
    this.graceTimers.forEach(timer => clearTimeout(timer));
  }

  // --- Lobby ---

  create(socketId: string, user: SessionUser | null, input: { name?: unknown; playerKey?: unknown; players?: unknown; targetPoints?: unknown }) {
    if (!user) return Promise.resolve(fail('AUTH_REQUIRED'));
    if (!validKey(input.playerKey)) return Promise.resolve(fail('BAD_REQUEST'));
    if (this.seatOf(socketId)) return Promise.resolve(fail('ALREADY_SEATED'));
    const target = input.targetPoints === undefined ? DEFAULT_TARGET_POINTS : Number(input.targetPoints);
    if (!this.validTarget(target)) return Promise.resolve(fail('INVALID_TARGET'));

    const now = Date.now();
    const player = this.newPlayer(socketId, user, input.name, input.playerKey, 0);
    const room: CasinoRoom = {
      gameType: CASINO_GAME_TYPE,
      id: generateRoomCode(code => this.rooms.has(code)),
      hostId: player.id,
      capacity: input.players === 4 ? 4 : 2,
      targetPoints: target,
      players: [player],
      status: 'lobby',
      match: null,
      matchId: null,
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
    console.log(`Casino room ${room.id} created (${room.capacity} players)`);
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

  // Only takes back an existing seat; never sits a newcomer down
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

  chooseSeat(socketId: string, input: { roomId?: unknown; seat?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      const seat = Number(input.seat);
      if (!this.freeSeats(room).includes(seat)) return fail('SEAT_TAKEN');
      player.seat = seat;
      player.isReady = false;
      this.changed(room);
      return { ok: true as const };
    });
  }

  setTarget(socketId: string, input: { roomId?: unknown; targetPoints?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.hostId !== player.id) return fail('NOT_HOST');
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      const target = Number(input.targetPoints);
      if (!this.validTarget(target)) return fail('INVALID_TARGET');
      if (target !== room.targetPoints) {
        room.targetPoints = target;
        room.players.forEach(p => (p.isReady = false));
        this.changed(room);
      }
      return { ok: true as const };
    });
  }

  // The match starts once every seat is taken and every player is connected and ready
  ready(socketId: string, input: { roomId?: unknown; ready?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      player.isReady = input.ready === true;
      const full = room.players.length === room.capacity;
      if (full && room.players.every(p => p.isReady && p.connected)) this.startMatch(room);
      this.changed(room);
      return { ok: true as const };
    });
  }

  // After a finished match, everyone goes back to the lobby to ready up again
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
      this.removePlayer(room, player);
      return { ok: true as const };
    });
  }

  // Freezes the match: no turn is accepted until it is resumed
  pause(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'playing' || !room.match) return fail('GAME_NOT_ACTIVE');
      if (!room.paused) {
        room.paused = { by: player.id, at: Date.now() };
        this.changed(room);
      }
      return { ok: true as const };
    });
  }

  resume(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (!room.paused) return { ok: true as const };
      if (!canResume(room.paused, player.id, room.players)) return fail('NOT_PAUSER');
      room.paused = null;
      this.changed(room);
      return { ok: true as const };
    });
  }

  // --- Play ---

  submitTurn(socketId: string, input: { roomId?: unknown; version?: unknown; requestId?: unknown; turn?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId)) return fail('BAD_REQUEST_ID');
      // A retry of a request we already answered gets the same answer and changes nothing
      const previous = room.processed[player.id]?.find(r => r.requestId === input.requestId);
      if (previous) return previous.ack;

      const match = room.match;
      if (room.status !== 'playing' || !match) return fail('GAME_NOT_ACTIVE');
      if (room.paused) return fail('PAUSED');
      if (input.version !== match.version) return fail('STALE_STATE', { version: match.version });
      const seat = player.seat;
      let ack: CasinoAck<{ version: number }>;
      const parsed = parseTurn(input.turn);
      if (!parsed.ok) {
        ack = fail(parsed.error.code, { params: parsed.error.params, action: parsed.error.action });
      } else {
        const result = this.play(match, seat, this.withPrivateOrder(match, parsed.proposal));
        if (result.ok) {
          room.match = result.state;
          if (result.state.status === 'finished') this.finishMatch(room);
          ack = { ok: true, version: result.state.version };
        } else {
          ack = this.ruleFailure(match, seat, result.error);
        }
      }
      this.remember(room, player.id, { requestId: input.requestId, ack });
      if (ack.ok) this.changed(room);
      else this.rooms.save(room);
      return ack;
    });
  }

  // Checks a turn without playing it, for the turn preview; changes nothing
  preview(socketId: string, input: { roomId?: unknown; version?: unknown; turn?: unknown }): CasinoAck<{ valid: boolean; error?: unknown }> {
    const found = this.findPlayer(socketId, input.roomId);
    if (!found) return fail('NOT_SEATED');
    const match = found.room.match;
    if (found.room.status !== 'playing' || !match) return fail('GAME_NOT_ACTIVE');
    if (input.version !== match.version) return fail('STALE_STATE', { version: match.version });
    const parsed = parseTurn(input.turn);
    if (!parsed.ok) return { ok: true, valid: false, error: parsed.error };
    const result = applyTurn(match, found.player.seat, parsed.proposal);
    if (result.ok) return { ok: true, valid: true };
    const failure = this.ruleFailure(match, found.player.seat, result.error) as Extract<CasinoAck, { ok: false }>;
    return { ok: true, valid: false, error: { code: failure.code, params: failure.params, action: failure.action } };
  }

  // Takes the exposed opponents' pile card into one of the side's builds now, so the card under it is
  // shown to everyone; the turn goes on. Versioned and idempotent like a turn.
  takeFromPile(socketId: string, input: { roomId?: unknown; version?: unknown; requestId?: unknown; action?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId)) return fail('BAD_REQUEST_ID');
      const previous = room.processed[player.id]?.find(r => r.requestId === input.requestId);
      if (previous) return previous.ack;
      const match = room.match;
      if (room.status !== 'playing' || !match) return fail('GAME_NOT_ACTIVE');
      if (room.paused) return fail('PAUSED');
      if (input.version !== match.version) return fail('STALE_STATE', { version: match.version });
      const parsed = parseTurn({ actions: [input.action] });
      const action = parsed.ok ? parsed.proposal.actions[0] : null;
      let ack: CasinoAck<{ version: number }>;
      if (!action || action.type !== 'augment') {
        ack = fail('TAKE_NOT_ALLOWED');
      } else {
        const result = applyPileTake(match, player.seat, action);
        if (result.ok) {
          room.match = result.state;
          ack = { ok: true, version: result.state.version };
        } else {
          ack = this.ruleFailure(match, player.seat, result.error);
        }
      }
      this.remember(room, player.id, { requestId: input.requestId, ack });
      if (ack.ok) this.changed(room);
      else this.rooms.save(room);
      return ack;
    });
  }

  // A legal turn for the player whose turn it is (built from public cards and their own hand)
  hint(socketId: string, input: { roomId?: unknown }): CasinoAck<{ turn: TurnProposal | null }> {
    const found = this.findPlayer(socketId, input.roomId);
    if (!found) return fail('NOT_SEATED');
    const match = found.room.match;
    if (found.room.status !== 'playing' || !match) return fail('GAME_NOT_ACTIVE');
    if (match.turn !== found.player.seat) return fail('NOT_YOUR_TURN');
    return { ok: true, turn: findLegalTurn(match, found.player.seat) };
  }

  // "Please don't capture this build": tells the partner this player holds its rank
  hold(socketId: string, input: { roomId?: unknown; value?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'playing' || !room.match) return fail('GAME_NOT_ACTIVE');
      if (room.paused) return fail('PAUSED');
      const result = requestHold(room.match, player.seat, Number(input.value));
      if (!result.ok) return fail(result.error.code, { params: result.error.params });
      if (result.state !== room.match) {
        room.match = result.state;
        this.changed(room);
      }
      return { ok: true as const };
    });
  }

  // --- Connections ---

  disconnected(socketId: string) {
    for (const room of this.rooms.casinoRooms()) {
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
  inviteRoom(socketId: string, roomId: unknown): { room: CasinoRoom; freeSeats: number } | null {
    const found = this.findPlayer(socketId, roomId);
    if (!found || found.room.status !== 'lobby') return null;
    return { room: found.room, freeSeats: this.freeSeats(found.room).length };
  }

  seatedSocket(socketId: string): boolean {
    return this.seatOf(socketId) !== null;
  }

  // --- Internals ---

  // A capture without a chosen pile order gets a random one, so the order under the top card can't
  // be predicted from the public layout
  private withPrivateOrder(match: MatchState, proposal: TurnProposal): TurnProposal {
    return {
      actions: proposal.actions.map(a => {
        if (a.type !== 'capture' || a.order) return a;
        const builds = a.builds.map(id => match.builds.find(b => b.id === id));
        if (builds.some(b => !b)) return a; // a build made this turn: the engine keeps its own order
        return { ...a, order: shuffle([...a.sets.flat(), ...builds.flatMap(b => buildCards(b!))], this.random) };
      }),
    };
  }

  // A rule error for the player, naming only cards they can see (their hand, the table, the pile
  // tops and their own side's pile), whatever the engine reported
  private ruleFailure(match: MatchState, seat: number, error: RuleError): CasinoAck<never> {
    const visible = new Set([
      ...match.hands[seat],
      ...match.loose,
      ...match.builds.flatMap(buildCards),
      ...match.piles[teamOf(match, seat)],
      ...match.piles.map(p => p.at(-1)).filter((id): id is string => Boolean(id)),
    ]);
    const params = error.params ? { ...error.params } : undefined;
    if (params?.cards) params.cards = params.cards.filter(id => visible.has(id));
    return fail(error.code, { params, action: error.action });
  }

  private play(match: MatchState, seat: number, proposal: TurnProposal) {
    const result = playTurn(match, seat, proposal, this.random);
    if (result.ok) return result;
    // Safety valve: if no legal turn exists at all, any discard is accepted (never seen in simulation)
    const only = proposal.actions[0];
    if (proposal.actions.length === 1 && only.type === 'discard' && legalTurns(match, seat).length === 0) {
      console.error(`Casino: no legal turn for seat ${seat}; accepting a plain discard`);
      const forced = applyForcedDiscard(match, seat, only.card);
      if (forced.ok) return { ok: true as const, state: startNextHand(forced.state, this.random) };
    }
    return result;
  }

  private startMatch(room: CasinoRoom) {
    room.status = 'playing';
    room.matchId = randomUUID();
    room.matchStartedAt = Date.now();
    room.match = createMatch({ players: room.capacity, targetPoints: room.targetPoints }, this.random);
    room.matchPlayers = room.players.map(p => ({ id: p.id, name: p.name, userId: p.userId, seat: p.seat }));
    room.outcome = null;
    room.paused = null;
    room.processed = {};
    room.players.forEach(p => (p.isReady = false));
    console.log(`Casino match ${room.matchId} started in room ${room.id}`);
  }

  private finishMatch(room: CasinoRoom) {
    const match = room.match!;
    room.status = 'finished';
    room.paused = null;
    room.outcome = {
      matchId: room.matchId!,
      winnerTeam: match.winnerTeam,
      scores: [...match.scores],
      forfeit: false,
      forfeitTeam: null,
      results: structuredClone(match.results),
      finishedAt: Date.now(),
    };
    this.recordResult(room);
  }

  // Leaving a started match (or staying away past the grace period) forfeits it for that side,
  // once at least one turn was played; the room goes back to the lobby either way
  private removePlayer(room: CasinoRoom, player: CasinoPlayer) {
    this.clearGraceTimer(player);
    const match = room.match;
    if (room.status === 'playing' && match) {
      const team = teamOf(match, player.seat);
      if (match.turnsPlayed > 0) {
        room.outcome = {
          matchId: room.matchId!,
          winnerTeam: 1 - team,
          scores: [...match.scores],
          forfeit: true,
          forfeitTeam: team,
          results: structuredClone(match.results),
          finishedAt: Date.now(),
        };
        this.recordResult(room);
      }
    }
    room.players = room.players.filter(p => p !== player);
    this.emitter?.leave(player.socketId, room.id);
    this.seatListener?.unseated(player.socketId);
    if (room.status !== 'lobby') {
      room.status = 'lobby';
      room.match = null;
      room.paused = null;
    }
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
  private recordResult(room: CasinoRoom) {
    const outcome = room.outcome;
    if (!outcome || !room.matchPlayers || room.matchStartedAt === null) return;
    if (room.pendingResults.some(r => r.outcome.matchId === outcome.matchId)) return;
    room.pendingResults.push({
      outcome: structuredClone(outcome),
      players: structuredClone(room.matchPlayers),
      capacity: room.capacity,
      targetPoints: room.match?.config.targetPoints ?? room.targetPoints,
      startedAt: room.matchStartedAt,
    });
    this.rooms.save(room);
    this.flushResults(room);
  }

  // Writes every queued result with a few retries (the write itself is idempotent); a result still
  // unwritten after that is retried at the next restart or the next finished match in the room
  private flushResults(room: CasinoRoom) {
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
            else if (this.rooms.getCasino(room.id) === room) this.rooms.save(room);
          });
        } catch (error) {
          console.error(`Failed to save Casino match ${matchId} (attempt ${n}):`, error);
          if (n < SAVE_ATTEMPTS) setTimeout(() => void attempt(n + 1), 2000 * n).unref?.();
          else this.saving.delete(matchId);
        }
      };
      void attempt(1);
    }
  }

  private reclaim(room: CasinoRoom, player: CasinoPlayer, socketId: string) {
    this.clearGraceTimer(player);
    if (player.socketId !== socketId) this.emitter?.leave(player.socketId, room.id);
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    this.emitter?.join(socketId, room.id);
    this.seatListener?.seated(socketId);
    this.changed(room);
    return { ok: true as const, roomId: room.id, playerId: player.id, rejoined: true };
  }

  // This player's seat: same signed-in account and same browser key. Another device of the same
  // account never takes a seat over (as in Joda Memory); it is told the account is already seated.
  private ownSeat(room: CasinoRoom, user: SessionUser, playerKey: unknown): CasinoPlayer | 'taken' | null {
    const mine = room.players.filter(p => p.userId === user.id);
    const exact = mine.find(p => p.playerKey === playerKey);
    if (exact) return exact;
    return mine.length > 0 ? 'taken' : null;
  }

  private newPlayer(socketId: string, user: SessionUser, name: unknown, playerKey: string, seat: number): CasinoPlayer {
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

  private validTarget(target: number) {
    return Number.isInteger(target) && target >= MIN_TARGET_POINTS && target <= MAX_TARGET_POINTS;
  }

  private freeSeats(room: CasinoRoom): number[] {
    const taken = new Set(room.players.map(p => p.seat));
    return Array.from({ length: room.capacity }, (_, i) => i).filter(i => !taken.has(i));
  }

  private seatOf(socketId: string): { room: CasinoRoom; player: CasinoPlayer } | null {
    for (const room of this.rooms.casinoRooms()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) return { room, player };
    }
    return null;
  }

  private findPlayer(socketId: string, roomId: unknown) {
    const room = this.rooms.getCasino(normalizeRoomCode(roomId));
    const player = room?.players.find(p => p.socketId === socketId);
    return room && player ? { room, player } : null;
  }

  // A code that belongs to another game's room: the client opens that game instead
  private otherGame(roomId: unknown): CasinoAck<never> | null {
    const gameType = this.rooms.gameTypeOf(normalizeRoomCode(roomId));
    return gameType && gameType !== CASINO_GAME_TYPE ? fail('WRONG_GAME', { params: { gameType } }) : null;
  }

  private inRoom<T>(roomId: unknown, fn: (room: CasinoRoom) => T): Promise<T | CasinoAck<never>> {
    const code = normalizeRoomCode(roomId);
    return this.serialize(code, () => {
      const room = this.rooms.getCasino(code);
      return room ? fn(room) : fail('ROOM_NOT_FOUND');
    });
  }

  private asPlayer<T>(socketId: string, roomId: unknown, fn: (room: CasinoRoom, player: CasinoPlayer) => T) {
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

  private remember(room: CasinoRoom, playerId: string, entry: ProcessedRequest) {
    const list = (room.processed[playerId] ??= []);
    list.push(entry);
    if (list.length > PROCESSED_KEPT) list.splice(0, list.length - PROCESSED_KEPT);
  }

  private changed(room: CasinoRoom) {
    this.rooms.save(room);
    this.broadcast(room);
  }

  roomView(room: CasinoRoom): CasinoRoomView {
    return {
      id: room.id,
      gameType: CASINO_GAME_TYPE,
      capacity: room.capacity,
      targetPoints: room.targetPoints,
      status: room.status,
      seats: Array.from({ length: room.capacity }, (_, seat) => {
        const p = room.players.find(x => x.seat === seat);
        return {
          seat,
          team: room.capacity === 4 ? seat % 2 : seat,
          player: p ? { id: p.id, name: p.name, connected: p.connected, isReady: p.isReady, isHost: room.hostId === p.id } : null,
        };
      }),
      match: room.match ? publicView(room.match) : null,
      outcome: room.outcome,
      paused: room.status === 'playing' ? pauseView(room.paused, room.players) : null,
    };
  }

  privateViewOf(room: CasinoRoom, player: CasinoPlayer): CasinoPrivateView {
    return {
      roomId: room.id,
      playerId: player.id,
      seat: player.seat,
      match: room.match ? privateView(room.match, player.seat) : null,
    };
  }

  // Public state to the room, then each player's own hand to that player only
  private broadcast(room: CasinoRoom) {
    if (!this.emitter) return;
    this.emitter.toRoom(room.id, 'casino:room', this.roomView(room));
    for (const p of room.players) {
      if (p.connected) this.emitter.toSocket(p.socketId, 'casino:private', this.privateViewOf(room, p));
    }
  }

  private startGraceTimer(room: CasinoRoom, player: CasinoPlayer) {
    this.clearGraceTimer(player);
    const timer = setTimeout(() => {
      this.graceTimers.delete(player.id);
      void this.serialize(room.id, () => {
        if (this.rooms.getCasino(room.id) === room && room.players.includes(player) && !player.connected) {
          console.log(`Casino seat in room ${room.id} expired`);
          this.removePlayer(room, player);
        }
      });
    }, graceMs(room));
    timer.unref?.();
    this.graceTimers.set(player.id, timer);
  }

  private clearGraceTimer(player: CasinoPlayer) {
    const timer = this.graceTimers.get(player.id);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(player.id);
  }
}
