import type { Socket } from 'socket.io';
import { RoomStore } from '../game/room-store';
import { DraughtsGateway } from './draughts.gateway';
import { DraughtsService } from './draughts.service';
import { TUTORIAL_STEPS } from './tutorial';

const client = (id: string) => ({ id }) as Socket;

function setup() {
  const service = new DraughtsService(new RoomStore(), { save: async () => true } as never);
  const sessions = { user: async () => null };
  return new DraughtsGateway(service, sessions as never);
}

describe('Draughts gateway', () => {
  it('serves tutorial steps with their position and the step count', () => {
    const gateway = setup();
    const first = gateway.tutorial({ step: 0 }, client('a')) as any;
    expect(first).toEqual({ ok: true, step: expect.objectContaining({ id: 'move', index: 0, total: TUTORIAL_STEPS }) });
    expect(first.step.view.pieces.length).toBeGreaterThan(0);
    for (const step of [-1, TUTORIAL_STEPS, 1.5, '0', true, null, undefined]) {
      expect(gateway.tutorial({ step }, client('a'))).toEqual({ ok: false, code: 'BAD_REQUEST' });
    }
  });

  it('checks a tutorial route with the real rules', () => {
    const gateway = setup();
    expect(gateway.tutorialCheck({ step: 1, route: { from: 28, path: [39] } }, client('a'))).toEqual(expect.objectContaining({ ok: true, done: true }));
    expect(gateway.tutorialCheck({ step: 1, route: { from: 46, path: [41] } }, client('a'))).toEqual({
      ok: false,
      error: { code: 'CAPTURE_REQUIRED', params: { count: 1 } },
    });
    expect(gateway.tutorialCheck({ step: 1, route: { from: 28 } }, client('a'))).toEqual({ ok: false, error: { code: 'BAD_MOVE' } });
    expect(gateway.tutorialCheck({ step: 99, route: { from: 28, path: [39] } }, client('a'))).toEqual({ ok: false, code: 'BAD_REQUEST' });
  });

  it('answers AUTH_REQUIRED to a socket without a session', async () => {
    const gateway = setup();
    expect(await gateway.create({ playerKey: 'browser-key-0' }, client('a'))).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    expect(await gateway.join({ roomId: 'ABCDEF', playerKey: 'browser-key-0' }, client('a'))).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
  });
});
