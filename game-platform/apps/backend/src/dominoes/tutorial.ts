import { seededRandom } from '../lib/random';
import { pass, playTile, privateView, publicView, type PrivateDominoView, type PublicDominoView } from './engine/match';
import { scenario } from './engine/scenario';
import type { DominoMatch, HandResult, Move, RuleError } from './engine/types';

// A short guided lesson: each step is a real position, and the player's move goes through the same
// validator as a game. The learner always sits in seat 0.
type Step = {
  id: 'place' | 'end' | 'pass' | 'blocked' | 'team';
  state: () => DominoMatch;
  goal: (action: TutorialAction, next: DominoMatch, result: HandResult | null) => boolean;
};

export type TutorialAction = { type: 'play'; move: Move } | { type: 'pass' };

const STEPS: Step[] = [
  {
    // Match the number at an open end: 5-6 goes on the 5
    id: 'place',
    state: () => scenario({ hands: [['5-6', '0-1', '2-2'], ['1-4', '3-3', '0-6']], board: [['3-5', 3, 5]] }),
    goal: action => action.type === 'play' && action.move.tile === '5-6',
  },
  {
    // 2-4 fits both ends; choose which end it goes on
    id: 'end',
    state: () => scenario({ hands: [['2-4', '0-0'], ['1-1', '5-5', '3-6']], board: [['4-6', 4, 6], ['6-2', 6, 2]] }),
    goal: action => action.type === 'play' && action.move.tile === '2-4' && action.move.end === 'left',
  },
  {
    // Nothing fits a 6 or a 6: the only legal action is to pass (there is no drawing)
    id: 'pass',
    state: () => scenario({ hands: [['0-1', '2-3', '4-5'], ['1-6', '0-2']], board: [['6-6', 6, 6]] }),
    goal: action => action.type === 'pass',
  },
  {
    // The opponent has just passed; when you pass too, nobody can play and the hand is blocked
    id: 'blocked',
    state: () => scenario({ hands: [['0-1', '1-2'], ['3-4', '5-5']], board: [['6-6', 6, 6]], passes: 1 }),
    goal: (_action, _next, result) => result?.ending === 'blocked',
  },
  {
    // Partners: go out with your last tile and your side scores the opponents' pips
    id: 'team',
    state: () =>
      scenario({
        mode: 'partners',
        hands: [['3-6'], ['1-2', '4-4'], ['0-5', '2-3'], ['1-5']],
        board: [['6-6', 6, 6]],
      }),
    goal: (_action, _next, result) => result?.ending === 'domino' && result.outSeat === 0,
  },
];

export const TUTORIAL_STEPS = STEPS.length;

export function tutorialStep(index: number): { id: string; view: PublicDominoView; me: PrivateDominoView } | null {
  const step = STEPS[index];
  if (!step) return null;
  const state = step.state();
  return { id: step.id, view: publicView(state), me: privateView(state, 0) };
}

export type TutorialCheck =
  | { ok: false; error: RuleError }
  | { ok: true; done: boolean; result: HandResult | null; view: PublicDominoView; me: PrivateDominoView };

// Runs the learner's action on the lesson's position. A legal action that isn't the lesson's goal
// is reported as not done, so the client can explain and let them try again.
export function checkTutorial(index: number, action: TutorialAction): TutorialCheck | null {
  const step = STEPS[index];
  if (!step) return null;
  const state = step.state();
  const outcome = action.type === 'pass' ? pass(state, 0, seededRandom(index)) : playTile(state, 0, action.move, seededRandom(index));
  if (!outcome.ok) return { ok: false, error: outcome.error };
  const done = step.goal(action, outcome.state, outcome.handResult);
  return { ok: true, done, result: outcome.handResult, view: publicView(outcome.state), me: privateView(outcome.state, 0) };
}
