// Mirrors the server's Dominoes contracts (apps/backend/src/dominoes/dominoes.types.ts, engine/types.ts
// and the views in engine/match.ts). The client never decides what is legal: it shows the server's
// `moves` and `canPass` and sends the player's choice back.

// "a-b" with 0 <= a <= b <= 6
export type TileId = string;
export type End = 'left' | 'right';
export type Mode = 'head-to-head' | 'partners';

// One tile on the table; the chain is kept left to right and neighbours touch where a.right === b.left
export interface Placement {
  tile: TileId;
  seat: number;
  left: number;
  right: number;
}

export interface Move {
  tile: TileId;
  end: End | null; // null for the first tile of a hand
}

export type LastAction = { seat: number; type: 'play'; tile: TileId; end: End | null } | { seat: number; type: 'pass' };

export interface HandResult {
  hand: number;
  startSeat: number;
  ending: 'domino' | 'blocked';
  outSeat: number | null;
  remaining: TileId[][];
  pips: number[];
  teamPips: number[];
  winnerTeam: number | null;
  points: number[];
  scoresAfter: number[];
}

export interface PublicDominoView {
  matchId: string;
  rulesVersion: number;
  mode: Mode;
  players: number;
  targetScore: number;
  version: number;
  handNumber: number;
  startSeat: number;
  turn: number;
  status: 'playing' | 'finished';
  winnerTeam: number | null;
  forfeitTeam: number | null;
  board: Placement[];
  ends: { left: number; right: number } | null;
  handCounts: number[];
  unusedCount: number;
  passes: number;
  scores: number[];
  results: HandResult[];
  lastAction: LastAction | null;
}

export interface PrivateDominoView {
  seat: number;
  hand: TileId[];
  moves: Move[];
  canPass: boolean;
}

export interface PublicDominoSeat {
  seat: number;
  team: number;
  player: {
    id: string;
    name: string;
    connected: boolean;
    graceEndsAt: number | null;
    isReady: boolean;
    isHost: boolean;
  } | null;
}

export interface DominoOutcome {
  matchId: string;
  winnerTeam: number | null;
  scores: number[];
  forfeit: boolean;
  forfeitTeam: number | null;
  results: HandResult[];
  finishedAt: number;
}

export interface DominoRoomView {
  id: string;
  gameType: 'dominoes';
  mode: Mode;
  capacity: 2 | 4;
  targetScore: number;
  status: 'lobby' | 'playing' | 'finished';
  seats: PublicDominoSeat[];
  match: PublicDominoView | null;
  outcome: DominoOutcome | null;
}

export interface DominoPrivateView {
  roomId: string;
  playerId: string;
  seat: number;
  match: PrivateDominoView | null;
}

export type RuleErrorCode =
  | 'BAD_MOVE'
  | 'NOT_PLAYING'
  | 'NOT_YOUR_TURN'
  | 'UNKNOWN_TILE'
  | 'NOT_YOUR_TILE'
  | 'MUST_OPEN_WITH'
  | 'CHOOSE_END'
  | 'TILE_DOES_NOT_FIT'
  | 'CAN_PLAY';

export type DominoErrorCode =
  | RuleErrorCode
  | 'AUTH_REQUIRED'
  | 'BAD_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'WRONG_GAME'
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_SEATED'
  | 'ALREADY_SEATED'
  | 'SEAT_TAKEN'
  | 'NOT_HOST'
  | 'NOT_READY'
  | 'INVALID_TARGET'
  | 'INVALID_MODE'
  | 'INVALID_NAME'
  | 'STALE_STATE'
  | 'BAD_REQUEST_ID'
  | 'RATE_LIMITED'
  | 'NOT_FINISHED'
  // Client-side only: no answer before the timeout, or a move is still being sent
  | 'NO_ANSWER'
  | 'BUSY';

export type ErrorParams = { tile?: TileId; end?: End; value?: number; gameType?: string };

export interface DominoError {
  code: string;
  params?: ErrorParams;
}

export type DominoAck<T = object> = ({ ok: true } & T) | { ok: false; code: DominoErrorCode; params?: ErrorParams; version?: number };

// Tutorial (dominoes:tutorial / dominoes:tutorialCheck)
export type TutorialAction = { type: 'play'; move: Move } | { type: 'pass' };
export type TutorialStepAck =
  | { ok: true; step: number; id: string; view: PublicDominoView; me: PrivateDominoView; total: number }
  | { ok: false; code?: string };
export type TutorialCheckAck =
  | { ok: false; error?: DominoError; code?: string }
  | { ok: true; done: boolean; result: HandResult | null; view: PublicDominoView; me: PrivateDominoView };

// --- Small helpers shared by the components (display only) ---

export const DEFAULT_TARGET = 100;
export const MIN_TARGET = 25;
export const MAX_TARGET = 500;
export const TARGETS = [25, 50, 75, 100, 150, 200, 250, 300, 500];

export function tileValues(id: TileId): [number, number] {
  const [a = 0, b = 0] = id.split('-').map(Number);
  return [a, b];
}

export const isDouble = (id: TileId) => {
  const [a, b] = tileValues(id);
  return a === b;
};

export const pipsOf = (id: TileId) => {
  const [a, b] = tileValues(id);
  return a + b;
};

// The number left exposed when the tile's `value` side touches the chain
export function otherValue(id: TileId, value: number) {
  const [a, b] = tileValues(id);
  return a === value ? b : a;
}

export const teamOfSeat = (players: number, seat: number) => (players === 4 ? seat % 2 : seat);
export const partnerOfSeat = (players: number, seat: number) => (players === 4 ? (seat + 2) % 4 : null);
