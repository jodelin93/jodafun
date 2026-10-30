import { assertValidState, createMatch, legalTurns, playTurn, publicView, restoreMatch, serializeMatch } from './match';
import { seededRandom } from './test-helpers';
import type { MatchState, PlayerCount } from './types';

const cardsInHands = (s: MatchState) => s.hands.reduce((n, h) => n + h.length, 0) + s.stock.length;

// Plays a whole match choosing among the legal turns at random; returns how it went
function simulate(players: PlayerCount, seed: number, target = 21) {
  const random = seededRandom(seed);
  let state = createMatch({ players, targetPoints: target }, random);
  let turns = 0;
  let hands = 0;
  while (state.status === 'playing') {
    const seat = state.turn;
    const options = legalTurns(state, seat);
    // Nobody is ever stuck
    expect(options.length).toBeGreaterThan(0);
    const proposal = options[random(options.length)];
    const before = state;
    const beforeJson = JSON.stringify(before);
    const result = playTurn(state, seat, proposal, random);
    if (!result.ok) throw new Error(`Legal turn rejected: ${JSON.stringify(result.error)}`);
    // The previous state object is never modified
    expect(JSON.stringify(before)).toBe(beforeJson);
    state = result.state;
    assertValidState(state);
    turns++;

    if (result.handResult) {
      hands++;
      const points = result.handResult.teams.reduce((n, t) => n + t.total, 0);
      // 11 points a hand, unless nobody ever captured (then the table cards go unscored)
      if (result.handResult.lastCapturer !== null) expect(points).toBe(11);
    } else {
      // Exactly one card left the hands (a second two-player deal refills them by 24)
      const drop = cardsInHands(before) - cardsInHands(state);
      expect(drop === 1 || (players === 2 && state.deal === 1 && before.deal === 0)).toBe(true);
    }
    // Hidden cards never reach the public view (a previous hand's last turn names reshuffled cards)
    const pub = publicView(state);
    const view = JSON.stringify({ ...pub, lastTurn: pub.lastTurn?.hand === state.handNumber ? pub.lastTurn : null });
    for (const id of [...state.hands.flat(), ...state.stock]) expect(view).not.toContain(`"${id}"`);
    // Every position survives a save and restore
    if (turns % 7 === 0) expect(restoreMatch(serializeMatch(state))).toEqual(state);
    if (turns > 5000) throw new Error('Match did not finish');
  }
  return { state, turns, hands };
}

describe('simulated matches', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('plays a full two-player match (seed %i)', seed => {
    const { state, hands } = simulate(2, seed);
    expect(state.status).toBe('finished');
    expect(state.scores[state.winnerTeam!]).toBeGreaterThanOrEqual(21);
    expect(state.scores[state.winnerTeam!]).toBeGreaterThan(state.scores[1 - state.winnerTeam!]);
    expect(state.results).toHaveLength(hands);
  });

  it.each([13, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 108])('plays a full four-player match (seed %i)', seed => {
    const { state } = simulate(4, seed);
    expect(state.status).toBe('finished');
    expect(state.scores[state.winnerTeam!]).toBeGreaterThanOrEqual(21);
  });

  it('rotates the dealer to the right after every hand', () => {
    const random = seededRandom(42);
    let state = createMatch({ players: 4, targetPoints: 61 }, random, 0);
    const dealers = [state.dealer];
    while (state.status === 'playing' && state.handNumber < 4) {
      const options = legalTurns(state, state.turn);
      const result = playTurn(state, state.turn, options[0], random);
      if (!result.ok) throw new Error('rejected');
      if (result.state.handNumber !== state.handNumber) dealers.push(result.state.dealer);
      state = result.state;
    }
    expect(dealers).toEqual([0, 1, 2, 3]);
  });
});
