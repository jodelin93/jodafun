import { parseCell } from './engine/coords';
import { createGame, place, summary, type FiveSummary } from './engine/game';
import type { FiveGame, FiveMove } from './engine/types';

// A short guided lesson on real positions checked by the engine. The learner plays X.
type Step = {
  id: 'place' | 'row' | 'diagonal' | 'offscreen';
  stones: [number, number][]; // alternating X, O, X, O… then X to move
  goal: (move: FiveMove, next: FiveGame) => boolean;
};

const STEPS: Step[] = [
  // Any free cell will do: there is no need to play next to anything
  { id: 'place', stones: [], goal: () => true },
  // Four X in a row: complete five at either end
  { id: 'row', stones: [[-2, 0], [-2, 2], [-1, 0], [0, 2], [0, 0], [3, -3], [1, 0], [4, 4]], goal: (_m, next) => next.winner === 'X' },
  // Four on a diagonal, blocked at one end by O: only the open end wins
  { id: 'diagonal', stones: [[0, 0], [-1, -1], [1, 1], [2, -3], [2, 2], [-4, 3], [3, 3], [5, 0]], goal: (_m, next) => next.winner === 'X' },
  // The opponent played far off screen: find it (the "Last move" button) and play next to it
  {
    id: 'offscreen',
    stones: [[0, 0], [1, 1], [2, 0], [60, -40]],
    goal: m => Math.abs(Number(m.x) - 60) <= 1 && Math.abs(Number(m.y) + 40) <= 1,
  },
];

function stateOf(step: Step): FiveGame {
  const state = createGame(`tutorial-${step.id}`);
  step.stones.forEach(([x, y]) => {
    const result = place(state, state.turn, { x, y });
    if (!result.ok) throw new Error(`Tutorial position ${step.id} is invalid`);
  });
  return state;
}

export const TUTORIAL_STEPS = STEPS.length;

// The lesson's position: its summary and every stone (lessons are small)
export function tutorialStep(index: unknown): { id: string; index: number; total: number; game: FiveSummary; stones: FiveMove[] } | null {
  const i = Number(index);
  const step = Number.isInteger(i) ? STEPS[i] : undefined;
  if (!step) return null;
  const state = stateOf(step);
  return { id: step.id, index: i, total: STEPS.length, game: summary(state), stones: state.moves };
}

export type TutorialCheck =
  | { ok: false; error: { code: string } }
  | { ok: true; done: boolean; move: FiveMove; game: FiveSummary };

export function checkTutorial(index: unknown, raw: unknown): TutorialCheck | null {
  const i = Number(index);
  const step = Number.isInteger(i) ? STEPS[i] : undefined;
  if (!step) return null;
  if (!parseCell(raw)) return { ok: false, error: { code: 'BAD_CELL' } };
  const state = stateOf(step);
  const result = place(state, 'X', raw);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, done: step.goal(result.move, result.state), move: result.move, game: summary(result.state) };
}
