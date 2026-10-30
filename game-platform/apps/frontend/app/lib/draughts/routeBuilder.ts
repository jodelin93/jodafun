import type { Move, Route, Square } from './types';

// Building a route one landing at a time from the server's legal moves. Nothing here decides what
// is legal: every choice offered is a step of at least one move in `legal`.

const startsWith = (path: Square[], prefix: Square[]) => prefix.every((s, i) => path[i] === s);

// The legal moves that begin with the route chosen so far
export function matchingMoves(legal: Move[], route: Route): Move[] {
  return legal.filter(m => m.from === route.from && m.path.length >= route.path.length && startsWith(m.path, route.path));
}

export type RouteState = {
  matching: Move[];
  // Squares the piece may stop on next (distinct, in the order the server listed them)
  nextLandings: Square[];
  // The legal move equal to the route chosen so far, if there is one: it can be confirmed
  complete: Move | null;
  // Pieces taken by the route so far (the same for every matching move)
  captured: Square[];
};

export function routeState(legal: Move[], route: Route): RouteState {
  const matching = matchingMoves(legal, route);
  const depth = route.path.length;
  const nextLandings: Square[] = [];
  for (const m of matching) {
    const next = m.path[depth];
    if (next !== undefined && !nextLandings.includes(next)) nextLandings.push(next);
  }
  const complete = depth > 0 ? (matching.find(m => m.path.length === depth) ?? null) : null;
  const captured = (complete ?? matching[0])?.captures.slice(0, depth) ?? [];
  return { matching, nextLandings, complete, captured };
}

// Squares holding a piece that has at least one legal move
export const movableSquares = (legal: Move[]) => new Set(legal.map(m => m.from));
