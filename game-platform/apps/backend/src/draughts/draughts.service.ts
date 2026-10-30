import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SessionUser } from '../auth/session';
import { RoomStore } from '../game/room-store';
import { generateRoomCode, normalizeRoomCode } from '../game/game.utils';
import { presenceName } from '../game/presence';
import { canResume, pauseView, type SeatListener, type TeamRoomGame } from '../game/team-room';
import { secureRandomInt, type RandomInt } from '../lib/random';
import { answerDraw, createGame, forfeit, offerDraw, opponent, parseRoute, playMove, publicView, resign } from './engine/game';
import type { Color, RuleResult } from './engine/types';
import { DraughtsResults } from './draughts-results';
import {
  DRAUGHTS_GAME_TYPE,
  SERIES_STREAK,
  type DraughtsAck,
  type DraughtsErrorCode,
  type DraughtsOutcome,
  type DraughtsPlayer,
  type DraughtsRoom,
  type DraughtsRoomView,
  type ProcessedRequest,
} from './draughts.types';

// How the service reaches sockets; the gateway backs this with the Socket.IO server
export interface DraughtsEmitter {
  toRoom(roomId: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
  join(socketId: string, roomId: string): void;
  leave(socketId: string, roomId: string): void;
}

type Failure = Extract<DraughtsAck, { ok: false }>;
type Mutation = { roomId?: unknown; version?: unknown; requestId?: unknown };

const CAPACITY = 2;
const STALE_SOCKET_PREFIX = 'stale:';
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PROCESSED_KEPT = 30;
const SAVE_ATTEMPTS = 4;

// How long an absent player keeps their seat
const graceMs = (room: DraughtsRoom) =>
  room.status === 'playing'
    ? Number(process.env.ROOM_GRACE_DRAUGHTS_MS) || 3 * 60_000
    : Number(process.env.ROOM_GRACE_LOBBY_MS) || 5 * 60_000;

const fail = (code: DraughtsErrorCode, extra: Partial<Omit<Failure, 'ok' | 'code'>> = {}): DraughtsAck<never> => ({
  ok: false,
  code,
  ...extra,
});

const validKey = (key: unknown): key is string => typeof key === 'string' && key.length >= 8 && key.length <= 100;
const seatColor = (seat0Color: Color, seat: number): Color => (seat === 0 ? seat0Color : opponent(seat0Color));

/**
 * International draughts rooms: two seats, readiness, the game, reconnection and results.
 * Every change to a room runs through serialize(), one at a time per room; the gateway only parses
 * input and resolves who is asking. The process that owns the RoomStore owns every room.
 * Friendly games: there is no clock and nobody is ever moved for. A player who stays away loses the
 * seat when the grace period ends, which forfeits a game in which a move has been played.
 */
@Injectable()
export class DraughtsService implements OnModuleInit, OnModuleDestroy, TeamRoomGame {
  private emitter: DraughtsEmitter | null = null;
  private queues = new Map<string, Promise<unknown>>();
  private graceTimers = new Map<string, { timer: NodeJS.Timeout; endsAt: number }>(); // by player id
  private saving = new Set<string>(); // game ids being written
  seatListener: SeatListener | null = null;
  random: RandomInt = secureRandomInt;

  constructor(
    private rooms: RoomStore,
    private results: DraughtsResults,
  ) {}

  attach(emitter: DraughtsEmitter) {
    this.emitter = emitter;
  }

  // Rooms restored from Redis come back with everyone disconnected until they rejoin
  async onModuleInit() {
    let restored: DraughtsRoom[] = [];
    try {
      restored = (await this.rooms.loadAll()).filter((r): r is DraughtsRoom => r.gameType === DRAUGHTS_GAME_TYPE);
    } catch (error) {
      console.error('Failed to restore draughts rooms:', error);
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

  create(socketId: string, user: SessionUser | null, input: { name?: unknown; playerKey?: unknown }) {
    if (!user) return Promise.resolve(fail('AUTH_REQUIRED'));
    if (!validKey(input.playerKey)) return Promise.resolve(fail('BAD_REQUEST'));
    if (this.seatOf(socketId)) return Promise.resolve(fail('ALREADY_SEATED'));

    const now = Date.now();
    const player = this.newPlayer(socketId, user, input.name, input.playerKey, 0);
    const room: DraughtsRoom = {
      gameType: DRAUGHTS_GAME_TYPE,
      id: generateRoomCode(code => this.rooms.has(code)),
      hostId: player.id,
      players: [player],
      status: 'lobby',
      seat0Color: null,
      game: null,
      gameStartedAt: null,
      gamePlayers: null,
      outcome: null,
      paused: null,
      pendingResults: [],
      processed: {},
      createdAt: now,
      updatedAt: now,
    };
    this.rooms.save(room);
    this.emitter?.join(socketId, room.id);
    this.seatListener?.seated(socketId);
    this.broadcast(room);
    console.log(`Draughts room ${room.id} created`);
    return Promise.resolve({ ok: true as const, roomId: room.id, playerId: player.id });
  }

  // Joins the free seat, or takes back this player's own seat (refresh, reconnect, another tab)
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

  // Only takes back an existing seat (mid-game too); never sits a newcomer down
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

  // The game starts by itself once both seats are taken and both players are connected and ready
  ready(socketId: string, input: { roomId?: unknown; ready?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'lobby') return fail('GAME_STARTED');
      player.isReady = input.ready === true;
      this.startIfReady(room);
      this.changed(room);
      return { ok: true as const };
    });
  }

  // After a finished game both players go back to the lobby (same seats) and swap colours for the
  // next one
  rematch(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, room => {
      if (room.status !== 'finished') return fail('NOT_FINISHED');
      room.status = 'lobby';
      room.game = null;
      room.paused = null;
      if (room.seat0Color) room.seat0Color = opponent(room.seat0Color);
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

  // Freezes the game: no move and no draw offer or answer until it is resumed (resigning still works)
  pause(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (room.status !== 'playing' || !room.game) return fail('NOT_PLAYING');
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

  // The client names only the start square and the landing squares; captures and promotion are
  // worked out by the engine from the legal moves
  move(socketId: string, input: Mutation & { from?: unknown; path?: unknown }) {
    return this.mutate(socketId, input, false, (room, color) => {
      const parsed = parseRoute({ from: input.from, path: input.path });
      if (!parsed.ok) return { ok: false, error: { code: 'BAD_MOVE' } };
      return playMove(room.game!, color, parsed.route);
    });
  }

  resign(socketId: string, input: Mutation) {
    return this.mutate(socketId, input, true, (room, color) => resign(room.game!, color));
  }

  offerDraw(socketId: string, input: Mutation) {
    return this.mutate(socketId, input, false, (room, color) => offerDraw(room.game!, color));
  }

  // offerVersion is the version the offer was made at (game.drawOffer.version)
  respondDraw(socketId: string, input: Mutation & { offerVersion?: unknown; accept?: unknown }) {
    return this.mutate(socketId, input, false, (room, color) =>
      answerDraw(room.game!, color, input.accept === true, typeof input.offerVersion === 'number' ? input.offerVersion : NaN),
    );
  }

  // --- Connections ---

  disconnected(socketId: string) {
    for (const room of this.rooms.draughtsRooms()) {
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
  inviteRoom(socketId: string, roomId: unknown) {
    const found = this.findPlayer(socketId, roomId);
    if (!found || found.room.status !== 'lobby') return null;
    const { room } = found;
    return { room: { id: room.id, capacity: CAPACITY as 2, players: room.players }, freeSeats: this.freeSeats(room).length };
  }

  seatedSocket(socketId: string): boolean {
    return this.seatOf(socketId) !== null;
  }

  // --- Views ---

  roomView(room: DraughtsRoom): DraughtsRoomView {
    return {
      id: room.id,
      gameType: DRAUGHTS_GAME_TYPE,
      status: room.status,
      seats: ([0, 1] as const).map(seat => {
        const p = room.players.find(x => x.seat === seat);
        return {
          seat,
          // The colours of the current game, or of the next one once a game has been played
          color: room.seat0Color ? seatColor(room.seat0Color, seat) : null,
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
      game: room.game ? publicView(room.game) : null,
      outcome: room.outcome,
      series: room.series ? { ...structuredClone(room.series), target: SERIES_STREAK } : null,
      paused: room.status === 'playing' ? pauseView(room.paused, room.players) : null,
    };
  }

  // --- Internals ---

  // A versioned, idempotent change to the game: a retried request id gets its first answer and
  // changes nothing
  private mutate(socketId: string, input: Mutation, allowedWhilePaused: boolean, apply: (room: DraughtsRoom, color: Color) => RuleResult) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId)) return fail('BAD_REQUEST_ID');
      const previous = room.processed[player.id]?.find(r => r.requestId === input.requestId);
      if (previous) return previous.ack;

      const game = room.game;
      if (room.status !== 'playing' || !game) return fail('NOT_PLAYING');
      // Not remembered: the same request goes through once the game is resumed
      if (room.paused && !allowedWhilePaused) return fail('PAUSED');
      if (input.version !== game.version) return fail('STALE_STATE', { version: game.version });
      const color = room.gamePlayers?.find(g => g.id === player.id)?.color;
      if (!color) return fail('NOT_SEATED');

      let ack: DraughtsAck<{ version: number }>;
      const result = apply(room, color);
      if (result.ok) {
        room.game = result.state;
        if (result.state.status === 'finished') this.finishGame(room);
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

  private startIfReady(room: DraughtsRoom) {
    if (room.status !== 'lobby' || room.players.length !== CAPACITY) return;
    if (!room.players.every(p => p.isReady && p.connected)) return;
    // Drawn for the room's first game; every rematch swaps it
    room.seat0Color ??= this.random(2) === 0 ? 'white' : 'black';
    const seat0Color = room.seat0Color;
    room.status = 'playing';
    room.game = createGame(randomUUID());
    room.gameStartedAt = Date.now();
    room.gamePlayers = room.players.map(p => ({ id: p.id, name: p.name, userId: p.userId, seat: p.seat, color: seatColor(seat0Color, p.seat) }));
    room.outcome = null;
    room.paused = null;
    room.processed = {};
    room.players.forEach(p => (p.isReady = false));
    // A new match when none is running or the last one was decided
    if (!room.series || room.series.winnerSeat !== null) {
      room.series = { id: randomUUID(), games: 0, wins: [0, 0], draws: 0, streak: [0, 0], winnerSeat: null, forfeit: false };
    }
    console.log(`Draughts game ${room.game.gameId} started in room ${room.id}`);
  }

  private outcomeOf(room: DraughtsRoom): DraughtsOutcome {
    const game = room.game!;
    return {
      gameId: game.gameId,
      winner: game.result?.winner ?? null,
      reason: game.result!.reason,
      moves: game.moves.length,
      finishedAt: Date.now(),
    };
  }

  private finishGame(room: DraughtsRoom) {
    room.status = 'finished';
    room.paused = null;
    room.outcome = this.outcomeOf(room);
    this.scoreSeries(room);
    this.recordResult(room);
  }

  // Counts the finished game in the match: a win adds to the winner's run and ends the loser's, a
  // draw changes neither, a forfeit decides the match
  private scoreSeries(room: DraughtsRoom) {
    const series = room.series;
    const outcome = room.outcome;
    if (!series || !outcome) return;
    series.games += 1;
    const winnerSeat = outcome.winner ? room.gamePlayers?.find(p => p.color === outcome.winner)?.seat : undefined;
    if (winnerSeat === undefined) {
      series.draws += 1;
      return;
    }
    const loserSeat = winnerSeat === 0 ? 1 : 0;
    series.wins[winnerSeat] += 1;
    series.streak[winnerSeat] += 1;
    series.streak[loserSeat] = 0;
    if (outcome.reason === 'forfeit') {
      series.winnerSeat = winnerSeat;
      series.forfeit = true;
    } else if (series.streak[winnerSeat] >= SERIES_STREAK) {
      series.winnerSeat = winnerSeat;
    }
  }

  // Leaving a started game (or staying away past the grace period) forfeits it once a move has
  // been played; before that the room just goes back to the lobby. The seat is freed either way.
  private removePlayer(room: DraughtsRoom, player: DraughtsPlayer, lost: boolean) {
    this.clearGraceTimer(player);
    const game = room.game;
    if (room.status === 'playing' && game) {
      room.paused = null;
      const color = room.gamePlayers?.find(g => g.id === player.id)?.color;
      if (game.moves.length > 0 && color) {
        room.game = forfeit(game, color);
        this.finishGame(room);
      } else {
        room.status = 'lobby';
        room.game = null;
      }
    }
    room.players = room.players.filter(p => p !== player);
    // A match is between these two players: whoever sits down next starts a new one. A match just
    // decided (by this forfeit or earlier) stays on show for the player who remains.
    if (room.series && room.series.winnerSeat === null) room.series = null;
    if (lost) this.emitter?.toSocket(player.socketId, 'draughts:seatLost', { roomId: room.id });
    this.emitter?.leave(player.socketId, room.id);
    this.seatListener?.unseated(player.socketId);
    room.players.forEach(p => (p.isReady = false));
    if (room.players.length === 0) {
      // Keep the room only until its unsaved results are written
      if (room.pendingResults.length === 0) this.rooms.delete(room.id);
      else this.rooms.save(room);
      return;
    }
    if (room.hostId === player.id) room.hostId = room.players[0].id;
    this.changed(room);
  }

  // Queues the room's outcome for the database. The queue is saved with the room, so a result
  // survives a rematch and a restart until it is written.
  private recordResult(room: DraughtsRoom) {
    const outcome = room.outcome;
    const game = room.game;
    if (!outcome || !game || !room.gamePlayers || room.gameStartedAt === null) return;
    if (room.pendingResults.some(r => r.outcome.gameId === outcome.gameId)) return;
    room.pendingResults.push({
      outcome: structuredClone(outcome),
      players: structuredClone(room.gamePlayers),
      rulesVersion: game.rulesVersion,
      routes: game.moves.map(m => ({ from: m.from, path: [...m.path] })),
      notation: game.moves.map(m => m.notation),
      startedAt: room.gameStartedAt,
      ...(room.series
        ? {
            series: {
              id: room.series.id,
              game: room.series.games,
              streak: [...room.series.streak] as [number, number],
              winnerColor: room.series.winnerSeat === null ? null : (room.gamePlayers.find(p => p.seat === room.series!.winnerSeat)?.color ?? null),
              decided: room.series.winnerSeat !== null,
            },
          }
        : {}),
    });
    this.rooms.save(room);
    this.flushResults(room);
  }

  // Writes every queued result with a few retries (the write itself is idempotent); a result still
  // unwritten after that is retried at the next restart or the next finished game in the room
  private flushResults(room: DraughtsRoom) {
    for (const pending of room.pendingResults) {
      const gameId = pending.outcome.gameId;
      if (this.saving.has(gameId)) continue;
      this.saving.add(gameId);
      const attempt = async (n: number): Promise<void> => {
        try {
          await this.results.save(pending);
          this.saving.delete(gameId);
          await this.serialize(room.id, () => {
            room.pendingResults = room.pendingResults.filter(r => r.outcome.gameId !== gameId);
            if (room.players.length === 0 && room.pendingResults.length === 0) this.rooms.delete(room.id);
            else if (this.rooms.getDraughts(room.id) === room) this.rooms.save(room);
          });
        } catch (error) {
          console.error(`Failed to save draughts game ${gameId} (attempt ${n}):`, error);
          if (n < SAVE_ATTEMPTS) setTimeout(() => void attempt(n + 1), 2000 * n).unref?.();
          else this.saving.delete(gameId);
        }
      };
      void attempt(1);
    }
  }

  private reclaim(room: DraughtsRoom, player: DraughtsPlayer, socketId: string) {
    this.clearGraceTimer(player);
    if (player.socketId !== socketId) {
      // Another tab of the same browser had the seat: it no longer does
      this.emitter?.toSocket(player.socketId, 'draughts:seatLost', { roomId: room.id });
      this.emitter?.leave(player.socketId, room.id);
      this.seatListener?.unseated(player.socketId);
    }
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    this.emitter?.join(socketId, room.id);
    this.seatListener?.seated(socketId);
    this.startIfReady(room);
    this.changed(room);
    return { ok: true as const, roomId: room.id, playerId: player.id, rejoined: true };
  }

  // This player's seat: same signed-in account and same browser key. Another device of the same
  // account never takes a seat over; it is told the account is already seated.
  private ownSeat(room: DraughtsRoom, user: SessionUser, playerKey: unknown): DraughtsPlayer | 'taken' | null {
    const mine = room.players.filter(p => p.userId === user.id);
    const exact = mine.find(p => p.playerKey === playerKey);
    if (exact) return exact;
    return mine.length > 0 ? 'taken' : null;
  }

  private newPlayer(socketId: string, user: SessionUser, name: unknown, playerKey: string, seat: 0 | 1): DraughtsPlayer {
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

  private freeSeats(room: DraughtsRoom): (0 | 1)[] {
    const taken = new Set(room.players.map(p => p.seat));
    return ([0, 1] as const).filter(i => !taken.has(i));
  }

  private seatOf(socketId: string): { room: DraughtsRoom; player: DraughtsPlayer } | null {
    for (const room of this.rooms.draughtsRooms()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) return { room, player };
    }
    return null;
  }

  private findPlayer(socketId: string, roomId: unknown) {
    const room = this.rooms.getDraughts(normalizeRoomCode(roomId));
    const player = room?.players.find(p => p.socketId === socketId);
    return room && player ? { room, player } : null;
  }

  // A code that belongs to another game's room: the client opens that game instead
  private otherGame(roomId: unknown): DraughtsAck<never> | null {
    const gameType = this.rooms.gameTypeOf(normalizeRoomCode(roomId));
    return gameType && gameType !== DRAUGHTS_GAME_TYPE ? fail('WRONG_GAME', { params: { gameType } }) : null;
  }

  private inRoom<T>(roomId: unknown, fn: (room: DraughtsRoom) => T): Promise<T | DraughtsAck<never>> {
    const code = normalizeRoomCode(roomId);
    return this.serialize(code, () => {
      const room = this.rooms.getDraughts(code);
      return room ? fn(room) : fail('ROOM_NOT_FOUND');
    });
  }

  private asPlayer<T>(socketId: string, roomId: unknown, fn: (room: DraughtsRoom, player: DraughtsPlayer) => T) {
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

  private remember(room: DraughtsRoom, playerId: string, entry: ProcessedRequest) {
    const list = (room.processed[playerId] ??= []);
    list.push(entry);
    if (list.length > PROCESSED_KEPT) list.splice(0, list.length - PROCESSED_KEPT);
  }

  private changed(room: DraughtsRoom) {
    this.rooms.save(room);
    this.broadcast(room);
  }

  // The board is public: everything goes to the whole room in one view
  private broadcast(room: DraughtsRoom) {
    this.emitter?.toRoom(room.id, 'draughts:room', this.roomView(room));
  }

  private startGraceTimer(room: DraughtsRoom, player: DraughtsPlayer) {
    this.clearGraceTimer(player);
    const ms = graceMs(room);
    const timer = setTimeout(() => {
      this.graceTimers.delete(player.id);
      void this.serialize(room.id, () => {
        if (this.rooms.getDraughts(room.id) === room && room.players.includes(player) && !player.connected) {
          console.log(`Draughts seat in room ${room.id} expired`);
          this.removePlayer(room, player, true);
        }
      });
    }, ms);
    timer.unref?.();
    this.graceTimers.set(player.id, { timer, endsAt: Date.now() + ms });
  }

  private clearGraceTimer(player: DraughtsPlayer) {
    const entry = this.graceTimers.get(player.id);
    if (entry) clearTimeout(entry.timer);
    this.graceTimers.delete(player.id);
  }
}
