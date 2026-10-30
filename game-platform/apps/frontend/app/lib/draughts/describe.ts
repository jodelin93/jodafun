import { END_REASONS, type DraughtsError, type PublicDraughtsView } from './types';

// A loosely typed translator, so codes coming from the server can pick their message
export type Tx = (key: string, vars?: Record<string, string | number>) => string;

// A server or client error code as a sentence, with the count and square filled in
export function errorMessage(tx: Tx, error: DraughtsError) {
  const key = `err_${error.code}`;
  const p = error.params ?? {};
  const text = tx(key, { count: p.count ?? '', square: p.square ?? '' });
  return text === key ? tx('errUnknown', { code: error.code }) : text;
}

// How a game ended, in plain words
export function reasonText(tx: Tx, reason: string) {
  return (END_REASONS as readonly string[]).includes(reason) ? tx(`reason_${reason}`) : tx('errUnknown', { code: reason });
}

// m:ss for a grace period countdown
export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Limits from FMJD art. 6, in single moves (plies), as the server counts them
const KING_MOVES_LIMIT = 50;
const LONG_DIAGONAL_LIMIT = 10;

// The draw rules that are running, each with the single moves left before it ends the game
export function drawCountdowns(view: PublicDraughtsView): { key: string; left: number }[] {
  const ply = view.moves.length;
  const out: { key: string; left: number }[] = [];
  const { kingMoves, endgame, longDiagonal } = view.counters;
  if (endgame) out.push({ key: endgame.rule === '6.3' ? 'counter16' : 'counter5', left: endgame.limitPlies - (ply - endgame.startPly) });
  if (longDiagonal) out.push({ key: 'counterDiagonal', left: LONG_DIAGONAL_LIMIT - (ply - longDiagonal.startPly) });
  // Only worth showing once kings have been shuffling for a while
  if (kingMoves >= 10) out.push({ key: 'counterKings', left: KING_MOVES_LIMIT - kingMoves });
  return out.filter(c => c.left > 0);
}
