import { parseRoute, playMove, publicView, type PublicDraughtsView } from './engine/game';
import { position } from './engine/scenario';
import type { DraughtsGame, MoveRecord, RuleError } from './engine/types';

// A short guided lesson: each step is a real position and the learner's route goes through the same
// validator as a game. The learner plays white.
type Step = {
  id: 'move' | 'capture' | 'max' | 'promotion' | 'end';
  state: () => DraughtsGame;
  goal: (move: MoveRecord, next: DraughtsGame) => boolean;
};

const STEPS: Step[] = [
  // A man moves one square diagonally forwards
  { id: 'move', state: () => position({ white: { men: [32] }, black: { men: [3] } }), goal: m => m.captures.length === 0 },
  // Capturing is compulsory, backwards too: 28 takes 33
  { id: 'capture', state: () => position({ white: { men: [28, 46] }, black: { men: [33, 3] } }), goal: m => m.captures.length === 1 },
  // Take the most pieces: 36 takes 31 and 22, not the single man on 33
  { id: 'max', state: () => position({ white: { men: [36, 28] }, black: { men: [31, 22, 33], kings: [3] } }), goal: m => m.captures.length === 2 },
  // A man that stops on the far row becomes a king
  { id: 'promotion', state: () => position({ white: { men: [7] }, black: { men: [40] } }), goal: m => m.promotes },
  // The king flies along the diagonal and takes the last piece: the game is won
  { id: 'end', state: () => position({ white: { kings: [46] }, black: { men: [28] } }), goal: (_m, next) => next.result?.winner === 'white' },
];

export const TUTORIAL_STEPS = STEPS.length;

export function tutorialStep(index: unknown): { id: string; index: number; total: number; view: PublicDraughtsView } | null {
  const i = Number(index);
  const step = Number.isInteger(i) ? STEPS[i] : undefined;
  if (!step) return null;
  return { id: step.id, index: i, total: STEPS.length, view: publicView(step.state()) };
}

export type TutorialCheck =
  | { ok: false; error: RuleError }
  | { ok: true; done: boolean; move: MoveRecord; view: PublicDraughtsView };

// Plays the learner's route on the lesson's position. A legal route that isn't the lesson's goal
// is reported as not done, so the client can explain and let them try again.
export function checkTutorial(index: unknown, raw: unknown): TutorialCheck | null {
  const i = Number(index);
  const step = Number.isInteger(i) ? STEPS[i] : undefined;
  if (!step) return null;
  const parsed = parseRoute(raw);
  if (!parsed.ok) return { ok: false, error: { code: 'BAD_MOVE' } };
  const result = playMove(step.state(), 'white', parsed.route);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, done: step.goal(result.move!, result.state), move: result.move!, view: publicView(result.state) };
}
