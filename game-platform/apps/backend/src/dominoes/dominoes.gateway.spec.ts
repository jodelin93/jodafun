import type { Socket } from 'socket.io';
import { RoomStore } from '../game/room-store';
import { DominoesGateway } from './dominoes.gateway';
import { DominoesService } from './dominoes.service';
import { TUTORIAL_STEPS } from './tutorial';

const client = (id: string) => ({ id }) as Socket;

function setup() {
  const service = new DominoesService(new RoomStore(), { save: async () => true } as never);
  const sessions = { user: async () => null };
  return new DominoesGateway(service, sessions as never);
}

describe('Dominoes gateway', () => {
  it('serves tutorial steps with their position, the learner hand and the step count', () => {
    const gateway = setup();
    const first = gateway.tutorial({ step: 0 }, client('a')) as any;
    expect(first).toEqual(expect.objectContaining({ ok: true, step: 0, id: 'place', total: TUTORIAL_STEPS }));
    expect(first.me.hand).toEqual(['5-6', '0-1', '2-2']);
    expect(first.view).not.toHaveProperty('hands');
    for (const step of [-1, TUTORIAL_STEPS, 1.5, '0', undefined]) {
      expect(gateway.tutorial({ step }, client('a'))).toEqual({ ok: false, code: 'BAD_REQUEST' });
    }
  });

  it('checks a tutorial action with the real rules', () => {
    const gateway = setup();
    expect(gateway.tutorialCheck({ step: 0, action: { type: 'play', move: { tile: '5-6', end: 'right' } } }, client('a'))).toEqual(
      expect.objectContaining({ ok: true, done: true }),
    );
    expect(gateway.tutorialCheck({ step: 0, action: { type: 'play', move: { tile: '0-1', end: 'right' } } }, client('a'))).toEqual({
      ok: false,
      error: { code: 'TILE_DOES_NOT_FIT', params: { tile: '0-1', end: 'right', value: 5 } },
    });
    expect(gateway.tutorialCheck({ step: 2, action: { type: 'pass' } }, client('a'))).toEqual(expect.objectContaining({ ok: true, done: true }));
    expect(gateway.tutorialCheck({ step: 0, action: { type: 'pass' } }, client('a'))).toEqual({ ok: false, error: { code: 'CAN_PLAY' } });
    expect(gateway.tutorialCheck({ step: 0, action: { type: 'draw' } }, client('a'))).toEqual({ ok: false, error: { code: 'BAD_MOVE' } });
    expect(gateway.tutorialCheck({ step: 99, action: { type: 'pass' } }, client('a'))).toEqual({ ok: false, code: 'BAD_REQUEST' });
  });

  it('answers AUTH_REQUIRED to a socket without a session', async () => {
    const gateway = setup();
    expect(await gateway.create({ playerKey: 'browser-key-0', mode: 'partners' }, client('a'))).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
  });
});
