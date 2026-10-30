import { cellKey, chunkOf, fromWire, parseCell, toWire, type Cell, type WireCell } from './coords';
import type { FiveErrorCode, FiveGame, FiveMove, FiveResult, FiveSymbol } from './types';

/**
 * Infinite five-in-a-row ("Morpion infini"): X moves first, one symbol per turn on any free cell of
 * an unbounded grid, and the first unbroken run of five or more identical symbols horizontally,
 * vertically or diagonally wins. Symbols never move. There is no draw and no move limit.
 */
export const RULES_VERSION = 'five-in-a-row-1';
export const WIN_LENGTH = 5;

// The four axes through a cell, in the fixed order used to pick the reported line
export const AXES: readonly [bigint, bigint][] = [
  [1n, 0n], // horizontal
  [0n, 1n], // vertical
  [1n, 1n], // diagonal
  [1n, -1n], // anti-diagonal
];

export const other = (s: FiveSymbol): FiveSymbol => (s === 'X' ? 'O' : 'X');

export function createGame(gameId = 'game'): FiveGame {
  return { gameId, rulesVersion: RULES_VERSION, version: 1, turn: 'X', cells: {}, chunks: {}, moves: [], status: 'playing', winner: null, reason: null, winLine: null };
}

// The run of `symbol` through `at` along one axis, both ways, counting `at` once. Stops at the
// first free cell or opponent symbol; `limit` caps each direction (4 decides a win; the full run
// is walked only to report it).
function runThrough(cells: Record<string, FiveSymbol>, at: Cell, [dx, dy]: [bigint, bigint], symbol: FiveSymbol, limit = Infinity): Cell[] {
  const back: Cell[] = [];
  for (let i = 1n; back.length < limit; i++) {
    const c = { x: at.x - dx * i, y: at.y - dy * i };
    if (cells[cellKey(c)] !== symbol) break;
    back.push(c);
  }
  const forward: Cell[] = [];
  for (let i = 1n; forward.length < limit; i++) {
    const c = { x: at.x + dx * i, y: at.y + dy * i };
    if (cells[cellKey(c)] !== symbol) break;
    forward.push(c);
  }
  return [...back.reverse(), at, ...forward];
}

// The winning run through the last symbol, if any: the first axis in AXES order that has five or
// more in a row (several at once still end the game once), reported whole and in axis order
export function winningLine(cells: Record<string, FiveSymbol>, at: Cell, symbol: FiveSymbol): Cell[] | null {
  for (const axis of AXES) {
    if (runThrough(cells, at, axis, symbol, WIN_LENGTH - 1).length >= WIN_LENGTH) return runThrough(cells, at, axis, symbol);
  }
  return null;
}

// Checks a placement without changing anything
export function validate(state: FiveGame, symbol: FiveSymbol, raw: unknown): { ok: true; cell: Cell } | { ok: false; error: { code: FiveErrorCode } } {
  if (state.status !== 'playing') return { ok: false, error: { code: 'NOT_PLAYING' } };
  if (state.turn !== symbol) return { ok: false, error: { code: 'NOT_YOUR_TURN' } };
  const cell = parseCell(raw);
  if (!cell) return { ok: false, error: { code: 'BAD_CELL' } };
  if (state.cells[cellKey(cell)]) return { ok: false, error: { code: 'CELL_TAKEN' } };
  return { ok: true, cell };
}

// Places the player's symbol. Everything is checked first: a rejected placement changes nothing.
// An accepted one updates `state` in place in constant time (copying the board on every move
// would make long games quadratic), and the caller owns `state` (the server serialises each room).
export function place(state: FiveGame, symbol: FiveSymbol, raw: unknown): FiveResult {
  const checked = validate(state, symbol, raw);
  if (!checked.ok) return checked;
  const { cell } = checked;
  const key = cellKey(cell);
  const move: FiveMove = { ply: state.moves.length + 1, symbol, ...toWire(cell) };
  state.cells[key] = symbol;
  (state.chunks[chunkOf(cell)] ??= []).push(key);
  state.moves.push(move);
  state.turn = other(symbol);
  state.version += 1;
  const line = winningLine(state.cells, cell, symbol);
  if (line) {
    state.status = 'finished';
    state.winner = symbol;
    state.reason = 'five';
    state.winLine = line.map(toWire);
  }
  return { ok: true, state, move };
}

export function resign(state: FiveGame, symbol: FiveSymbol): FiveGame | null {
  if (state.status !== 'playing') return null;
  return { ...state, status: 'finished', winner: other(symbol), reason: 'resignation', version: state.version + 1 };
}

export function forfeit(state: FiveGame, symbol: FiveSymbol): FiveGame {
  if (state.status !== 'playing') return state;
  return { ...state, status: 'finished', winner: other(symbol), reason: 'forfeit', version: state.version + 1 };
}

// --- Views ---

// The occupied cells inside a rectangle (inclusive), for drawing the visible area. Only the 32×32
// blocks that overlap the rectangle are read, so the cost depends on the area asked for and the
// symbols in it, never on the rest of the game. The server caps the area a client may ask for (a
// message limit, not an edge of the board).
export function cellsInArea(state: FiveGame, a: Cell, b: Cell): AreaCell[] {
  const minX = a.x < b.x ? a.x : b.x;
  const maxX = a.x < b.x ? b.x : a.x;
  const minY = a.y < b.y ? a.y : b.y;
  const maxY = a.y < b.y ? b.y : a.y;
  const [bx0, by0] = chunkOf({ x: minX, y: minY }).split(',').map(BigInt) as [bigint, bigint];
  const [bx1, by1] = chunkOf({ x: maxX, y: maxY }).split(',').map(BigInt) as [bigint, bigint];
  const out: AreaCell[] = [];
  for (let bx = bx0; bx <= bx1; bx++) {
    for (let by = by0; by <= by1; by++) {
      for (const key of state.chunks[`${bx},${by}`] ?? []) {
        const [x, y] = key.split(',').map(BigInt) as [bigint, bigint];
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        out.push({ x: x.toString(), y: y.toString(), symbol: state.cells[key]! });
      }
    }
  }
  return out;
}

export interface AreaCell extends WireCell {
  symbol: FiveSymbol;
}

// The summary everyone sees without the whole history: the last moves, counts and the result
export interface FiveSummary {
  gameId: string;
  rulesVersion: string;
  version: number;
  turn: FiveSymbol;
  moveCount: number;
  lastMoves: FiveMove[]; // the most recent moves (at most RECENT), oldest first
  status: FiveGame['status'];
  winner: FiveSymbol | null;
  reason: FiveGame['reason'];
  winLine: WireCell[] | null;
}

export const RECENT = 40;

export function summary(state: FiveGame): FiveSummary {
  return {
    gameId: state.gameId,
    rulesVersion: state.rulesVersion,
    version: state.version,
    turn: state.turn,
    moveCount: state.moves.length,
    lastMoves: state.moves.slice(-RECENT),
    status: state.status,
    winner: state.winner,
    reason: state.reason,
    winLine: state.winLine,
  };
}

// --- Persistence ---

export function assertValidState(state: FiveGame) {
  const keys = Object.keys(state.cells);
  if (keys.length !== state.moves.length) throw new Error('Five state: cells and moves disagree');
  state.moves.forEach((m, i) => {
    if (m.ply !== i + 1) throw new Error('Five state: plies out of order');
    if (m.symbol !== (i % 2 === 0 ? 'X' : 'O')) throw new Error('Five state: symbols do not alternate');
    if (state.cells[cellKey(fromWire(m))] !== m.symbol) throw new Error(`Five state: cell ${m.x},${m.y} disagrees with its move`);
  });
}

export const serializeGame = (state: FiveGame) => JSON.stringify(state);

export function restoreGame(raw: string | FiveGame): FiveGame {
  const state = (typeof raw === 'string' ? JSON.parse(raw) : raw) as FiveGame;
  // The block index is rebuilt from the cells rather than trusted
  state.chunks = {};
  for (const key of Object.keys(state.cells ?? {})) {
    const [x, y] = key.split(',').map(BigInt) as [bigint, bigint];
    (state.chunks[chunkOf({ x, y })] ??= []).push(key);
  }
  assertValidState(state);
  return state;
}

// Plays a recorded game again from its moves; the same moves always give the same state
export function replay(gameId: string, moves: readonly WireCell[]): FiveGame {
  let state = createGame(gameId);
  for (const m of moves) {
    const result = place(state, state.turn, m);
    if (!result.ok) throw new Error(`Replay rejected ${m.x},${m.y}: ${result.error.code}`);
    state = result.state;
  }
  return state;
}
