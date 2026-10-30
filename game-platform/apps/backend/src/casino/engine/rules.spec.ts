import { DECK } from './cards';
import { assertValidState, createMatch, publicView, privateView, requestHold, restoreMatch, serializeMatch } from './match';
import { scenario, seededRandom, single } from './test-helpers';
import { applyPileTake, applyTurn, parseTurn, scoreHand } from './turn';
import type { MatchState, TurnAction } from './types';

const turn = (state: MatchState, seat: number, ...actions: TurnAction[]) => applyTurn(state, seat, { actions });
const errorOf = (result: ReturnType<typeof applyTurn>) => (result.ok ? null : result.error.code);
const ok = (result: ReturnType<typeof applyTurn>) => {
  if (!result.ok) throw new Error(`Expected a legal turn, got ${JSON.stringify(result.error)}`);
  return result.state;
};
const four = (hands: string[][]) => ({ players: 4 as const, hands });

describe('cards and deal', () => {
  it('has 52 distinct cards with values 1-13', () => {
    expect(new Set(DECK.map(c => c.id)).size).toBe(52);
    expect(DECK.filter(c => c.rank === 1)).toHaveLength(4);
    expect(DECK.find(c => c.id === 'QH')?.rank).toBe(12);
  });

  it('deals four players 12 cards each with four on the table', () => {
    const state = createMatch({ players: 4 }, seededRandom(1), 2);
    expect(state.hands.map(h => h.length)).toEqual([12, 12, 12, 12]);
    expect(state.loose).toHaveLength(4);
    expect(state.stock).toHaveLength(0);
    expect(state.turn).toBe(3); // the player on the dealer's right plays first
    assertValidState(state);
  });

  it('deals two players 12 each and keeps 24 for the second deal', () => {
    const state = createMatch({ players: 2 }, seededRandom(2), 0);
    expect(state.hands.map(h => h.length)).toEqual([12, 12]);
    expect(state.stock).toHaveLength(24);
    expect(state.turn).toBe(1);
    assertValidState(state);
  });

  it('recuts a layout worth 3+ points or with 3 picture cards', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { loose } = createMatch({ players: 4 }, seededRandom(seed));
      const points = loose.reduce((p, id) => p + (id === '10D' ? 2 : id === '2S' || id.startsWith('A') ? 1 : 0), 0);
      const pictures = loose.filter(id => /^[JQK]/.test(id)).length;
      expect(points < 3 && pictures < 3).toBe(true);
    }
  });

  it('uses the default target of 21 and keeps a configured one in range', () => {
    expect(createMatch({}, seededRandom(3)).config.targetPoints).toBe(21);
    expect(createMatch({ targetPoints: 31 }, seededRandom(3)).config.targetPoints).toBe(31);
    expect(createMatch({ targetPoints: 5 }, seededRandom(3)).config.targetPoints).toBe(21);
  });
});

describe('capturing', () => {
  it('captures a matching card and a set adding up to the played value', () => {
    const state = scenario({ hands: [['9H', '2C'], ['KD']], loose: ['9S', '5D', '4C', 'QH'] });
    const next = ok(turn(state, 0, { type: 'capture', card: '9H', sets: [['9S'], ['5D', '4C']], builds: [] }));
    expect(next.loose).toEqual(['QH']);
    expect(next.piles[0].at(-1)).toBe('9H');
    expect(next.piles[0]).toHaveLength(4);
    expect(next.lastCapturer).toBe(0);
    expect(next.turn).toBe(1);
  });

  it('lets the capturer order the captured cards under the capturing card', () => {
    const state = scenario({ hands: [['9H', '2C'], ['KD']], loose: ['9S', '5D', '4C'] });
    const capture = { type: 'capture' as const, card: '9H', sets: [['9S'], ['5D', '4C']], builds: [] };
    expect(ok(turn(state, 0, { ...capture, order: ['4C', '9S', '5D'] })).piles[0]).toEqual(['4C', '9S', '5D', '9H']);
    expect(errorOf(turn(state, 0, { ...capture, order: ['4C', '9S'] }))).toBe('INVALID_ORDER');
    expect(errorOf(turn(state, 0, { ...capture, order: ['4C', '9S', '9H'] }))).toBe('INVALID_ORDER');
  });

  it('rejects a capture that leaves cards the played card is entitled to, naming them', () => {
    const state = scenario({ hands: [['9H', '2C'], ['KD']], loose: ['9S', '5D', '4C'] });
    const result = turn(state, 0, { type: 'capture', card: '9H', sets: [['9S']], builds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(expect.objectContaining({ code: 'CAPTURE_INCOMPLETE', action: 0 }));
      expect([...(result.error.params?.cards ?? [])].sort()).toEqual(['4C', '5D']);
    }
  });

  it('lets the player choose between incompatible completions', () => {
    const state = scenario({ hands: [['10H', '2C'], ['KD']], loose: ['5S', '5D', '5C'] });
    for (const pair of [['5S', '5D'], ['5S', '5C'], ['5D', '5C']]) {
      expect(turn(state, 0, { type: 'capture', card: '10H', sets: [pair], builds: [] }).ok).toBe(true);
    }
  });

  it('captures builds only by matching their value (pagat: 8-build, 6-build, single 6)', () => {
    const builds = [single('b1', ['5C', '3C'], 8, 1), single('b2', ['4D', '2D'], 6, 1)];
    const state = scenario({ hands: [['AH', '6H', 'KS'], ['8D', '6S']], loose: ['6C'], builds });
    expect(errorOf(turn(state, 0, { type: 'capture', card: 'AH', aceValue: 14, sets: [], builds: ['b1'] }))).toBe('BUILD_VALUE_MISMATCH');
    expect(errorOf(turn(state, 0, { type: 'capture', card: 'AH', aceValue: 14, sets: [], builds: [] }))).toBe('CAPTURE_EMPTY');
    expect(errorOf(turn(state, 0, { type: 'capture', card: '6H', sets: [['6C']], builds: [] }))).toBe('CAPTURE_INCOMPLETE');
    const next = ok(turn(state, 0, { type: 'capture', card: '6H', sets: [['6C']], builds: ['b2'] }));
    expect(next.builds.map(b => b.id)).toEqual(['b1']);
  });

  it('never captures straight from a capture pile', () => {
    const state = scenario({ hands: [['7H', '2C'], ['KD']], loose: ['3C'], piles: [[], ['4S', '7S']] });
    expect(errorOf(turn(state, 0, { type: 'capture', card: '7H', sets: [['7S']], builds: [] }))).toBe('CARD_NOT_ON_TABLE');
  });

  it('asks for an ace value and judges entitlement by the value chosen', () => {
    const state = scenario({ hands: [['AH', '2C'], ['KD']], loose: ['AS', '9C', '5D'] });
    expect(errorOf(turn(state, 0, { type: 'capture', card: 'AH', sets: [['AS']], builds: [] }))).toBe('ACE_VALUE_REQUIRED');
    expect(errorOf(turn(state, 0, { type: 'capture', card: 'AH', aceValue: 14, sets: [['AS']], builds: [] }))).toBe('CAPTURE_INCOMPLETE');
    expect(turn(state, 0, { type: 'capture', card: 'AH', aceValue: 14, sets: [['AS'], ['9C', '5D']], builds: [] }).ok).toBe(true);
    expect(turn(state, 0, { type: 'capture', card: 'AH', aceValue: 1, sets: [['AS']], builds: [] }).ok).toBe(true);
  });
});

describe('discarding', () => {
  it('rejects discarding a card that could capture', () => {
    const state = scenario({ hands: [['7H', '2C'], ['KD']], loose: ['3C', '4D'] });
    expect(errorOf(turn(state, 0, { type: 'discard', card: '7H' }))).toBe('DISCARD_COULD_CAPTURE');
    expect(turn(state, 0, { type: 'discard', card: '2C' }).ok).toBe(true);
  });

  it('treats a discarded ace as able to capture at 1 or 14', () => {
    const state = scenario({ hands: [['AH', '2C'], ['KD']], loose: ['9C', '5D'] });
    expect(errorOf(turn(state, 0, { type: 'discard', card: 'AH' }))).toBe('DISCARD_COULD_CAPTURE');
  });
});

describe('single builds', () => {
  it('builds from the layout when a capture card is kept', () => {
    const state = scenario({ ...four([['10H', '2C'], ['KD'], ['QD'], ['JD']]), loose: ['5S', '3D', '2D'] });
    const next = ok(turn(state, 0, { type: 'build', loose: ['5S', '3D', '2D'] }, { type: 'discard', card: '2C' }));
    expect(next.builds).toEqual([expect.objectContaining({ value: 10, owner: 0 })]);
  });

  it('builds with a hand card (pagat: 4 and 5 on the table, play a 5 for 14 holding an ace)', () => {
    const state = scenario({ hands: [['5H', 'AC'], ['KD']], loose: ['4S', '5D'] });
    expect(ok(turn(state, 0, { type: 'build', hand: '5H', loose: ['4S', '5D'] })).builds[0]).toEqual(
      expect.objectContaining({ value: 14, owner: 0 }),
    );
  });

  it('requires keeping a card that captures the build', () => {
    const state = scenario({ ...four([['9H', '2C'], ['KD'], ['QD'], ['JD']]), loose: ['5S', '3D', '2D'] });
    expect(errorOf(turn(state, 0, { type: 'build', loose: ['5S', '3D', '2D'] }, { type: 'discard', card: '2C' }))).toBe('NO_CAPTURE_CARD_KEPT');
  });

  it('never uses capture-pile cards for a single build', () => {
    const state = scenario({ hands: [['10H', '2C'], ['KD']], loose: ['5S'], piles: [[], ['5D']] });
    expect(errorOf(turn(state, 0, { type: 'build', loose: ['5S', '5D'] }, { type: 'discard', card: '2C' }))).toBe('CARD_NOT_ON_TABLE');
  });

  it('allows one build per value on the table', () => {
    const opts = { ...four([['KH', '2C', 'KC'], ['KD'], ['QD'], ['JD']]), loose: ['9S', '4D'] };
    const theirs = scenario({ ...opts, builds: [single('b1', ['8C', '5C'], 13, 1)] });
    expect(errorOf(turn(theirs, 0, { type: 'build', loose: ['9S', '4D'] }, { type: 'discard', card: '2C' }))).toBe('BUILD_VALUE_TAKEN');
    const ours = scenario({ ...opts, builds: [single('b1', ['8C', '5C'], 13, 0)] });
    expect(errorOf(turn(ours, 0, { type: 'build', loose: ['9S', '4D'] }, { type: 'discard', card: '2C' }))).toBe('MUST_AUGMENT_EXISTING');
    expect(turn(ours, 0, { type: 'augment', build: 'b1', loose: ['9S', '4D'] }, { type: 'discard', card: '2C' }).ok).toBe(true);
  });

  it('turns two aces into a 2-build, or an augmented build of 1 or 14', () => {
    const state = scenario({ ...four([['AH', '2C', 'AD', 'KS'], ['KD'], ['QD'], ['JD']]), loose: ['AS'] });
    expect(ok(turn(state, 0, { type: 'build', hand: 'AH', loose: ['AS'] })).builds[0].value).toBe(2);
    for (const value of [1, 14] as const) {
      const next = ok(turn(state, 0, { type: 'augment', base: 'AS', baseValue: value, hand: 'AH', loose: [] }));
      expect(next.builds[0]).toEqual(expect.objectContaining({ value, groups: [[{ id: 'AS', value }], [{ id: 'AH', value }]] }));
    }
    expect(errorOf(turn(state, 0, { type: 'augment', base: 'AS', hand: 'AH', loose: [] }))).toBe('ACE_VALUE_REQUIRED');
  });

  it('fixes ace values inside a build until it is captured', () => {
    const state = scenario({ ...four([['AD', '2S'], ['AC', '3H'], ['QD'], ['JD']]), loose: ['AS', 'KC', 'AH'] });
    // A 14-build: a base ace as 14 plus K + A, where that second ace counts 1
    const next = ok(turn(state, 0, { type: 'augment', base: 'AS', baseValue: 14, loose: ['KC', 'AH'] }, { type: 'discard', card: '2S' }));
    expect(next.builds[0].groups).toEqual([[{ id: 'AS', value: 14 }], [{ id: 'KC', value: 13 }, { id: 'AH', value: 1 }]]);
    // An ace played as 1 can't take it
    expect(errorOf(turn(next, 1, { type: 'capture', card: 'AC', aceValue: 1, sets: [], builds: ['b100'] }))).toBe('BUILD_VALUE_MISMATCH');
    expect(turn(next, 1, { type: 'capture', card: 'AC', aceValue: 14, sets: [], builds: ['b100'] }).ok).toBe(true);
  });
});

describe('changing a build value', () => {
  const opts = (owner: number) => ({
    ...four([['2H', 'JC', '5S'], ['KD', '9D'], ['QD'], ['JD']]),
    builds: [single('b1', ['6C', '3C'], 9, owner)],
  });

  it('lets a player raise an opponent single build and take it over (pagat: 9 + 2 = 11 holding a jack)', () => {
    const next = ok(turn(scenario(opts(1)), 0, { type: 'change', build: 'b1', card: '2H' }));
    expect(next.builds[0]).toEqual(expect.objectContaining({ value: 11, owner: 0 }));
    expect(next.proven[1]).toEqual([9]);
  });

  it('refuses own or partner builds, augmented builds and values the player cannot capture', () => {
    expect(errorOf(turn(scenario(opts(0)), 0, { type: 'change', build: 'b1', card: '2H' }))).toBe('CANNOT_CHANGE_OWN_BUILD');
    expect(errorOf(turn(scenario(opts(2)), 0, { type: 'change', build: 'b1', card: '2H' }))).toBe('CANNOT_CHANGE_OWN_BUILD');
    expect(errorOf(turn(scenario(opts(1)), 0, { type: 'change', build: 'b1', card: '5S' }))).toBe('NO_CARD_FOR_NEW_VALUE');
    const augmented = scenario({ ...opts(1), builds: [{ id: 'b1', value: 9, owner: 1, groups: [[{ id: '9C', value: 9 }], [{ id: '6C', value: 6 }, { id: '3C', value: 3 }]] }] });
    expect(errorOf(turn(augmented, 0, { type: 'change', build: 'b1', card: '2H' }))).toBe('CANNOT_CHANGE_AUGMENTED');
  });

  it('merges into the side’s build of the new value (pagat: own 13, opponent 6+3, play a 4)', () => {
    const state = scenario({
      ...four([['4H', 'KC', '2S'], ['KD'], ['QD'], ['JD']]),
      builds: [single('b1', ['8C', '5C'], 13, 0), single('b2', ['6D', '3D'], 9, 1)],
    });
    const next = ok(turn(state, 0, { type: 'change', build: 'b2', card: '4H' }));
    expect(next.builds).toHaveLength(1);
    expect(next.builds[0]).toEqual(expect.objectContaining({ value: 13, owner: 0 }));
    expect(next.builds[0].groups).toHaveLength(2);
  });
});

describe('augmenting and capture piles', () => {
  it('exposes pile cards one at a time (pagat: layout 9, 7, 4; pile top 5 over a 2)', () => {
    const state = scenario({
      ...four([['9H', '3C'], ['KD'], ['QD'], ['JD']]),
      loose: ['9S', '7D', '4C'],
      piles: [[], ['KS', '2D', '5S']],
    });
    // Taking the 5 shows everyone the 2 before the rest of the turn is chosen
    const taken = applyPileTake(state, 0, { type: 'augment', base: '9S', loose: ['4C'], pile: true });
    if (!taken.ok) throw new Error(taken.error.code);
    expect(taken.state.turn).toBe(0);
    expect(publicView(taken.state).piles[1]).toEqual({ count: 2, top: '2D' });
    const next = ok(turn(taken.state, 0, { type: 'augment', build: 'b100', loose: ['7D'], pile: true }, { type: 'discard', card: '3C' }));
    expect(next.builds[0].groups.map(g => g.map(c => c.id))).toEqual([['9S'], ['4C', '5S'], ['7D', '2D']]);
    expect(next.piles[1]).toEqual(['KS']);
    expect(next.lastTurn?.actions).toHaveLength(3);
  });

  it('uses only the pile card showing when the turn was chosen', () => {
    const state = scenario({ ...four([['9H', '3C'], ['KD'], ['QD'], ['JD']]), loose: ['9S', '7D', '4C'], piles: [[], ['KS', '2D', '5S']] });
    expect(
      errorOf(turn(state, 0, { type: 'augment', base: '9S', loose: ['4C'], pile: true }, { type: 'augment', build: 'b100', loose: ['7D'], pile: true }, { type: 'discard', card: '3C' })),
    ).toBe('PILE_ALREADY_USED');
    // The 2 it uncovers would fit with the 7, but nobody could see it: it is not demanded
    expect(turn(state, 0, { type: 'augment', base: '9S', loose: ['4C'], pile: true }, { type: 'discard', card: '3C' }).ok).toBe(true);
  });

  it('takes pile cards early only into the side’s builds or onto a base the player can capture', () => {
    const state = scenario({
      ...four([['9H', '3C'], ['KD'], ['QD'], ['JD']]),
      loose: ['4C', '2C'],
      builds: [single('b1', ['8C', '3D'], 11, 1)],
      piles: [[], ['5S']],
    });
    expect(applyPileTake(state, 0, { type: 'augment', build: 'b1', loose: ['4C', '2C'], pile: true }).ok).toBe(false);
    const noCard = scenario({ ...four([['8H', '3C'], ['KD'], ['QD'], ['JD']]), loose: ['9S', '4C'], piles: [[], ['5S']] });
    expect(applyPileTake(noCard, 0, { type: 'augment', base: '9S', loose: ['4C'], pile: true })).toEqual({ ok: false, error: expect.objectContaining({ code: 'NO_CAPTURE_CARD_KEPT' }) });
  });

  it('does not take two pile cards for one set (pagat: layout 9 and 2, pile 5 over 2)', () => {
    const state = scenario({ ...four([['9H', '3C'], ['KD'], ['QD'], ['JD']]), loose: ['9S', '2C'], piles: [[], ['2D', '5S']] });
    expect(errorOf(turn(state, 0, { type: 'augment', base: '9S', loose: ['2C', '2D'], pile: true }, { type: 'discard', card: '3C' }))).toBe('CARD_NOT_ON_TABLE');
    expect(errorOf(turn(state, 0, { type: 'augment', base: '9S', loose: ['2C'], pile: true }, { type: 'discard', card: '3C' }))).toBe('SET_SUM_MISMATCH');
  });

  it('only ever takes from the opponents’ pile', () => {
    const state = scenario({
      ...four([['9H', '3C'], ['KD'], ['QD'], ['JD']]),
      builds: [single('b1', ['5C', '4C'], 9, 0)],
      piles: [['9D'], []],
    });
    expect(errorOf(turn(state, 0, { type: 'augment', build: 'b1', loose: [], pile: true }, { type: 'discard', card: '3C' }))).toBe('PILE_EMPTY');
  });

  it('augments an opponent build only when capturing it in the same turn', () => {
    const opts = { ...four([['9H', '3C'], ['KD', '9D'], ['QD'], ['JD']]), loose: ['5S', '4H'], builds: [single('b1', ['5C', '4C'], 9, 1)] };
    const state = scenario(opts);
    const steal = ok(turn(state, 0, { type: 'augment', build: 'b1', loose: ['5S', '4H'] }, { type: 'capture', card: '9H', sets: [], builds: ['b1'] }));
    expect(steal.piles[0]).toHaveLength(5);
    expect(steal.proven[1]).toEqual([9]);
    expect(errorOf(turn(state, 0, { type: 'augment', build: 'b1', loose: ['5S', '4H'] }, { type: 'discard', card: '3C' }))).toBe('OPPONENT_BUILD_NOT_CAPTURED');
    expect(errorOf(turn(scenario({ ...opts, hands: [['9H', '9C'], ['KD'], ['QD'], ['JD']] }), 0, { type: 'augment', build: 'b1', hand: '9C', loose: [] }))).toBe(
      'HAND_CARD_ON_OPPONENT_BUILD',
    );
  });

  it('requires adding cards that could join the side’s builds before the turn ends', () => {
    const state = scenario({ ...four([['KH', '3C', 'KC'], ['KD'], ['QD'], ['JD']]), loose: ['9S', '4D'], builds: [single('b1', ['8C', '5C'], 13, 2)] });
    const result = turn(state, 0, { type: 'discard', card: '3C' });
    expect(errorOf(result)).toBe('MUST_AUGMENT');
    if (!result.ok) expect([...(result.error.params?.cards ?? [])].sort()).toEqual(['4D', '9S']);
    expect(turn(state, 0, { type: 'augment', build: 'b1', loose: ['9S', '4D'] }, { type: 'discard', card: '3C' }).ok).toBe(true);
  });

  it('never splits builds or combines them for a capture', () => {
    const state = scenario({ hands: [['KH', '2C'], ['QD']], builds: [single('b1', ['5C', '3C'], 8, 1)], loose: ['5S'] });
    expect(errorOf(turn(state, 0, { type: 'capture', card: 'KH', sets: [['5S', '5C', '3C']], builds: [] }))).toBe('CARD_NOT_ON_TABLE');
  });
});

describe('two-player first deal', () => {
  it('forbids discarding while owning a build, and owning two builds at the end of a turn', () => {
    const state = scenario({ hands: [['3C', 'KH', 'JS', 'KC'], ['QD']], loose: ['9S', '4D', '6H', '5C'], builds: [single('b1', ['8C', '5D'], 13, 0)] });
    const addToOwn = { type: 'augment' as const, build: 'b1', loose: ['9S', '4D'] };
    expect(errorOf(turn(state, 0, addToOwn, { type: 'build', loose: ['6H', '5C'] }, { type: 'discard', card: '3C' }))).toBe('DISCARD_WHILE_OWNING');
    expect(errorOf(turn(state, 0, addToOwn, { type: 'build', loose: ['6H', '5C'] }, { type: 'augment', build: 'b1', hand: 'KH', loose: [] }))).toBe('TOO_MANY_BUILDS');
    // A second build made to steal cards is fine if one of them is captured in the same turn
    expect(turn(state, 0, addToOwn, { type: 'build', loose: ['6H', '5C'] }, { type: 'capture', card: 'JS', sets: [], builds: ['b100'] }).ok).toBe(true);
  });

  it('lifts both restrictions for the second twelve cards', () => {
    const state = scenario({ deal: 1, hands: [['3C', 'KH', 'JS'], ['QD']], loose: ['9S', '4D'], builds: [single('b1', ['8C', '5D'], 13, 0)] });
    expect(turn(state, 0, { type: 'augment', build: 'b1', loose: ['9S', '4D'] }, { type: 'discard', card: '3C' }).ok).toBe(true);
  });

  it('deals the second twelve onto the same layout when both hands are empty', () => {
    const stock = DECK.map(c => c.id).filter(id => !['2C', '3D', '9S', 'KH'].includes(id)).slice(0, 24);
    const state = scenario({ turn: 1, hands: [[], ['2C']], loose: ['9S', 'KH'], stock });
    const next = ok(turn(state, 1, { type: 'discard', card: '2C' }));
    expect(next.deal).toBe(1);
    expect(next.hands.map(h => h.length)).toEqual([12, 12]);
    expect(next.loose).toEqual(['9S', 'KH', '2C']);
    expect(next.turn).toBe(0);
  });
});

describe('partnerships', () => {
  it('lets a player build for a partner whose build was taken, until the partner plays that rank', () => {
    const base = { ...four([['5H', '2C'], ['9D', '3D'], ['3S', 'KC'], ['QD']]), loose: ['4S', '6C', '3H'] };
    const unknown = scenario({ ...base, turn: 2 });
    expect(errorOf(turn(unknown, 2, { type: 'build', loose: ['6C', '3H'], forPartner: true }, { type: 'discard', card: 'KC' }))).toBe('PARTNER_NOT_PROVEN');
    const known = scenario({ ...base, turn: 2, proven: [[9], [], [], []] });
    const next = ok(turn(known, 2, { type: 'build', loose: ['6C', '3H'], forPartner: true }, { type: 'discard', card: 'KC' }));
    expect(next.builds[0]).toEqual(expect.objectContaining({ value: 9, owner: 0 }));
    expect(errorOf(turn(scenario({ ...base, players: 2, hands: [['5H'], ['9D']] }), 0, { type: 'build', loose: ['6C', '3H'], forPartner: true }))).toBe('NO_PARTNER');
  });

  it('forgets what a partner holds once they play that rank', () => {
    const state = scenario({ ...four([['9C', '2C'], ['KD'], ['QD'], ['JD']]), loose: ['5S'], proven: [[9], [], [], []] });
    expect(ok(turn(state, 0, { type: 'discard', card: '9C' })).proven[0]).toEqual([]);
  });

  it('hands a build to a partner who asked not to capture it', () => {
    const state = scenario({
      ...four([['KH', '2C'], ['QD'], ['KS', '3C'], ['JD']]),
      builds: [single('b1', ['8C', '5C'], 13, 0)],
      turn: 0,
    });
    expect(requestHold(state, 3, 13).ok).toBe(false); // not their side's build
    const held = requestHold(state, 2, 13);
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.state.holds[2]).toEqual([13]);
    const next = ok(turn(held.state, 0, { type: 'augment', build: 'b1', hand: 'KH', loose: [], giveToPartner: true }));
    expect(next.builds[0].owner).toBe(2);
    expect(errorOf(turn(state, 0, { type: 'augment', build: 'b1', hand: 'KH', loose: [], giveToPartner: true }))).toBe('GIVE_NOT_ALLOWED');
  });
});

describe('a whole turn', () => {
  it('plays exactly one card from hand', () => {
    const state = scenario({ ...four([['10H', '2C', '3C'], ['KD'], ['QD'], ['JD']]), loose: ['5S', '3D', '2D'] });
    expect(errorOf(turn(state, 0, { type: 'build', loose: ['5S', '3D', '2D'] }))).toBe('NO_HAND_CARD');
    const kings = scenario({ ...four([['KC', 'QC', '9H'], ['KD'], ['QD'], ['JD']]), loose: ['5S'] });
    expect(errorOf(turn(kings, 0, { type: 'discard', card: 'KC' }, { type: 'discard', card: 'QC' }))).toBe('MULTIPLE_HAND_CARDS');
  });

  it('never uses a card twice', () => {
    const state = scenario({ hands: [['9H', '2C'], ['KD']], loose: ['9S', '5D', '4C'] });
    expect(errorOf(turn(state, 0, { type: 'capture', card: '9H', sets: [['9S'], ['9S']], builds: [] }))).toBe('CARD_REUSED');
  });

  it('leaves the state untouched when a compound turn fails half way', () => {
    const state = scenario({ ...four([['KH', '3C', 'KC'], ['KD'], ['QD'], ['JD']]), loose: ['9S', '4D'], builds: [single('b1', ['8C', '5C'], 13, 0)] });
    const before = JSON.stringify(state);
    expect(turn(state, 0, { type: 'augment', build: 'b1', loose: ['9S', '4D'] }, { type: 'discard', card: 'QH' }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('is only accepted from the player whose turn it is', () => {
    const state = scenario({ hands: [['9H'], ['KD']], loose: ['9S'] });
    expect(errorOf(turn(state, 1, { type: 'discard', card: 'KD' }))).toBe('NOT_YOUR_TURN');
  });

  it('bounds and checks untrusted input', () => {
    expect(parseTurn({ actions: Array.from({ length: 17 }, () => ({ type: 'discard', card: '2C' })) })).toEqual({ ok: false, error: { code: 'TOO_MANY_ACTIONS' } });
    expect(parseTurn({ actions: [{ type: 'discard', card: 'ZZ' }] }).ok).toBe(false);
    expect(parseTurn({ actions: [{ type: 'capture', card: '9H', sets: [['9S']], builds: ['drop table'] }] }).ok).toBe(false);
    expect(parseTurn({ actions: [{ type: 'augment', build: 'b1', base: '9S', loose: [] }] }).ok).toBe(false);
    expect(parseTurn({ actions: [{ type: 'discard', card: '2C', extra: 1 }] })).toEqual({ ok: true, proposal: { actions: [{ type: 'discard', card: '2C' }] } });
  });
});

describe('scoring', () => {
  const ids = (suit: string) => DECK.filter(c => c.suit === suit).map(c => c.id);

  it('scores 11 points for a whole deck', () => {
    const [a, b] = scoreHand([[...ids('S'), ...ids('H')], [...ids('D'), ...ids('C')]]);
    expect(a).toEqual(expect.objectContaining({ cards: 26, mostCards: 1, mostSpades: 2, twoOfSpades: 1, tenOfDiamonds: 0, aces: 2, total: 6 }));
    expect(b).toEqual(expect.objectContaining({ mostCards: 1, mostSpades: 0, tenOfDiamonds: 2, aces: 2, total: 5 }));
  });

  it('splits tied majorities', () => {
    const [a, b] = scoreHand([['2S', '3S', 'KH'], ['4S', '5S', 'KD']]);
    expect([a.mostCards, a.mostSpades, b.mostCards, b.mostSpades]).toEqual([1, 1, 1, 1]);
  });

  // Seat 0 plays the last card; team 0 then scores 3 (most spades 2, cards tied 1) and team 1 scores 1
  const lastCard = (scores: number[]) => scenario({ turn: 0, hands: [['2C'], []], loose: ['KD'], piles: [['9S'], ['9H']], scores, target: 21 });

  it('checks for a winner only after a hand', () => {
    const next = ok(turn(lastCard([10, 10]), 0, { type: 'discard', card: '2C' }));
    expect(next.scores).toEqual([13, 11]);
    expect(next.status).toBe('handOver');
    expect(next.results).toHaveLength(1);
  });

  it('plays another hand while the leaders are tied at or above the target', () => {
    const next = ok(turn(lastCard([18, 20]), 0, { type: 'discard', card: '2C' }));
    expect(next.scores).toEqual([21, 21]);
    expect(next.status).toBe('handOver');
  });

  it('ends the match when one side leads at or above the target', () => {
    const next = ok(turn(lastCard([19, 20]), 0, { type: 'discard', card: '2C' }));
    expect(next.scores).toEqual([22, 21]);
    expect(next.status).toBe('finished');
    expect(next.winnerTeam).toBe(0);
  });
});

describe('views and persistence', () => {
  it('shows each player only their own hand and side’s pile', () => {
    const state = createMatch({ players: 4 }, seededRandom(7));
    const json = JSON.stringify(publicView(state));
    for (const id of state.hands.flat()) expect(json).not.toContain(`"${id}"`);
    expect(json).not.toContain('"stock"');
    const mine = privateView(state, 1);
    expect(mine.hand).toEqual(state.hands[1]);
    expect(JSON.stringify(mine)).not.toContain(`"${state.hands[0][0]}"`);
  });

  it('keeps pile order private: others see only the top card', () => {
    const state = scenario({ hands: [['9H', '2C'], ['KD']], loose: ['9S', '5D', '4C'] });
    const next = ok(turn(state, 0, { type: 'capture', card: '9H', sets: [['9S'], ['5D', '4C']], builds: [], order: ['4C', '9S', '5D'] }));
    expect(publicView(next).piles[0]).toEqual({ count: 4, top: '9H' });
    // Everyone learns what was taken, in deck order rather than the order chosen for the pile
    expect(publicView(next).lastTurn?.actions[0]).toEqual(expect.objectContaining({ captured: ['9S', '5D', '4C'] }));
    expect(privateView(next, 0).teamPile).toEqual(['4C', '9S', '5D', '9H']);
  });

  it('round-trips through serialization and rejects a corrupted state', () => {
    const state = createMatch({ players: 2 }, seededRandom(9));
    expect(restoreMatch(serializeMatch(state))).toEqual(state);
    const broken = structuredClone(state);
    broken.loose.push(broken.hands[0][0]);
    expect(() => restoreMatch(broken)).toThrow();
  });
});
