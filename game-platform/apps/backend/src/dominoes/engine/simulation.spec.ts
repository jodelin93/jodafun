import { seededRandom } from '../../lib/random';
import { assertValidState, createMatch, legalMoves, pass, playTile, privateView, publicView, restoreMatch, serializeMatch } from './match';
import { sumPips } from './tiles';
import type { DominoMatch, Mode } from './types';

// Plays a whole match choosing among the legal moves at random, checking the engine's promises on
// every step
function simulate(mode: Mode, seed: number, targetScore = 100) {
  const random = seededRandom(seed);
  let state = createMatch({ mode, targetScore }, random, `sim-${seed}`);
  let turns = 0;
  let blocked = 0;
  while (state.status === 'playing') {
    const seat = state.turn;
    const moves = legalMoves(state, seat);
    const view = privateView(state, seat);
    // Passing is offered exactly when nothing can be played
    expect(view.canPass).toBe(moves.length === 0);
    const before: DominoMatch = state;
    const beforeJson = JSON.stringify(before);
    const result = moves.length ? playTile(state, seat, moves[random(moves.length)]!, random) : pass(state, seat, random);
    if (!result.ok) throw new Error(`Legal action rejected: ${JSON.stringify(result.error)}`);
    expect(JSON.stringify(before)).toBe(beforeJson);
    state = result.state;
    assertValidState(state);
    turns++;

    if (result.handResult) {
      const r = result.handResult;
      if (r.ending === 'blocked') blocked++;
      // Only the winner scores; pips match the revealed hands
      expect(r.points.filter(p => p > 0).length).toBeLessThanOrEqual(1);
      r.remaining.forEach((hand, s) => expect(r.pips[s]).toBe(sumPips(hand)));
      if (r.ending === 'domino') expect(r.remaining[r.outSeat!]).toEqual([]);
      if (r.winnerTeam === null) expect(r.points).toEqual([0, 0]);
    } else if (moves.length) {
      expect(state.passes).toBe(0);
    }
    // Hidden tiles never reach the public view (finished hands are revealed only in their results)
    const pub = JSON.stringify({ ...publicView(state), results: [] });
    for (const id of [...state.hands.flat(), ...state.unused]) expect(pub).not.toContain(`"${id}"`);
    if (turns % 9 === 0) expect(restoreMatch(serializeMatch(state))).toEqual(state);
    if (turns > 20000) throw new Error('Match did not finish');
  }
  return { state, turns, blocked };
}

describe('simulated matches', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('plays a full head-to-head match (seed %i)', seed => {
    const { state } = simulate('head-to-head', seed);
    expect(state.status).toBe('finished');
    expect(state.scores[state.winnerTeam!]).toBeGreaterThanOrEqual(100);
    expect(state.scores[state.winnerTeam!]).toBeGreaterThan(state.scores[1 - state.winnerTeam!]!);
    expect(state.results.at(-1)!.scoresAfter).toEqual(state.scores);
  });

  it.each([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])('plays a full partners match (seed %i)', seed => {
    const { state } = simulate('partners', seed);
    expect(state.status).toBe('finished');
    expect(state.scores[state.winnerTeam!]).toBeGreaterThanOrEqual(100);
  });

  it('reaches blocked hands in both modes across many matches', () => {
    let blocked = 0;
    for (let seed = 100; seed < 140; seed++) blocked += simulate(seed % 2 ? 'partners' : 'head-to-head', seed).blocked;
    expect(blocked).toBeGreaterThan(0);
  });
});
