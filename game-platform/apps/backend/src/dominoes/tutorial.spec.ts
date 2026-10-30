import { checkTutorial, tutorialStep, TUTORIAL_STEPS, type TutorialAction } from './tutorial';

// The intended solution of each lesson, in order
const SOLUTIONS: TutorialAction[] = [
  { type: 'play', move: { tile: '5-6', end: 'right' } },
  { type: 'play', move: { tile: '2-4', end: 'left' } },
  { type: 'pass' },
  { type: 'pass' },
  { type: 'play', move: { tile: '3-6', end: 'right' } },
];

describe('Dominoes tutorial', () => {
  it('has a solvable, validator-backed position for every lesson', () => {
    expect(TUTORIAL_STEPS).toBe(SOLUTIONS.length);
    SOLUTIONS.forEach((action, i) => {
      expect(tutorialStep(i)).not.toBeNull();
      const check = checkTutorial(i, action);
      expect(check).toEqual(expect.objectContaining({ ok: true, done: true }));
    });
  });

  it('explains illegal moves with the engine’s own errors and accepts legal non-goals as not done', () => {
    expect(checkTutorial(0, { type: 'play', move: { tile: '0-1', end: 'left' } })).toEqual({ ok: false, error: expect.objectContaining({ code: 'TILE_DOES_NOT_FIT' }) });
    expect(checkTutorial(0, { type: 'pass' })).toEqual({ ok: false, error: expect.objectContaining({ code: 'CAN_PLAY' }) });
    expect(checkTutorial(1, { type: 'play', move: { tile: '2-4', end: 'right' } })).toEqual(expect.objectContaining({ ok: true, done: false }));
  });

  it('scores the blocked lesson by pip difference and the team lesson by the opponents’ pips', () => {
    const blocked = checkTutorial(3, { type: 'pass' });
    expect(blocked).toEqual(expect.objectContaining({ result: expect.objectContaining({ ending: 'blocked', winnerTeam: 0, points: [13, 0] }) }));
    const team = checkTutorial(4, { type: 'play', move: { tile: '3-6', end: 'left' } });
    expect(team).toEqual(expect.objectContaining({ result: expect.objectContaining({ ending: 'domino', teamPips: [10, 17], points: [17, 0] }) }));
  });

  it('never shows the opponents’ tiles in a lesson', () => {
    const step = tutorialStep(0)!;
    for (const id of ['1-4', '3-3', '0-6']) expect(JSON.stringify(step)).not.toContain(`"${id}"`);
  });
});
