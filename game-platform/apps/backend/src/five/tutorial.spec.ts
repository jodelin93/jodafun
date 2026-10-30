import { checkTutorial, tutorialStep, TUTORIAL_STEPS } from './tutorial';

describe('five-in-a-row tutorial', () => {
  it('has a valid position and a solution for every lesson', () => {
    const solutions = [
      { x: '7', y: '-3' },
      { x: '2', y: '0' },
      { x: '4', y: '4' },
      { x: '61', y: '-40' },
    ];
    expect(TUTORIAL_STEPS).toBe(solutions.length);
    solutions.forEach((cell, i) => {
      expect(tutorialStep(i)).not.toBeNull();
      expect(checkTutorial(i, cell)).toEqual(expect.objectContaining({ ok: true, done: true }));
    });
  });

  it('accepts the other open end of the row, and refuses the blocked end of the diagonal as a win', () => {
    expect(checkTutorial(1, { x: '-3', y: '0' })).toEqual(expect.objectContaining({ done: true }));
    expect(checkTutorial(2, { x: '-1', y: '-1' })).toEqual({ ok: false, error: { code: 'CELL_TAKEN' } });
    expect(checkTutorial(2, { x: '9', y: '9' })).toEqual(expect.objectContaining({ ok: true, done: false }));
    expect(checkTutorial(3, { x: '1', y: '0' })).toEqual(expect.objectContaining({ ok: true, done: false }));
    expect(checkTutorial(0, { x: 'nope', y: 0 })).toEqual({ ok: false, error: { code: 'BAD_CELL' } });
    expect(tutorialStep(9)).toBeNull();
  });
});
