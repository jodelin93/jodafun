import type { DominoMatch, HandResult, Mode, RuleError, RuleErrorCode, TileId } from './engine/types';
import type { PrivateDominoView, PublicDominoView } from './engine/match';

export const DOMINOES_GAME_TYPE = 'dominoes';

// A seat at a Dominoes room. playerKey, socketId and userId never leave the server.
export interface DominoPlayer {
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

export interface DominoOutcome {
  matchId: string;
  winnerTeam: number | null; // null when a match was abandoned before any tile was played
  scores: number[];
  forfeit: boolean;
  forfeitTeam: number | null;
  results: HandResult[];
  finishedAt: number;
}

// The players a match started with, kept for results even if someone leaves
export interface DominoMatchPlayer {
  id: string;
  name: string;
  userId: string;
  seat: number;
}

// A finished match waiting to be written to the database (kept with the room until it is)
export interface DominoResult {
  outcome: DominoOutcome;
  players: DominoMatchPlayer[];
  mode: Mode;
  capacity: 2 | 4;
  targetScore: number;
  rulesVersion: number;
  startedAt: number;
}

// One answered move request, so a retry gets the same answer instead of being applied twice
export interface ProcessedRequest {
  requestId: string;
  ack: DominoAck<{ version: number }>;
}

export interface DominoRoom {
  gameType: typeof DOMINOES_GAME_TYPE;
  id: string;
  hostId: string; // player id
  mode: Mode;
  capacity: 2 | 4;
  targetScore: number; // fixed once a match starts
  players: DominoPlayer[];
  status: 'lobby' | 'playing' | 'finished';
  match: DominoMatch | null;
  matchStartedAt: number | null;
  matchPlayers: DominoMatchPlayer[] | null;
  outcome: DominoOutcome | null;
  pendingResults: DominoResult[];
  processed: Record<string, ProcessedRequest[]>; // by player id
  createdAt: number;
  updatedAt: number;
}

// --- Event contracts (the frontend mirrors these in app/lib/dominoes/types.ts) ---
//
// Client → server (every one answers through the Socket.IO acknowledgement with a DominoAck):
//   dominoes:create     { name, playerKey, mode, targetScore? }        → { roomId, playerId }
//   dominoes:join       { roomId, name, playerKey }                     → { roomId, playerId }
//   dominoes:rejoin     { roomId, playerKey }                           → { roomId, playerId }
//   dominoes:chooseSeat { roomId, seat }                                (lobby only)
//   dominoes:setTarget  { roomId, targetScore }                         (host, lobby only)
//   dominoes:ready      { roomId, ready }
//   dominoes:start      { roomId }                                      (host; every seat filled, connected and ready)
//   dominoes:play       { roomId, version, requestId, tile, end }       → { version }
//   dominoes:pass       { roomId, version, requestId }                  → { version }
//   dominoes:rematch    { roomId }                                      (after a finished match: back to the lobby, same seats)
//   dominoes:leave      { roomId }
//   dominoes:tutorial   { step }                                        → { step, id, view, me, total }
//   dominoes:tutorialCheck { step, action }                             → TutorialCheck
//
// Server → client:
//   dominoes:room    DominoRoomView      to everyone in the room after every change
//   dominoes:private DominoPrivateView   to one player after every change
//   dominoes:seatLost { roomId }         when this socket's seat was taken away (forfeit, room closed)

export type DominoErrorCode =
  | RuleErrorCode
  | 'AUTH_REQUIRED'
  | 'BAD_REQUEST' // a malformed request (e.g. a missing or invalid playerKey, an unknown tutorial step)
  | 'ROOM_NOT_FOUND'
  | 'WRONG_GAME' // the code belongs to another game; params.gameType says which
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_SEATED'
  | 'ALREADY_SEATED'
  | 'SEAT_TAKEN'
  | 'NOT_HOST'
  | 'NOT_READY' // start asked for before every seat is filled, connected and ready
  | 'INVALID_TARGET'
  | 'INVALID_MODE'
  | 'INVALID_NAME'
  | 'STALE_STATE'
  | 'BAD_REQUEST_ID'
  | 'RATE_LIMITED'
  | 'NOT_FINISHED';

export type DominoAck<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: DominoErrorCode; params?: RuleError['params'] & { gameType?: string }; version?: number };

export interface PublicDominoSeat {
  seat: number;
  team: number;
  player: {
    id: string;
    name: string;
    connected: boolean;
    graceEndsAt: number | null; // while disconnected: when the seat is forfeited (epoch ms)
    isReady: boolean;
    isHost: boolean;
  } | null;
}

// dominoes:room, sent to everyone in the room after every change
export interface DominoRoomView {
  id: string;
  gameType: typeof DOMINOES_GAME_TYPE;
  mode: Mode;
  capacity: 2 | 4;
  targetScore: number;
  status: DominoRoom['status'];
  seats: PublicDominoSeat[];
  match: PublicDominoView | null;
  outcome: DominoOutcome | null;
}

// dominoes:private, sent to one player only
export interface DominoPrivateView {
  roomId: string;
  playerId: string;
  seat: number;
  match: PrivateDominoView | null;
}

// Invitation details carried by invite:received for a Dominoes room
export interface DominoInviteInfo {
  game: typeof DOMINOES_GAME_TYPE;
  roomId: string;
  capacity: 2 | 4;
}

export type { TileId };
