import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export type Difficulty = 'easy' | 'medium' | 'hard';

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
  createdAt: number;
  updatedAt: number;
}

const KEY_PREFIX = 'jodafun:room:';
const TTL_SECONDS = 24 * 60 * 60;

function serializeRoom(room: GameRoom): string {
  // Dates become ISO strings; everything else is plain JSON
  return JSON.stringify(room);
}

function deserializeRoom(raw: string): GameRoom | null {
  try {
    const room = JSON.parse(raw);
    if (typeof room?.id !== 'string' || !Array.isArray(room.players)) return null;
    room.gameStartedAt = room.gameStartedAt ? new Date(room.gameStartedAt) : null;
    return room as GameRoom;
  } catch {
    return null;
  }
}

/**
 * Rooms live in memory (the cache every read hits). When REDIS_URL is set, every
 * save is also written to Redis so rooms survive a restart; Redis is only read at boot.
 */
@Injectable()
export class RoomStore implements OnModuleDestroy {
  private cache = new Map<string, GameRoom>();
  private redis: Redis | null = null;

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

  get(code: string): GameRoom | undefined {
    return this.cache.get(code);
  }

  has(code: string): boolean {
    return this.cache.has(code);
  }

  values(): IterableIterator<GameRoom> {
    return this.cache.values();
  }

  // Call after every mutation; writes are sent in order on one connection
  save(room: GameRoom) {
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
  async fetch(code: string): Promise<GameRoom | null> {
    if (!this.redis) return null;
    const raw = await this.redis.get(KEY_PREFIX + code);
    return raw ? deserializeRoom(raw) : null;
  }

  // Loads every persisted room into the cache (boot only)
  async loadAll(): Promise<GameRoom[]> {
    if (!this.redis) return [];
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 200);
      keys.push(...batch);
      cursor = next;
    } while (cursor !== '0');

    const rooms: GameRoom[] = [];
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
