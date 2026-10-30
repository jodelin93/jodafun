import { seededRandom } from '../../lib/random';
import { assertValidState, createGame, legalMoves, playMove, replay, restoreGame, serializeGame } from './game';
import type { DraughtsGame } from './types';

// Whole games with random legal moves: checks the engine's bookkeeping on every step. The rules
// themselves are checked against hand-built positions in rules.spec.ts and draws.spec.ts.
function randomGame(seed: number, maxPlies = 400) {
  const random = seededRandom(seed);
  let state = createGame(`sim-${seed}`);
  const ids = new Set(state.pieces.map(p => p.id));
  while (state.status === 'playing' && state.moves.length < maxPlies) {
    const moves = legalMoves(state);
    expect(moves.length).toBeGreaterThan(0); // otherwise the game would already be over
    const move = moves[random(moves.length)]!;
    const before = JSON.stringify(state);
    const result = playMove(state, state.turn, { from: move.from, path: move.path });
    if (!result.ok) throw new Error(`Legal move rejected: ${JSON.stringify(result.error)}`);
    expect(JSON.stringify(state)).toBe(before); // never mutated
    const prev: DraughtsGame = state;
    state = result.state;
    assertValidState(state);
    // Exactly the captured pieces left the board; ids never change or appear
    expect(state.pieces).toHaveLength(prev.pieces.length - move.captures.length);
    for (const p of state.pieces) expect(ids.has(p.id)).toBe(true);
    const moved = state.pieces.find(p => p.id === result.move!.pieceId)!;
    expect(moved.square).toBe(move.path.at(-1));
    if (state.moves.length % 11 === 0) expect(restoreGame(serializeGame(state))).toEqual(state);
  }
  return state;
}

describe('simulated games', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('keeps every piece and square consistent (seed %i)', seed => {
    const state = randomGame(seed);
    // Replaying the recorded routes gives the same game
    const again = replay(state.gameId, state.moves.map(m => ({ from: m.from, path: m.path })));
    expect(again).toEqual(state);
  });

  it('reaches finished games with a result and a reason', () => {
    let finished = 0;
    for (let seed = 100; seed < 130; seed++) {
      const state = randomGame(seed, 1000);
      if (state.status === 'finished') {
        finished++;
        expect(state.result?.reason).toBeDefined();
      }
    }
    expect(finished).toBeGreaterThan(0);
  });
});
