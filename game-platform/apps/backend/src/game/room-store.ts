import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { CASINO_GAME_TYPE, type CasinoRoom } from '../casino/casino.types';
import { restoreMatch } from '../casino/engine/match';
import { DOMINOES_GAME_TYPE, type DominoRoom } from '../dominoes/dominoes.types';
import { restoreMatch as restoreDominoMatch } from '../dominoes/engine/match';

export type Difficulty = 'easy' | 'medium' | 'hard';
// classic: both players share one board and take turns; alternate: each clears the same decks on their own board
export type RoomMode = 'classic' | 'alternate';

export interface AltRoundResult {
  moves: number;
  timeMs: number;
}

// One player's board in an alternate game
export interface AltBoard {
  round: number; // 0-based index into AltGame.decks
  matched: number[];
  flipped: number[];
  moves: number;
  elapsedMs: number; // play time banked while the clock was running
  runningSince: number | null; // epoch ms the clock last started; null while paused
}

export interface AltSeat {
  results: AltRoundResult[]; // completed rounds, in order
  board: AltBoard | null; // the round being played, if any
}

export interface AltGame {
  decks: { iconName: string }[][]; // the same decks for both players, one per round
  seats: AltSeat[]; // indexed like room.players
  finished: boolean;
  winnerIndex: number | null; // null when finished as a draw
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  socketId: string;
  userId?: string | null; // set from the session cookie; null for anonymous sockets
  playerKey?: string; // client-generated, stable per browser tab; never sent to clients
  connected: boolean; // false while the player is in the disconnect grace period
  disconnectedAt?: number | null; // epoch ms of the last disconnect; never sent to clients
}

export interface GameRoom {
  gameType?: 'joda-memory'; // missing on rooms saved before other games existed (= Joda Memory)
  id: string;
  hostId: string;
  players: Player[];
  difficulty: Difficulty;
  gameStarted: boolean;
  currentPlayerIndex: number;
  cards: { iconName: string }[];
  flippedCards: number[];
  currentRound: number;
  roundWins: number[]; // [player1RoundWins, player2RoundWins]
  showOpponentMoves: boolean; // Whether players can see opponent's moves
  pausedBy?: string | null; // player.id of whoever paused the game; only they can resume it
  // Server-side scoring state (never sent to clients)
  gameActive: boolean; // true from the first deal until the game ends or is abandoned
  roundActive: boolean; // true while the current deal still has unmatched cards
  gameHasFlips: boolean; // at least one card flipped in this game (forfeits only count after that)
  matchedCards: number[];
  roundPairs: number[]; // pairs per player in the current round
  totalPairs: number[]; // pairs per player across the whole game
  gameDifficulty: Difficulty;
  gameStartedAt: Date | null;
  mode?: RoomMode; // missing on rooms saved before alternate games existed (= classic)
  alt?: AltGame | null; // alternate games only; private decks are never sent to clients
  createdAt: number;
  updatedAt: number;
}

// Every game's rooms share one store and one code space; gameType tells them apart
export type StoredRoom = GameRoom | CasinoRoom | DominoRoom;
export const isCasinoRoom = (room: StoredRoom | null | undefined): room is CasinoRoom =>
  room?.gameType === CASINO_GAME_TYPE;
export const isDominoRoom = (room: StoredRoom | null | undefined): room is DominoRoom =>
  room?.gameType === DOMINOES_GAME_TYPE;
// Joda Memory rooms (older ones were saved without a gameType)
export const isMemoryRoom = (room: StoredRoom | null | undefined): room is GameRoom =>
  !!room && (room.gameType === undefined || room.gameType === 'joda-memory');

const KEY_PREFIX = 'jodafun:room:';
const TTL_SECONDS = 24 * 60 * 60;

function serializeRoom(room: StoredRoom): string {
  // Dates become ISO strings; everything else is plain JSON
  return JSON.stringify(room);
}

export function deserializeRoom(raw: string): StoredRoom | null {
  try {
    const room = JSON.parse(raw);
    if (typeof room?.id !== 'string' || !Array.isArray(room.players)) return null;
    if (room.gameType === CASINO_GAME_TYPE) {
      // A match that fails its card accounting is dropped rather than played on
      if (room.match) room.match = restoreMatch(room.match);
      return room as CasinoRoom;
    }
    if (room.gameType === DOMINOES_GAME_TYPE) {
      // A match that fails its tile accounting is dropped (the seats and unsaved results are kept)
      if (room.match) {
        try {
          room.match = restoreDominoMatch(room.match);
        } catch (error) {
          console.error(`Dropping an invalid Dominoes match in room ${room.id}:`, error);
          room.match = null;
          room.status = 'lobby';
        }
      }
      return room as DominoRoom;
    }
    room.gameStartedAt = room.gameStartedAt ? new Date(room.gameStartedAt) : null;
    return room as GameRoom;
  } catch {
    return null;
  }
}

/**
 * Rooms live in memory (the cache every read hits). When REDIS_URL is set, every
 * save is also written to Redis so rooms survive a restart; Redis is only read at boot.
 * This is a cache with persistence, not shared state: exactly one backend process owns the rooms.
 */
@Injectable()
export class RoomStore implements OnModuleDestroy {
  private cache = new Map<string, StoredRoom>();
  private redis: Redis | null = null;
  private loaded: Promise<StoredRoom[]> | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url);
      this.redis.on('error', error => console.error('Redis error:', error.message));
    }
  }

  get durable(): boolean {
    return this.redis !== null;
  }

  // Joda Memory rooms only; a Casino or Dominoes room's code is not a Memory room
  get(code: string): GameRoom | undefined {
    const room = this.cache.get(code);
    return isMemoryRoom(room) ? room : undefined;
  }

  getCasino(code: string): CasinoRoom | undefined {
    const room = this.cache.get(code);
    return isCasinoRoom(room) ? room : undefined;
  }

  getDominoes(code: string): DominoRoom | undefined {
    const room = this.cache.get(code);
    return isDominoRoom(room) ? room : undefined;
  }

  gameTypeOf(code: string): string | undefined {
    const room = this.cache.get(code);
    return room ? (room.gameType ?? 'joda-memory') : undefined;
  }

  // Any game's room: room codes are unique across games
  has(code: string): boolean {
    return this.cache.has(code);
  }

  // Joda Memory rooms only
  values(): GameRoom[] {
    return [...this.cache.values()].filter(isMemoryRoom);
  }

  casinoRooms(): CasinoRoom[] {
    return [...this.cache.values()].filter(isCasinoRoom);
  }

  dominoRooms(): DominoRoom[] {
    return [...this.cache.values()].filter(isDominoRoom);
  }

  allRooms(): StoredRoom[] {
    return [...this.cache.values()];
  }

  // Call after every mutation; writes are sent in order on one connection
  save(room: StoredRoom) {
    room.updatedAt = Date.now();
    this.cache.set(room.id, room);
    this.redis
      ?.set(KEY_PREFIX + room.id, serializeRoom(room), 'EX', TTL_SECONDS)
      .catch(error => console.error(`Failed to persist room ${room.id}:`, error));
  }

  delete(code: string) {
    this.cache.delete(code);
    this.redis
      ?.del(KEY_PREFIX + code)
      .catch(error => console.error(`Failed to delete room ${code}:`, error));
  }

  // Reads one room straight from Redis, bypassing the cache (null without Redis)
  async fetch(code: string): Promise<StoredRoom | null> {
    if (!this.redis) return null;
    const raw = await this.redis.get(KEY_PREFIX + code);
    return raw ? deserializeRoom(raw) : null;
  }

  // Loads every persisted room into the cache once (boot only); every caller gets the same list
  loadAll(): Promise<StoredRoom[]> {
    this.loaded ??= this.readAll();
    return this.loaded;
  }

  private async readAll(): Promise<StoredRoom[]> {
    if (!this.redis) return [];
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 200);
      keys.push(...batch);
      cursor = next;
    } while (cursor !== '0');

    const rooms: StoredRoom[] = [];
    for (let i = 0; i < keys.length; i += 200) {
      const values = await this.redis.mget(keys.slice(i, i + 200));
      for (const raw of values) {
        const room = raw ? deserializeRoom(raw) : null;
        if (room) {
          this.cache.set(room.id, room);
          rooms.push(room);
        }
      }
    }
    return rooms;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
