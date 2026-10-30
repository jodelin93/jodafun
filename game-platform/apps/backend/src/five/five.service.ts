import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SessionUser } from '../auth/session';
import { RoomStore } from '../game/room-store';
import { generateRoomCode, normalizeRoomCode } from '../game/game.utils';
import { presenceName } from '../game/presence';
import { canResume, pauseView, type SeatListener, type TeamRoomGame } from '../game/team-room';
import { secureRandomInt, type RandomInt } from '../lib/random';
import { parseCell } from './engine/coords';
import { cellsInArea, createGame, forfeit, other, place, resign, summary } from './engine/game';
import type { FiveMove, FiveSymbol } from './engine/types';
import { FiveResults } from './five-results';
import {
  FIVE_GAME_TYPE,
  MAX_AREA_SPAN,
  MAX_CATCH_UP,
  MAX_HISTORY_PAGE,
  type FiveAck,
  type FiveMoveEvent,
  type FiveOutcome,
  type FivePlayer,
  type FiveRoom,
  type FiveRoomView,
  type FiveServerErrorCode,
  type ProcessedRequest,
} from './five.types';

// How the service reaches sockets; the gateway backs this with the Socket.IO server
export interface FiveEmitter {
  toRoom(roomId: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
  join(socketId: string, roomId: string): void;
  leave(socketId: string, roomId: string): void;
}

type Failure = Extract<FiveAck, { ok: false }>;
type Mutation = { roomId?: unknown; gameId?: unknown; version?: unknown; requestId?: unknown };

const CAPACITY = 2;
const STALE_SOCKET_PREFIX = 'stale:';
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PROCESSED_KEPT = 30;
const SAVE_ATTEMPTS = 4;

// How long an absent player keeps their seat
const graceMs = (room: FiveRoom) =>
  room.status === 'playing'
    ? Number(process.env.ROOM_GRACE_FIVE_MS) || 3 * 60_000
    : Number(process.env.ROOM_GRACE_LOBBY_MS) || 5 * 60_000;

const fail = (code: FiveServerErrorCode, extra: Partial<Omit<Failure, 'ok' | 'code'>> = {}): FiveAck<never> => ({
  ok: false,
  code,
  ...extra,
});

const validKey = (key: unknown): key is string => typeof key === 'string' && key.length >= 8 && key.length <= 100;
const seatSymbol = (seat0Symbol: FiveSymbol, seat: number): FiveSymbol => (seat === 0 ? seat0Symbol : other(seat0Symbol));
const abs = (n: bigint) => (n < 0n ? -n : n);

/**
 * Infinite five-in-a-row rooms: two seats, readiness, the game, reconnection and results.
 * Every change to a room runs through serialize(), one at a time per room; the gateway only parses
 * input and resolves who is asking. The process that owns the RoomStore owns every room.
 * A placement is broadcast as one small five:move event (never the history or the board); clients
 * load the cells of their visible area with area(), older moves with history(), and catch up after
 * a gap with since(). A player who stays away loses the seat when the grace period ends, which
 * forfeits a game in which a move has been played.
 */
@Injectable()
export class FiveService implements OnModuleInit, OnModuleDestroy, TeamRoomGame {
  private emitter: FiveEmitter | null = null;
  private queues = new Map<string, Promise<unknown>>();
  private graceTimers = new Map<string, { timer: NodeJS.Timeout; endsAt: number }>(); // by player id
  private saving = new Set<string>(); // game ids being written
  seatListener: SeatListener | null = null;
  random: RandomInt = secureRandomInt;

  constructor(
    private rooms: RoomStore,
    private results: FiveResults,
  ) {}

  attach(emitter: FiveEmitter) {
    this.emitter = emitter;
  }

  // Rooms restored from Redis come back with everyone disconnected until they rejoin
  async onModuleInit() {
    let restored: FiveRoom[] = [];
    try {
      restored = (await this.rooms.loadAll()).filter((r): r is FiveRoom => r.gameType === FIVE_GAME_TYPE);
    } catch (error) {
      console.error('Failed to restore five-in-a-row rooms:', error);
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
    const room: FiveRoom = {
      gameType: FIVE_GAME_TYPE,
      id: generateRoomCode(code => this.rooms.has(code)),
      hostId: player.id,
      players: [player],
      status: 'lobby',
      seat0Symbol: null,
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
    console.log(`Five-in-a-row room ${room.id} created`);
    return Promise.resolve({ ok: true as const, roomId: room.id, playerId: player.id });
  }

  // Joins the free seat, or takes back this player's own seat (refresh, reconnect, another tab)
  join(socketId: string, user: SessionUser | null, input: { roomId?: unknown; name?: unknown; playerKey?: unknown }) {
    const wrong = this.otherGame(input.roomId);
    if (wrong) return Promise.resolve(wrong);
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
    const wrong = this.otherGame(input.roomId);
    if (wrong) return Promise.resolve(wrong);
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

  // After a finished game both players go back to the lobby (same seats) and swap symbols for the
  // next game, which gets a new id
  rematch(socketId: string, input: { roomId?: unknown }) {
    return this.asPlayer(socketId, input.roomId, room => {
      if (room.status !== 'finished') return fail('NOT_FINISHED');
      room.status = 'lobby';
      room.game = null;
      room.paused = null;
      if (room.seat0Symbol) room.seat0Symbol = other(room.seat0Symbol);
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

  // Freezes the game: no placement until it is resumed (resigning still works)
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

  // The engine checks the turn, the coordinates (any size, normalised) and that the cell is free,
  // and works out the win; the client sends only the cell
  place(socketId: string, input: Mutation & { x?: unknown; y?: unknown }) {
    return this.mutate(socketId, input, false, (room, symbol) => {
      const game = room.game!;
      const result = place(game, symbol, { x: input.x, y: input.y });
      if (!result.ok) return fail(result.error.code);
      room.game = result.state;
      const event: FiveMoveEvent = {
        roomId: room.id,
        gameId: game.gameId,
        version: game.version,
        move: { ...result.move },
        turn: game.turn,
        status: game.status,
        winner: game.winner,
        winLine: game.winLine ? game.winLine.map(c => ({ ...c })) : null,
      };
      this.emitter?.toRoom(room.id, 'five:move', event);
      return { ok: true as const, version: game.version, move: { ...result.move } };
    });
  }

  resign(socketId: string, input: Mutation) {
    return this.mutate(socketId, input, true, (room, symbol) => {
      const next = resign(room.game!, symbol);
      if (!next) return fail('NOT_PLAYING');
      room.game = next;
      return { ok: true as const, version: next.version };
    });
  }

  // --- Reading the board ---

  // The occupied cells of a rectangle (inclusive corners), at most MAX_AREA_SPAN cells per side
  area(socketId: string, input: { roomId?: unknown; gameId?: unknown; from?: unknown; to?: unknown }) {
    return this.asReader(socketId, input, room => {
      const from = parseCell(input.from);
      const to = parseCell(input.to);
      if (!from || !to) return fail('BAD_CELL');
      if (abs(to.x - from.x) + 1n > MAX_AREA_SPAN || abs(to.y - from.y) + 1n > MAX_AREA_SPAN) return fail('AREA_TOO_LARGE');
      const game = room.game!;
      return { ok: true as const, gameId: game.gameId, version: game.version, cells: cellsInArea(game, from, to) };
    });
  }

  // Older moves, newest first: the moves numbered below beforePly (all of them when it is left out)
  history(socketId: string, input: { roomId?: unknown; gameId?: unknown; beforePly?: unknown; limit?: unknown }) {
    return this.asReader(socketId, input, room => {
      const moves = room.game!.moves;
      const { beforePly, limit } = input;
      if (beforePly !== undefined && (!Number.isSafeInteger(beforePly) || (beforePly as number) < 1)) return fail('BAD_REQUEST');
      if (limit !== undefined && !Number.isSafeInteger(limit)) return fail('BAD_REQUEST');
      const size = Math.min(Math.max(limit === undefined ? MAX_HISTORY_PAGE : (limit as number), 1), MAX_HISTORY_PAGE);
      const end = Math.min(beforePly === undefined ? moves.length : (beforePly as number) - 1, moves.length);
      const start = Math.max(0, end - size);
      return { ok: true as const, moves: moves.slice(start, end).reverse().map(m => ({ ...m })), hasMore: start > 0 };
    });
  }

  // What a client at `version` missed. The version is 1 + the moves played, plus 1 once the game
  // ends by resignation or forfeit (after which no move is played), so a client at version v has
  // seen the first min(v − 1, moves) moves. The end of the game comes with the current turn,
  // status, winner, reason and winning line.
  since(socketId: string, input: { roomId?: unknown; gameId?: unknown; version?: unknown }) {
    return this.asReader(socketId, input, room => {
      const game = room.game!;
      const { version } = input;
      if (!Number.isSafeInteger(version) || (version as number) < 1) return fail('BAD_REQUEST');
      const base = { gameId: game.gameId, version: game.version };
      const seen = Math.min((version as number) - 1, game.moves.length);
      // A client ahead of the server, or too far behind, reloads its area instead
      if ((version as number) > game.version || game.moves.length - seen > MAX_CATCH_UP) return { ok: true as const, ...base, resync: true as const };
      return {
        ok: true as const,
        ...base,
        moves: game.moves.slice(seen).map(m => ({ ...m })),
        turn: game.turn,
        status: game.status,
        winner: game.winner,
        reason: game.reason,
        winLine: game.winLine ? game.winLine.map(c => ({ ...c })) : null,
      };
    });
  }

  // --- Connections ---

  disconnected(socketId: string) {
    for (const room of this.rooms.fiveRooms()) {
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

  roomView(room: FiveRoom): FiveRoomView {
    return {
      id: room.id,
      gameType: FIVE_GAME_TYPE,
      status: room.status,
      seats: ([0, 1] as const).map(seat => {
        const p = room.players.find(x => x.seat === seat);
        return {
          seat,
          // The symbols of the current game, or of the next one once a game has been played
          symbol: room.seat0Symbol ? seatSymbol(room.seat0Symbol, seat) : null,
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
      game: room.game ? structuredClone(summary(room.game)) : null,
      outcome: room.outcome ? structuredClone(room.outcome) : null,
      paused: room.status === 'playing' ? pauseView(room.paused, room.players) : null,
    };
  }

  // --- Internals ---

  // A versioned, idempotent change to the current game: a retried request id gets its first answer
  // and changes nothing. PAUSED, STALE_STATE, NOT_PLAYING and OLD_GAME are not remembered, so the
  // same request can go through later; the engine's refusals are.
  private mutate<T extends { version: number }>(
    socketId: string,
    input: Mutation,
    allowedWhilePaused: boolean,
    apply: (room: FiveRoom, symbol: FiveSymbol) => FiveAck<T>,
  ) {
    return this.asPlayer(socketId, input.roomId, (room, player) => {
      if (typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId)) return fail('BAD_REQUEST_ID');
      const previous = room.processed[player.id]?.find(r => r.requestId === input.requestId);
      if (previous) return previous.ack as FiveAck<T>;

      const game = room.game;
      if (!game || input.gameId !== game.gameId) return fail('OLD_GAME');
      if (room.status !== 'playing' || game.status !== 'playing') return fail('NOT_PLAYING');
      if (room.paused && !allowedWhilePaused) return fail('PAUSED');
      if (input.version !== game.version) return fail('STALE_STATE', { version: game.version });
      const symbol = room.gamePlayers?.find(g => g.id === player.id)?.symbol;
      if (!symbol) return fail('NOT_SEATED');

      const ack = apply(room, symbol);
      this.remember(room, player.id, { requestId: input.requestId, ack: ack as ProcessedRequest['ack'] });
      if (ack.ok && room.game!.status === 'finished') {
        this.finishGame(room);
        this.changed(room);
      } else {
        this.rooms.save(room);
      }
      return ack;
    });
  }

  private startIfReady(room: FiveRoom) {
    if (room.status !== 'lobby' || room.players.length !== CAPACITY) return;
    if (!room.players.every(p => p.isReady && p.connected)) return;
    // Drawn for the room's first game; every rematch swaps it
    room.seat0Symbol ??= this.random(2) === 0 ? 'X' : 'O';
    const seat0Symbol = room.seat0Symbol;
    room.status = 'playing';
    room.game = createGame(randomUUID());
    room.gameStartedAt = Date.now();
    room.gamePlayers = room.players.map(p => ({ id: p.id, name: p.name, userId: p.userId, seat: p.seat, symbol: seatSymbol(seat0Symbol, p.seat) }));
    room.outcome = null;
    room.paused = null;
    room.processed = {};
    room.players.forEach(p => (p.isReady = false));
    console.log(`Five-in-a-row game ${room.game.gameId} started in room ${room.id}`);
  }

  private outcomeOf(room: FiveRoom): FiveOutcome {
    const game = room.game!;
    return {
      gameId: game.gameId,
      winner: game.winner,
      reason: game.reason!,
      moves: game.moves.length,
      winLine: game.winLine ? game.winLine.map(c => ({ ...c })) : null,
      finishedAt: Date.now(),
    };
  }

  private finishGame(room: FiveRoom) {
    room.status = 'finished';
    room.paused = null;
    room.outcome = this.outcomeOf(room);
    this.recordResult(room);
  }

  // Leaving a started game (or staying away past the grace period) forfeits it once a move has
  // been played; before that the room just goes back to the lobby. The seat is freed either way.
  private removePlayer(room: FiveRoom, player: FivePlayer, lost: boolean) {
    this.clearGraceTimer(player);
    const game = room.game;
    if (room.status === 'playing' && game) {
      room.paused = null;
      const symbol = room.gamePlayers?.find(g => g.id === player.id)?.symbol;
      if (game.moves.length > 0 && symbol) {
        room.game = forfeit(game, symbol);
        this.finishGame(room);
      } else {
        room.status = 'lobby';
        room.game = null;
      }
    }
    room.players = room.players.filter(p => p !== player);
    if (lost) this.emitter?.toSocket(player.socketId, 'five:seatLost', { roomId: room.id });
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
  private recordResult(room: FiveRoom) {
    const outcome = room.outcome;
    const game = room.game;
    if (!outcome || !game || !room.gamePlayers || room.gameStartedAt === null) return;
    if (room.pendingResults.some(r => r.outcome.gameId === outcome.gameId)) return;
    room.pendingResults.push({
      outcome: structuredClone(outcome),
      players: structuredClone(room.gamePlayers),
      rulesVersion: game.rulesVersion,
      moves: game.moves.map(m => ({ ...m })),
      startedAt: room.gameStartedAt,
    });
    this.rooms.save(room);
    this.flushResults(room);
  }

  // Writes every queued result with a few retries (the write itself is idempotent); a result still
  // unwritten after that is retried at the next restart or the next finished game in the room
  private flushResults(room: FiveRoom) {
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
            else if (this.rooms.getFive(room.id) === room) this.rooms.save(room);
          });
        } catch (error) {
          console.error(`Failed to save five-in-a-row game ${gameId} (attempt ${n}):`, error);
          if (n < SAVE_ATTEMPTS) setTimeout(() => void attempt(n + 1), 2000 * n).unref?.();
          else this.saving.delete(gameId);
        }
      };
      void attempt(1);
    }
  }

  private reclaim(room: FiveRoom, player: FivePlayer, socketId: string) {
    this.clearGraceTimer(player);
    if (player.socketId !== socketId) {
      // Another tab of the same browser had the seat: it no longer does
      this.emitter?.toSocket(player.socketId, 'five:seatLost', { roomId: room.id });
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
  private ownSeat(room: FiveRoom, user: SessionUser, playerKey: unknown): FivePlayer | 'taken' | null {
    const mine = room.players.filter(p => p.userId === user.id);
    const exact = mine.find(p => p.playerKey === playerKey);
    if (exact) return exact;
    return mine.length > 0 ? 'taken' : null;
  }

  private newPlayer(socketId: string, user: SessionUser, name: unknown, playerKey: string, seat: 0 | 1): FivePlayer {
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

  private freeSeats(room: FiveRoom): (0 | 1)[] {
    const taken = new Set(room.players.map(p => p.seat));
    return ([0, 1] as const).filter(i => !taken.has(i));
  }

  private seatOf(socketId: string): { room: FiveRoom; player: FivePlayer } | null {
    for (const room of this.rooms.fiveRooms()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) return { room, player };
    }
    return null;
  }

  private findPlayer(socketId: string, roomId: unknown) {
    const room = this.rooms.getFive(normalizeRoomCode(roomId));
    const player = room?.players.find(p => p.socketId === socketId);
    return room && player ? { room, player } : null;
  }

  // A code that belongs to another game's room: the client opens that game instead
  private otherGame(roomId: unknown): FiveAck<never> | null {
    const gameType = this.rooms.gameTypeOf(normalizeRoomCode(roomId));
    return gameType && gameType !== FIVE_GAME_TYPE ? fail('WRONG_GAME', { params: { gameType } }) : null;
  }

  private inRoom<T>(roomId: unknown, fn: (room: FiveRoom) => T): Promise<T | FiveAck<never>> {
    const code = normalizeRoomCode(roomId);
    return this.serialize(code, () => {
      const room = this.rooms.getFive(code);
      return room ? fn(room) : fail('ROOM_NOT_FOUND');
    });
  }

  private asPlayer<T>(socketId: string, roomId: unknown, fn: (room: FiveRoom, player: FivePlayer) => T) {
    return this.inRoom(roomId, room => {
      const player = room.players.find(p => p.socketId === socketId);
      return player ? fn(room, player) : fail('NOT_SEATED');
    });
  }

  // A seated player reading the room's current game (finished games included until the rematch)
  private asReader<T>(socketId: string, input: { roomId?: unknown; gameId?: unknown }, fn: (room: FiveRoom) => T) {
    return this.asPlayer(socketId, input.roomId, room => {
      if (!room.game || input.gameId !== room.game.gameId) return fail('OLD_GAME');
      return fn(room);
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

  private remember(room: FiveRoom, playerId: string, entry: ProcessedRequest) {
    const list = (room.processed[playerId] ??= []);
    list.push(entry);
    if (list.length > PROCESSED_KEPT) list.splice(0, list.length - PROCESSED_KEPT);
  }

  private changed(room: FiveRoom) {
    this.rooms.save(room);
    this.broadcast(room);
  }

  // The seats, a bounded summary of the game and the outcome; moves travel as five:move events
  private broadcast(room: FiveRoom) {
    this.emitter?.toRoom(room.id, 'five:room', this.roomView(room));
  }

  private startGraceTimer(room: FiveRoom, player: FivePlayer) {
    this.clearGraceTimer(player);
    const ms = graceMs(room);
    const timer = setTimeout(() => {
      this.graceTimers.delete(player.id);
      void this.serialize(room.id, () => {
        if (this.rooms.getFive(room.id) === room && room.players.includes(player) && !player.connected) {
          console.log(`Five-in-a-row seat in room ${room.id} expired`);
          this.removePlayer(room, player, true);
        }
      });
    }, ms);
    timer.unref?.();
    this.graceTimers.set(player.id, { timer, endsAt: Date.now() + ms });
  }

  private clearGraceTimer(player: FivePlayer) {
    const entry = this.graceTimers.get(player.id);
    if (entry) clearTimeout(entry.timer);
    this.graceTimers.delete(player.id);
  }
}
