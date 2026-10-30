import type { PauseView, RoomPause } from '../game/team-room';
import type { WireCell } from './engine/coords';
import type { AreaCell, FiveSummary } from './engine/game';
import type { FiveEndReason, FiveErrorCode, FiveGame, FiveMove, FiveSymbol } from './engine/types';

export const FIVE_GAME_TYPE = 'five-in-a-row';

// Largest visible area a client may load at once, per axis (a message limit, not an edge of the
// board: any area anywhere can be loaded)
export const MAX_AREA_SPAN = 256n;
export const MAX_HISTORY_PAGE = 200;
// Beyond this many missed moves a reconnecting client reloads its area instead of replaying events
export const MAX_CATCH_UP = 500;

// A seat. playerKey, socketId and userId never leave the server.
export interface FivePlayer {
  id: string; // public, random, stable while the player holds the seat
  name: string;
  seat: 0 | 1;
  userId: string;
  playerKey: string;
  socketId: string;
  connected: boolean;
  disconnectedAt: number | null;
  isReady: boolean;
}

export interface FiveOutcome {
  gameId: string;
  winner: FiveSymbol | null; // null only when a game was abandoned before any move
  reason: FiveEndReason;
  moves: number;
  winLine: WireCell[] | null;
  finishedAt: number;
}

export interface FiveGamePlayer {
  id: string;
  name: string;
  userId: string;
  seat: 0 | 1;
  symbol: FiveSymbol;
}

// A finished game waiting to be written to the database (kept with the room until it is)
export interface FiveResult {
  outcome: FiveOutcome;
  players: FiveGamePlayer[];
  rulesVersion: string;
  moves: FiveMove[];
  startedAt: number;
}

export interface ProcessedRequest {
  requestId: string;
  ack: FiveAck<{ version: number }>;
}

export interface FiveRoom {
  gameType: typeof FIVE_GAME_TYPE;
  id: string;
  hostId: string;
  players: FivePlayer[];
  status: 'lobby' | 'playing' | 'finished';
  // Seat 0's symbol for the next or current game: random for the room's first game, swapped for
  // every rematch
  seat0Symbol: FiveSymbol | null;
  game: FiveGame | null;
  gameStartedAt: number | null;
  gamePlayers: FiveGamePlayer[] | null;
  outcome: FiveOutcome | null;
  paused?: RoomPause | null;
  pendingResults: FiveResult[];
  processed: Record<string, ProcessedRequest[]>; // by player id
  createdAt: number;
  updatedAt: number;
}

// --- Event contracts (the frontend mirrors these in app/lib/five/types.ts) ---
//
// Coordinates travel as canonical decimal strings ({ x: "-12", y: "345" }) of any size.
//
// Client → server, each answered through the Socket.IO acknowledgement with a FiveAck:
//   five:create   { name, playerKey }                                     → { roomId, playerId }
//   five:join     { roomId, name, playerKey }                             → { roomId, playerId, rejoined }
//   five:rejoin   { roomId, playerKey }                                   → { roomId, playerId, rejoined }
//   five:ready    { roomId, ready }      (the game starts when both seats are ready)
//   five:place    { roomId, gameId, version, requestId, x, y }            → { version, move }
//   five:resign   { roomId, gameId, version, requestId }                  → { version }
//   five:pause / five:resume { roomId }
//   five:rematch  { roomId }             (a new game with a new id; symbols swap)
//   five:leave    { roomId }
//   five:area     { roomId, gameId, from: {x,y}, to: {x,y} }              → { gameId, version, cells: AreaCell[] }
//                 (each side of the area at most MAX_AREA_SPAN cells; AREA_TOO_LARGE otherwise)
//   five:history  { roomId, gameId, beforePly?, limit? }                  → { moves: FiveMove[], hasMore }
//                 (newest first, at most MAX_HISTORY_PAGE per page)
//   five:since    { roomId, gameId, version }                            → { gameId, version, moves: FiveMove[] }
//                 or { gameId, version, resync: true } when more than MAX_CATCH_UP moves were missed
//   five:tutorial { step }  five:tutorialCheck { step, cell: {x,y} }
//
// Server → client:
//   five:room     FiveRoomView   after seat, status, pause or end-of-game changes (bounded size)
//   five:move     FiveMoveEvent  after every placement: just the new move, never the history
//   five:seatLost { roomId }

export interface FiveMoveEvent {
  roomId: string;
  gameId: string;
  version: number; // the game version after this move; apply only if it is your version + 1
  move: FiveMove;
  turn: FiveSymbol;
  status: FiveGame['status'];
  winner: FiveSymbol | null;
  winLine: WireCell[] | null;
}

export type FiveServerErrorCode =
  | FiveErrorCode
  | 'AUTH_REQUIRED'
  | 'BAD_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'WRONG_GAME'
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_SEATED'
  | 'ALREADY_SEATED'
  | 'INVALID_NAME'
  | 'STALE_STATE' // carries the current version: fetch five:since
  | 'OLD_GAME' // the gameId is not the room's current game
  | 'AREA_TOO_LARGE'
  | 'BAD_REQUEST_ID'
  | 'RATE_LIMITED'
  | 'NOT_FINISHED'
  | 'PAUSED'
  | 'NOT_PAUSER';

export type FiveAck<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: FiveServerErrorCode; params?: { gameType?: string }; version?: number };

export interface PublicFiveSeat {
  seat: 0 | 1;
  symbol: FiveSymbol | null; // null before the room's first game
  player: {
    id: string;
    name: string;
    connected: boolean;
    graceEndsAt: number | null;
    isReady: boolean;
    isHost: boolean;
  } | null;
}

export interface FiveRoomView {
  id: string;
  gameType: typeof FIVE_GAME_TYPE;
  status: FiveRoom['status'];
  seats: PublicFiveSeat[];
  game: FiveSummary | null; // the recent moves only; older ones come from five:area / five:history
  outcome: FiveOutcome | null;
  paused: PauseView | null;
}

export type { AreaCell, FiveMove, FiveSummary, FiveSymbol, WireCell };
