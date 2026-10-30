import type { PauseView, RoomPause } from '../game/team-room';
import type { PublicDraughtsView } from './engine/game';
import type { Color, DraughtsGame, EndReason, RuleError, RuleErrorCode, Square } from './engine/types';

export const DRAUGHTS_GAME_TYPE = 'international-draughts';

// A seat at a draughts room. playerKey, socketId and userId never leave the server.
export interface DraughtsPlayer {
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

export interface DraughtsOutcome {
  gameId: string;
  winner: Color | null; // null for a draw
  reason: EndReason;
  moves: number;
  finishedAt: number;
}

// A match is a series of games: whoever wins SERIES_STREAK games in a row wins it. A draw leaves
// both runs as they are; a loss puts the loser's run back to 0. Leaving or staying away forfeits
// the whole match.
export const SERIES_STREAK = 4;

export interface DraughtsSeries {
  id: string;
  games: number;
  wins: [number, number]; // by seat
  draws: number;
  streak: [number, number]; // consecutive wins by seat
  winnerSeat: 0 | 1 | null; // set when the match is decided
  forfeit: boolean;
}

// The players a game started with and their colours, kept for results even if someone leaves
export interface DraughtsGamePlayer {
  id: string;
  name: string;
  userId: string;
  seat: 0 | 1;
  color: Color;
}

// A finished game waiting to be written to the database (kept with the room until it is)
export interface DraughtsResult {
  outcome: DraughtsOutcome;
  players: DraughtsGamePlayer[];
  rulesVersion: string;
  routes: { from: Square; path: Square[] }[]; // every accepted move, replayable
  notation: string[];
  startedAt: number;
  // The match this game belongs to, as it stood after the game
  series?: { id: string; game: number; streak: [number, number]; winnerColor: Color | null; decided: boolean };
}

export interface ProcessedRequest {
  requestId: string;
  ack: DraughtsAck<{ version: number }>;
}

export interface DraughtsRoom {
  gameType: typeof DRAUGHTS_GAME_TYPE;
  id: string;
  hostId: string; // player id
  players: DraughtsPlayer[];
  status: 'lobby' | 'playing' | 'finished';
  // Seat 0's colour for the next or current game: random for the room's first game, swapped for
  // every rematch
  seat0Color: Color | null;
  game: DraughtsGame | null;
  gameStartedAt: number | null;
  gamePlayers: DraughtsGamePlayer[] | null;
  outcome: DraughtsOutcome | null;
  series?: DraughtsSeries | null; // missing on rooms saved before matches existed
  paused?: RoomPause | null;
  pendingResults: DraughtsResult[];
  processed: Record<string, ProcessedRequest[]>; // by player id
  createdAt: number;
  updatedAt: number;
}

// --- Event contracts (the frontend mirrors these in app/lib/draughts/types.ts) ---
//
// Client → server, each answered through the Socket.IO acknowledgement with a DraughtsAck:
//   draughts:create        { name, playerKey }                                → { roomId, playerId }
//   draughts:join          { roomId, name, playerKey }                        → { roomId, playerId, rejoined }
//   draughts:rejoin        { roomId, playerKey }                              → { roomId, playerId, rejoined }
//   draughts:ready         { roomId, ready }        (the game starts when both seats are ready)
//   draughts:move          { roomId, version, requestId, from, path }         → { version }
//   draughts:resign        { roomId, version, requestId }                     → { version }
//   draughts:offerDraw     { roomId, version, requestId }                     → { version }
//   draughts:respondDraw   { roomId, version, requestId, offerVersion, accept } → { version }
//   draughts:pause         { roomId }   draughts:resume { roomId }            (as in the other team games)
//   draughts:rematch       { roomId }   (after a finished game: back to the lobby for the next game of the
//                                       match, or a new match once one is decided; colours swap every game)
//   draughts:leave         { roomId }
//   draughts:tutorial      { step }                                           → { step: { id, index, total, view } }
//   draughts:tutorialCheck { step, route: { from, path } }                    → TutorialCheck
//
// Server → client:
//   draughts:room     DraughtsRoomView   to everyone in the room after every change
//   draughts:seatLost { roomId }         when this socket's seat was taken away (grace expired, another tab)

export type DraughtsErrorCode =
  | RuleErrorCode
  | 'AUTH_REQUIRED'
  | 'BAD_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'WRONG_GAME' // params.gameType says which game the code belongs to
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_SEATED'
  | 'ALREADY_SEATED'
  | 'INVALID_NAME'
  | 'STALE_STATE' // carries the current version: re-sync from the latest draughts:room
  | 'BAD_REQUEST_ID'
  | 'RATE_LIMITED'
  | 'NOT_FINISHED'
  | 'PAUSED'
  | 'NOT_PAUSER';

export type DraughtsAck<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: DraughtsErrorCode; params?: RuleError['params'] & { gameType?: string }; version?: number };

export interface PublicDraughtsSeat {
  seat: 0 | 1;
  color: Color | null; // null in the lobby before the first game (drawn at random when it starts)
  player: {
    id: string;
    name: string;
    connected: boolean;
    graceEndsAt: number | null; // while disconnected: when the seat is forfeited (epoch ms)
    isReady: boolean;
    isHost: boolean;
  } | null;
}

// draughts:room, sent to everyone in the room after every change. The board is public in draughts;
// session ids, socket ids and browser keys never appear.
export interface DraughtsRoomView {
  id: string;
  gameType: typeof DRAUGHTS_GAME_TYPE;
  status: DraughtsRoom['status'];
  seats: PublicDraughtsSeat[];
  game: PublicDraughtsView | null;
  outcome: DraughtsOutcome | null;
  series: (DraughtsSeries & { target: number }) | null;
  paused: PauseView | null;
}
