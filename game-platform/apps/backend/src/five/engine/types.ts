import type { WireCell } from './coords';

export type FiveSymbol = 'X' | 'O';

export interface FiveMove extends WireCell {
  ply: number; // 1-based
  symbol: FiveSymbol;
}

export type FiveEndReason = 'five' | 'resignation' | 'forfeit';

export interface FiveGame {
  gameId: string;
  rulesVersion: string;
  version: number; // bumps on every change; placements must name it
  turn: FiveSymbol;
  // Occupied cells only, by canonical key "x,y"; memory grows with the moves played, never with the
  // distance between them
  cells: Record<string, FiveSymbol>;
  // Occupied cells grouped by 32×32 block ("bx,by" → cell keys), to find the cells of a visible
  // area without walking the whole game
  chunks: Record<string, string[]>;
  moves: FiveMove[]; // in order
  status: 'playing' | 'finished';
  winner: FiveSymbol | null;
  reason: FiveEndReason | null;
  winLine: WireCell[] | null; // the winning run, in order along its axis
}

export type FiveErrorCode = 'NOT_PLAYING' | 'NOT_YOUR_TURN' | 'BAD_CELL' | 'CELL_TAKEN';

export type FiveResult = { ok: true; state: FiveGame; move: FiveMove } | { ok: false; error: { code: FiveErrorCode } };
