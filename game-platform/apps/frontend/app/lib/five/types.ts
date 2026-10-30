// Mirror of the server contract (apps/backend/src/five/five.types.ts and engine/*). Coordinates
// travel as canonical decimal strings of any size: never turn one into a Number.

export type FiveSymbol = 'X' | 'O';
export type FiveEndReason = 'five' | 'resignation' | 'forfeit';
export const END_REASONS: readonly FiveEndReason[] = ['five', 'resignation', 'forfeit'];

export interface WireCell {
  x: string;
  y: string;
}

export interface FiveMove extends WireCell {
  ply: number; // 1-based
  symbol: FiveSymbol;
}

export interface AreaCell extends WireCell {
  symbol: FiveSymbol;
}

// What everyone sees of a game without its history: the recent moves, counts and the result
export interface FiveSummary {
  gameId: string;
  rulesVersion: string;
  version: number;
  turn: FiveSymbol;
  moveCount: number;
  lastMoves: FiveMove[]; // the most recent moves (at most 40), oldest first
  status: 'playing' | 'finished';
  winner: FiveSymbol | null;
  reason: FiveEndReason | null;
  winLine: WireCell[] | null;
}

// five:move — just the new move, never the history
export interface FiveMoveEvent {
  roomId: string;
  gameId: string;
  version: number; // the game version after this move; apply only if it is ours + 1
  move: FiveMove;
  turn: FiveSymbol;
  status: FiveSummary['status'];
  winner: FiveSymbol | null;
  winLine: WireCell[] | null;
}

export interface FiveOutcome {
  gameId: string;
  winner: FiveSymbol | null;
  reason: FiveEndReason;
  moves: number;
  winLine: WireCell[] | null;
  finishedAt: number;
}

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
  gameType: 'five-in-a-row';
  status: 'lobby' | 'playing' | 'finished';
  seats: PublicFiveSeat[];
  game: FiveSummary | null;
  outcome: FiveOutcome | null;
  paused: { byId: string; byName: string; since: number } | null;
}

export type FiveAck<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: string; params?: { gameType?: string }; version?: number };

export type AreaAck = FiveAck<{ gameId: string; version: number; cells: AreaCell[] }>;
export type HistoryAck = FiveAck<{ moves: FiveMove[]; hasMore: boolean }>;
// The end of the game (turn, status, winner, reason, winning line) comes with the missed moves;
// `resync` instead when too many were missed or the client is ahead
export type SinceAck = FiveAck<{
  gameId: string;
  version: number;
  moves?: FiveMove[];
  resync?: boolean;
  turn?: FiveSymbol;
  status?: FiveSummary['status'];
  winner?: FiveSymbol | null;
  reason?: FiveEndReason | null;
  winLine?: WireCell[] | null;
}>;
export type PlaceAck = FiveAck<{ version: number; move?: FiveMove }>;

// Tutorial (five:tutorial / five:tutorialCheck)
export type TutorialStep = { id: string; index: number; total: number; game: FiveSummary; stones: FiveMove[] };
export type TutorialStepAck = { ok: true; step: TutorialStep } | { ok: false; code?: string };
export type TutorialCheckAck =
  | { ok: false; error?: { code: string }; code?: string }
  | { ok: true; done: boolean; move: FiveMove; game: FiveSummary };

// Server limits (message bounds, not edges of the board)
export const MAX_AREA_SPAN = 256;
export const MAX_COORDINATE_DIGITS = 400;
export const HISTORY_PAGE = 50;

export const otherSymbol = (s: FiveSymbol): FiveSymbol => (s === 'X' ? 'O' : 'X');
