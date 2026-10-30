import type { Socket } from 'socket.io';
import type { SessionUser } from '../auth/session';
import { CasinoService } from '../casino/casino.service';
import { DominoesService } from '../dominoes/dominoes.service';
import { DraughtsService } from '../draughts/draughts.service';
import { FiveService } from '../five/five.service';
import { GameGateway } from './game.gateway';
import { RoomStore } from './room-store';

const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
afterAll(() => log.mockRestore());

const user = (n: number): SessionUser => ({ id: `user-${n}`, name: `Player ${n}`, email: null, isGuest: true });

// A Socket.IO server stand-in that records what each socket was sent
function fakeServer(connected: Set<string>) {
  const sent: { to: string; event: string; payload: any }[] = [];
  const server = {
    sent,
    to: (to: string) => ({ emit: (event: string, payload: unknown) => sent.push({ to, event, payload }) }),
    emit: () => undefined,
    in: () => ({ socketsJoin: () => undefined, socketsLeave: () => undefined }),
    sockets: { sockets: { get: (id: string) => (connected.has(id) ? { connected: true } : undefined) } },
  };
  return server;
}

function setup() {
  const store = new RoomStore();
  const users = new Map<string, SessionUser>();
  const sessions = { user: async (id: string) => users.get(id) ?? null, forget: () => undefined };
  const casino = new CasinoService(store, { save: async () => true } as never);
  const dominoes = new DominoesService(store, { save: async () => true } as never);
  const draughts = new DraughtsService(store, { save: async () => true } as never);
  const five = new FiveService(store, { save: async () => true } as never);
  const gateway = new GameGateway({} as never, store, sessions as never, casino, dominoes, draughts, five);
  const connected = new Set<string>();
  const server = fakeServer(connected);
  gateway.server = server as never;
  const sockets: Socket[] = [];
  const socket = (id: string, n: number) => {
    users.set(id, user(n));
    connected.add(id);
    const client = { id, connected: true, join: () => undefined, leave: () => undefined } as unknown as Socket;
    sockets.push(client);
    return client;
  };
  // Disconnecting every socket clears the pending requests and their expiry timers
  const close = () => {
    sockets.forEach(client => gateway.handleDisconnect(client));
    dominoes.onModuleDestroy();
    casino.onModuleDestroy();
    draughts.onModuleDestroy();
    five.onModuleDestroy();
  };
  return { store, casino, dominoes, draughts, five, gateway, server, socket, close };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('Invitations into Dominoes rooms', () => {
  it('fills free seats like Casino: one request per free seat, seated through the Dominoes join', async () => {
    const { dominoes, gateway, server, socket, store, close } = setup();
    const host = socket('s0', 0);
    const created = await dominoes.create('s0', user(0), { name: 'Ana', playerKey: 'browser-key-0', mode: 'partners' });
    if (!created.ok) throw new Error();
    const { roomId } = created;
    const targets = [1, 2, 3, 4].map(n => socket(`t${n}`, n));
    for (const t of targets) await gateway.handlePresenceUpdate({ available: true, name: `T${t.id}`, playerKey: `browser-key-${t.id}` }, t);

    const sent: Awaited<ReturnType<GameGateway['handleInviteSend']>>[] = [];
    for (const t of targets.slice(0, 3)) {
      sent.push(await gateway.handleInviteSend({ toId: t.id, playerKey: 'browser-key-0', game: 'dominoes', roomId }, host));
    }
    expect(sent.every(r => r.success)).toBe(true);
    // Three free seats: a fourth request is refused
    expect(await gateway.handleInviteSend({ toId: 't4', playerKey: 'browser-key-0', game: 'dominoes', roomId }, host)).toEqual({
      success: false,
      error: 'You already have a pending request',
    });
    const received = server.sent.find(e => e.to === 't1' && e.event === 'invite:received')!.payload;
    expect(received).toEqual(expect.objectContaining({ from: { id: 's0', name: 'Ana' }, game: 'dominoes', capacity: 4 }));

    const inviteId = (sent[0] as { inviteId: string }).inviteId;
    expect(await gateway.handleInviteRespond({ inviteId, accept: true, playerKey: 'browser-key-t1' }, targets[0])).toEqual({
      success: true,
      game: 'dominoes',
      roomId,
    });
    expect(server.sent).toContainEqual({ to: 's0', event: 'invite:accepted', payload: { inviteId, game: 'dominoes', roomId } });
    const room = store.getDominoes(roomId)!;
    expect(room.players.map(p => [p.socketId, p.seat, p.name])).toEqual([
      ['s0', 0, 'Ana'],
      ['t1', 1, 'Tt1'],
    ]);

    // Seated players are not listed as available, but are shown as playing (the game only, no room code)
    const players = (await gateway.handlePresenceList(targets[3])).players;
    expect(players.filter(p => p.status === 'available').map(p => p.id)).toEqual(['t2', 't3']);
    expect(players.filter(p => p.status === 'playing').map(p => [p.id, 'game' in p ? p.game : null])).toEqual([
      ['s0', 'dominoes'],
      ['t1', 'dominoes'],
    ]);
    expect(JSON.stringify(players)).not.toContain(roomId);
    // A playing person can't be sent a request
    expect((await gateway.handleInviteSend({ toId: 't1', playerKey: 'browser-key-t4', game: 'dominoes', roomId }, targets[3])).success).toBe(false);

    // Leaving the seat withdraws the inviter's other Dominoes requests
    await dominoes.leave('s0', { roomId });
    await flush();
    expect(server.sent).toContainEqual({ to: 't2', event: 'invite:cancelled', payload: { inviteId: (sent[1] as { inviteId: string }).inviteId } });
    expect(server.sent).toContainEqual({ to: 't3', event: 'invite:cancelled', payload: { inviteId: (sent[2] as { inviteId: string }).inviteId } });
    close();
  });

  it('still seats a Casino invitee through the Casino join, with the same answers as before', async () => {
    const { casino, gateway, server, socket, store, close } = setup();
    const host = socket('c0', 0);
    const created = await casino.create('c0', user(0), { name: 'Bo', playerKey: 'browser-key-c0', players: 2 });
    if (!created.ok) throw new Error();
    const target = socket('t1', 1);
    await gateway.handlePresenceUpdate({ available: true, name: 'T1', playerKey: 'browser-key-t1' }, target);
    const sent = await gateway.handleInviteSend({ toId: 't1', playerKey: 'browser-key-c0', game: 'african-casino', roomId: created.roomId }, host);
    expect(sent.success).toBe(true);
    expect(server.sent.find(e => e.to === 't1' && e.event === 'invite:received')!.payload).toEqual(
      expect.objectContaining({ from: { id: 'c0', name: 'Bo' }, game: 'african-casino', mode: 'classic', capacity: 2 }),
    );
    const inviteId = (sent as { inviteId: string }).inviteId;
    expect(await gateway.handleInviteRespond({ inviteId, accept: true, playerKey: 'browser-key-t1' }, target)).toEqual({
      success: true,
      game: 'african-casino',
      roomId: created.roomId,
    });
    expect(store.getCasino(created.roomId)!.players.map(p => p.socketId)).toEqual(['c0', 't1']);
    close();
  });

  it('refuses a Dominoes request from someone who is not in that room’s lobby', async () => {
    const { gateway, socket, close } = setup();
    const host = socket('s0', 0);
    const target = socket('t1', 1);
    await gateway.handlePresenceUpdate({ available: true, name: 'T1' }, target);
    expect(await gateway.handleInviteSend({ toId: 't1', playerKey: 'k', game: 'dominoes', roomId: 'NOPE42' }, host)).toEqual({
      success: false,
      error: 'Room is not open',
    });
    close();
  });

  it('fills the free seat of a draughts room through the draughts join', async () => {
    const { draughts, gateway, server, socket, store, close } = setup();
    const host = socket('d0', 0);
    const created = await draughts.create('d0', user(0), { name: 'Ana', playerKey: 'browser-key-d0' });
    if (!created.ok) throw new Error();
    const targets = [1, 2].map(n => socket(`t${n}`, n));
    for (const t of targets) await gateway.handlePresenceUpdate({ available: true, name: `T${t.id}`, playerKey: `browser-key-${t.id}` }, t);
    const game = 'international-draughts';
    const sent = await gateway.handleInviteSend({ toId: 't1', playerKey: 'browser-key-d0', game, roomId: created.roomId }, host);
    expect(sent.success).toBe(true);
    // One free seat: a second request is refused
    expect(await gateway.handleInviteSend({ toId: 't2', playerKey: 'browser-key-d0', game, roomId: created.roomId }, host)).toEqual({
      success: false,
      error: 'You already have a pending request',
    });
    expect(server.sent.find(e => e.to === 't1' && e.event === 'invite:received')!.payload).toEqual(
      expect.objectContaining({ from: { id: 'd0', name: 'Ana' }, game, capacity: 2 }),
    );
    const inviteId = (sent as { inviteId: string }).inviteId;
    expect(await gateway.handleInviteRespond({ inviteId, accept: true, playerKey: 'browser-key-t1' }, targets[0])).toEqual({
      success: true,
      game,
      roomId: created.roomId,
    });
    expect(store.getDraughts(created.roomId)!.players.map(p => [p.socketId, p.seat])).toEqual([
      ['d0', 0],
      ['t1', 1],
    ]);
    close();
  });

  it('fills the free seat of a five-in-a-row room through the five-in-a-row join, and sends a Memory join there', async () => {
    const { five, gateway, server, socket, store, close } = setup();
    const host = socket('f0', 0);
    const created = await five.create('f0', user(0), { name: 'Ana', playerKey: 'browser-key-f0' });
    if (!created.ok) throw new Error();
    const target = socket('t1', 1);
    await gateway.handlePresenceUpdate({ available: true, name: 'T1', playerKey: 'browser-key-t1' }, target);
    const game = 'five-in-a-row';
    const sent = await gateway.handleInviteSend({ toId: 't1', playerKey: 'browser-key-f0', game, roomId: created.roomId }, host);
    expect(sent.success).toBe(true);
    expect(server.sent.find(e => e.to === 't1' && e.event === 'invite:received')!.payload).toEqual(
      expect.objectContaining({ from: { id: 'f0', name: 'Ana' }, game, capacity: 2 }),
    );
    const inviteId = (sent as { inviteId: string }).inviteId;
    expect(await gateway.handleInviteRespond({ inviteId, accept: true, playerKey: 'browser-key-t1' }, target)).toEqual({
      success: true,
      game,
      roomId: created.roomId,
    });
    expect(store.getFive(created.roomId)!.players.map(p => [p.socketId, p.seat])).toEqual([
      ['f0', 0],
      ['t1', 1],
    ]);
    const visitor = socket('v1', 2);
    expect(await gateway.handleJoinGame({ roomId: created.roomId, playerName: 'V' }, visitor)).toEqual({
      success: false,
      error: 'Wrong game',
      gameType: 'five-in-a-row',
    });
    close();
  });

  it('sends a Joda Memory join or rejoin with a Dominoes, Casino or draughts code to the right game', async () => {
    const { dominoes, casino, draughts, gateway, socket, close } = setup();
    const draughtsRoom = await draughts.create('d0', user(6), { playerKey: 'browser-key-6' });
    if (!draughtsRoom.ok) throw new Error();
    const created = await dominoes.create('s0', user(0), { playerKey: 'browser-key-0', mode: 'head-to-head' });
    const casinoRoom = await casino.create('c0', user(5), { playerKey: 'browser-key-5', players: 2 });
    if (!created.ok || !casinoRoom.ok) throw new Error();
    const visitor = socket('v1', 1);
    expect(await gateway.handleJoinGame({ roomId: created.roomId, playerName: 'V' }, visitor)).toEqual({
      success: false,
      error: 'Wrong game',
      gameType: 'dominoes',
    });
    expect(await gateway.handleRejoinRoom({ roomId: created.roomId, playerKey: 'k' }, visitor)).toEqual({
      success: false,
      error: 'Wrong game',
      gameType: 'dominoes',
    });
    expect(await gateway.handleJoinGame({ roomId: casinoRoom.roomId, playerName: 'V' }, visitor)).toEqual({
      success: false,
      error: 'Wrong game',
      gameType: 'african-casino',
    });
    expect(await gateway.handleRejoinRoom({ roomId: draughtsRoom.roomId, playerKey: 'k' }, visitor)).toEqual({
      success: false,
      error: 'Wrong game',
      gameType: 'international-draughts',
    });
    close();
  });
});
