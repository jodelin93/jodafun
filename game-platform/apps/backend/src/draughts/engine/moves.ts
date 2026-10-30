import { DIRECTIONS, forwardDirections, isPromotionSquare, ray } from './board';
import type { Color, Move, Piece, Square } from './types';

type Occupancy = Map<Square, Piece>;

export const occupancy = (pieces: readonly Piece[]): Occupancy => new Map(pieces.map(p => [p.square, p]));

// Every capture route of one piece, explored to the end (art. 4.5–4.8). Captured pieces stay on the
// board until the route ends (art. 4.11): they block the way and can't be jumped again. Empty
// squares, including the one the piece started from, may be crossed any number of times.
function captureRoutes(piece: Piece, board: Occupancy): Move[] {
  const routes: Move[] = [];
  const isEmpty = (s: Square) => !board.has(s) || s === piece.square;

  const explore = (at: Square, path: Square[], captured: Square[]) => {
    let extended = false;
    for (let d = 0; d < DIRECTIONS.length; d++) {
      const line = ray(at, d);
      if (piece.kind === 'man') {
        // A man captures the adjacent piece, forwards or backwards (art. 4.1, 4.2)
        const over = line[0];
        const land = line[1];
        if (over === undefined || land === undefined) continue;
        const target = board.get(over);
        if (!target || target.color === piece.color || captured.includes(over) || !isEmpty(land)) continue;
        extended = true;
        explore(land, [...path, land], [...captured, over]);
      } else {
        // A king captures at a distance and lands on any free square behind the piece (art. 4.3, 4.6)
        let i = 0;
        while (i < line.length && isEmpty(line[i]!)) i++;
        const over = line[i];
        if (over === undefined) continue;
        const target = board.get(over);
        if (!target || target.color === piece.color || captured.includes(over)) continue;
        for (let j = i + 1; j < line.length && isEmpty(line[j]!); j++) {
          extended = true;
          explore(line[j]!, [...path, line[j]!], [...captured, over]);
        }
      }
    }
    if (!extended && captured.length > 0) {
      // Promotion only when the route ends on the far row (art. 3.5, 4.15)
      routes.push({ from: piece.square, path, captures: captured, promotes: piece.kind === 'man' && isPromotionSquare(piece.color, at) });
    }
  };
  explore(piece.square, [], []);
  return routes;
}

function simpleMoves(piece: Piece, board: Occupancy): Move[] {
  const moves: Move[] = [];
  if (piece.kind === 'man') {
    // One square forwards to a free square of the next row (art. 3.4)
    for (const d of forwardDirections(piece.color)) {
      const to = ray(piece.square, d)[0];
      if (to !== undefined && !board.has(to)) {
        moves.push({ from: piece.square, path: [to], captures: [], promotes: isPromotionSquare(piece.color, to) });
      }
    }
  } else {
    // Any distance over free squares, forwards or backwards (art. 3.9)
    for (let d = 0; d < DIRECTIONS.length; d++) {
      for (const to of ray(piece.square, d)) {
        if (board.has(to)) break;
        moves.push({ from: piece.square, path: [to], captures: [], promotes: false });
      }
    }
  }
  return moves;
}

// Every legal move for `color`. Captures are compulsory and only the routes taking the most pieces
// are allowed, a king counting as one piece like a man (art. 4.13); equal routes are all allowed,
// with a man or a king (art. 4.14). The search covers whole routes for every piece before the
// maximum is applied, so no choice made earlier in a route can hide a longer one.
export function legalMovesFor(pieces: readonly Piece[], color: Color): Move[] {
  const board = occupancy(pieces);
  const own = pieces.filter(p => p.color === color);
  const captures = own.flatMap(p => captureRoutes(p, board));
  if (captures.length > 0) {
    const most = Math.max(...captures.map(m => m.captures.length));
    return dedupe(captures.filter(m => m.captures.length === most));
  }
  return own.flatMap(p => simpleMoves(p, board));
}

// Two explorations can reach the same route (same squares, same captured pieces); keep one
function dedupe(moves: Move[]): Move[] {
  const seen = new Set<string>();
  return moves.filter(m => {
    const key = `${m.from}:${m.path.join(',')}:${m.captures.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Every capture route of `color`, whatever its length (to explain a route that takes too few)
export function allCaptureRoutes(pieces: readonly Piece[], color: Color): Move[] {
  const board = occupancy(pieces);
  return dedupe(pieces.filter(p => p.color === color).flatMap(p => captureRoutes(p, board)));
}

export const sameRoute = (a: { from: Square; path: readonly Square[] }, b: { from: Square; path: readonly Square[] }) =>
  a.from === b.from && a.path.length === b.path.length && a.path.every((s, i) => s === b.path[i]);
