import { cellKey, chunkOf, parseCell, parseCoordinate } from './coords';
import { assertValidState, cellsInArea, createGame, forfeit, place, replay, resign, restoreGame, serializeGame, summary } from './game';
import type { FiveGame, FiveSymbol } from './types';

// Builds a position by placing X and O stones alternately; `x` and `o` are lists of [x, y]. X moves
// first, so X gets one more stone or the same number as O. Win checks are bypassed by construction:
// every reference position here keeps runs below five until the move under test.
function board(x: [number | string, number | string][], o: [number | string, number | string][]): FiveGame {
  const state = createGame('test');
  const n = Math.max(x.length, o.length);
  for (let i = 0; i < n; i++) {
    if (x[i]) expect(place(state, 'X', cell(...x[i]!)).ok).toBe(true);
    else if (i < n) expect(place(state, 'X', cell(1_000_000 + i, 1_000_000)).ok).toBe(true); // filler far away
    if (o[i]) expect(place(state, 'O', cell(...o[i]!)).ok).toBe(true);
    else if (i < n - 1) expect(place(state, 'O', cell(-1_000_000 - i, -1_000_000)).ok).toBe(true); // keeps turns alternating
  }
  return state;
}
const cell = (x: number | string, y: number | string) => ({ x: String(x), y: String(y) });
const play = (state: FiveGame, symbol: FiveSymbol, x: number | string, y: number | string) => place(state, symbol, cell(x, y));
const line = (state: FiveGame) => state.winLine?.map(c => `${c.x},${c.y}`);

describe('coordinates', () => {
  it('normalises every spelling of a cell to one key', () => {
    expect(cellKey(parseCell({ x: '007', y: '-0' })!)).toBe('7,0');
    expect(cellKey(parseCell({ x: 7, y: 0 })!)).toBe('7,0');
    expect(parseCoordinate('1.5')).toBeNull();
    expect(parseCoordinate('1e3')).toBeNull();
    expect(parseCoordinate(2 ** 60)).toBeNull(); // unsafe numbers must come as strings
    expect(parseCoordinate('9'.repeat(401))).toBeNull(); // message bound
  });

  it('keeps huge coordinates exact', () => {
    const far = '1' + '0'.repeat(300);
    expect(cellKey(parseCell({ x: far, y: `-${far}` })!)).toBe(`${far},-${far}`);
    expect(chunkOf({ x: -1n, y: -32n })).toBe('-1,-1');
    expect(chunkOf({ x: -33n, y: 31n })).toBe('-2,0');
  });
});

describe('placing (rules)', () => {
  it('starts with X, then alternates, one symbol per turn', () => {
    const game = createGame();
    expect(game.turn).toBe('X');
    expect(play(game, 'O', 0, 0)).toEqual({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    expect(play(game, 'X', 0, 0).ok).toBe(true);
    expect(game.turn).toBe('O');
    expect(play(game, 'X', 1, 0)).toEqual({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
  });

  it('refuses an occupied cell and malformed coordinates, changing nothing', () => {
    const game = board([[0, 0]], []);
    const before = serializeGame(game);
    expect(play(game, 'O', 0, 0)).toEqual({ ok: false, error: { code: 'CELL_TAKEN' } });
    expect(play(game, 'O', '000', '-0')).toEqual({ ok: false, error: { code: 'CELL_TAKEN' } }); // same cell, other spelling
    expect(place(game, 'O', { x: 'a', y: 0 })).toEqual({ ok: false, error: { code: 'BAD_CELL' } });
    expect(place(game, 'O', null)).toEqual({ ok: false, error: { code: 'BAD_CELL' } });
    expect(serializeGame(game)).toBe(before);
  });

  it('lets a player play anywhere, far from every other symbol, at negative coordinates', () => {
    const game = createGame();
    expect(play(game, 'X', -5, -7).ok).toBe(true);
    expect(play(game, 'O', '123456789012345678901234567890', '-98765432109876543210').ok).toBe(true);
    expect(Object.keys(game.cells)).toEqual(['-5,-7', '123456789012345678901234567890,-98765432109876543210']);
  });
});

describe('five in a row', () => {
  it('does not win with four', () => {
    const game = board([[0, 0], [1, 0], [2, 0]], [[0, 5], [1, 5], [2, 5]]);
    expect(play(game, 'X', 3, 0).ok).toBe(true);
    expect(game.status).toBe('playing');
  });

  it('wins with five on each of the four axes', () => {
    const axes: [string, [number, number][]][] = [
      ['horizontal', [[0, 0], [1, 0], [2, 0], [3, 0]]],
      ['vertical', [[0, 0], [0, 1], [0, 2], [0, 3]]],
      ['diagonal', [[0, 0], [1, 1], [2, 2], [3, 3]]],
      ['anti-diagonal', [[0, 0], [1, -1], [2, -2], [3, -3]]],
    ];
    for (const [, stones] of axes) {
      const game = board(stones.slice(0, 4), [[10, 10], [11, 10], [12, 10], [10, 20]]);
      const [dx, dy] = [stones[1]![0] - stones[0]![0], stones[1]![1] - stones[0]![1]];
      expect(play(game, 'X', 4 * dx, 4 * dy).ok).toBe(true);
      expect(game).toEqual(expect.objectContaining({ status: 'finished', winner: 'X', reason: 'five' }));
      expect(game.winLine).toHaveLength(5);
    }
  });

  it('wins with six or more in a row and reports the whole run', () => {
    // X X X _ X X: the gap filled makes six
    const game = board([[0, 0], [1, 0], [2, 0], [4, 0], [5, 0]], [[0, 9], [1, 9], [2, 9], [9, 9], [3, 7]]);
    expect(game.status).toBe('playing');
    expect(play(game, 'X', 3, 0).ok).toBe(true);
    expect(game.winner).toBe('X');
    expect(line(game)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0']);
  });

  it('wins by joining two segments, counting the joining symbol once', () => {
    const game = board([[0, 0], [1, 0], [3, 0], [4, 0]], [[0, 5], [1, 5], [3, 5], [4, 5]]);
    expect(play(game, 'X', 2, 0).ok).toBe(true);
    expect(line(game)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
  });

  it('is broken by an empty cell or an opponent symbol, and never adds different axes', () => {
    // Four horizontal then a gap, plus four vertical through the new stone: no axis reaches five
    const gap = board([[0, 0], [1, 0], [2, 0], [5, 0], [6, 1], [6, 2], [6, 3]], [[0, 9], [1, 9], [2, 9], [9, 9], [8, 8], [7, 9], [9, 7]]);
    expect(play(gap, 'X', 3, 0).ok).toBe(true); // 0..3 horizontal = 4, then 4 empty
    expect(gap.status).toBe('playing');
    const blocked = board([[0, 0], [1, 0], [2, 0]], [[4, 0], [1, 9], [2, 9]]);
    expect(play(blocked, 'X', 3, 0).ok).toBe(true); // X X X X O
    expect(blocked.status).toBe('playing');
    // An L of 3 + 3 through one corner is not a win
    const corner = board([[1, 0], [2, 0], [0, 1], [0, 2]], [[9, 9], [9, 8], [9, 7], [9, 6]]);
    expect(play(corner, 'X', 0, 0).ok).toBe(true);
    expect(corner.status).toBe('playing');
  });

  it('ends once, with a deterministic line, when one stone completes two lines', () => {
    // Horizontal 1..4 and vertical 1..4 through (0,0): the horizontal is reported (first in axis order)
    const game = board([[1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[9, 9], [9, 8], [9, 7], [9, 6], [8, 9], [7, 9], [6, 9], [8, 7]]);
    expect(play(game, 'X', 0, 0).ok).toBe(true);
    expect(game.status).toBe('finished');
    expect(line(game)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    expect(play(game, 'O', 50, 50)).toEqual({ ok: false, error: { code: 'NOT_PLAYING' } });
  });

  it('wins far away and at negative coordinates without rounding', () => {
    const far = 10n ** 300n;
    const x = (i: number) => (far + BigInt(i)).toString();
    const game = board([[x(0), '-5'], [x(1), '-5'], [x(2), '-5'], [x(3), '-5']], [[x(0), '-6'], [x(1), '-6'], [x(2), '-6'], [x(9), '-6']]);
    expect(play(game, 'X', x(4), '-5').ok).toBe(true);
    expect(game.winner).toBe('X');
    expect(line(game)).toEqual([0, 1, 2, 3, 4].map(i => `${x(i)},-5`));
  });

  it('ends by resignation or forfeit, after which nothing can be placed', () => {
    const game = createGame();
    expect(resign(game, 'X')).toEqual(expect.objectContaining({ status: 'finished', winner: 'O', reason: 'resignation' }));
    expect(forfeit(game, 'O')).toEqual(expect.objectContaining({ winner: 'X', reason: 'forfeit' }));
    expect(resign(forfeit(game, 'O'), 'X')).toBeNull();
  });
});

describe('long games, views and persistence', () => {
  it('has no artificial end: 2,000 moves without five in a row keep going', () => {
    // A pattern with no five: X on even columns, O on odd, each player's stones 3 apart vertically
    const game = createGame();
    for (let i = 0; i < 1000; i++) {
      expect(play(game, 'X', i * 2, (i % 7) * 3).ok).toBe(true);
      expect(play(game, 'O', i * 2 + 1, (i % 5) * 3 + 100).ok).toBe(true);
    }
    expect(game.status).toBe('playing');
    expect(game.moves).toHaveLength(2000);
    assertValidState(game);
  });

  it('keeps storage proportional to the moves, not the distance between them, and reads areas by block', () => {
    const game = createGame();
    const far = 10n ** 200n;
    const spots = 4000;
    const started = Date.now();
    for (let i = 0; i < spots; i++) {
      const base = BigInt(i) * far; // stones scattered across astronomically distant areas
      expect(place(game, i % 2 === 0 ? 'X' : 'O', { x: base.toString(), y: (-base).toString() }).ok).toBe(true);
    }
    const elapsed = Date.now() - started;
    expect(Object.keys(game.cells)).toHaveLength(spots);
    expect(Object.values(game.chunks).reduce((n, keys) => n + keys.length, 0)).toBe(spots);
    expect(elapsed).toBeLessThan(5000);
    // A visible area reads only its blocks
    const area = cellsInArea(game, { x: 3n * far - 5n, y: -3n * far - 5n }, { x: 3n * far + 5n, y: -3n * far + 5n });
    expect(area).toEqual([{ x: (3n * far).toString(), y: (-3n * far).toString(), symbol: 'O' }]);
    // The summary sent to clients carries only recent moves
    expect(summary(game).lastMoves.length).toBeLessThanOrEqual(40);
    expect(JSON.stringify(summary(game)).length).toBeLessThan(40 * 1000);
  });

  it('restores and replays to the same state, and refuses a damaged one', () => {
    const game = board([[0, 0], [1, 1], [-3, 4]], [[5, 5], [-2, -2], [7, 0]]);
    const restored = restoreGame(serializeGame(game));
    expect(restored).toEqual(game);
    expect(replay('test', game.moves)).toEqual(game);
    const broken = JSON.parse(serializeGame(game)) as FiveGame;
    broken.cells['99,99'] = 'X';
    expect(() => restoreGame(broken)).toThrow();
  });
});
