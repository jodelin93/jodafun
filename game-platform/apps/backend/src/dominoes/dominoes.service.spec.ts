import { RoomStore, deserializeRoom, type GameRoom, type StoredRoom } from '../game/room-store';
import type { SessionUser } from '../auth/session';
import { CasinoService } from '../casino/casino.service';
import { seededRandom } from '../lib/random';
import { DominoesService, type DominoEmitter } from './dominoes.service';
import type { DominoAck, DominoPrivateView, DominoResult, DominoRoom, DominoRoomView } from './dominoes.types';
import { legalMoves } from './engine/match';
import { scenario } from './engine/scenario';
import type { Mode } from './engine/types';

const user = (n: number): SessionUser => ({ id: `user-${n}`, name: `Player ${n}`, email: null, isGuest: true });
const key = (n: number) => `browser-key-${n}`;

// Records every emit so tests can check who received what
class FakeEmitter implements DominoEmitter {
  room = new Map<string, DominoRoomView>();
  private = new Map<string, DominoPrivateView>(); // by socket id
  log: { kind: 'room' | 'socket'; to: string; event: string; payload: unknown }[] = [];
  members = new Map<string, Set<string>>();
  onRoom: ((roomId: string, view: DominoRoomView) => void) | null = null;
  onPrivate: ((socketId: string, view: DominoPrivateView) => void) | null = null;
  toRoom(roomId: string, event: string, payload: unknown) {
    this.log.push({ kind: 'room', to: roomId, event, payload });
    if (event === 'dominoes:room') {
      this.room.set(roomId, payload as DominoRoomView);
      this.onRoom?.(roomId, payload as DominoRoomView);
    }
  }
  toSocket(socketId: string, event: string, payload: unknown) {
    this.log.push({ kind: 'socket', to: socketId, event, payload });
    if (event === 'dominoes:private') {
      this.private.set(socketId, payload as DominoPrivateView);
      this.onPrivate?.(socketId, payload as DominoPrivateView);
    }
  }
  join(socketId: string, roomId: string) {
    (this.members.get(roomId) ?? this.members.set(roomId, new Set()).get(roomId)!).add(socketId);
  }
  leave(socketId: string, roomId: string) {
    this.members.get(roomId)?.delete(socketId);
  }
}

class FakeResults {
  saved: DominoResult[] = [];
  calls = 0;
  async save(result: DominoResult) {
    this.calls++;
    if (!this.saved.some(r => r.outcome.matchId === result.outcome.matchId)) this.saved.push(structuredClone(result));
    return true;
  }
}

function setup(store = new RoomStore()) {
  const results = new FakeResults();
  const service = new DominoesService(store, results as never);
  const emitter = new FakeEmitter();
  service.attach(emitter);
  service.random = seededRandom(7);
  return { service, emitter, results, store };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ok = <T>(ack: DominoAck<T>): T => {
  if (!ack.ok) throw new Error(`Expected ok, got ${ack.code}`);
  return ack as T;
};

// Seats every player of the mode in seat order and readies them; the host is s0
async function readyRoom(service: DominoesService, mode: Mode, targetScore?: number) {
  const players = mode === 'partners' ? 4 : 2;
  const { roomId } = ok(await service.create('s0', user(0), { name: 'Ana', playerKey: key(0), mode, targetScore }));
  for (let i = 1; i < players; i++) ok(await service.join(`s${i}`, user(i), { roomId, name: `P${i}`, playerKey: key(i) }));
  for (let i = 0; i < players; i++) ok(await service.ready(`s${i}`, { roomId, ready: true }));
  return roomId;
}

async function startedRoom(service: DominoesService, mode: Mode, targetScore?: number) {
  const roomId = await readyRoom(service, mode, targetScore);
  ok(await service.start('s0', { roomId }));
  return roomId;
}

const roomOf = (store: RoomStore, id: string) => store.getDominoes(id)!;
let requests = 0;
const requestId = () => `req-${++requests}-abcdef`;
const socketAt = (room: DominoRoom, seat: number) => room.players.find(p => p.seat === seat)!.socketId;

// The player whose turn it is plays their first legal tile, or passes when nothing fits
function nextMove(room: DominoRoom) {
  const match = room.match!;
  const seat = match.turn;
  const move = legalMoves(match, seat)[0];
  return { seat, socket: socketAt(room, seat), move, version: match.version };
}

async function playOne(service: DominoesService, store: RoomStore, roomId: string) {
  const { socket, move, version } = nextMove(roomOf(store, roomId));
  return move
    ? service.play(socket, { roomId, version, requestId: requestId(), tile: move.tile, end: move.end })
    : service.pass(socket, { roomId, version, requestId: requestId() });
}

async function playToEnd(service: DominoesService, store: RoomStore, roomId: string) {
  for (let i = 0; i < 5000 && roomOf(store, roomId).status === 'playing'; i++) {
    const ack = await playOne(service, store, roomId);
    if (!ack.ok) throw new Error(JSON.stringify(ack));
  }
  expect(roomOf(store, roomId).status).toBe('finished');
}

// Puts a hand-made position into a started room, keeping its match id
function setPosition(store: RoomStore, roomId: string, position: ReturnType<typeof scenario>) {
  const room = roomOf(store, roomId);
  room.match = { ...position, matchId: room.match!.matchId, version: room.match!.version + 1 };
  return room.match;
}

describe('Dominoes rooms', () => {
  it('needs a signed-in player to create, join or rejoin (a guest account is fine)', async () => {
    const { service } = setup();
    expect(await service.create('s0', null, { playerKey: key(0), mode: 'head-to-head' })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'head-to-head' }));
    expect(await service.join('s1', null, { roomId, playerKey: key(1) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    expect(await service.rejoin('s1', null, { roomId, playerKey: key(0) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
  });

  it('validates the mode, the target score and the browser key on create', async () => {
    const { service, emitter } = setup();
    expect(await service.create('s0', user(0), { playerKey: key(0), mode: 'teams' })).toEqual({ ok: false, code: 'INVALID_MODE' });
    expect(await service.create('s0', user(0), { playerKey: key(0) })).toEqual({ ok: false, code: 'INVALID_MODE' });
    expect(await service.create('s0', user(0), { playerKey: key(0), mode: 'partners', targetScore: 10 })).toEqual({ ok: false, code: 'INVALID_TARGET' });
    expect(await service.create('s0', user(0), { playerKey: key(0), mode: 'partners', targetScore: 501 })).toEqual({ ok: false, code: 'INVALID_TARGET' });
    expect(await service.create('s0', user(0), { playerKey: 'short', mode: 'partners' })).toEqual({ ok: false, code: 'BAD_REQUEST' });

    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'partners' }));
    const view = emitter.room.get(roomId)!;
    expect(view).toEqual(expect.objectContaining({ gameType: 'dominoes', mode: 'partners', capacity: 4, targetScore: 100, status: 'lobby' }));
    expect(view.seats.map(s => s.team)).toEqual([0, 1, 0, 1]);
    expect(await service.create('s0', user(0), { playerKey: key(0), mode: 'partners' })).toEqual({ ok: false, code: 'ALREADY_SEATED' });
    const h2h = ok(await service.create('x0', user(5), { playerKey: key(5), mode: 'head-to-head', targetScore: 25 }));
    expect(emitter.room.get(h2h.roomId)).toEqual(expect.objectContaining({ capacity: 2, targetScore: 25 }));
  });

  it('refuses a full room, an unknown code, a started match and a second seat for the same account', async () => {
    const { service } = setup();
    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'head-to-head' }));
    expect(await service.join('s9', user(0), { roomId, playerKey: key(9) })).toEqual({ ok: false, code: 'ALREADY_SEATED' });
    ok(await service.join('s1', user(1), { roomId, playerKey: key(1) }));
    expect(await service.join('s2', user(2), { roomId, playerKey: key(2) })).toEqual({ ok: false, code: 'ROOM_FULL' });
    expect(await service.join('s2', user(2), { roomId: 'NOPE42', playerKey: key(2) })).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });

    const started = setup();
    const partners = await readyRoom(started.service, 'partners');
    await started.service.leave('s3', { roomId: partners });
    ok(await started.service.join('s3', user(3), { roomId: partners, playerKey: key(3) }));
    for (const s of ['s0', 's1', 's2', 's3']) ok(await started.service.ready(s, { roomId: partners, ready: true }));
    ok(await started.service.start('s0', { roomId: partners }));
    await started.service.leave('s3', { roomId: partners }); // before any tile: back to the lobby
    expect(roomOf(started.store, partners).status).toBe('lobby');
  });

  it('lets players choose a free seat and the host set the target in the lobby only', async () => {
    const { service, emitter, store } = setup();
    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'partners' }));
    ok(await service.join('s1', user(1), { roomId, playerKey: key(1) }));
    expect(await service.chooseSeat('s1', { roomId, seat: 2 })).toEqual({ ok: true });
    expect(emitter.room.get(roomId)!.seats[2].player?.name).toBe('Player 1');
    expect(emitter.room.get(roomId)!.seats[2].team).toBe(0);
    expect(await service.chooseSeat('s1', { roomId, seat: 0 })).toEqual({ ok: false, code: 'SEAT_TAKEN' });
    expect(await service.chooseSeat('s1', { roomId, seat: 7 })).toEqual({ ok: false, code: 'SEAT_TAKEN' });
    expect(await service.setTarget('s1', { roomId, targetScore: 150 })).toEqual({ ok: false, code: 'NOT_HOST' });
    expect(await service.setTarget('s0', { roomId, targetScore: 20 })).toEqual({ ok: false, code: 'INVALID_TARGET' });
    expect(await service.setTarget('s0', { roomId, targetScore: 150 })).toEqual({ ok: true });
    expect(emitter.room.get(roomId)!.targetScore).toBe(150);
    expect(await service.chooseSeat('nobody', { roomId, seat: 1 })).toEqual({ ok: false, code: 'NOT_SEATED' });

    // Seats, teams and the target are locked once the match starts
    for (const [s, n] of [['s2', 2], ['s3', 3]] as const) ok(await service.join(s, user(n), { roomId, playerKey: key(n) }));
    for (const s of ['s0', 's1', 's2', 's3']) ok(await service.ready(s, { roomId, ready: true }));
    ok(await service.start('s0', { roomId }));
    expect(roomOf(store, roomId).match!.config.targetScore).toBe(150);
    const seats = roomOf(store, roomId).players.map(p => [p.socketId, p.seat]);
    expect(await service.chooseSeat('s1', { roomId, seat: 1 })).toEqual({ ok: false, code: 'GAME_STARTED' });
    expect(await service.chooseSeat('s3', { roomId, seat: 2 })).toEqual({ ok: false, code: 'GAME_STARTED' });
    expect(await service.setTarget('s0', { roomId, targetScore: 200 })).toEqual({ ok: false, code: 'GAME_STARTED' });
    expect(await service.ready('s0', { roomId, ready: true })).toEqual({ ok: false, code: 'GAME_STARTED' });
    expect(roomOf(store, roomId).players.map(p => [p.socketId, p.seat])).toEqual(seats);
  });

  it('starts only when the host asks and every seat is filled, connected and ready', async () => {
    const { service, store, emitter } = setup();
    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'partners' }));
    expect(await service.start('s0', { roomId })).toEqual({ ok: false, code: 'NOT_READY' }); // seats empty
    for (let i = 1; i < 4; i++) ok(await service.join(`s${i}`, user(i), { roomId, playerKey: key(i) }));
    for (let i = 0; i < 3; i++) ok(await service.ready(`s${i}`, { roomId, ready: true }));
    expect(await service.start('s0', { roomId })).toEqual({ ok: false, code: 'NOT_READY' }); // s3 not ready
    ok(await service.ready('s3', { roomId, ready: true }));
    expect(roomOf(store, roomId).status).toBe('lobby'); // readiness alone never starts the match
    expect(await service.start('s1', { roomId })).toEqual({ ok: false, code: 'NOT_HOST' });

    service.disconnected('s2');
    await flush();
    expect(await service.start('s0', { roomId })).toEqual({ ok: false, code: 'NOT_READY' }); // s2 away
    ok(await service.rejoin('s2b', user(2), { roomId, playerKey: key(2) }));

    expect(await service.start('s0', { roomId })).toEqual({ ok: true });
    const room = roomOf(store, roomId);
    expect(room.status).toBe('playing');
    expect(room.match!.config).toEqual({ mode: 'partners', players: 4, targetScore: 100 });
    expect(room.matchPlayers!.map(p => p.seat)).toEqual([0, 1, 2, 3]);
    expect(emitter.room.get(roomId)!.match?.handCounts).toEqual([7, 7, 7, 7]);
    expect(await service.start('s0', { roomId })).toEqual({ ok: false, code: 'GAME_STARTED' });
    expect(await service.join('late', user(9), { roomId, playerKey: key(9) })).toEqual({ ok: false, code: 'GAME_STARTED' });
    service.onModuleDestroy();
  });

  it('hands the host over and deletes the room when the last player leaves the lobby', async () => {
    const { service, store, emitter } = setup();
    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'partners' }));
    ok(await service.join('s1', user(1), { roomId, playerKey: key(1) }));
    ok(await service.join('s2', user(2), { roomId, playerKey: key(2) }));
    await service.leave('s0', { roomId });
    expect(emitter.room.get(roomId)!.seats[1].player?.isHost).toBe(true);
    expect(emitter.room.get(roomId)!.seats[0].player).toBeNull();
    await service.leave('s1', { roomId });
    await service.leave('s2', { roomId });
    expect(store.getDominoes(roomId)).toBeUndefined();
  });

  it('tells presence when a socket takes or leaves a seat', async () => {
    const { service } = setup();
    const events: string[] = [];
    service.seatListener = { seated: id => events.push(`+${id}`), unseated: id => events.push(`-${id}`) };
    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'head-to-head' }));
    ok(await service.join('s1', user(1), { roomId, playerKey: key(1) }));
    await service.leave('s1', { roomId });
    expect(events).toEqual(['+s0', '+s1', '-s1']);
    expect(service.seatedSocket('s0')).toBe(true);
    expect(service.seatedSocket('s1')).toBe(false);
    expect(service.inviteRoom('s0', roomId)).toEqual(expect.objectContaining({ freeSeats: 1 }));
  });
});

describe('Dominoes moves', () => {
  it('accepts a legal tile from the right player at the current version only', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 'head-to-head');
    const room = roomOf(store, roomId);
    const { seat, socket, move, version } = nextMove(room);
    const other = socketAt(room, 1 - seat);
    const payload = { roomId, version, tile: move.tile, end: move.end };

    expect(await service.play('stranger', { ...payload, requestId: requestId() })).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(await service.play(other, { ...payload, requestId: requestId() })).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(await service.play(socket, { ...payload, version: version - 1, requestId: requestId() })).toEqual({
      ok: false,
      code: 'STALE_STATE',
      version,
    });
    expect(await service.play(socket, { ...payload, requestId: 'x' })).toEqual({ ok: false, code: 'BAD_REQUEST_ID' });
    expect(await service.play(socket, { ...payload, tile: '9-9', requestId: requestId() })).toEqual({ ok: false, code: 'UNKNOWN_TILE' });
    expect(await service.play(socket, { ...payload, tile: { evil: true }, requestId: requestId() })).toEqual({ ok: false, code: 'BAD_MOVE' });
    const foreign = room.match!.hands[1 - seat][0];
    expect(await service.play(socket, { ...payload, tile: foreign, requestId: requestId() })).toEqual({
      ok: false,
      code: 'NOT_YOUR_TILE',
      params: { tile: foreign },
    });
    expect(roomOf(store, roomId).match!.version).toBe(version);

    expect(await service.play(socket, { ...payload, requestId: requestId() })).toEqual({ ok: true, version: version + 1 });
    expect(roomOf(store, roomId).match!.board.map(p => p.tile)).toEqual([move.tile]);
    expect(roomOf(store, roomId).match!.hands[seat]).not.toContain(move.tile);
  });

  it('answers a retried request with the original answer and applies it only once', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 'head-to-head');
    const { socket, move, version } = nextMove(roomOf(store, roomId));
    const payload = { roomId, version, requestId: requestId(), tile: move.tile, end: move.end };
    const first = await service.play(socket, payload);
    expect(first).toEqual({ ok: true, version: version + 1 });
    const afterFirst = JSON.stringify(roomOf(store, roomId).match);
    expect(await service.play(socket, payload)).toEqual(first);
    expect(await service.play(socket, payload)).toEqual(first);
    expect(JSON.stringify(roomOf(store, roomId).match)).toBe(afterFirst);
    expect(roomOf(store, roomId).match!.turnsPlayed).toBe(1);
  });

  it('serializes simultaneous moves so only one of two at the same version is applied', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 'partners');
    const { socket, move, version } = nextMove(roomOf(store, roomId));
    const base = { roomId, version, tile: move.tile, end: move.end };
    const [a, b] = await Promise.all([
      service.play(socket, { ...base, requestId: requestId() }),
      service.play(socket, { ...base, requestId: requestId() }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find(x => !x.ok)).toEqual({ ok: false, code: 'STALE_STATE', version: version + 1 });
    expect(roomOf(store, roomId).match!.turnsPlayed).toBe(1);
  });

  it('refuses a pass while a tile fits and accepts one when nothing does', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service, 'head-to-head');
    // Seat 0 holds nothing with a 6; seat 1 does
    const match = setPosition(
      store,
      roomId,
      scenario({ hands: [['0-1', '2-3', '4-5'], ['1-6', '5-5', '0-0']], board: [['6-6', 6, 6]], turn: 0 }),
    );
    const s0 = socketAt(roomOf(store, roomId), 0);
    const s1 = socketAt(roomOf(store, roomId), 1);
    expect(await service.play(s0, { roomId, version: match.version, requestId: requestId(), tile: '0-1', end: 'left' })).toEqual({
      ok: false,
      code: 'TILE_DOES_NOT_FIT',
      params: { tile: '0-1', end: 'left', value: 6 },
    });
    expect(await service.pass(s0, { roomId, version: match.version, requestId: requestId() })).toEqual({ ok: true, version: match.version + 1 });
    expect(emitter.private.get(s1)?.match).toEqual(expect.objectContaining({ canPass: false, moves: [{ tile: '1-6', end: 'left' }, { tile: '1-6', end: 'right' }] }));
    expect(await service.pass(s1, { roomId, version: match.version + 1, requestId: requestId() })).toEqual({ ok: false, code: 'CAN_PLAY' });
    expect(roomOf(store, roomId).match!.passes).toBe(1);
    expect(roomOf(store, roomId).match!.lastAction).toEqual({ seat: 0, type: 'pass' });
  });

  it('sends the hidden tiles to nobody: hands only to their owner, the unused tiles never', async () => {
    const { service, store, emitter } = setup();
    let roomId = '';
    let roomPayloads = 0;
    let privatePayloads = 0;
    emitter.onRoom = (id, view) => {
      const room = store.getDominoes(id);
      if (!room?.match) return;
      roomPayloads++;
      // Finished hands are revealed in results on purpose; everything else must stay hidden
      const json = JSON.stringify({
        ...view,
        match: view.match && { ...view.match, results: [] },
        outcome: view.outcome && { ...view.outcome, results: [] },
      });
      const hidden = [...room.match.hands.flat(), ...room.match.unused];
      for (const tile of hidden) expect(json).not.toContain(`"${tile}"`);
      for (const secret of ['playerKey', 'socketId', 'userId', 'browser-key', 'user-', 'hands', 'unused"', 'openingTile']) {
        expect(json).not.toContain(secret);
      }
    };
    emitter.onPrivate = (socketId, view) => {
      const room = store.getDominoes(view.roomId)!;
      const owner = room.players.find(p => p.socketId === socketId)!;
      expect(owner.seat).toBe(view.seat);
      expect(owner.id).toBe(view.playerId);
      if (!room.match) return;
      privatePayloads++;
      expect(view.match?.hand).toEqual(room.match.hands[owner.seat]);
      const others = room.match.hands.filter((_, seat) => seat !== owner.seat).flat();
      const json = JSON.stringify(view);
      for (const tile of [...others, ...room.match.unused]) expect(json).not.toContain(`"${tile}"`);
    };
    roomId = await startedRoom(service, 'head-to-head', 25);
    await playToEnd(service, store, roomId);
    expect(roomPayloads).toBeGreaterThan(10);
    expect(privatePayloads).toBeGreaterThan(20);
    // Private views only ever go to a single socket, never to the room
    expect(emitter.log.filter(e => e.event === 'dominoes:private').every(e => e.kind === 'socket')).toBe(true);
    expect(emitter.log.filter(e => e.event === 'dominoes:room').every(e => e.kind === 'room')).toBe(true);
  });
});

describe('Dominoes connections', () => {
  it('gives a reconnecting player back the same seat and hand mid-match', async () => {
    const { service, emitter, store } = setup();
    const roomId = await startedRoom(service, 'partners');
    ok(await playOne(service, store, roomId));
    const hand = roomOf(store, roomId).match!.hands[2];
    service.disconnected('s2');
    await flush();
    const away = emitter.room.get(roomId)!.seats[2].player!;
    expect(away.connected).toBe(false);
    expect(away.graceEndsAt).toEqual(expect.any(Number));
    expect(away.graceEndsAt!).toBeGreaterThan(Date.now());

    expect(await service.rejoin('t2', user(3), { roomId, playerKey: key(2) })).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(await service.rejoin('t2', user(2), { roomId, playerKey: 'someone-elses-key' })).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(await service.join('t2', user(2), { roomId, playerKey: 'another-browser' })).toEqual({ ok: false, code: 'ALREADY_SEATED' });
    const back = await service.rejoin('t2', user(2), { roomId, playerKey: key(2) });
    expect(back).toEqual(expect.objectContaining({ ok: true, rejoined: true, playerId: roomOf(store, roomId).players.find(p => p.seat === 2)!.id }));
    expect(emitter.private.get('t2')).toEqual(expect.objectContaining({ seat: 2, match: expect.objectContaining({ hand }) }));
    const seat = emitter.room.get(roomId)!.seats[2].player!;
    expect(seat).toEqual(expect.objectContaining({ connected: true, graceEndsAt: null }));
    expect(roomOf(store, roomId).players.map(p => p.seat).sort()).toEqual([0, 1, 2, 3]);
  });

  it('moves the seat to a new tab of the same browser and tells the old one', async () => {
    const { service, emitter, store } = setup();
    const roomId = await startedRoom(service, 'head-to-head');
    ok(await service.join('s1-tab2', user(1), { roomId, playerKey: key(1) }));
    expect(emitter.log).toContainEqual({ kind: 'socket', to: 's1', event: 'dominoes:seatLost', payload: { roomId } });
    expect(roomOf(store, roomId).players.find(p => p.seat === 1)!.socketId).toBe('s1-tab2');
    expect(await service.pass('s1', { roomId, version: 1, requestId: requestId() })).toEqual({ ok: false, code: 'NOT_SEATED' });
  });

  it('forfeits a started match for the side that stays away past the grace period', async () => {
    const previous = process.env.ROOM_GRACE_DOMINOES_MS;
    process.env.ROOM_GRACE_DOMINOES_MS = '30';
    try {
      const { service, emitter, store, results } = setup();
      const roomId = await startedRoom(service, 'partners');
      ok(await playOne(service, store, roomId));
      service.disconnected('s3');
      await flush();
      expect(roomOf(store, roomId).status).toBe('playing'); // the seat is kept while the grace runs
      expect(roomOf(store, roomId).players).toHaveLength(4);
      await sleep(60);
      await flush();
      const room = roomOf(store, roomId);
      expect(room.status).toBe('finished');
      expect(room.outcome).toEqual(expect.objectContaining({ forfeit: true, forfeitTeam: 1, winnerTeam: 0 }));
      expect(room.match).toEqual(expect.objectContaining({ status: 'finished', forfeitTeam: 1, winnerTeam: 0 }));
      expect(room.players.map(p => p.seat).sort()).toEqual([0, 1, 2]);
      expect(emitter.log).toContainEqual({ kind: 'socket', to: 's3', event: 'dominoes:seatLost', payload: { roomId } });
      expect(emitter.room.get(roomId)!.outcome?.forfeitTeam).toBe(1);
      await flush();
      expect(results.saved).toHaveLength(1);
      expect(results.saved[0].players).toHaveLength(4);

      // Before any tile is played, the room just goes back to the lobby and nothing is recorded
      const early = setup();
      const quiet = await startedRoom(early.service, 'head-to-head');
      early.service.disconnected('s1');
      await sleep(60);
      await flush();
      expect(roomOf(early.store, quiet).status).toBe('lobby');
      expect(roomOf(early.store, quiet).match).toBeNull();
      expect(roomOf(early.store, quiet).players.map(p => p.socketId)).toEqual(['s0']);
      expect(early.results.saved).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.ROOM_GRACE_DOMINOES_MS;
      else process.env.ROOM_GRACE_DOMINOES_MS = previous;
    }
  });

  it('restores rooms from storage with everyone away, and lets them rejoin the same match', async () => {
    const first = setup();
    const roomId = await startedRoom(first.service, 'partners');
    ok(await playOne(first.service, first.store, roomId));
    const saved = JSON.parse(JSON.stringify(roomOf(first.store, roomId))) as DominoRoom;

    class RestoredStore extends RoomStore {
      loadAll(): Promise<StoredRoom[]> {
        this.save(saved);
        return Promise.resolve([saved]);
      }
    }
    const second = setup(new RestoredStore());
    await second.service.onModuleInit();
    const restored = roomOf(second.store, roomId);
    expect(restored.players.every(p => !p.connected && p.socketId.startsWith('stale:'))).toBe(true);
    expect(restored.match).toEqual(saved.match);
    const back = await second.service.rejoin('new-socket', user(2), { roomId, playerKey: key(2) });
    expect(back.ok).toBe(true);
    expect(second.emitter.private.get('new-socket')?.match?.hand).toEqual(saved.match!.hands[2]);
    second.service.onModuleDestroy();
    first.service.onModuleDestroy();
  });
});

describe('Dominoes match end and results', () => {
  it('saves a finished match once, then a rematch keeps the seats and clears readiness', async () => {
    const { service, store, results, emitter } = setup();
    const roomId = await startedRoom(service, 'partners', 25);
    expect(await service.rematch('s0', { roomId })).toEqual({ ok: false, code: 'NOT_FINISHED' });
    await playToEnd(service, store, roomId);
    await flush();
    const room = roomOf(store, roomId);
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0]).toEqual(
      expect.objectContaining({ mode: 'partners', capacity: 4, targetScore: 25, rulesVersion: room.match!.rulesVersion }),
    );
    expect(results.saved[0].outcome).toEqual(
      expect.objectContaining({ matchId: room.match!.matchId, winnerTeam: room.match!.winnerTeam, forfeit: false, scores: room.match!.scores }),
    );
    expect(Math.max(...room.match!.scores)).toBeGreaterThanOrEqual(25);
    expect(emitter.room.get(roomId)!.outcome?.scores).toEqual(room.match!.scores);
    const finishedVersion = room.match!.version;
    expect(await service.pass('s0', { roomId, version: finishedVersion, requestId: requestId() })).toEqual({ ok: false, code: 'NOT_PLAYING' });

    const seats = room.players.map(p => [p.id, p.seat]);
    expect(await service.rematch('s2', { roomId })).toEqual({ ok: true });
    const lobby = roomOf(store, roomId);
    expect(lobby.status).toBe('lobby');
    expect(lobby.match).toBeNull();
    expect(lobby.players.map(p => [p.id, p.seat])).toEqual(seats);
    expect(lobby.players.every(p => !p.isReady)).toBe(true);
    for (let i = 0; i < 4; i++) ok(await service.ready(`s${i}`, { roomId, ready: true }));
    ok(await service.start('s0', { roomId }));
    expect(roomOf(store, roomId).match!.matchId).not.toBe(results.saved[0].outcome.matchId);
    await flush();
    expect(results.saved).toHaveLength(1);
    expect(results.calls).toBe(1);
  });

  it('records a forfeit for the side that leaves after a tile was played', async () => {
    const { service, store, results } = setup();
    const roomId = await startedRoom(service, 'partners');
    ok(await playOne(service, store, roomId));
    ok(await service.leave('s2', { roomId }));
    await flush();
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0].outcome).toEqual(expect.objectContaining({ forfeit: true, forfeitTeam: 0, winnerTeam: 1 }));
    expect(roomOf(store, roomId).status).toBe('finished');
    // The others can go back to the lobby, where the free seat can be filled again
    ok(await service.rematch('s0', { roomId }));
    ok(await service.join('s9', user(9), { roomId, playerKey: key(9) }));
    expect(roomOf(store, roomId).players.find(p => p.socketId === 's9')!.seat).toBe(2);
  });

  it('keeps an unsaved result through a rematch and a restart, and writes it once the database is back', async () => {
    const failing = new FakeResults();
    let down = true;
    const save = failing.save.bind(failing);
    failing.save = async (r: DominoResult) => {
      if (down) throw new Error('database unavailable');
      return save(r);
    };
    const store = new RoomStore();
    const service = new DominoesService(store, failing as never);
    service.attach(new FakeEmitter());
    service.random = seededRandom(7);
    const roomId = await startedRoom(service, 'head-to-head');
    ok(await playOne(service, store, roomId));
    await service.leave('s1', { roomId }); // forfeit while the database is down
    await flush();
    expect(roomOf(store, roomId).pendingResults).toHaveLength(1);
    // A new match starts; the old result is still queued with the room
    ok(await service.rematch('s0', { roomId }));
    ok(await service.join('s2', user(2), { roomId, playerKey: key(2) }));
    for (const s of ['s0', 's2']) ok(await service.ready(s, { roomId, ready: true }));
    ok(await service.start('s0', { roomId }));
    expect(roomOf(store, roomId).pendingResults).toHaveLength(1);

    // After a restart (everyone gone), the empty room is kept for its result and written once
    const saved = JSON.parse(JSON.stringify({ ...roomOf(store, roomId), players: [] })) as DominoRoom;
    class RestoredStore extends RoomStore {
      loadAll(): Promise<StoredRoom[]> {
        this.save(saved);
        return Promise.resolve([saved]);
      }
    }
    down = false;
    const restoredStore = new RestoredStore();
    const restarted = new DominoesService(restoredStore, failing as never);
    await restarted.onModuleInit();
    await flush();
    await flush();
    expect(failing.saved).toHaveLength(1);
    expect(failing.saved[0].outcome.forfeit).toBe(true);
    expect(restoredStore.getDominoes(roomId)).toBeUndefined();
    service.onModuleDestroy();
    restarted.onModuleDestroy();
  });

  it('deletes a room abandoned before any tile was played, recording nothing', async () => {
    const { service, store, results } = setup();
    const roomId = await startedRoom(service, 'head-to-head');
    await service.leave('s0', { roomId });
    await service.leave('s1', { roomId });
    await flush();
    expect(store.getDominoes(roomId)).toBeUndefined();
    expect(results.calls).toBe(0);
  });
});

describe('Dominoes and other games', () => {
  it("answers WRONG_GAME for another game's code, and Casino does the same for a Dominoes code", async () => {
    const store = new RoomStore();
    const { service } = setup(store);
    const casino = new CasinoService(store, { save: async () => true } as never);
    const casinoRoom = await casino.create('c0', user(8), { playerKey: key(8), players: 2 });
    if (!casinoRoom.ok) throw new Error();
    expect(await service.join('s1', user(1), { roomId: casinoRoom.roomId, playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'african-casino' },
    });
    expect(await service.rejoin('s1', user(1), { roomId: casinoRoom.roomId.toLowerCase(), playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'african-casino' },
    });

    const memory = { id: 'MEMO23', players: [], updatedAt: 0 } as unknown as GameRoom; // an old record: no gameType
    store.save(memory);
    expect(await service.join('s1', user(1), { roomId: 'MEMO23', playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'joda-memory' },
    });

    const { roomId } = ok(await service.create('s0', user(0), { playerKey: key(0), mode: 'head-to-head' }));
    expect(await casino.join('c1', user(1), { roomId, playerKey: key(1) })).toEqual({ ok: false, code: 'WRONG_GAME', params: { gameType: 'dominoes' } });
    expect(await casino.rejoin('c1', user(1), { roomId, playerKey: key(1) })).toEqual({ ok: false, code: 'WRONG_GAME', params: { gameType: 'dominoes' } });
    expect(await casino.join('c1', user(1), { roomId: 'MEMO23', playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'joda-memory' },
    });

    // Memory lookups never see Casino or Dominoes rooms
    expect(store.get(roomId)).toBeUndefined();
    expect(store.get(casinoRoom.roomId)).toBeUndefined();
    expect(store.get('MEMO23')).toBe(memory);
    expect(store.values()).toEqual([memory]);
    expect(store.dominoRooms().map(r => r.id)).toEqual([roomId]);
    expect(store.casinoRooms().map(r => r.id)).toEqual([casinoRoom.roomId]);
  });

  it('restores a stored Dominoes match through the engine, and drops one that fails its checks', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service, 'head-to-head');
    ok(await playOne(service, store, roomId));
    const json = JSON.stringify(roomOf(store, roomId));

    const restored = deserializeRoom(json) as DominoRoom;
    expect(restored.gameType).toBe('dominoes');
    expect(restored.match).toEqual(roomOf(store, roomId).match);

    const broken = JSON.parse(json) as DominoRoom;
    broken.match!.hands[0].push(broken.match!.hands[1][0]); // a tile in two places
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const dropped = deserializeRoom(JSON.stringify(broken)) as DominoRoom;
    error.mockRestore();
    expect(dropped.match).toBeNull();
    expect(dropped.status).toBe('lobby');
    expect(dropped.players).toHaveLength(2);

    const legacy = deserializeRoom(JSON.stringify({ id: 'OLD234', players: [], gameStartedAt: '2026-01-01T00:00:00.000Z' })) as GameRoom;
    expect(legacy.gameType).toBeUndefined();
    expect(legacy.gameStartedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });
});
