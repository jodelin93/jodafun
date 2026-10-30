import type { PrivateMatchView, PublicMatchView } from './engine/match';
import type { CasinoResult } from './casino-results';
import type { HandResult, MatchState, RuleError, RuleErrorCode } from './engine/types';

export const CASINO_GAME_TYPE = 'african-casino';

// A seat at a Casino room. playerKey, socketId and userId never leave the server.
export interface CasinoPlayer {
  id: string; // public, random, stable while the player holds the seat
  name: string;
  seat: number;
  userId: string;
  playerKey: string;
  socketId: string;
  connected: boolean;
  disconnectedAt: number | null;
  isReady: boolean;
}

export interface CasinoOutcome {
  matchId: string;
  winnerTeam: number | null; // null when a match was abandoned before anyone played
  scores: number[];
  forfeit: boolean;
  forfeitTeam: number | null;
  results: HandResult[];
  finishedAt: number;
}

// The players a match started with, kept for results even if someone leaves
export interface CasinoMatchPlayer {
  id: string;
  name: string;
  userId: string;
  seat: number;
}

// One answered turn request, so a retry gets the same answer instead of being applied twice
export interface ProcessedRequest {
  requestId: string;
  ack: CasinoAck<{ version: number }>;
}

export interface CasinoRoom {
  gameType: typeof CASINO_GAME_TYPE;
  id: string;
  hostId: string; // player id
  capacity: 2 | 4;
  targetPoints: number;
  players: CasinoPlayer[];
  status: 'lobby' | 'playing' | 'finished';
  match: MatchState | null;
  matchId: string | null;
  matchStartedAt: number | null;
  matchPlayers: CasinoMatchPlayer[] | null;
  outcome: CasinoOutcome | null;
  pendingResults: CasinoResult[]; // finished matches not yet written to the database
  processed: Record<string, ProcessedRequest[]>; // by player id
  createdAt: number;
  updatedAt: number;
}

// --- Event contracts (the frontend mirrors these in app/lib/casino/types.ts) ---

export type CasinoErrorCode =
  | RuleErrorCode
  | 'AUTH_REQUIRED'
  | 'ROOM_NOT_FOUND'
  | 'WRONG_GAME' // the code belongs to another game; params.gameType says which
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_SEATED'
  | 'ALREADY_SEATED'
  | 'SEAT_TAKEN'
  | 'NOT_HOST'
  | 'INVALID_TARGET'
  | 'INVALID_NAME'
  | 'STALE_STATE'
  | 'BAD_REQUEST_ID'
  | 'RATE_LIMITED'
  | 'NOT_FINISHED';

export type CasinoAck<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: CasinoErrorCode; params?: RuleError['params'] & { gameType?: string }; action?: number; version?: number };

export interface PublicSeat {
  seat: number;
  team: number;
  player: { id: string; name: string; connected: boolean; isReady: boolean; isHost: boolean } | null;
}

// casino:room, sent to everyone in the room after every change
export interface CasinoRoomView {
  id: string;
  gameType: typeof CASINO_GAME_TYPE;
  capacity: 2 | 4;
  targetPoints: number;
  status: CasinoRoom['status'];
  seats: PublicSeat[];
  match: PublicMatchView | null;
  outcome: CasinoOutcome | null;
}

// casino:private, sent to one player only
export interface CasinoPrivateView {
  roomId: string;
  playerId: string;
  seat: number;
  match: PrivateMatchView | null;
}

// Invitation details carried by invite:received for a Casino room
export interface CasinoInviteInfo {
  game: typeof CASINO_GAME_TYPE;
  roomId: string;
  capacity: 2 | 4;
}
