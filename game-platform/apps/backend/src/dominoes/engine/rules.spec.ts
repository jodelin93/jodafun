import { seededRandom } from '../../lib/random';
import {
  assertValidState,
  createMatch,
  firstOpeningTile,
  forfeitMatch,
  legalMoves,
  normalizeConfig,
  parseMove,
  pass,
  playTile,
  privateView,
  publicView,
  restoreMatch,
  scoreHand,
  serializeMatch,
} from './match';
import { DOMINO_RULES } from './rules';
import { scenario } from './scenario';
import { ALL_TILES, isTileId, pipsOf, tileValues } from './tiles';
import type { DominoMatch, Move, RuleResult } from './types';

const random = seededRandom(1);
const ok = (result: RuleResult): DominoMatch => {
  if (!result.ok) throw new Error(`Rejected: ${JSON.stringify(result.error)}`);
  return result.state;
};
const errorOf = (result: RuleResult) => (result.ok ? null : result.error.code);
const play = (state: DominoMatch, seat: number, tile: string, end: Move['end'] = null) => playTile(state, seat, { tile, end }, random);

describe('tiles and dealing', () => {
  it('has exactly the 28 unique double-six tiles, smaller number first', () => {
    expect(ALL_TILES).toHaveLength(28);
    expect(new Set(ALL_TILES).size).toBe(28);
    for (const id of ALL_TILES) {
      const [a, b] = tileValues(id);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(b);
      expect(b).toBeLessThanOrEqual(6);
    }
    expect(ALL_TILES[0]).toBe('0-0');
    expect(ALL_TILES.at(-1)).toBe('6-6');
    expect(isTileId('5-3')).toBe(false); // not canonical
    expect(isTileId('7-7')).toBe(false);
  });

  it('deals two players seven each and leaves 14 unused', () => {
    const state = createMatch({ mode: 'head-to-head' }, seededRandom(2));
    expect(state.hands.map(h => h.length)).toEqual([7, 7]);
    expect(state.unused).toHaveLength(14);
    assertValidState(state);
  });

  it('deals four players the whole set, seven each, partners opposite', () => {
    const state = createMatch({ mode: 'partners' }, seededRandom(3));
    expect(state.hands.map(h => h.length)).toEqual([7, 7, 7, 7]);
    expect(state.unused).toHaveLength(0);
    expect([0, 1, 2, 3].map(seat => (seat % 2 === 0 ? 0 : 1))).toEqual([0, 1, 0, 1]);
    assertValidState(state);
  });

  it('uses a target of 100 by default and keeps a configured one in range', () => {
    expect(normalizeConfig({}).targetScore).toBe(100);
    expect(normalizeConfig({ targetScore: 150 }).targetScore).toBe(150);
    expect(normalizeConfig({ targetScore: 5 }).targetScore).toBe(100);
    expect(normalizeConfig({ mode: 'partners' }).players).toBe(4);
    expect(normalizeConfig({ mode: 'anything' }).mode).toBe('head-to-head');
  });
});

describe('opening', () => {
  it('opens the first hand with the highest dealt double, held by the starting player', () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = createMatch({ mode: 'partners' }, seededRandom(seed));
      expect(state.openingTile).toBe('6-6'); // every tile is dealt with four players
      expect(state.hands[state.startSeat]).toContain('6-6');
      expect(state.turn).toBe(state.startSeat);
      expect(legalMoves(state, state.turn)).toEqual([{ tile: '6-6', end: null }]);
    }
  });

  it('picks the highest double from dealt hands only, else the heaviest tile with ties broken by its higher end', () => {
    expect(firstOpeningTile([['4-4', '1-6'], ['2-2', '5-6']])).toBe('4-4');
    expect(firstOpeningTile([['3-6', '0-1'], ['4-5', '2-3']])).toBe('3-6'); // 9 pips each; 6 beats 5
    expect(firstOpeningTile([['5-6', '0-1'], ['4-6', '2-3']])).toBe('5-6');
  });

  it('refuses any other first tile in the first hand', () => {
    const state = scenario({ hands: [['5-5', '1-2'], ['0-3']], handNumber: 1, openingTile: '5-5' });
    expect(errorOf(play(state, 0, '1-2'))).toBe('MUST_OPEN_WITH');
    expect(ok(play(state, 0, '5-5')).board).toEqual([{ tile: '5-5', seat: 0, left: 5, right: 5 }]);
  });

  it('rotates the start anticlockwise for later hands, which may open with any tile', () => {
    let state = createMatch({ mode: 'head-to-head', targetScore: 500 }, seededRandom(9));
    const starts = [state.startSeat];
    const r = seededRandom(10);
    while (state.handNumber < 4) {
      const moves = legalMoves(state, state.turn);
      const result = moves.length ? playTile(state, state.turn, moves[0]!, r) : pass(state, state.turn, r);
      state = ok(result);
      if (result.ok && result.handResult) {
        starts.push(state.startSeat);
        expect(state.openingTile).toBeNull();
        expect(legalMoves(state, state.turn)).toHaveLength(7); // any tile, no end yet
      }
    }
    expect(starts.slice(1)).toEqual([1, 2, 3].map(i => (starts[0]! + i) % 2));
  });
});

describe('placing tiles', () => {
  // Chain 3-5 then 5-1: ends are 3 (left) and 1 (right)
  const base = () => scenario({ hands: [['1-6', '0-3', '1-3', '2-2'], ['4-4']], board: [['3-5', 3, 5], ['5-1', 5, 1]] });

  it('places on either end, matching the touching numbers, and stores the orientation', () => {
    const right = ok(play(base(), 0, '1-6', 'right'));
    expect(right.board.at(-1)).toEqual({ tile: '1-6', seat: 0, left: 1, right: 6 });
    const left = ok(play(base(), 0, '0-3', 'left'));
    expect(left.board[0]).toEqual({ tile: '0-3', seat: 0, left: 0, right: 3 });
    expect(publicView(left).ends).toEqual({ left: 0, right: 1 });
  });

  it('lets a tile that fits both ends go on either, and asks which end', () => {
    expect(legalMoves(base(), 0).filter(m => m.tile === '1-3')).toEqual([
      { tile: '1-3', end: 'left' },
      { tile: '1-3', end: 'right' },
    ]);
    expect(errorOf(play(base(), 0, '1-3'))).toBe('CHOOSE_END');
    expect(ok(play(base(), 0, '1-3', 'left')).board[0]).toEqual({ tile: '1-3', seat: 0, left: 1, right: 3 });
    expect(ok(play(base(), 0, '1-3', 'right')).board.at(-1)).toEqual({ tile: '1-3', seat: 0, left: 1, right: 3 });
  });

  it('places doubles crosswise with the same number on both sides and no extra branch', () => {
    const state = scenario({ hands: [['2-2', '0-0'], ['1-1']], board: [['2-4', 2, 4]] });
    const next = ok(play(state, 0, '2-2', 'left'));
    expect(next.board[0]).toEqual({ tile: '2-2', seat: 0, left: 2, right: 2 });
    expect(publicView(next).ends).toEqual({ left: 2, right: 4 }); // still two ends
  });

  it('plays blanks like any other number', () => {
    const state = scenario({ hands: [['0-4', '0-0'], ['1-1']], board: [['0-6', 0, 6]] });
    const next = ok(play(state, 0, '0-0', 'left'));
    expect(publicView(next).ends).toEqual({ left: 0, right: 6 });
    expect(errorOf(play(next, 1, '1-1', 'left'))).toBe('TILE_DOES_NOT_FIT');
    expect(ok(play(state, 0, '0-4', 'left')).board[0]).toEqual({ tile: '0-4', seat: 0, left: 4, right: 0 });
  });

  it('rejects tiles that do not fit, are not held, or are not real', () => {
    const state = base();
    expect(errorOf(play(state, 0, '2-2', 'left'))).toBe('TILE_DOES_NOT_FIT');
    expect(errorOf(play(state, 0, '4-4', 'left'))).toBe('NOT_YOUR_TILE');
    expect(errorOf(play(state, 0, '9-9', 'left'))).toBe('UNKNOWN_TILE');
    expect(errorOf(play(state, 1, '4-4', 'left'))).toBe('NOT_YOUR_TURN');
  });

  it('never changes the state it is given, and a rejected move changes nothing', () => {
    const state = base();
    const before = JSON.stringify(state);
    play(state, 0, '1-6', 'right');
    play(state, 0, '2-2', 'left');
    pass(state, 0, random);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('accepts only a tile id and an end from clients', () => {
    expect(parseMove({ tile: '1-6', end: 'right' })).toEqual({ ok: true, move: { tile: '1-6', end: 'right' } });
    expect(parseMove({ tile: '1-6' })).toEqual({ ok: true, move: { tile: '1-6', end: null } });
    expect(parseMove({ tile: '1-6', end: 'middle' }).ok).toBe(false);
    expect(parseMove({ tile: 'x'.repeat(50) }).ok).toBe(false);
    expect(parseMove('1-6').ok).toBe(false);
  });
});

describe('passing and blocking', () => {
  it('refuses a pass while any tile fits, including on an empty board', () => {
    const state = scenario({ hands: [['0-1', '2-6'], ['3-3']], board: [['6-6', 6, 6]] });
    expect(errorOf(pass(state, 0, random))).toBe('CAN_PLAY');
    expect(privateView(state, 0).canPass).toBe(false);
    const empty = scenario({ hands: [['0-1'], ['3-3']] });
    expect(errorOf(pass(empty, 0, random))).toBe('CAN_PLAY');
  });

  it('allows a pass only when nothing fits, and moves the turn on', () => {
    const state = scenario({ hands: [['0-1', '2-3'], ['1-6', '4-5']], board: [['6-6', 6, 6]] });
    expect(privateView(state, 0).canPass).toBe(true);
    const next = ok(pass(state, 0, random));
    expect(next.passes).toBe(1);
    expect(next.turn).toBe(1);
    expect(next.lastAction).toEqual({ seat: 0, type: 'pass' });
  });

  it('resets the pass count when a tile is placed', () => {
    const state = scenario({ hands: [['0-1', '2-3'], ['1-6', '4-5']], board: [['6-6', 6, 6]] });
    const passed = ok(pass(state, 0, random));
    const played = ok(play(passed, 1, '1-6', 'right'));
    expect(played.passes).toBe(0);
  });

  it('blocks a head-to-head hand after two passes in a row', () => {
    const state = scenario({ hands: [['0-1', '1-2'], ['3-4', '5-5']], board: [['6-6', 6, 6]], passes: 1 });
    const result = pass(state, 0, random);
    expect(result.ok && result.handResult?.ending).toBe('blocked');
  });

  it('blocks a partners hand only after four passes in a row', () => {
    const hands = [['0-1'], ['0-2'], ['0-3'], ['0-4']];
    const three = pass(scenario({ mode: 'partners', hands, board: [['6-6', 6, 6]], passes: 2, turn: 2 }), 2, random);
    expect(three.ok && three.handResult).toBeNull();
    const four = pass(scenario({ mode: 'partners', hands, board: [['6-6', 6, 6]], passes: 3, turn: 3 }), 3, random);
    expect(four.ok && four.handResult?.ending).toBe('blocked');
    expect(DOMINO_RULES.passesToBlock).toEqual({ 'head-to-head': 2, partners: 4 });
  });

  it('ends the hand the moment a player plays their last tile', () => {
    const state = scenario({ hands: [['3-6'], ['1-2', '4-4']], board: [['6-6', 6, 6]] });
    const result = playTile(state, 0, { tile: '3-6', end: 'right' }, random);
    expect(result.ok && result.handResult).toEqual(expect.objectContaining({ ending: 'domino', outSeat: 0, winnerTeam: 0 }));
  });
});

describe('scoring', () => {
  const hand = (hands: string[][], mode: 'head-to-head' | 'partners' = 'head-to-head') => ({
    config: normalizeConfig({ mode }),
    hands,
    handNumber: 3,
    startSeat: 0,
    scores: [10, 20],
  });

  it('head-to-head, going out: the winner scores the opponent’s pips (unused tiles never count)', () => {
    const r = scoreHand(hand([[], ['6-6', '0-1']]), 'domino', 0);
    expect(r).toEqual(expect.objectContaining({ winnerTeam: 0, points: [13, 0], pips: [0, 13], scoresAfter: [23, 20] }));
  });

  it('head-to-head, blocked: the lower total wins the difference; equal totals score nothing', () => {
    expect(scoreHand(hand([['1-2'], ['4-5']]), 'blocked', null)).toEqual(expect.objectContaining({ winnerTeam: 0, points: [6, 0] }));
    expect(scoreHand(hand([['5-6'], ['0-2']]), 'blocked', null)).toEqual(expect.objectContaining({ winnerTeam: 1, points: [0, 9] }));
    expect(scoreHand(hand([['1-4'], ['2-3']]), 'blocked', null)).toEqual(expect.objectContaining({ winnerTeam: null, points: [0, 0] }));
  });

  it('partners, going out: the side wins and scores the losing side’s pips only', () => {
    const r = scoreHand(hand([[], ['1-2'], ['6-6'], ['3-4']], 'partners'), 'domino', 0);
    expect(r).toEqual(expect.objectContaining({ winnerTeam: 0, teamPips: [12, 10], points: [10, 0] }));
  });

  it('partners, blocked: combined pips per side; the lower side scores the losing side’s total', () => {
    const r = scoreHand(hand([['0-1'], ['5-6'], ['1-1'], ['0-0']], 'partners'), 'blocked', null);
    expect(r).toEqual(expect.objectContaining({ teamPips: [3, 11], winnerTeam: 0, points: [11, 0] }));
    const tie = scoreHand(hand([['0-3'], ['1-2'], ['1-1'], ['0-2']], 'partners'), 'blocked', null);
    expect(tie).toEqual(expect.objectContaining({ winnerTeam: null, points: [0, 0] }));
  });

  it('can award zero points to a winner when the losers hold only blanks', () => {
    expect(scoreHand(hand([[], ['0-0']]), 'domino', 0).points).toEqual([0, 0]);
  });

  it('ends the match only after a completed hand, once a side reaches the target', () => {
    const near = scenario({ hands: [['3-6'], ['1-2', '4-4']], board: [['6-6', 6, 6]], scores: [90, 95], target: 100 });
    const done = ok(playTile(near, 0, { tile: '3-6', end: 'right' }, random));
    expect(done.scores).toEqual([101, 95]);
    expect(done.status).toBe('finished');
    expect(done.winnerTeam).toBe(0);

    const short = scenario({ hands: [['3-6'], ['0-1']], board: [['6-6', 6, 6]], scores: [90, 95], target: 100 });
    const more = ok(playTile(short, 0, { tile: '3-6', end: 'right' }, random));
    expect(more.scores).toEqual([91, 95]);
    expect(more.status).toBe('playing');
    expect(more.handNumber).toBe(3);
    expect(more.results).toHaveLength(1);
  });

  it('reveals every remaining hand in the result, never the unused tiles', () => {
    const state = scenario({ hands: [['3-6'], ['1-2', '4-4']], board: [['6-6', 6, 6]] });
    const result = playTile(state, 0, { tile: '3-6', end: 'right' }, random);
    if (!result.ok) throw new Error('rejected');
    expect(result.handResult?.remaining).toEqual([[], ['1-2', '4-4']]);
    const shown = JSON.stringify(result.handResult);
    for (const id of state.unused) expect(shown).not.toContain(`"${id}"`);
  });

  it('records a forfeit for the side that left', () => {
    const state = createMatch({ mode: 'partners' }, seededRandom(5));
    const lost = forfeitMatch(state, 1);
    expect(lost).toEqual(expect.objectContaining({ status: 'finished', winnerTeam: 0, forfeitTeam: 1 }));
    expect(state.status).toBe('playing');
  });
});

describe('views and persistence', () => {
  it('shows each player only their own hand; others see counts', () => {
    const state = createMatch({ mode: 'partners' }, seededRandom(7));
    const json = JSON.stringify(publicView(state));
    for (const id of state.hands.flat()) expect(json).not.toContain(`"${id}"`);
    expect(publicView(state).handCounts).toEqual([7, 7, 7, 7]);
    const mine = privateView(state, 1);
    expect(mine.hand).toEqual(state.hands[1]);
    for (const id of state.hands[0]!) expect(JSON.stringify(mine)).not.toContain(`"${id}"`);
  });

  it('never shows the unused tiles', () => {
    const state = createMatch({ mode: 'head-to-head' }, seededRandom(8));
    const json = JSON.stringify([publicView(state), privateView(state, 0), privateView(state, 1)]);
    for (const id of state.unused) expect(json).not.toContain(`"${id}"`);
    expect(publicView(state).unusedCount).toBe(14);
  });

  it('survives a save and restore, and refuses a state that loses a tile', () => {
    const state = createMatch({ mode: 'head-to-head' }, seededRandom(11));
    expect(restoreMatch(serializeMatch(state))).toEqual(state);
    const broken = structuredClone(state);
    broken.hands[0]!.pop();
    expect(() => restoreMatch(serializeMatch(broken))).toThrow();
  });

  it('counts pips per tile', () => {
    expect(pipsOf('6-6')).toBe(12);
    expect(pipsOf('0-0')).toBe(0);
  });
});
