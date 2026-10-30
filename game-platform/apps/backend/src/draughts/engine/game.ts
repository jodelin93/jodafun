import { LONG_DIAGONAL, SQUARES, isSquare } from './board';
import { allCaptureRoutes, legalMovesFor, sameRoute } from './moves';
import { ENDGAME_16_LIMIT, ENDGAME_5_LIMIT, KING_MOVES_LIMIT, REPETITIONS, RULES_VERSION } from './rules';
import type { Color, DraughtsGame, EndReason, Move, MoveRecord, Piece, Result, RuleError, RuleResult, Square } from './types';

export const opponent = (color: Color): Color => (color === 'white' ? 'black' : 'white');
const MAX_PATH = 20; // the longest possible route is far shorter; bounds client input

// --- Setup ---

// 20 black men on 1–20 and 20 white men on 31–50; white moves first (art. 2.8, 3.3)
export function initialPieces(): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < 20; i++) pieces.push({ id: `b${i + 1}`, color: 'black', kind: 'man', square: i + 1 });
  for (let i = 0; i < 20; i++) pieces.push({ id: `w${i + 1}`, color: 'white', kind: 'man', square: 31 + i });
  return pieces;
}

export function createGame(gameId = 'game', pieces: Piece[] = initialPieces(), turn: Color = 'white'): DraughtsGame {
  const state: DraughtsGame = {
    gameId,
    rulesVersion: RULES_VERSION,
    version: 1,
    pieces: pieces.map(p => ({ ...p })),
    turn,
    moves: [],
    positions: [],
    kingMoves: 0,
    endgame: null,
    longDiagonal: null,
    drawOffer: null,
    status: 'playing',
    result: null,
  };
  state.positions = [positionKey(state)];
  updateEndgame(state);
  const over = decisiveResult(state);
  if (over) finish(state, over);
  return state;
}

// The position as art. 6.1 compares it: which kind and colour stands on each square, and who is to
// move. Piece ids, move history and display orientation play no part.
export function positionKey(state: Pick<DraughtsGame, 'pieces' | 'turn'>): string {
  const cells: string[] = new Array(SQUARES).fill('.');
  for (const p of state.pieces) cells[p.square - 1] = p.color === 'white' ? (p.kind === 'man' ? 'w' : 'W') : p.kind === 'man' ? 'b' : 'B';
  return `${state.turn === 'white' ? 'W' : 'B'}:${cells.join('')}`;
}

// --- Moves ---

export function legalMoves(state: DraughtsGame): Move[] {
  return state.status === 'playing' ? legalMovesFor(state.pieces, state.turn) : [];
}

// A route as sent by a client: the starting square and every square the piece stops on
export function parseRoute(raw: unknown): { ok: true; route: { from: Square; path: Square[] } } | { ok: false } {
  if (typeof raw !== 'object' || raw === null) return { ok: false };
  const { from, path } = raw as { from?: unknown; path?: unknown };
  if (!isSquare(from) || !Array.isArray(path) || path.length === 0 || path.length > MAX_PATH || !path.every(isSquare)) return { ok: false };
  return { ok: true, route: { from, path: [...path] } };
}

const fail = (code: RuleError['code'], params?: RuleError['params']): RuleResult => ({ ok: false, error: { code, params } });

// Explains why a route is not one of the legal moves, in the terms of the rules
function explain(state: DraughtsGame, route: { from: Square; path: Square[] }, legal: Move[]): RuleResult {
  const piece = state.pieces.find(p => p.square === route.from);
  if (!piece) return fail('NO_PIECE', { square: route.from });
  if (piece.color !== state.turn) return fail('NOT_YOUR_PIECE', { square: route.from });
  const most = legal[0]?.captures.length ?? 0;
  if (most === 0) return fail('ILLEGAL_MOVE');
  const startsLegal = legal.some(m => m.from === route.from && m.path.length > route.path.length && route.path.every((s, i) => s === m.path[i]));
  if (startsLegal) return fail('INCOMPLETE_CAPTURE', { count: most });
  if (allCaptureRoutes(state.pieces, state.turn).some(m => sameRoute(m, route))) return fail('MAX_CAPTURE_REQUIRED', { count: most });
  return fail('CAPTURE_REQUIRED', { count: most });
}

// Validates a whole route against the legal moves and plays it. The state given is never changed;
// a rejected route changes nothing.
export function playMove(state: DraughtsGame, color: Color, route: { from: Square; path: Square[] }): RuleResult {
  if (state.status !== 'playing') return fail('NOT_PLAYING');
  if (state.turn !== color) return fail('NOT_YOUR_TURN');
  const legal = legalMoves(state);
  const move = legal.find(m => sameRoute(m, route));
  if (!move) return explain(state, route, legal);

  const next = structuredClone(state);
  const piece = next.pieces.find(p => p.square === move.from)!;
  const kind = piece.kind;
  const capturedIds = move.captures.map(sq => next.pieces.find(p => p.square === sq)!.id);
  // Captured pieces leave the board only once the route is complete (art. 4.11)
  next.pieces = next.pieces.filter(p => !capturedIds.includes(p.id));
  piece.square = move.path.at(-1)!;
  if (move.promotes) piece.kind = 'king';

  const record: MoveRecord = {
    ...move,
    ply: state.moves.length + 1,
    color,
    pieceId: piece.id,
    kind,
    capturedIds,
    notation: notation(move, legal),
  };
  next.moves.push(record);
  next.turn = opponent(color);
  next.drawOffer = null; // a move withdraws any offer made before it
  next.version += 1;

  // Art. 6 counters
  const irreversible = kind === 'man' || move.captures.length > 0;
  next.kingMoves = irreversible ? 0 : next.kingMoves + 1;
  next.positions = irreversible ? [positionKey(next)] : [...next.positions, positionKey(next)];
  updateEndgame(next);

  // A win on this move takes precedence over every draw rule (art. 6.3, 6.4 last sentence)
  const result = decisiveResult(next) ?? drawResult(next);
  if (result) finish(next, result);
  return { ok: true, state: next, move: record };
}

// "from-to" for a move, "fromxto" for a capture (art. 8.2); the stops in between are added only
// when another legal capture shares the same start, end and count
function notation(move: Move, legal: Move[]): string {
  const to = move.path.at(-1)!;
  if (move.captures.length === 0) return `${move.from}-${to}`;
  const ambiguous = legal.some(m => m !== move && m.from === move.from && m.path.at(-1) === to);
  return ambiguous ? [move.from, ...move.path].join('x') : `${move.from}x${to}`;
}

// --- Results ---

// Art. 7.2.2 / 7.2.3: the player to move has no piece, or no legal move
function decisiveResult(state: DraughtsGame): Result | null {
  const mine = state.pieces.filter(p => p.color === state.turn);
  if (mine.length === 0) return { winner: opponent(state.turn), reason: 'no-pieces' };
  if (legalMovesFor(state.pieces, state.turn).length === 0) return { winner: opponent(state.turn), reason: 'blocked' };
  return null;
}

function drawResult(state: DraughtsGame): Result | null {
  const current = state.positions.at(-1);
  if (current && state.positions.filter(p => p === current).length >= REPETITIONS) return { winner: null, reason: 'repetition' };
  if (state.kingMoves >= KING_MOVES_LIMIT) return { winner: null, reason: 'kings-25' };
  const ply = state.moves.length;
  if (state.longDiagonal && ply - state.longDiagonal.startPly >= ENDGAME_5_LIMIT) return { winner: null, reason: 'long-diagonal-5' };
  if (state.endgame && ply - state.endgame.startPly >= state.endgame.limitPlies) {
    return { winner: null, reason: state.endgame.rule === '6.3' ? 'endgame-16' : 'endgame-5' };
  }
  return null;
}

type Material = { kings: number; men: number };
const materialOf = (state: DraughtsGame, color: Color): Material => ({
  kings: state.pieces.filter(p => p.color === color && p.kind === 'king').length,
  men: state.pieces.filter(p => p.color === color && p.kind === 'man').length,
});
const isLoneKing = (m: Material) => m.kings === 1 && m.men === 0;
// Art. 6.3: three kings, two kings and a man, or a king and two men, against one king
const isSixteen = (m: Material) => (m.kings === 3 && m.men === 0) || (m.kings === 2 && m.men === 1) || (m.kings === 1 && m.men === 2);
// Art. 6.4: two kings, a king and a man, or one king, against one king
const isFive = (m: Material) => (m.kings === 2 && m.men === 0) || (m.kings === 1 && m.men === 1) || (m.kings === 1 && m.men === 0);

// Starts the art. 6.3 / 6.4 counts when their material first appears. Once a 16-move count runs,
// a capture doesn't restart or shorten it ("the maximum of 16 moves remains valid").
function updateEndgame(state: DraughtsGame) {
  const white = materialOf(state, 'white');
  const black = materialOf(state, 'black');
  const ply = state.moves.length;
  if (!state.endgame) {
    if ((isLoneKing(black) && isSixteen(white)) || (isLoneKing(white) && isSixteen(black))) {
      state.endgame = { rule: '6.3', startPly: ply, limitPlies: ENDGAME_16_LIMIT };
    } else if ((isLoneKing(black) && isFive(white)) || (isLoneKing(white) && isFive(black))) {
      state.endgame = { rule: '6.4', startPly: ply, limitPlies: ENDGAME_5_LIMIT };
    }
  }
  // Art. 6.3 exception: once the player with the single king holds the long diagonal alone, 5 more
  // moves each at most
  if (state.endgame?.rule === '6.3' && !state.longDiagonal) {
    const lone = isLoneKing(white) && !isLoneKing(black) ? 'white' : isLoneKing(black) && !isLoneKing(white) ? 'black' : null;
    const onDiagonal = state.pieces.filter(p => LONG_DIAGONAL.includes(p.square));
    if (lone && onDiagonal.length === 1 && onDiagonal[0]!.color === lone && onDiagonal[0]!.kind === 'king') {
      state.longDiagonal = { startPly: ply };
    }
  }
}

function finish(state: DraughtsGame, result: Result) {
  state.status = 'finished';
  state.result = result;
  state.drawOffer = null;
}

// --- Resignation, forfeit and draw offers ---

export function resign(state: DraughtsGame, color: Color): RuleResult {
  if (state.status !== 'playing') return fail('NOT_PLAYING');
  const next = structuredClone(state);
  finish(next, { winner: opponent(color), reason: 'resignation' });
  next.version += 1;
  return { ok: true, state: next };
}

export function forfeit(state: DraughtsGame, color: Color): DraughtsGame {
  if (state.status !== 'playing') return state;
  const next = structuredClone(state);
  finish(next, { winner: opponent(color), reason: 'forfeit' });
  next.version += 1;
  return next;
}

// A draw offer is tied to the position it was made in: any move withdraws it (art. 7.3.1)
export function offerDraw(state: DraughtsGame, color: Color): RuleResult {
  if (state.status !== 'playing') return fail('NOT_PLAYING');
  if (state.drawOffer?.by === color) return { ok: true, state };
  if (state.drawOffer) return fail('DRAW_OFFER_PENDING');
  const next = structuredClone(state);
  next.drawOffer = { by: color, version: next.version + 1 };
  next.version += 1;
  return { ok: true, state: next };
}

// Accepting needs the version the offer was made at, so an answer to an offer that a later move
// withdrew can't end the game
export function answerDraw(state: DraughtsGame, color: Color, accept: boolean, offerVersion: number): RuleResult {
  if (state.status !== 'playing') return fail('NOT_PLAYING');
  const offer = state.drawOffer;
  if (!offer) return fail('NO_DRAW_OFFER');
  if (offer.by === color) return fail('OWN_DRAW_OFFER');
  if (offer.version !== offerVersion) return fail('STALE_DRAW_OFFER');
  const next = structuredClone(state);
  next.drawOffer = null;
  if (accept) finish(next, { winner: null, reason: 'agreement' });
  next.version += 1;
  return { ok: true, state: next };
}

// --- Views and persistence ---

export interface PublicDraughtsView {
  gameId: string;
  rulesVersion: string;
  version: number;
  pieces: Piece[];
  turn: Color;
  moves: MoveRecord[];
  legalMoves: Move[]; // for the player to move: the board is public, so this hides nothing
  counters: { kingMoves: number; endgame: DraughtsGame['endgame']; longDiagonal: DraughtsGame['longDiagonal']; repetitions: number };
  drawOffer: DraughtsGame['drawOffer'];
  status: DraughtsGame['status'];
  result: Result | null;
}

export function publicView(state: DraughtsGame): PublicDraughtsView {
  const current = state.positions.at(-1);
  return {
    gameId: state.gameId,
    rulesVersion: state.rulesVersion,
    version: state.version,
    pieces: state.pieces.map(p => ({ ...p })),
    turn: state.turn,
    moves: structuredClone(state.moves),
    legalMoves: legalMoves(state),
    counters: {
      kingMoves: state.kingMoves,
      endgame: state.endgame ? { ...state.endgame } : null,
      longDiagonal: state.longDiagonal ? { ...state.longDiagonal } : null,
      repetitions: current ? state.positions.filter(p => p === current).length : 1,
    },
    drawOffer: state.drawOffer ? { ...state.drawOffer } : null,
    status: state.status,
    result: state.result ? { ...state.result } : null,
  };
}

// Pieces are 40 at most, each on its own valid square, with valid ids and kinds
export function assertValidState(state: DraughtsGame) {
  const squares = new Set<number>();
  const ids = new Set<string>();
  for (const p of state.pieces) {
    if (!isSquare(p.square) || squares.has(p.square)) throw new Error(`Draughts state has a bad or doubled square ${p.square}`);
    if (ids.has(p.id) || !/^[wb]([1-9]|1\d|20)$/.test(p.id)) throw new Error(`Draughts state has a bad piece id ${p.id}`);
    if ((p.color === 'white') !== p.id.startsWith('w') || (p.kind !== 'man' && p.kind !== 'king')) throw new Error(`Draughts piece ${p.id} is malformed`);
    squares.add(p.square);
    ids.add(p.id);
  }
  if (state.pieces.length > 40) throw new Error('Draughts state has too many pieces');
}

export const serializeGame = (state: DraughtsGame) => JSON.stringify(state);

export function restoreGame(raw: string | DraughtsGame): DraughtsGame {
  const state = (typeof raw === 'string' ? JSON.parse(raw) : raw) as DraughtsGame;
  state.drawOffer ??= null;
  state.longDiagonal ??= null;
  assertValidState(state);
  return state;
}

// Plays a recorded game again from the start; the same routes always give the same state
export function replay(gameId: string, routes: { from: Square; path: Square[] }[]): DraughtsGame {
  let state = createGame(gameId);
  for (const route of routes) {
    const result = playMove(state, state.turn, route);
    if (!result.ok) throw new Error(`Replay rejected ${route.from}-${route.path.join('-')}: ${result.error.code}`);
    state = result.state;
  }
  return state;
}

export type { EndReason };
