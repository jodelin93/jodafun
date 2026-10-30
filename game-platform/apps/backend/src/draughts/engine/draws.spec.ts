import { playMove } from './game';
import { position } from './scenario';
import type { DraughtsGame, RuleResult } from './types';

// FMJD Annex 1 art. 6 (draws) and the precedence rule of 6.3/6.4. Counters are counted in single
// moves (plies): "25 moves for each player" = 50, "16 moves" each = 32, "5 moves" each = 10.
const route = (from: number, ...path: number[]) => ({ from, path });
const ok = (result: RuleResult): DraughtsGame => {
  if (!result.ok) throw new Error(`Rejected: ${JSON.stringify(result.error)}`);
  return result.state;
};

describe('art. 6.1: third occurrence of the same position with the same player to move', () => {
  it('draws on the third occurrence, not the second', () => {
    // Kings shuffle 50-45 / 1-6 / 45-50 / 6-1: the start position recurs after plies 4 and 8
    let game = position({ white: { kings: [50] }, black: { kings: [1] } });
    const cycle = [route(50, 45), route(1, 6), route(45, 50), route(6, 1)];
    for (let i = 0; i < 8; i++) {
      game = ok(playMove(game, game.turn, cycle[i % 4]!));
      if (i < 7) expect(game.status).toBe('playing');
    }
    expect(game.result).toEqual({ winner: null, reason: 'repetition' });
  });

  it('forgets earlier positions after a man move or a capture, which can never be undone', () => {
    let game = position({ white: { kings: [50], men: [31] }, black: { kings: [1], men: [15] } });
    game = ok(playMove(game, 'white', route(50, 45)));
    game = ok(playMove(game, 'black', route(1, 6)));
    expect(game.positions).toHaveLength(3);
    game = ok(playMove(game, 'white', route(31, 26))); // man move
    expect(game.positions).toHaveLength(1);
  });
});

describe('art. 6.2: 25 moves each with only kings moving, no man move, no capture', () => {
  // No piece can capture here and the material is outside 6.3/6.4
  const quiet = (kingMoves: number) => {
    const game = position({ white: { kings: [50], men: [31, 36] }, black: { kings: [1], men: [15, 20] } });
    return { ...game, kingMoves };
  };

  it('draws when the 50th king move in a row is played, not before', () => {
    expect(ok(playMove(quiet(48), 'white', route(50, 44)))).toEqual(expect.objectContaining({ status: 'playing', kingMoves: 49 }));
    expect(ok(playMove(quiet(49), 'white', route(50, 44))).result).toEqual({ winner: null, reason: 'kings-25' });
  });

  it('starts again after a man move or a capture', () => {
    expect(ok(playMove(quiet(49), 'white', route(31, 26))).kingMoves).toBe(0);
    const capture = { ...position({ white: { kings: [46], men: [31] }, black: { kings: [1], men: [28, 15, 20] } }), kingMoves: 30 };
    const after = ok(playMove(capture, 'white', route(46, 14, 25)));
    expect(after.moves[0]!.captures).toEqual([28, 20]);
    expect(after.kingMoves).toBe(0);
  });
});

describe('art. 6.3: three kings, two kings and a man, or a king and two men against one king', () => {
  const sixteen = (startPly: number) => {
    const game = position({ white: { kings: [50, 49, 48] }, black: { kings: [1] } });
    return { ...game, endgame: { ...game.endgame!, startPly } };
  };

  it('starts counting when the material appears', () => {
    expect(position({ white: { kings: [50, 49, 48] }, black: { kings: [1] } }).endgame).toEqual({ rule: '6.3', startPly: 0, limitPlies: 32 });
    expect(position({ white: { kings: [50, 49], men: [31] }, black: { kings: [1] } }).endgame?.rule).toBe('6.3');
    expect(position({ white: { kings: [50], men: [31, 32] }, black: { kings: [1] } }).endgame?.rule).toBe('6.3');
    // Not this rule: a lone king against a king and three men
    expect(position({ white: { kings: [50], men: [31, 32, 33] }, black: { kings: [1] } }).endgame).toBeNull();
  });

  it('draws after 16 more moves each, not before', () => {
    expect(ok(playMove(sixteen(-30), 'white', route(50, 44))).status).toBe('playing');
    expect(ok(playMove(sixteen(-31), 'white', route(50, 44))).result).toEqual({ winner: null, reason: 'endgame-16' });
  });

  it('keeps the 16-move maximum when a piece is taken during it', () => {
    // The lone king takes the king on 7: two kings against one now, but the count stays at 16
    const game = position({ white: { kings: [7, 50, 49] }, black: { kings: [1] }, turn: 'black' });
    expect(game.endgame).toEqual({ rule: '6.3', startPly: 0, limitPlies: 32 });
    const after = ok(playMove(game, 'black', route(1, 12)));
    expect(after.pieces.filter(p => p.color === 'white')).toHaveLength(2);
    expect(after.endgame).toEqual({ rule: '6.3', startPly: 0, limitPlies: 32 });
  });

  it('limits to 5 more moves each once the lone king holds the long diagonal alone', () => {
    const game = position({ white: { kings: [50, 49, 48] }, black: { kings: [1] }, turn: 'black' });
    expect(game.longDiagonal).toBeNull();
    const held = ok(playMove(game, 'black', route(1, 23)));
    expect(held.longDiagonal).toEqual({ startPly: 1 });
    // Shared diagonal (a white king on 46 too): the exception doesn't apply
    const shared = ok(playMove(position({ white: { kings: [50, 49, 46] }, black: { kings: [1] }, turn: 'black' }), 'black', route(1, 23)));
    expect(shared.longDiagonal).toBeNull();
    // Ten plies after it began, the game is drawn
    const late = { ...held, longDiagonal: { startPly: -8 } };
    expect(ok(playMove(late, 'white', route(50, 44))).result).toEqual({ winner: null, reason: 'long-diagonal-5' });
    const early = { ...held, longDiagonal: { startPly: -7 } };
    expect(ok(playMove(early, 'white', route(50, 44))).status).toBe('playing');
  });
});

describe('art. 6.4: two kings, a king and a man, or one king against one king', () => {
  it('starts counting when a capture brings the material about', () => {
    const game = position({ white: { kings: [46, 50] }, black: { kings: [3], men: [28] } });
    expect(game.endgame).toBeNull();
    const after = ok(playMove(game, 'white', route(46, 23)));
    expect(after.endgame).toEqual({ rule: '6.4', startPly: 1, limitPlies: 10 });
  });

  it('draws after 5 more moves each, not before', () => {
    const five = (startPly: number) => {
      const game = position({ white: { kings: [50, 49] }, black: { kings: [1] } });
      return { ...game, endgame: { ...game.endgame!, startPly } };
    };
    expect(five(0).endgame?.rule).toBe('6.4');
    expect(ok(playMove(five(-8), 'white', route(50, 44))).status).toBe('playing');
    expect(ok(playMove(five(-9), 'white', route(50, 44))).result).toEqual({ winner: null, reason: 'endgame-5' });
  });

  it('gives the win when the last allowed move leaves the opponent without pieces (precedence)', () => {
    const game = position({ white: { kings: [46, 50] }, black: { kings: [28] } });
    const last = { ...game, endgame: { ...game.endgame!, startPly: -9 } };
    expect(ok(playMove(last, 'white', route(46, 23))).result).toEqual({ winner: 'white', reason: 'no-pieces' });
  });
});
