import { checkTutorial, tutorialStep, TUTORIAL_STEPS } from './tutorial';
import type { TurnAction } from './engine/types';

// A correct answer for each lesson, in order
const ANSWERS: TurnAction[][] = [
  [{ type: 'capture', card: '7H', sets: [['7S']], builds: [] }],
  [{ type: 'capture', card: '9D', sets: [['5C', '4H']], builds: [] }],
  [{ type: 'build', hand: '6H', loose: ['4S'] }],
  [{ type: 'augment', base: '8D', loose: ['3S'], pile: true }, { type: 'capture', card: '8C', sets: [], builds: ['b100'] }],
  [{ type: 'capture', card: '10H', sets: [['10S'], ['6D', '4C']], builds: [] }],
];

describe('tutorial', () => {
  it('has a legal answer that meets the goal of every lesson', () => {
    expect(ANSWERS).toHaveLength(TUTORIAL_STEPS);
    ANSWERS.forEach((actions, i) => expect(checkTutorial(i, { actions })).toEqual({ valid: true, goalMet: true }));
  });

  it('explains a rule mistake with the engine’s own reason', () => {
    const partial = checkTutorial(4, { actions: [{ type: 'capture', card: '10H', sets: [['10S']], builds: [] }] });
    expect(partial).toEqual(expect.objectContaining({ valid: false, error: expect.objectContaining({ code: 'CAPTURE_INCOMPLETE' }) }));
  });

  it('tells a legal move that misses the lesson apart from a wrong one', () => {
    expect(checkTutorial(0, { actions: [{ type: 'capture', card: 'KC', sets: [['2D', 'JC']], builds: [] }] })).toEqual({ valid: true, goalMet: false });
    expect(checkTutorial(0, { actions: [{ type: 'discard', card: 'KC' }] })).toEqual(expect.objectContaining({ valid: false }));
  });

  it('shows only the learner’s own hand', () => {
    const step = tutorialStep(0)!;
    expect(step.mine.hand).toEqual(['7H', 'KC']);
    expect(JSON.stringify(step.match)).not.toContain('"QD"');
    expect(tutorialStep(99)).toBeNull();
  });
});
