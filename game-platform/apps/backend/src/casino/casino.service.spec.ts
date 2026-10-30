import { RoomStore, type StoredRoom } from '../game/room-store';
import type { SessionUser } from '../auth/session';
import { CasinoService, type CasinoEmitter } from './casino.service';
import type { CasinoResult } from './casino-results';
import type { CasinoPrivateView, CasinoRoom, CasinoRoomView } from './casino.types';
import { findLegalTurn } from './engine/match';
import { seededRandom } from './engine/test-helpers';

const user = (n: number): SessionUser => ({ id: `user-${n}`, name: `Player ${n}`, email: null, isGuest: true });
const key = (n: number) => `browser-key-${n}`;

// Records every emit so tests can check who received what
class FakeEmitter implements CasinoEmitter {
  room = new Map<string, CasinoRoomView>();
  private = new Map<string, CasinoPrivateView>(); // by socket id
  log: { to: string; event: string; payload: unknown }[] = [];
  members = new Map<string, Set<string>>();
  toRoom(roomId: string, event: string, payload: unknown) {
    this.log.push({ to: roomId, event, payload });
    if (event === 'casino:room') this.room.set(roomId, payload as CasinoRoomView);
  }
  toSocket(socketId: string, event: string, payload: unknown) {
    this.log.push({ to: socketId, event, payload });
    if (event === 'casino:private') this.private.set(socketId, payload as CasinoPrivateView);
  }
  join(socketId: string, roomId: string) {
    (this.members.get(roomId) ?? this.members.set(roomId, new Set()).get(roomId)!).add(socketId);
  }
  leave(socketId: string, roomId: string) {
    this.members.get(roomId)?.delete(socketId);
  }
}

class FakeResults {
  saved: CasinoResult[] = [];
  async save(result: CasinoResult) {
    if (!this.saved.some(r => r.outcome.matchId === result.outcome.matchId)) this.saved.push(structuredClone(result));
    return true;
  }
}

function setup(store = new RoomStore()) {
  const results = new FakeResults();
  const service = new CasinoService(store, results as never);
  const emitter = new FakeEmitter();
  service.attach(emitter);
  service.random = seededRandom(5);
  return { service, emitter, results, store };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// Seats `players` players and readies them; returns the room id
async function startedRoom(service: CasinoService, players: 2 | 4) {
  const created = await service.create('s0', user(0), { name: 'Ana', playerKey: key(0), players });
  if (!created.ok) throw new Error(created.code);
  for (let i = 1; i < players; i++) {
    const joined = await service.join(`s${i}`, user(i), { roomId: created.roomId, name: `P${i}`, playerKey: key(i) });
    if (!joined.ok) throw new Error(joined.code);
  }
  for (let i = 0; i < players; i++) await service.ready(`s${i}`, { roomId: created.roomId, ready: true });
  return created.roomId;
}

const roomOf = (store: RoomStore, id: string) => store.getCasino(id)!;
let requests = 0;
const requestId = () => `req-${++requests}-abcdef`;

async function playOne(service: CasinoService, store: RoomStore, roomId: string) {
  const room = roomOf(store, roomId);
  const seat = room.match!.turn;
  const socket = room.players.find(p => p.seat === seat)!.socketId;
  const turn = findLegalTurn(room.match!, seat);
  return service.submitTurn(socket, { roomId, version: room.match!.version, requestId: requestId(), turn });
}

describe('Casino rooms', () => {
  it('needs a signed-in player (a guest account is fine)', async () => {
    const { service } = setup();
    expect(await service.create('s0', null, { playerKey: key(0) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
  });

  it('starts a two-player match once both are ready, and deals each player only their own hand', async () => {
    const { service, emitter, store } = setup();
    const roomId = await startedRoom(service, 2);
    const room = roomOf(store, roomId);
    expect(room.status).toBe('playing');

    const view = emitter.room.get(roomId)!;
    expect(view.match?.handCounts).toEqual([4, 4]);
    const json = JSON.stringify(view);
    for (const id of room.match!.hands.flat()) expect(json).not.toContain(`"${id}"`);
    for (const secret of ['playerKey', 'socketId', 'userId', 'browser-key']) expect(json).not.toContain(secret);

    for (const p of room.players) {
      const mine = emitter.private.get(p.socketId)!;
      expect(mine.match?.hand).toEqual(room.match!.hands[p.seat]);
      expect(JSON.stringify(mine)).not.toContain(key(p.seat));
    }
  });

  it('fills four seats into two teams of opposite partners', async () => {
    const { service, emitter } = setup();
    const roomId = await startedRoom(service, 4);
    const view = emitter.room.get(roomId)!;
    expect(view.seats.map(s => s.team)).toEqual([0, 1, 0, 1]);
    expect(view.seats.every(s => s.player)).toBe(true);
    expect(view.match?.handCounts).toEqual([4, 4, 4, 4]);
  });

  it('refuses a full room, a started match and a second seat for the same account', async () => {
    const { service } = setup();
    const created = await service.create('s0', user(0), { playerKey: key(0), players: 2 });
    if (!created.ok) throw new Error();
    expect((await service.join('s9', user(0), { roomId: created.roomId, playerKey: key(9) })).ok).toBe(false);
    await service.join('s1', user(1), { roomId: created.roomId, playerKey: key(1) });
    expect(await service.join('s2', user(2), { roomId: created.roomId, playerKey: key(2) })).toEqual({ ok: false, code: 'ROOM_FULL' });
    expect(await service.join('s2', user(2), { roomId: 'NOPE42', playerKey: key(2) })).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
  });

  it('lets players change seat and the host change the target before the match', async () => {
    const { service, emitter } = setup();
    const created = await service.create('s0', user(0), { playerKey: key(0), players: 4 });
    if (!created.ok) throw new Error();
    await service.join('s1', user(1), { roomId: created.roomId, playerKey: key(1) });
    expect((await service.chooseSeat('s1', { roomId: created.roomId, seat: 2 })).ok).toBe(true);
    expect(emitter.room.get(created.roomId)!.seats[2].player?.name).toBe('Player 1');
    expect(await service.chooseSeat('s1', { roomId: created.roomId, seat: 0 })).toEqual({ ok: false, code: 'SEAT_TAKEN' });
    expect(await service.setTarget('s1', { roomId: created.roomId, targetPoints: 31 })).toEqual({ ok: false, code: 'NOT_HOST' });
    expect(await service.setTarget('s0', { roomId: created.roomId, targetPoints: 99 })).toEqual({ ok: false, code: 'INVALID_TARGET' });
    expect((await service.setTarget('s0', { roomId: created.roomId, targetPoints: 31 })).ok).toBe(true);
    expect(emitter.room.get(created.roomId)!.targetPoints).toBe(31);
  });
});

describe('Casino turns', () => {
  it('accepts a legal turn from the right player and the current version only', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 2);
    const room = roomOf(store, roomId);
    const seat = room.match!.turn;
    const mover = room.players.find(p => p.seat === seat)!;
    const other = room.players.find(p => p.seat !== seat)!;
    const turn = findLegalTurn(room.match!, seat);
    const version = room.match!.version;

    expect(await service.submitTurn(other.socketId, { roomId, version, requestId: requestId(), turn })).toEqual(
      expect.objectContaining({ ok: false, code: 'NOT_YOUR_TURN' }),
    );
    expect(await service.submitTurn(mover.socketId, { roomId, version: version - 1, requestId: requestId(), turn })).toEqual({
      ok: false,
      code: 'STALE_STATE',
      version,
    });
    expect(await service.submitTurn(mover.socketId, { roomId, version, requestId: 'x', turn })).toEqual({ ok: false, code: 'BAD_REQUEST_ID' });
    const accepted = await service.submitTurn(mover.socketId, { roomId, version, requestId: requestId(), turn });
    expect(accepted).toEqual({ ok: true, version: version + 1 });
  });

  it('answers a retried request with the original answer and applies it only once', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 2);
    const room = roomOf(store, roomId);
    const seat = room.match!.turn;
    const mover = room.players.find(p => p.seat === seat)!;
    const payload = { roomId, version: room.match!.version, requestId: requestId(), turn: findLegalTurn(room.match!, seat) };
    const first = await service.submitTurn(mover.socketId, payload);
    const afterFirst = JSON.stringify(roomOf(store, roomId).match);
    const again = await service.submitTurn(mover.socketId, payload);
    expect(again).toEqual(first);
    expect(JSON.stringify(roomOf(store, roomId).match)).toBe(afterFirst);
  });

  it('serializes simultaneous submissions so only one of two identical turns is applied', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 2);
    const room = roomOf(store, roomId);
    const seat = room.match!.turn;
    const mover = room.players.find(p => p.seat === seat)!;
    const base = { roomId, version: room.match!.version, turn: findLegalTurn(room.match!, seat) };
    const [a, b] = await Promise.all([
      service.submitTurn(mover.socketId, { ...base, requestId: requestId() }),
      service.submitTurn(mover.socketId, { ...base, requestId: requestId() }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(roomOf(store, roomId).match!.turnsPlayed).toBe(1);
  });

  it('rejects an illegal turn with a code and leaves the match unchanged', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 2);
    const room = roomOf(store, roomId);
    const seat = room.match!.turn;
    const mover = room.players.find(p => p.seat === seat)!;
    const before = JSON.stringify(room.match);
    const foreign = room.match!.hands[1 - seat][0];
    const result = await service.submitTurn(mover.socketId, {
      roomId,
      version: room.match!.version,
      requestId: requestId(),
      turn: { actions: [{ type: 'discard', card: foreign }] },
    });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'CARD_NOT_IN_HAND' }));
    expect(JSON.stringify(roomOf(store, roomId).match)).toBe(before);
    // The error names only the card the player sent
    expect(JSON.stringify(result)).not.toContain(room.match!.hands[1 - seat][1]);
  });

  it('previews a turn without playing it', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 2);
    const room = roomOf(store, roomId);
    const seat = room.match!.turn;
    const mover = room.players.find(p => p.seat === seat)!;
    const before = JSON.stringify(room.match);
    const check = service.preview(mover.socketId, { roomId, version: room.match!.version, turn: findLegalTurn(room.match!, seat) });
    expect(check).toEqual({ ok: true, valid: true });
    expect(JSON.stringify(roomOf(store, roomId).match)).toBe(before);
  });
});

describe('Casino connections', () => {
  it('gives a reconnecting player back the same seat and hand', async () => {
    const { service, emitter, store } = setup();
    const roomId = await startedRoom(service, 2);
    const hand = roomOf(store, roomId).match!.hands[1];
    service.disconnected('s1');
    await flush();
    expect(emitter.room.get(roomId)!.seats[1].player?.connected).toBe(false);

    expect(await service.rejoin('t1', user(2), { roomId, playerKey: key(1) })).toEqual({ ok: false, code: 'NOT_SEATED' });
    const back = await service.rejoin('t1', user(1), { roomId, playerKey: key(1) });
    expect(back).toEqual(expect.objectContaining({ ok: true, rejoined: true }));
    expect(emitter.private.get('t1')?.match?.hand).toEqual(hand);
    expect(emitter.room.get(roomId)!.seats[1].player?.connected).toBe(true);
  });

  it('never lets another device of the same account take the seat, even while it is away', async () => {
    const { service } = setup();
    const roomId = await startedRoom(service, 2);
    expect(await service.join('other-device', user(1), { roomId, playerKey: 'another-browser' })).toEqual({ ok: false, code: 'ALREADY_SEATED' });
    service.disconnected('s1');
    await flush();
    expect(await service.join('other-device', user(1), { roomId, playerKey: 'another-browser' })).toEqual({ ok: false, code: 'ALREADY_SEATED' });
    expect((await service.rejoin('same-browser', user(1), { roomId, playerKey: key(1) })).ok).toBe(true);
  });

  it('tells presence when a socket takes or leaves a seat', async () => {
    const { service } = setup();
    const events: string[] = [];
    service.seatListener = { seated: id => events.push(`+${id}`), unseated: id => events.push(`-${id}`) };
    const created = await service.create('s0', user(0), { playerKey: key(0), players: 2 });
    if (!created.ok) throw new Error();
    await service.join('s1', user(1), { roomId: created.roomId, playerKey: key(1) });
    await service.leave('s1', { roomId: created.roomId });
    expect(events).toEqual(['+s0', '+s1', '-s1']);
  });

  it('restores rooms from storage with everyone away, and lets them rejoin the same match', async () => {
    const first = setup();
    const roomId = await startedRoom(first.service, 4);
    await playOne(first.service, first.store, roomId);
    const saved = JSON.parse(JSON.stringify(roomOf(first.store, roomId))) as CasinoRoom;

    class RestoredStore extends RoomStore {
      loadAll(): Promise<StoredRoom[]> {
        this.save(saved);
        return Promise.resolve([saved]);
      }
    }
    const second = setup(new RestoredStore());
    await second.service.onModuleInit();
    const restored = roomOf(second.store, roomId);
    expect(restored.players.every(p => !p.connected)).toBe(true);
    expect(restored.match).toEqual(saved.match);
    const back = await second.service.rejoin('new-socket', user(2), { roomId, playerKey: key(2) });
    expect(back.ok).toBe(true);
    expect(second.emitter.private.get('new-socket')?.match?.hand).toEqual(saved.match!.hands[2]);
    second.service.onModuleDestroy();
    first.service.onModuleDestroy();
  });
});

describe('Casino results', () => {
  it('saves a finished match once, with every participant', async () => {
    const { service, store, results, emitter } = setup();
    const roomId = await startedRoom(service, 4);
    for (let i = 0; i < 2000 && roomOf(store, roomId).status === 'playing'; i++) {
      const ack = await playOne(service, store, roomId);
      if (!ack.ok) throw new Error(JSON.stringify(ack));
    }
    await flush();
    const room = roomOf(store, roomId);
    expect(room.status).toBe('finished');
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0].players).toHaveLength(4);
    expect(results.saved[0].outcome.winnerTeam).toBe(room.match!.winnerTeam);
    expect(emitter.room.get(roomId)!.outcome?.scores).toEqual(room.match!.scores);

    // Leaving after the end is not a forfeit, and a rematch starts a new match id
    await service.rematch('s0', { roomId });
    expect(roomOf(store, roomId).status).toBe('lobby');
    for (let i = 0; i < 4; i++) await service.ready(`s${i}`, { roomId, ready: true });
    expect(roomOf(store, roomId).matchId).not.toBe(results.saved[0].outcome.matchId);
    await flush();
    expect(results.saved).toHaveLength(1);
  });

  it('keeps an unsaved result through a rematch and a restart, and writes it once the database is back', async () => {
    const failing = new FakeResults();
    let down = true;
    const save = failing.save.bind(failing);
    failing.save = async (r: CasinoResult) => {
      if (down) throw new Error('database unavailable');
      return save(r);
    };
    const store = new RoomStore();
    const service = new CasinoService(store, failing as never);
    service.attach(new FakeEmitter());
    service.random = seededRandom(5);
    const roomId = await startedRoom(service, 2);
    await playOne(service, store, roomId);
    await service.leave('s1', { roomId }); // forfeit while the database is down
    await flush();
    const room = roomOf(store, roomId);
    expect(room.pendingResults).toHaveLength(1);
    // A new match starts; the old result is still queued with the room
    await service.join('s2', user(2), { roomId, playerKey: key(2) });
    for (const s of ['s0', 's2']) await service.ready(s, { roomId, ready: true });
    expect(roomOf(store, roomId).status).toBe('playing');
    expect(roomOf(store, roomId).pendingResults).toHaveLength(1);

    // After a restart (everyone gone), the empty room is kept for its result and written
    const saved = JSON.parse(JSON.stringify({ ...roomOf(store, roomId), players: [] })) as CasinoRoom;
    class RestoredStore extends RoomStore {
      loadAll(): Promise<StoredRoom[]> {
        this.save(saved);
        return Promise.resolve([saved]);
      }
    }
    down = false;
    const restoredStore = new RestoredStore();
    const restarted = new CasinoService(restoredStore, failing as never);
    await restarted.onModuleInit();
    await flush();
    await flush();
    expect(failing.saved).toHaveLength(1);
    expect(failing.saved[0].outcome.forfeit).toBe(true);
    expect(restoredStore.getCasino(roomId)).toBeUndefined();
    service.onModuleDestroy();
    restarted.onModuleDestroy();
  });

  it('deletes a room abandoned before anyone played', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 2);
    await service.leave('s0', { roomId });
    await service.leave('s1', { roomId });
    expect(store.getCasino(roomId)).toBeUndefined();
  });

  it('records a forfeit for the side that leaves after play began, and nothing before', async () => {
    const early = setup();
    const quiet = await startedRoom(early.service, 2);
    await early.service.leave('s1', { roomId: quiet });
    await flush();
    expect(early.results.saved).toHaveLength(0);

    const { service, store, results } = setup();
    const roomId = await startedRoom(service, 4);
    await playOne(service, store, roomId);
    await service.leave('s3', { roomId });
    await flush();
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0].outcome).toEqual(expect.objectContaining({ forfeit: true, forfeitTeam: 1, winnerTeam: 0 }));
    expect(roomOf(store, roomId).status).toBe('lobby');
  });
});
