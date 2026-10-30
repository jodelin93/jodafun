import { privateView, publicView } from './engine/match';
import { scenario } from './engine/scenario';
import { applyTurn, parseTurn } from './engine/turn';
import type { MatchState, RuleError, TurnProposal } from './engine/types';

// Practice positions for the guided tutorial. The player is always seat 0; every attempt is checked
// by the real rules engine, then against the lesson's goal. The words live in the frontend.
interface TutorialStep {
  id: string;
  state: () => MatchState;
  goal: (proposal: TurnProposal, next: MatchState) => boolean;
}

const captures = (p: TurnProposal) => p.actions.filter(a => a.type === 'capture');

const STEPS: TutorialStep[] = [
  {
    id: 'match',
    state: () => scenario({ deal: 1, hands: [['7H', 'KC'], ['QD', '2S']], loose: ['7S', '2D', 'JC'] }),
    goal: p => captures(p).some(a => a.sets.flat().includes('7S')),
  },
  {
    id: 'sum',
    state: () => scenario({ deal: 1, hands: [['9D', 'QS'], ['KD', '3H']], loose: ['5C', '4H', '8S'] }),
    goal: p => captures(p).some(a => a.card === '9D' && a.sets.flat().includes('5C') && a.sets.flat().includes('4H')),
  },
  {
    id: 'build',
    state: () => scenario({ deal: 1, hands: [['6H', '10C', '3C'], ['KD', '2H']], loose: ['4S', '3D'] }),
    goal: (_p, next) => next.builds.some(b => b.value === 10 && b.owner === 0),
  },
  {
    id: 'pile',
    state: () => scenario({ deal: 1, hands: [['8C', '2H', 'JS'], ['KD', '4D']], loose: ['8D', '3S'], piles: [[], ['QS', '5H']] }),
    goal: p => p.actions.some(a => a.type === 'augment' && a.pile),
  },
  {
    id: 'complete',
    state: () => scenario({ deal: 1, hands: [['10H', '3C'], ['KD', '4D']], loose: ['10S', '6D', '4C', '2S'] }),
    goal: p => captures(p).some(a => a.card === '10H'),
  },
];

export const TUTORIAL_STEPS = STEPS.length;

export function tutorialStep(index: unknown) {
  const step = STEPS[Number(index)];
  if (!step) return null;
  const state = step.state();
  return { index: Number(index), total: STEPS.length, id: step.id, match: publicView(state), mine: privateView(state, 0) };
}

export function checkTutorial(index: unknown, turn: unknown): { valid: boolean; goalMet: boolean; error?: RuleError } {
  const step = STEPS[Number(index)];
  if (!step) return { valid: false, goalMet: false, error: { code: 'BAD_REQUEST' } };
  const parsed = parseTurn(turn);
  if (!parsed.ok) return { valid: false, goalMet: false, error: parsed.error };
  const result = applyTurn(step.state(), 0, parsed.proposal);
  if (!result.ok) return { valid: false, goalMet: false, error: result.error };
  return { valid: true, goalMet: step.goal(parsed.proposal, result.state) };
}
