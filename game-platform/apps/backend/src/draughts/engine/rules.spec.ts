import { LONG_DIAGONAL, coords, ray, squareAt } from './board';
import { answerDraw, createGame, legalMoves, offerDraw, parseRoute, playMove, positionKey, resign } from './game';
import { position } from './scenario';
import type { DraughtsGame, RuleResult } from './types';

// Reference positions are worked out by hand from the board numbering (FMJD Annex 1 art. 2.6);
// routes are written [from, ...landing squares].
const route = (from: number, ...path: number[]) => ({ from, path });
const ok = (result: RuleResult): DraughtsGame => {
  if (!result.ok) throw new Error(`Rejected: ${JSON.stringify(result.error)}`);
  return result.state;
};
const errorOf = (result: RuleResult) => (result.ok ? null : result.error.code);
const routes = (state: DraughtsGame) => legalMoves(state).map(m => [m.from, ...m.path].join('-')).sort();
const at = (state: DraughtsGame, square: number) => state.pieces.find(p => p.square === square);

describe('board (art. 2)', () => {
  it('numbers the 50 dark squares row by row from the top left (2.6)', () => {
    expect(coords(1)).toEqual({ row: 0, col: 1 });
    expect(coords(5)).toEqual({ row: 0, col: 9 });
    expect(coords(6)).toEqual({ row: 1, col: 0 });
    expect(coords(46)).toEqual({ row: 9, col: 0 });
    expect(coords(50)).toEqual({ row: 9, col: 8 });
    expect(squareAt(0, 0)).toBeNull(); // light square
    // Sides 6-16-26-36-46 and 5-15-25-35-45 (2.6.2); corners 5 and 46 end the long diagonal (2.6.3)
    expect([6, 16, 26, 36, 46].map(s => coords(s).col)).toEqual([0, 0, 0, 0, 0]);
    expect([5, 15, 25, 35, 45].map(s => coords(s).col)).toEqual([9, 9, 9, 9, 9]);
    expect([46, ...ray(46, 1)]).toEqual(LONG_DIAGONAL.slice().reverse());
  });

  it('starts with 20 black men on 1–20, 20 white men on 31–50, white to move (2.8, 3.3)', () => {
    const game = createGame();
    expect(game.pieces.filter(p => p.color === 'black').map(p => p.square)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(game.pieces.filter(p => p.color === 'white').map(p => p.square)).toEqual(Array.from({ length: 20 }, (_, i) => i + 31));
    expect(game.turn).toBe('white');
    expect(new Set(game.pieces.map(p => p.id)).size).toBe(40);
    // The nine opening moves of the front row
    expect(routes(game)).toEqual(['31-26', '31-27', '32-27', '32-28', '33-28', '33-29', '34-29', '34-30', '35-30'].sort());
  });
});

describe('moving (art. 3)', () => {
  it('moves a man one square forwards only (3.4)', () => {
    const game = position({ white: { men: [28] }, black: { men: [1] } });
    expect(routes(game)).toEqual(['28-22', '28-23']);
    expect(errorOf(playMove(game, 'white', route(28, 33)))).toBe('ILLEGAL_MOVE'); // backwards
    expect(errorOf(playMove(game, 'black', route(1, 7)))).toBe('NOT_YOUR_TURN');
  });

  it('moves a king any distance over free squares, forwards and backwards (3.9)', () => {
    const game = position({ white: { kings: [46] }, black: { men: [3] } });
    expect(routes(game)).toEqual(['46-10', '46-14', '46-19', '46-23', '46-28', '46-32', '46-37', '46-41', '46-5'].sort());
  });

  it('promotes a man that stops on the far row (3.5), for both colours', () => {
    const white = ok(playMove(position({ white: { men: [7] }, black: { men: [40] } }), 'white', route(7, 1)));
    expect(at(white, 1)).toEqual(expect.objectContaining({ kind: 'king', id: 'w1' }));
    const black = ok(playMove(position({ white: { men: [11] }, black: { men: [44] }, turn: 'black' }), 'black', route(44, 50)));
    expect(at(black, 50)?.kind).toBe('king');
  });
});

describe('capturing (art. 4)', () => {
  it('captures backwards with a man (4.1, 4.2) and the capture is compulsory', () => {
    const game = position({ white: { men: [28] }, black: { men: [33, 3] } });
    expect(routes(game)).toEqual(['28-39']);
    expect(errorOf(playMove(game, 'white', route(28, 23)))).toBe('CAPTURE_REQUIRED');
    const next = ok(playMove(game, 'white', route(28, 39)));
    expect(at(next, 33)).toBeUndefined();
    expect(next.moves[0]).toEqual(expect.objectContaining({ notation: '28x39', captures: [33], capturedIds: ['b1'] }));
  });

  it('lets a king capture at a distance and land on any free square behind (4.3)', () => {
    const game = position({ white: { kings: [46] }, black: { men: [28] } });
    expect(routes(game)).toEqual(['46-10', '46-14', '46-19', '46-23', '46-5'].sort());
  });

  it('obliges the route taking the most pieces, a king counting as one piece (4.13)', () => {
    // 36x27x18 takes 31 and 22; 28x39 would take only 33
    const game = position({ white: { men: [36, 28] }, black: { men: [31, 22, 33], kings: [3] } });
    expect(routes(game)).toEqual(['36-27-18']);
    expect(errorOf(playMove(game, 'white', route(28, 39)))).toBe('MAX_CAPTURE_REQUIRED');
    expect(errorOf(playMove(game, 'white', route(36, 27)))).toBe('INCOMPLETE_CAPTURE');
    const next = ok(playMove(game, 'white', route(36, 27, 18)));
    expect(next.pieces.filter(p => p.color === 'black').map(p => p.square).sort((a, b) => a - b)).toEqual([3, 33]);
  });

  it('counts a king as one piece: a man taking a king ties with a man taking a man (4.13, 4.14)', () => {
    const game = position({ white: { men: [28, 47] }, black: { men: [22, 1], kings: [42] } });
    // 28x17 takes the man on 22; 47x38 takes the king on 42
    expect(routes(game)).toEqual(['28-17', '47-38']);
  });

  it('turns corners with a king and keeps every equal longest route (4.6, 4.14)', () => {
    // 46 jumps 28 to 19, turns and jumps 13 to land on 8 or 2
    const game = position({ white: { kings: [46] }, black: { men: [28, 13] } });
    expect(routes(game)).toEqual(['46-19-2', '46-19-8']);
    const next = ok(playMove(game, 'white', route(46, 19, 2)));
    expect(next.moves[0]!.notation).toBe('46x2'); // from and to are enough: no other route ends on 2 (art. 8.2)
  });

  it('lets a man choose between equal routes and never jumps a captured piece twice (4.8, 4.14)', () => {
    // 37 jumps 32 to 28, then may take 22, 23 or 33 (one each); 32 can't be taken again
    const game = position({ white: { men: [37] }, black: { men: [32, 22, 23, 33] } });
    expect(routes(game)).toEqual(['37-28-17', '37-28-19', '37-28-39']);
  });

  it('keeps captured pieces on the board until the route ends, blocking the king (4.11)', () => {
    // 46 jumps 37 (landing 32 or 28) then 23; 37 stays on the board and is never taken twice
    const game = position({ white: { kings: [46] }, black: { men: [37, 23] } });
    const all = legalMoves(game);
    expect(all.every(m => m.captures.length === 2)).toBe(true);
    expect(all.every(m => new Set(m.captures).size === m.captures.length)).toBe(true);
  });

  it('lets a king cross the same free square twice in one route (4.8)', () => {
    // 46 jumps 23 → 19, 13 → 8, 21 → 26, then 42 → 48: the last leg crosses 37 again
    const game = position({ white: { kings: [46] }, black: { men: [23, 13, 21, 42] } });
    expect(routes(game)).toEqual(['46-19-8-26-48']);
    const next = ok(playMove(game, 'white', route(46, 19, 8, 26, 48)));
    expect(next.moves[0]!.captures).toEqual([23, 13, 21, 42]);
    expect(next.pieces.filter(p => p.color === 'black')).toHaveLength(0);
  });

  it('never jumps one’s own pieces (4.7)', () => {
    // The white man on 37 stands between the king and the black man on 28
    const game = position({ white: { kings: [46], men: [37] }, black: { men: [28, 3] } });
    expect(legalMoves(game).every(m => m.captures.length === 0)).toBe(true);
    expect(errorOf(playMove(game, 'white', route(46, 23)))).toBe('ILLEGAL_MOVE');
  });

  it('keeps a man that only passes the far row during a capture (4.15)', () => {
    // 12x3x14: lands on 3 (white's promotion row) mid-route, ends on 14
    const game = position({ white: { men: [12] }, black: { men: [8, 9] } });
    expect(routes(game)).toEqual(['12-3-14']);
    const next = ok(playMove(game, 'white', route(12, 3, 14)));
    expect(at(next, 14)?.kind).toBe('man');
    expect(next.moves[0]!.promotes).toBe(false);
  });

  it('promotes a man whose capture ends on the far row', () => {
    const game = position({ white: { men: [18] }, black: { men: [12, 40] } });
    const next = ok(playMove(game, 'white', route(18, 7)));
    expect(next.moves[0]).toEqual(expect.objectContaining({ notation: '18x7', promotes: false }));
    const promo = position({ white: { men: [17] }, black: { men: [11, 40] } });
    const crowned = ok(playMove(promo, 'white', route(17, 6)));
    expect(at(crowned, 6)?.kind).toBe('man'); // 6 is not on the far row
    const top = position({ white: { men: [13] }, black: { men: [8, 40] } });
    const king = ok(playMove(top, 'white', route(13, 2)));
    expect(at(king, 2)?.kind).toBe('king');
  });

  it('rejects a route that does not exist and changes nothing', () => {
    const game = position({ white: { men: [28] }, black: { men: [33, 3] } });
    const before = JSON.stringify(game);
    for (const bad of [route(28, 39, 50), route(27, 22), route(3, 9), route(28, 17)]) playMove(game, 'white', bad);
    expect(JSON.stringify(game)).toBe(before);
    expect(errorOf(playMove(game, 'white', route(27, 22)))).toBe('NO_PIECE');
    expect(errorOf(playMove(game, 'white', route(3, 9)))).toBe('NOT_YOUR_PIECE');
  });

  it('accepts only a start square and its landing squares from clients', () => {
    expect(parseRoute({ from: 32, path: [28] })).toEqual({ ok: true, route: { from: 32, path: [28] } });
    expect(parseRoute({ from: 0, path: [28] }).ok).toBe(false);
    expect(parseRoute({ from: 32, path: [] }).ok).toBe(false);
    expect(parseRoute({ from: 32, path: [51] }).ok).toBe(false);
    expect(parseRoute({ from: 32, path: Array(21).fill(28) }).ok).toBe(false);
    expect(parseRoute('32-28').ok).toBe(false);
  });
});

describe('result (art. 7)', () => {
  it('wins when the opponent has no pieces left (7.2.3)', () => {
    const next = ok(playMove(position({ white: { men: [28] }, black: { men: [33] } }), 'white', route(28, 39)));
    expect(next).toEqual(expect.objectContaining({ status: 'finished', result: { winner: 'white', reason: 'no-pieces' } }));
  });

  it('wins when the opponent has the move but every piece is blocked (7.2.2)', () => {
    // After 6-11, white's man on 16 can neither move to 11 nor jump it (7 is occupied)
    const game = position({ white: { men: [16] }, black: { men: [6, 7] }, turn: 'black' });
    const next = ok(playMove(game, 'black', route(6, 11)));
    expect(next.result).toEqual({ winner: 'black', reason: 'blocked' });
  });

  it('wins by resignation (7.2.1) and draws by agreement tied to the position (7.3.1)', () => {
    const game = createGame();
    expect(ok(resign(game, 'black')).result).toEqual({ winner: 'white', reason: 'resignation' });

    const offered = ok(offerDraw(game, 'white'));
    expect(errorOf(answerDraw(offered, 'white', true, offered.drawOffer!.version))).toBe('OWN_DRAW_OFFER');
    expect(errorOf(answerDraw(offered, 'black', true, offered.drawOffer!.version - 1))).toBe('STALE_DRAW_OFFER');
    expect(ok(answerDraw(offered, 'black', true, offered.drawOffer!.version)).result).toEqual({ winner: null, reason: 'agreement' });
    const declined = ok(answerDraw(offered, 'black', false, offered.drawOffer!.version));
    expect(declined.status).toBe('playing');
    expect(declined.drawOffer).toBeNull();

    // A move withdraws the offer: answering it afterwards does nothing
    const moved = ok(playMove(offered, 'white', route(32, 28)));
    expect(moved.drawOffer).toBeNull();
    expect(errorOf(answerDraw(moved, 'black', true, offered.drawOffer!.version))).toBe('NO_DRAW_OFFER');
  });
});

describe('position key (art. 6.1)', () => {
  it('depends only on pieces and the player to move, not on ids or history', () => {
    const a = position({ white: { kings: [50] }, black: { kings: [1] } });
    const b = structuredClone(a);
    b.pieces.forEach(p => (p.id = p.id === 'w1' ? 'w9' : p.id));
    b.moves = [];
    expect(positionKey(b)).toBe(positionKey(a));
    expect(positionKey({ ...a, turn: 'black' })).not.toBe(positionKey(a));
  });
});
