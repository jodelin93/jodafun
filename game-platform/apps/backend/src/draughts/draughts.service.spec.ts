import type { SessionUser } from '../auth/session';
import { CasinoService } from '../casino/casino.service';
import { DominoesService } from '../dominoes/dominoes.service';
import { RoomStore, deserializeRoom, type GameRoom, type StoredRoom } from '../game/room-store';
import { seededRandom } from '../lib/random';
import { DraughtsService, type DraughtsEmitter } from './draughts.service';
import type { DraughtsAck, DraughtsResult, DraughtsRoom, DraughtsRoomView } from './draughts.types';
import { legalMoves, playMove } from './engine/game';
import { position, type Setup } from './engine/scenario';
import type { Color } from './engine/types';

const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
afterAll(() => log.mockRestore());

const user = (n: number): SessionUser => ({ id: `user-${n}`, name: `Player ${n}`, email: null, isGuest: true });
const key = (n: number) => `browser-key-${n}`;
const sock = (n: number) => `socket-${n}`;

// Records every emit so tests can check who received what
class FakeEmitter implements DraughtsEmitter {
  room = new Map<string, DraughtsRoomView>();
  log: { kind: 'room' | 'socket'; to: string; event: string; payload: unknown }[] = [];
  toRoom(roomId: string, event: string, payload: unknown) {
    this.log.push({ kind: 'room', to: roomId, event, payload: structuredClone(payload) });
    if (event === 'draughts:room') this.room.set(roomId, payload as DraughtsRoomView);
  }
  toSocket(socketId: string, event: string, payload: unknown) {
    this.log.push({ kind: 'socket', to: socketId, event, payload: structuredClone(payload) });
  }
  join() {}
  leave() {}
}

class FakeResults {
  saved: DraughtsResult[] = [];
  calls = 0;
  async save(result: DraughtsResult) {
    this.calls++;
    if (!this.saved.some(r => r.outcome.gameId === result.outcome.gameId)) this.saved.push(structuredClone(result));
    return true;
  }
}

function setup(store = new RoomStore(), seed = 7) {
  const results = new FakeResults();
  const service = new DraughtsService(store, results as never);
  const emitter = new FakeEmitter();
  service.attach(emitter);
  service.random = seededRandom(seed);
  return { service, emitter, results, store };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ok = <T>(ack: DraughtsAck<T>): T => {
  if (!ack.ok) throw new Error(`Expected ok, got ${ack.code}`);
  return ack as T;
};
let requests = 0;
const requestId = () => `req-${++requests}-abcdef`;

// Seats players 0 and 1 (socket-0 hosts) and readies both: the game starts by itself
async function startedRoom(service: DraughtsService) {
  const { roomId } = ok(await service.create(sock(0), user(0), { name: 'Ana', playerKey: key(0) }));
  ok(await service.join(sock(1), user(1), { roomId, name: 'Bo', playerKey: key(1) }));
  ok(await service.ready(sock(0), { roomId, ready: true }));
  ok(await service.ready(sock(1), { roomId, ready: true }));
  return roomId;
}

const roomOf = (store: RoomStore, id: string) => store.getDraughts(id)!;
const socketOf = (room: DraughtsRoom, color: Color) => {
  const id = room.gamePlayers!.find(g => g.color === color)!.id;
  return room.players.find(p => p.id === id)!.socketId;
};

// The player to move plays their first legal move
function nextMove(room: DraughtsRoom) {
  const game = room.game!;
  const move = legalMoves(game)[0];
  return { socket: socketOf(room, game.turn), other: socketOf(room, game.turn === 'white' ? 'black' : 'white'), route: { from: move.from, path: move.path }, version: game.version };
}

function playOne(service: DraughtsService, store: RoomStore, roomId: string) {
  const { socket, route, version } = nextMove(roomOf(store, roomId));
  return service.move(socket, { roomId, version, requestId: requestId(), ...route });
}

// The player to move plays a move after which nothing can be captured (keeps king-move counts running)
function playQuiet(service: DraughtsService, store: RoomStore, roomId: string) {
  const room = roomOf(store, roomId);
  const game = room.game!;
  const move = legalMoves(game).find(m => {
    const next = playMove(game, game.turn, m);
    return next.ok && next.state.status === 'playing' && legalMoves(next.state).every(x => x.captures.length === 0);
  })!;
  return service.move(socketOf(room, game.turn), { roomId, version: game.version, requestId: requestId(), from: move.from, path: move.path });
}

// Puts a hand-made position into a started room, keeping its game id
function setPosition(store: RoomStore, roomId: string, setupPosition: Setup) {
  const room = roomOf(store, roomId);
  room.game = { ...position(setupPosition), gameId: room.game!.gameId, version: room.game!.version + 1 };
  return room.game;
}

describe('Draughts rooms', () => {
  it('needs a signed-in player to create, join or rejoin', async () => {
    const { service } = setup();
    expect(await service.create(sock(0), null, { playerKey: key(0) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    expect(await service.create(sock(0), user(0), { playerKey: 'short' })).toEqual({ ok: false, code: 'BAD_REQUEST' });
    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    expect(await service.join(sock(1), null, { roomId, playerKey: key(1) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    expect(await service.rejoin(sock(1), null, { roomId, playerKey: key(0) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
  });

  it('starts by itself once both seats are filled, connected and ready, with colours drawn at random', async () => {
    const { service, store, emitter } = setup(new RoomStore(), 11);
    const { roomId } = ok(await service.create(sock(0), user(0), { name: 'Ana', playerKey: key(0) }));
    ok(await service.ready(sock(0), { roomId, ready: true }));
    expect(roomOf(store, roomId).status).toBe('lobby');
    ok(await service.join(sock(1), user(1), { roomId, name: 'Bo', playerKey: key(1) }));
    expect(await service.join(sock(2), user(2), { roomId, playerKey: key(2) })).toEqual({ ok: false, code: 'ROOM_FULL' });
    expect(emitter.room.get(roomId)!.seats.map(s => s.color)).toEqual([null, null]);

    // A ready player who is away holds the start back until they are back
    service.disconnected(sock(0));
    await flush();
    ok(await service.ready(sock(1), { roomId, ready: true }));
    expect(roomOf(store, roomId).status).toBe('lobby');
    ok(await service.rejoin('socket-0b', user(0), { roomId, playerKey: key(0) }));

    const room = roomOf(store, roomId);
    expect(room.status).toBe('playing');
    const expected: Color = seededRandom(11)(2) === 0 ? 'white' : 'black';
    expect(room.seat0Color).toBe(expected);
    expect(room.gamePlayers!.map(g => [g.seat, g.color])).toEqual([
      [0, expected],
      [1, expected === 'white' ? 'black' : 'white'],
    ]);
    expect(emitter.room.get(roomId)!.seats.map(s => s.color)).toEqual([expected, expected === 'white' ? 'black' : 'white']);
    expect(room.players.every(p => !p.isReady)).toBe(true);
    expect(await service.ready(sock(1), { roomId, ready: true })).toEqual({ ok: false, code: 'GAME_STARTED' });
    expect(await service.join(sock(2), user(2), { roomId, playerKey: key(2) })).toEqual({ ok: false, code: 'GAME_STARTED' });
  });

  it('swaps colours at every rematch and starts a new game id with every counter reset', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const first = roomOf(store, roomId).game!;
    const firstColor = roomOf(store, roomId).seat0Color!;
    ok(await playOne(service, store, roomId));
    expect(await service.rematch(sock(0), { roomId })).toEqual({ ok: false, code: 'NOT_FINISHED' });
    ok(await service.resign(sock(1), { roomId, version: roomOf(store, roomId).game!.version, requestId: requestId() }));

    ok(await service.rematch(sock(1), { roomId }));
    const lobby = roomOf(store, roomId);
    expect(lobby.status).toBe('lobby');
    expect(lobby.game).toBeNull();
    expect(lobby.players.map(p => p.seat)).toEqual([0, 1]);
    expect(lobby.seat0Color).toBe(firstColor === 'white' ? 'black' : 'white');
    ok(await service.ready(sock(0), { roomId, ready: true }));
    ok(await service.ready(sock(1), { roomId, ready: true }));

    const second = roomOf(store, roomId);
    expect(second.status).toBe('playing');
    expect(second.game!.gameId).not.toBe(first.gameId);
    expect(second.game).toEqual(expect.objectContaining({ version: 1, moves: [], kingMoves: 0, endgame: null, drawOffer: null, turn: 'white' }));
    expect(second.game!.positions).toHaveLength(1);
    expect(second.gamePlayers!.find(g => g.seat === 0)!.color).toBe(firstColor === 'white' ? 'black' : 'white');
    expect(second.outcome).toBeNull();

    // And back again for the third game
    ok(await service.resign(sock(0), { roomId, version: second.game!.version, requestId: requestId() }));
    ok(await service.rematch(sock(0), { roomId }));
    expect(roomOf(store, roomId).seat0Color).toBe(firstColor);
  });

  it('hands the host over and deletes the room when the last player leaves the lobby', async () => {
    const { service, store, emitter } = setup();
    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    ok(await service.join(sock(1), user(1), { roomId, playerKey: key(1) }));
    ok(await service.leave(sock(0), { roomId }));
    expect(emitter.room.get(roomId)!.seats[1].player!.isHost).toBe(true);
    ok(await service.leave(sock(1), { roomId }));
    expect(store.getDraughts(roomId)).toBeUndefined();
  });

  it('tells presence when a socket takes or leaves a seat', async () => {
    const { service } = setup();
    const events: string[] = [];
    service.seatListener = { seated: id => events.push(`+${id}`), unseated: id => events.push(`-${id}`) };
    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    expect(service.seatedSocket(sock(0))).toBe(true);
    expect(service.inviteRoom(sock(0), roomId)).toEqual({ room: expect.objectContaining({ id: roomId, capacity: 2 }), freeSeats: 1 });
    ok(await service.leave(sock(0), { roomId }));
    expect(events).toEqual([`+${sock(0)}`, `-${sock(0)}`]);
    expect(service.seatedSocket(sock(0))).toBe(false);
  });
});

describe('Draughts moves', () => {
  it('checks the seat, the colour and the turn on the server', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const { socket, other, route, version } = nextMove(room);
    expect(room.game!.turn).toBe('white');

    expect(await service.move('stranger', { roomId, version, requestId: requestId(), ...route })).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(await service.move(other, { roomId, version, requestId: requestId(), ...route })).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
    // White to move, touching a black man
    expect(await service.move(socket, { roomId, version, requestId: requestId(), from: 18, path: [23] })).toEqual({
      ok: false,
      code: 'NOT_YOUR_PIECE',
      params: { square: 18 },
    });
    expect(await service.move(socket, { roomId, version, requestId: 'bad id' as string, ...route })).toEqual({ ok: false, code: 'BAD_REQUEST_ID' });
    expect(await service.move(socket, { roomId, version, requestId: requestId(), from: 32, path: 28 })).toEqual({ ok: false, code: 'BAD_MOVE' });
    expect(roomOf(store, roomId).game!.version).toBe(version);
    expect(roomOf(store, roomId).game!.moves).toHaveLength(0);

    // Client-sent captures or promotion are ignored: the engine works them out
    const ack = await service.move(socket, { roomId, version, requestId: requestId(), ...route, captures: [19], promotes: true } as never);
    expect(ack).toEqual({ ok: true, version: version + 1 });
    const played = roomOf(store, roomId).game!.moves[0];
    expect(played).toEqual(expect.objectContaining({ from: route.from, path: route.path, captures: [], promotes: false, color: 'white' }));
  });

  it('rejects a stale version with the current one', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const { socket, route, version } = nextMove(roomOf(store, roomId));
    expect(await service.move(socket, { roomId, version: version - 1, requestId: requestId(), ...route })).toEqual({
      ok: false,
      code: 'STALE_STATE',
      version,
    });
    expect(await service.move(socket, { roomId, requestId: requestId(), ...route })).toEqual({ ok: false, code: 'STALE_STATE', version });
  });

  it('answers a retried request with the original answer and applies it only once', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const { socket, route, version } = nextMove(roomOf(store, roomId));
    const request = { roomId, version, requestId: requestId(), ...route };
    const first = await service.move(socket, request);
    expect(first).toEqual({ ok: true, version: version + 1 });
    expect(await service.move(socket, request)).toEqual(first);
    expect(roomOf(store, roomId).game!.moves).toHaveLength(1);
    expect(roomOf(store, roomId).game!.version).toBe(version + 1);

    // A rejected request is remembered the same way
    const next = nextMove(roomOf(store, roomId));
    const illegal = { roomId, version: next.version, requestId: requestId(), from: next.route.from, path: [50] };
    const refused = await service.move(next.socket, illegal);
    expect(refused.ok).toBe(false);
    expect(await service.move(next.socket, illegal)).toEqual(refused);
  });

  it('applies only one of two moves sent at the same version', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const [a, b] = legalMoves(room.game!);
    const { socket, version } = nextMove(room);
    const acks = await Promise.all([
      service.move(socket, { roomId, version, requestId: requestId(), from: a.from, path: a.path }),
      service.move(socket, { roomId, version, requestId: requestId(), from: b.from, path: b.path }),
    ]);
    expect(acks.filter(x => x.ok)).toHaveLength(1);
    expect(acks.filter(x => !x.ok)).toEqual([{ ok: false, code: 'STALE_STATE', version: version + 1 }]);
    expect(roomOf(store, roomId).game!.moves).toHaveLength(1);
  });

  it('rejects an illegal route with the engine code and changes nothing', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const game = setPosition(store, roomId, { white: { men: [28, 46] }, black: { men: [33, 3] } });
    const before = structuredClone(game);
    const white = socketOf(roomOf(store, roomId), 'white');
    const route = { from: 46, path: [41] };
    const engine = playMove(game, 'white', route);
    expect(engine).toEqual({ ok: false, error: { code: 'CAPTURE_REQUIRED', params: { count: 1 } } });
    expect(await service.move(white, { roomId, version: game.version, requestId: requestId(), ...route })).toEqual({
      ok: false,
      code: 'CAPTURE_REQUIRED',
      params: { count: 1 },
    });
    expect(await service.move(white, { roomId, version: game.version, requestId: requestId(), from: 32, path: [23] })).toEqual({
      ok: false,
      code: 'NO_PIECE',
      params: { square: 32 },
    });
    expect(roomOf(store, roomId).game).toEqual(before);
    ok(await service.move(white, { roomId, version: game.version, requestId: requestId(), from: 28, path: [39] }));
    expect(roomOf(store, roomId).game!.moves[0].captures).toEqual([33]);
  });

  it('accepts a draw with the offer version, and refuses an answer after a move or with a stale offer', async () => {
    const { service, store, results } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const white = socketOf(room, 'white');
    const black = socketOf(room, 'black');
    const v = () => roomOf(store, roomId).game!.version;

    // Offered, then withdrawn by the offerer's own move: the answer comes too late
    ok(await service.offerDraw(white, { roomId, version: v(), requestId: requestId() }));
    const firstOffer = roomOf(store, roomId).game!.drawOffer!;
    expect(firstOffer).toEqual({ by: 'white', version: v() });
    ok(await playOne(service, store, roomId));
    expect(roomOf(store, roomId).game!.drawOffer).toBeNull();
    expect(await service.respondDraw(black, { roomId, version: v(), requestId: requestId(), offerVersion: firstOffer.version, accept: true })).toEqual({
      ok: false,
      code: 'NO_DRAW_OFFER',
    });

    // Black offers; white answers with the wrong offer version, then black answers its own offer
    ok(await service.offerDraw(black, { roomId, version: v(), requestId: requestId() }));
    const offer = roomOf(store, roomId).game!.drawOffer!;
    expect(await service.respondDraw(white, { roomId, version: v(), requestId: requestId(), offerVersion: offer.version - 1, accept: true })).toEqual({
      ok: false,
      code: 'STALE_DRAW_OFFER',
    });
    expect(await service.respondDraw(black, { roomId, version: v(), requestId: requestId(), offerVersion: offer.version, accept: true })).toEqual({
      ok: false,
      code: 'OWN_DRAW_OFFER',
    });
    expect(roomOf(store, roomId).status).toBe('playing');

    ok(await service.respondDraw(white, { roomId, version: v(), requestId: requestId(), offerVersion: offer.version, accept: true }));
    const done = roomOf(store, roomId);
    expect(done.status).toBe('finished');
    expect(done.outcome).toEqual(expect.objectContaining({ gameId: done.game!.gameId, winner: null, reason: 'agreement', moves: 1 }));
    await flush();
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0].outcome.winner).toBeNull();
  });

  it('declines a draw and plays on', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const white = socketOf(room, 'white');
    const black = socketOf(room, 'black');
    ok(await service.offerDraw(white, { roomId, version: 1, requestId: requestId() }));
    ok(await service.respondDraw(black, { roomId, version: 2, requestId: requestId(), offerVersion: 2, accept: false }));
    expect(roomOf(store, roomId).game).toEqual(expect.objectContaining({ status: 'playing', drawOffer: null, version: 3 }));
  });

  it('ends the game on resignation and records it', async () => {
    const { service, store, results, emitter } = setup();
    const roomId = await startedRoom(service);
    ok(await playOne(service, store, roomId));
    const room = roomOf(store, roomId);
    const black = socketOf(room, 'black');
    const version = room.game!.version;
    expect(await service.resign(black, { roomId, version, requestId: requestId() })).toEqual({ ok: true, version: version + 1 });
    expect(roomOf(store, roomId).outcome).toEqual(expect.objectContaining({ winner: 'white', reason: 'resignation', moves: 1 }));
    expect(emitter.room.get(roomId)!.outcome?.winner).toBe('white');
    const after = roomOf(store, roomId).game!.version;
    expect(await service.move(black, { roomId, version: after, requestId: requestId(), from: 18, path: [23] })).toEqual({ ok: false, code: 'NOT_PLAYING' });
    expect(await service.resign(black, { roomId, version: roomOf(store, roomId).game!.version, requestId: requestId() })).toEqual({
      ok: false,
      code: 'NOT_PLAYING',
    });
    await flush();
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0]).toEqual(
      expect.objectContaining({
        rulesVersion: room.game!.rulesVersion,
        routes: [{ from: room.game!.moves[0].from, path: room.game!.moves[0].path }],
        notation: [room.game!.moves[0].notation],
      }),
    );
    expect(results.saved[0].players.map(p => p.color).sort()).toEqual(['black', 'white']);
  });
});

describe('Draughts pause', () => {
  it('blocks moves and draw actions until whoever paused resumes; resigning still works', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const { socket, other, route, version } = nextMove(room);

    expect(await service.pause(other, { roomId })).toEqual({ ok: true });
    expect(emitter.room.get(roomId)!.paused).toEqual(expect.objectContaining({ byId: room.players.find(p => p.socketId === other)!.id }));
    const held = { roomId, version, requestId: requestId(), ...route };
    expect(await service.move(socket, held)).toEqual({ ok: false, code: 'PAUSED' });
    expect(await service.offerDraw(socket, { roomId, version, requestId: requestId() })).toEqual({ ok: false, code: 'PAUSED' });
    expect(await service.respondDraw(other, { roomId, version, requestId: requestId(), offerVersion: 1, accept: true })).toEqual({
      ok: false,
      code: 'PAUSED',
    });
    expect(roomOf(store, roomId).game!.version).toBe(version);

    expect(await service.resume(socket, { roomId })).toEqual({ ok: false, code: 'NOT_PAUSER' });
    expect(await service.resume(other, { roomId })).toEqual({ ok: true });
    expect(emitter.room.get(roomId)!.paused).toBeNull();
    expect(await service.move(socket, held)).toEqual({ ok: true, version: version + 1 });

    ok(await service.pause(socket, { roomId }));
    ok(await service.resign(socket, { roomId, version: version + 1, requestId: requestId() }));
    expect(roomOf(store, roomId).status).toBe('finished');
    expect(roomOf(store, roomId).paused).toBeNull();
  });

  it('lets the other player resume once the one who paused has lost connection, and refuses a pause in the lobby', async () => {
    const { service, store } = setup();
    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    expect(await service.pause(sock(0), { roomId })).toEqual({ ok: false, code: 'NOT_PLAYING' });
    ok(await service.join(sock(1), user(1), { roomId, playerKey: key(1) }));
    ok(await service.ready(sock(0), { roomId, ready: true }));
    ok(await service.ready(sock(1), { roomId, ready: true }));
    ok(await service.pause(sock(0), { roomId }));
    service.disconnected(sock(0));
    await flush();
    expect(await service.resume(sock(1), { roomId })).toEqual({ ok: true });
    expect(roomOf(store, roomId).paused).toBeNull();
    service.onModuleDestroy();
  });
});

describe('Draughts connections', () => {
  it('keeps the seat and every counter through a refresh, and through a stored copy of the room', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    setPosition(store, roomId, { white: { kings: [47, 48, 49] }, black: { kings: [3] } });
    ok(await playQuiet(service, store, roomId));
    ok(await playQuiet(service, store, roomId));
    const game = roomOf(store, roomId).game!;
    expect(game.kingMoves).toBe(2);
    expect(game.endgame).toEqual({ rule: '6.3', startPly: 0, limitPlies: 32 });
    expect(game.positions).toHaveLength(3);
    const counters = emitter.room.get(roomId)!.game!.counters;

    const white = socketOf(roomOf(store, roomId), 'white');
    const whiteSeat = roomOf(store, roomId).players.find(p => p.socketId === white)!;
    service.disconnected(white);
    await flush();
    const away = emitter.room.get(roomId)!.seats[whiteSeat.seat].player!;
    expect(away.connected).toBe(false);
    expect(away.graceEndsAt!).toBeGreaterThan(Date.now());

    const back = await service.rejoin('socket-new', user(whiteSeat.seat), { roomId, playerKey: key(whiteSeat.seat) });
    expect(back).toEqual({ ok: true, roomId, playerId: whiteSeat.id, rejoined: true });
    expect(roomOf(store, roomId).game).toEqual(game);
    expect(emitter.room.get(roomId)!.game!.counters).toEqual(counters);
    expect(emitter.room.get(roomId)!.seats[whiteSeat.seat].player).toEqual(expect.objectContaining({ connected: true, graceEndsAt: null }));
    ok(await playQuiet(service, store, roomId)); // the new socket plays white

    // Through the stored form (what Redis keeps) and a restart
    const saved = deserializeRoom(JSON.stringify(roomOf(store, roomId))) as DraughtsRoom;
    expect(saved.game).toEqual(roomOf(store, roomId).game);
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
    ok(await second.service.rejoin('after-restart', user(0), { roomId, playerKey: key(0) }));
    ok(await second.service.rejoin('after-restart-1', user(1), { roomId, playerKey: key(1) }));
    const view = second.emitter.room.get(roomId)!.game!;
    expect(view.counters).toEqual(expect.objectContaining({ kingMoves: 3, endgame: { rule: '6.3', startPly: 0, limitPlies: 32 } }));
    expect(roomOf(second.store, roomId).game).toEqual(roomOf(store, roomId).game);
    ok(await playQuiet(second.service, second.store, roomId));
    expect(roomOf(second.store, roomId).game!.kingMoves).toBe(4);
    service.onModuleDestroy();
    second.service.onModuleDestroy();
  });

  it('never lets another device of the same account take the seat; a new tab of the same browser does', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    expect(await service.join('other-device', user(1), { roomId, playerKey: 'another-browser' })).toEqual({ ok: false, code: 'ALREADY_SEATED' });
    expect(await service.rejoin('other-device', user(1), { roomId, playerKey: 'another-browser' })).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(await service.rejoin('other-device', user(5), { roomId, playerKey: key(1) })).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(roomOf(store, roomId).players.find(p => p.seat === 1)!.socketId).toBe(sock(1));

    ok(await service.join('socket-1-tab2', user(1), { roomId, playerKey: key(1) }));
    expect(emitter.log).toContainEqual({ kind: 'socket', to: sock(1), event: 'draughts:seatLost', payload: { roomId } });
    expect(roomOf(store, roomId).players.find(p => p.seat === 1)!.socketId).toBe('socket-1-tab2');
    expect(await service.resign(sock(1), { roomId, version: 1, requestId: requestId() })).toEqual({ ok: false, code: 'NOT_SEATED' });
  });

  it('forfeits for the player who stays away past the grace period once a move was played', async () => {
    const previous = process.env.ROOM_GRACE_DRAUGHTS_MS;
    process.env.ROOM_GRACE_DRAUGHTS_MS = '30';
    try {
      const { service, emitter, store, results } = setup();
      const roomId = await startedRoom(service);
      ok(await playOne(service, store, roomId));
      const black = socketOf(roomOf(store, roomId), 'black');
      service.disconnected(black);
      await flush();
      expect(roomOf(store, roomId).status).toBe('playing'); // the seat is kept while the grace runs
      await sleep(60);
      await flush();
      const room = roomOf(store, roomId);
      expect(room.status).toBe('finished');
      expect(room.outcome).toEqual(expect.objectContaining({ winner: 'white', reason: 'forfeit', moves: 1 }));
      expect(room.players).toHaveLength(1);
      expect(emitter.log).toContainEqual({ kind: 'socket', to: black, event: 'draughts:seatLost', payload: { roomId } });
      await flush();
      expect(results.saved).toHaveLength(1);
      expect(results.saved[0].outcome.reason).toBe('forfeit');

      // Before the first move the room just goes back to the lobby and nothing is recorded
      const early = setup();
      const quiet = await startedRoom(early.service);
      early.service.disconnected(sock(1));
      await sleep(60);
      await flush();
      expect(roomOf(early.store, quiet).status).toBe('lobby');
      expect(roomOf(early.store, quiet).game).toBeNull();
      expect(roomOf(early.store, quiet).players.map(p => p.socketId)).toEqual([sock(0)]);
      expect(early.results.calls).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.ROOM_GRACE_DRAUGHTS_MS;
      else process.env.ROOM_GRACE_DRAUGHTS_MS = previous;
    }
  });

  it('records a forfeit when a player leaves after a move, and nothing when they leave before the first one', async () => {
    const { service, store, results } = setup();
    const roomId = await startedRoom(service);
    ok(await service.leave(sock(1), { roomId }));
    expect(roomOf(store, roomId).status).toBe('lobby');
    expect(roomOf(store, roomId).game).toBeNull();
    await flush();
    expect(results.calls).toBe(0);

    ok(await service.join(sock(2), user(2), { roomId, playerKey: key(2) }));
    ok(await service.ready(sock(0), { roomId, ready: true }));
    ok(await service.ready(sock(2), { roomId, ready: true }));
    ok(await playOne(service, store, roomId));
    const leaver = sock(2);
    const leaverColor = roomOf(store, roomId).gamePlayers!.find(g => g.seat === 1)!.color;
    ok(await service.leave(leaver, { roomId }));
    await flush();
    expect(roomOf(store, roomId).outcome).toEqual(expect.objectContaining({ reason: 'forfeit', winner: leaverColor === 'white' ? 'black' : 'white' }));
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0].players.map(p => p.userId).sort()).toEqual(['user-0', 'user-2']);
  });
});

describe('Draughts results', () => {
  it('saves a finished game exactly once, keeping it through a rematch and a restart while the database is down', async () => {
    const failing = new FakeResults();
    let down = true;
    const save = failing.save.bind(failing);
    failing.save = async (r: DraughtsResult) => {
      if (down) throw new Error('database unavailable');
      return save(r);
    };
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new RoomStore();
    const service = new DraughtsService(store, failing as never);
    service.attach(new FakeEmitter());
    service.random = seededRandom(3);
    const roomId = await startedRoom(service);
    ok(await playOne(service, store, roomId));
    const black = socketOf(roomOf(store, roomId), 'black');
    ok(await service.resign(black, { roomId, version: roomOf(store, roomId).game!.version, requestId: requestId() }));
    await flush();
    expect(roomOf(store, roomId).pendingResults).toHaveLength(1);
    const gameId = roomOf(store, roomId).outcome!.gameId;

    // A new game starts; the old result is still queued with the room
    ok(await service.rematch(sock(0), { roomId }));
    ok(await service.ready(sock(0), { roomId, ready: true }));
    ok(await service.ready(sock(1), { roomId, ready: true }));
    expect(roomOf(store, roomId).pendingResults).toHaveLength(1);

    // After a restart (everyone gone), the empty room is kept for its result and written once
    const saved = deserializeRoom(JSON.stringify({ ...roomOf(store, roomId), players: [] }))!;
    class RestoredStore extends RoomStore {
      loadAll(): Promise<StoredRoom[]> {
        this.save(saved);
        return Promise.resolve([saved]);
      }
    }
    down = false;
    const restoredStore = new RestoredStore();
    const restarted = new DraughtsService(restoredStore, failing as never);
    await restarted.onModuleInit();
    await flush();
    await flush();
    expect(failing.saved).toHaveLength(1);
    expect(failing.saved[0].outcome).toEqual(expect.objectContaining({ gameId, winner: 'white', reason: 'resignation' }));
    expect(restoredStore.getDraughts(roomId)).toBeUndefined();
    error.mockRestore();
    service.onModuleDestroy();
    restarted.onModuleDestroy();
  });

  it('never emits a browser key, socket id or account id', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    ok(await playOne(service, store, roomId));
    ok(await service.offerDraw(socketOf(roomOf(store, roomId), 'white'), { roomId, version: roomOf(store, roomId).game!.version, requestId: requestId() }));
    service.disconnected(sock(1));
    await flush();
    ok(await service.join('socket-0-tab2', user(0), { roomId, playerKey: key(0) }));
    ok(await service.rejoin(sock(1), user(1), { roomId, playerKey: key(1) }));
    ok(await service.resign(sock(1), { roomId, version: roomOf(store, roomId).game!.version, requestId: requestId() }));
    ok(await service.rematch(sock(1), { roomId }));
    expect(emitter.log.length).toBeGreaterThan(5);
    for (const entry of emitter.log) {
      const json = JSON.stringify(entry.payload);
      expect(json).not.toMatch(/browser-key|socket-|user-|playerKey|socketId|userId/);
    }
    service.onModuleDestroy();
  });
});

describe('Draughts and other games', () => {
  it("answers WRONG_GAME for another game's code, and Casino and Dominoes do the same for a draughts code", async () => {
    const store = new RoomStore();
    const { service } = setup(store);
    const casino = new CasinoService(store, { save: async () => true } as never);
    const dominoes = new DominoesService(store, { save: async () => true } as never);
    const casinoRoom = await casino.create('c0', user(8), { playerKey: key(8), players: 2 });
    const dominoRoom = await dominoes.create('d0', user(9), { playerKey: key(9), mode: 'head-to-head' });
    if (!casinoRoom.ok || !dominoRoom.ok) throw new Error('rooms not created');
    expect(await service.join(sock(1), user(1), { roomId: casinoRoom.roomId, playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'african-casino' },
    });
    expect(await service.rejoin(sock(1), user(1), { roomId: dominoRoom.roomId.toLowerCase(), playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'dominoes' },
    });
    const memory = { id: 'MEMO23', players: [], updatedAt: 0 } as unknown as GameRoom; // an old record: no gameType
    store.save(memory);
    expect(await service.join(sock(1), user(1), { roomId: 'MEMO23', playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'joda-memory' },
    });

    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    const wrong = { ok: false, code: 'WRONG_GAME', params: { gameType: 'international-draughts' } };
    expect(await casino.join('c1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await casino.rejoin('c1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await dominoes.join('d1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await dominoes.rejoin('d1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await service.join(sock(1), user(1), { roomId: 'NOPE42', playerKey: key(1) })).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });

    // Memory lookups never see draughts rooms; each game's list holds only its own
    expect(store.get(roomId)).toBeUndefined();
    expect(store.values()).toEqual([memory]);
    expect(store.draughtsRooms().map(r => r.id)).toEqual([roomId]);
    expect(store.dominoRooms().map(r => r.id)).toEqual([dominoRoom.roomId]);
    expect(store.getDominoes(roomId)).toBeUndefined();
    expect(store.getDraughts(dominoRoom.roomId)).toBeUndefined();
  });

  it('restores a stored game through the engine, and drops one that fails its checks', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    ok(await playOne(service, store, roomId));
    const json = JSON.stringify(roomOf(store, roomId));
    const restored = deserializeRoom(json) as DraughtsRoom;
    expect(restored.gameType).toBe('international-draughts');
    expect(restored.game).toEqual(roomOf(store, roomId).game);

    const broken = JSON.parse(json) as DraughtsRoom;
    broken.game!.pieces[1].square = broken.game!.pieces[0].square; // two pieces on one square
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const dropped = deserializeRoom(JSON.stringify(broken)) as DraughtsRoom;
    error.mockRestore();
    expect(dropped.game).toBeNull();
    expect(dropped.status).toBe('lobby');
    expect(dropped.players).toHaveLength(2);
  });
});
