import { checkTutorial, tutorialStep, TUTORIAL_STEPS } from './tutorial';

// The intended solution of each lesson
const SOLUTIONS = [
  { from: 32, path: [28] },
  { from: 28, path: [39] },
  { from: 36, path: [27, 18] },
  { from: 7, path: [1] },
  { from: 46, path: [19] },
];

describe('draughts tutorial', () => {
  it('has a solvable, validator-backed position for every lesson', () => {
    expect(TUTORIAL_STEPS).toBe(SOLUTIONS.length);
    SOLUTIONS.forEach((route, i) => {
      expect(tutorialStep(i)).not.toBeNull();
      expect(checkTutorial(i, route)).toEqual(expect.objectContaining({ ok: true, done: true }));
    });
  });

  it('explains wrong routes with the engine’s own errors', () => {
    expect(checkTutorial(1, { from: 28, path: [23] })).toEqual({ ok: false, error: expect.objectContaining({ code: 'CAPTURE_REQUIRED' }) });
    expect(checkTutorial(2, { from: 28, path: [39] })).toEqual({ ok: false, error: expect.objectContaining({ code: 'MAX_CAPTURE_REQUIRED' }) });
    expect(checkTutorial(2, { from: 36, path: [27] })).toEqual({ ok: false, error: expect.objectContaining({ code: 'INCOMPLETE_CAPTURE' }) });
    expect(checkTutorial(0, 'nonsense')).toEqual({ ok: false, error: { code: 'BAD_MOVE' } });
    expect(tutorialStep(9)).toBeNull();
  });
});
