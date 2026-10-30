import type { SessionUser } from '../auth/session';
import { CasinoService } from '../casino/casino.service';
import { DominoesService } from '../dominoes/dominoes.service';
import { DraughtsService } from '../draughts/draughts.service';
import { RoomStore, deserializeRoom, type StoredRoom } from '../game/room-store';
import { seededRandom } from '../lib/random';
import type { FiveSymbol } from './engine/types';
import { FiveService, type FiveEmitter } from './five.service';
import { MAX_AREA_SPAN, MAX_CATCH_UP, MAX_HISTORY_PAGE, type FiveAck, type FiveMoveEvent, type FiveResult, type FiveRoom, type FiveRoomView } from './five.types';

const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
afterAll(() => log.mockRestore());

const user = (n: number): SessionUser => ({ id: `user-${n}`, name: `Player ${n}`, email: null, isGuest: true });
const key = (n: number) => `browser-key-${n}`;
const sock = (n: number) => `socket-${n}`;

// Records every emit so tests can check who received what
class FakeEmitter implements FiveEmitter {
  room = new Map<string, FiveRoomView>();
  log: { kind: 'room' | 'socket'; to: string; event: string; payload: unknown }[] = [];
  toRoom(roomId: string, event: string, payload: unknown) {
    this.log.push({ kind: 'room', to: roomId, event, payload: structuredClone(payload) });
    if (event === 'five:room') this.room.set(roomId, payload as FiveRoomView);
  }
  toSocket(socketId: string, event: string, payload: unknown) {
    this.log.push({ kind: 'socket', to: socketId, event, payload: structuredClone(payload) });
  }
  join() {}
  leave() {}
  events(event: string) {
    return this.log.filter(e => e.event === event);
  }
}

class FakeResults {
  saved: FiveResult[] = [];
  calls = 0;
  async save(result: FiveResult) {
    this.calls++;
    if (!this.saved.some(r => r.outcome.gameId === result.outcome.gameId)) this.saved.push(structuredClone(result));
    return true;
  }
}

function setup(store = new RoomStore(), seed = 7) {
  const results = new FakeResults();
  const service = new FiveService(store, results as never);
  const emitter = new FakeEmitter();
  service.attach(emitter);
  service.random = seededRandom(seed);
  return { service, emitter, results, store };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ok = <T>(ack: FiveAck<T>): T => {
  if (!ack.ok) throw new Error(`Expected ok, got ${ack.code}`);
  return ack as T;
};
let requests = 0;
const requestId = () => `req-${++requests}-abcdef`;

// Seats players 0 and 1 (socket-0 hosts) and readies both: the game starts by itself
async function startedRoom(service: FiveService) {
  const { roomId } = ok(await service.create(sock(0), user(0), { name: 'Ana', playerKey: key(0) }));
  ok(await service.join(sock(1), user(1), { roomId, name: 'Bo', playerKey: key(1) }));
  ok(await service.ready(sock(0), { roomId, ready: true }));
  ok(await service.ready(sock(1), { roomId, ready: true }));
  return roomId;
}

const roomOf = (store: RoomStore, id: string) => store.getFive(id)!;
const socketOf = (room: FiveRoom, symbol: FiveSymbol) => {
  const id = room.gamePlayers!.find(g => g.symbol === symbol)!.id;
  return room.players.find(p => p.id === id)!.socketId;
};

// The player to move places on (x, y) at the current version
function play(service: FiveService, store: RoomStore, roomId: string, x: number | string | bigint, y: number | string | bigint) {
  const room = roomOf(store, roomId);
  const game = room.game!;
  return service.place(socketOf(room, game.turn), { roomId, gameId: game.gameId, version: game.version, requestId: requestId(), x: String(x), y: String(y) });
}

// n moves that never make five: X on (10k, 0), O on (10k, 100)
async function playQuiet(service: FiveService, store: RoomStore, roomId: string, n: number) {
  const start = roomOf(store, roomId).game!.moves.length;
  for (let i = start; i < start + n; i++) {
    const k = Math.floor(i / 2);
    ok(await play(service, store, roomId, 10 * k, i % 2 === 0 ? 0 : 100));
  }
}

// X makes five on row 0 (x = 0..4) while O plays row 5; X's fifth symbol is move 9
async function playXWins(service: FiveService, store: RoomStore, roomId: string) {
  for (let i = 0; i < 4; i++) {
    ok(await play(service, store, roomId, i, 0));
    ok(await play(service, store, roomId, i, 5));
  }
  return play(service, store, roomId, 4, 0);
}

describe('Five-in-a-row rooms', () => {
  it('needs a signed-in player to create, join or rejoin', async () => {
    const { service } = setup();
    expect(await service.create(sock(0), null, { playerKey: key(0) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    expect(await service.create(sock(0), user(0), { playerKey: 'short' })).toEqual({ ok: false, code: 'BAD_REQUEST' });
    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    expect(await service.join(sock(1), null, { roomId, playerKey: key(1) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    expect(await service.rejoin(sock(1), null, { roomId, playerKey: key(0) })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
  });

  it('starts once both seats are ready, with symbols drawn at random and X to move first', async () => {
    const { service, store, emitter } = setup(new RoomStore(), 11);
    const { roomId } = ok(await service.create(sock(0), user(0), { name: 'Ana', playerKey: key(0) }));
    ok(await service.ready(sock(0), { roomId, ready: true }));
    expect(roomOf(store, roomId).status).toBe('lobby');
    ok(await service.join(sock(1), user(1), { roomId, name: 'Bo', playerKey: key(1) }));
    expect(await service.join(sock(2), user(2), { roomId, playerKey: key(2) })).toEqual({ ok: false, code: 'ROOM_FULL' });
    expect(emitter.room.get(roomId)!.seats.map(s => s.symbol)).toEqual([null, null]);
    ok(await service.ready(sock(1), { roomId, ready: true }));

    const room = roomOf(store, roomId);
    expect(room.status).toBe('playing');
    const expected: FiveSymbol = seededRandom(11)(2) === 0 ? 'X' : 'O';
    const second: FiveSymbol = expected === 'X' ? 'O' : 'X';
    expect(room.seat0Symbol).toBe(expected);
    expect(room.gamePlayers!.map(g => [g.seat, g.symbol])).toEqual([
      [0, expected],
      [1, second],
    ]);
    const view = emitter.room.get(roomId)!;
    expect(view.seats.map(s => s.symbol)).toEqual([expected, second]);
    expect(view.game).toEqual(expect.objectContaining({ turn: 'X', version: 1, moveCount: 0, lastMoves: [], status: 'playing' }));
    expect(await service.ready(sock(1), { roomId, ready: true })).toEqual({ ok: false, code: 'GAME_STARTED' });
    expect(await service.join(sock(2), user(2), { roomId, playerKey: key(2) })).toEqual({ ok: false, code: 'GAME_STARTED' });

    // X, whoever it is, moves first
    const o = socketOf(room, 'O');
    const game = room.game!;
    expect(await service.place(o, { roomId, gameId: game.gameId, version: 1, requestId: requestId(), x: '0', y: '0' })).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
    ok(await service.place(socketOf(room, 'X'), { roomId, gameId: game.gameId, version: 1, requestId: requestId(), x: '0', y: '0' }));
  });

  it('swaps symbols at every rematch with a new game id and none of the old moves', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const first = roomOf(store, roomId).game!;
    const firstGameId = first.gameId;
    const firstSymbol = roomOf(store, roomId).seat0Symbol!;
    await playQuiet(service, store, roomId, 3);
    expect(await service.rematch(sock(0), { roomId })).toEqual({ ok: false, code: 'NOT_FINISHED' });
    const o = socketOf(roomOf(store, roomId), 'O');
    ok(await service.resign(o, { roomId, gameId: firstGameId, version: roomOf(store, roomId).game!.version, requestId: requestId() }));

    ok(await service.rematch(sock(1), { roomId }));
    const lobby = roomOf(store, roomId);
    expect(lobby.status).toBe('lobby');
    expect(lobby.game).toBeNull();
    expect(lobby.seat0Symbol).toBe(firstSymbol === 'X' ? 'O' : 'X');
    ok(await service.ready(sock(0), { roomId, ready: true }));
    ok(await service.ready(sock(1), { roomId, ready: true }));

    const second = roomOf(store, roomId);
    expect(second.game!.gameId).not.toBe(firstGameId);
    expect(second.game).toEqual(expect.objectContaining({ version: 1, moves: [], cells: {}, chunks: {}, turn: 'X', status: 'playing', winner: null }));
    expect(second.gamePlayers!.find(g => g.seat === 0)!.symbol).toBe(firstSymbol === 'X' ? 'O' : 'X');
    expect(second.outcome).toBeNull();

    // The old game can no longer be read or played
    const x = socketOf(second, 'X');
    expect(await service.place(x, { roomId, gameId: firstGameId, version: 1, requestId: requestId(), x: '9', y: '9' })).toEqual({ ok: false, code: 'OLD_GAME' });
    expect(await service.since(x, { roomId, gameId: firstGameId, version: 1 })).toEqual({ ok: false, code: 'OLD_GAME' });
    expect(await service.history(x, { roomId, gameId: firstGameId })).toEqual({ ok: false, code: 'OLD_GAME' });
    expect(await service.area(x, { roomId, gameId: firstGameId, from: { x: '0', y: '0' }, to: { x: '10', y: '10' } })).toEqual({ ok: false, code: 'OLD_GAME' });
    expect(ok(await service.history(x, { roomId, gameId: second.game!.gameId }))).toEqual({ ok: true, moves: [], hasMore: false });

    // And back again for the third game
    ok(await service.resign(x, { roomId, gameId: second.game!.gameId, version: 1, requestId: requestId() }));
    ok(await service.rematch(sock(0), { roomId }));
    expect(roomOf(store, roomId).seat0Symbol).toBe(firstSymbol);
  });

  it('hands the host over and deletes the room when the last player leaves the lobby', async () => {
    const { service, store, emitter } = setup();
    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    ok(await service.join(sock(1), user(1), { roomId, playerKey: key(1) }));
    ok(await service.leave(sock(0), { roomId }));
    expect(emitter.room.get(roomId)!.seats[1].player!.isHost).toBe(true);
    ok(await service.leave(sock(1), { roomId }));
    expect(store.getFive(roomId)).toBeUndefined();
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

describe('Five-in-a-row placements', () => {
  it('checks the seat, the game, the turn and the cell on the server', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const { gameId } = room.game!;
    const x = socketOf(room, 'X');
    const o = socketOf(room, 'O');
    const at = (extra: object) => ({ roomId, gameId, version: 1, requestId: requestId(), x: '0', y: '0', ...extra });

    expect(await service.place('stranger', at({}))).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(await service.place(x, at({ gameId: 'another-game' }))).toEqual({ ok: false, code: 'OLD_GAME' });
    expect(await service.place(x, at({ requestId: 'bad id' }))).toEqual({ ok: false, code: 'BAD_REQUEST_ID' });
    expect(await service.place(o, at({}))).toEqual({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(await service.place(x, at({ x: '1.5' }))).toEqual({ ok: false, code: 'BAD_CELL' });
    expect(await service.place(x, at({ x: undefined }))).toEqual({ ok: false, code: 'BAD_CELL' });
    expect(await service.place(x, at({ y: '1'.repeat(401) }))).toEqual({ ok: false, code: 'BAD_CELL' });
    expect(roomOf(store, roomId).game!.version).toBe(1);

    // The symbol comes from the seat: a symbol sent by the client is ignored
    const ack = ok(await service.place(x, at({ symbol: 'O', x: '-007', y: '-0' })));
    expect(ack).toEqual({ ok: true, version: 2, move: { ply: 1, symbol: 'X', x: '-7', y: '0' } });

    // The same cell under another spelling is taken
    expect(await service.place(o, at({ version: 2, x: '-7', y: '0' }))).toEqual({ ok: false, code: 'CELL_TAKEN' });
    expect(await service.place(o, at({ version: 2, x: '-0007', y: '00' }))).toEqual({ ok: false, code: 'CELL_TAKEN' });
    expect(roomOf(store, roomId).game!.moves).toHaveLength(1);
    ok(await service.place(o, at({ version: 2, x: '3', y: '3' })));
  });

  it('works out the win on the server, broadcasts it and refuses anything after it', async () => {
    const { service, store, emitter, results } = setup();
    const roomId = await startedRoom(service);
    const { gameId } = roomOf(store, roomId).game!;
    const roomViews = emitter.events('five:room').length;
    const win = ok(await playXWins(service, store, roomId));
    expect(win).toEqual({ ok: true, version: 10, move: { ply: 9, symbol: 'X', x: '4', y: '0' } });

    const moves = emitter.events('five:move');
    expect(moves).toHaveLength(9);
    expect(moves[8].payload).toEqual({
      roomId,
      gameId,
      version: 10,
      move: { ply: 9, symbol: 'X', x: '4', y: '0' },
      turn: 'O',
      status: 'finished',
      winner: 'X',
      winLine: [0, 1, 2, 3, 4].map(i => ({ x: String(i), y: '0' })),
    });
    // five:room only once, for the end of the game, after the move
    const rooms = emitter.events('five:room');
    expect(rooms).toHaveLength(roomViews + 1);
    expect(emitter.log.indexOf(rooms[rooms.length - 1])).toBeGreaterThan(emitter.log.indexOf(moves[8]));
    const view = emitter.room.get(roomId)!;
    expect(view.status).toBe('finished');
    expect(view.outcome).toEqual(expect.objectContaining({ gameId, winner: 'X', reason: 'five', moves: 9 }));
    expect(view.game).toEqual(expect.objectContaining({ status: 'finished', winner: 'X', reason: 'five', moveCount: 9 }));

    const room = roomOf(store, roomId);
    const o = socketOf(room, 'O');
    expect(await service.place(o, { roomId, gameId, version: 10, requestId: requestId(), x: '9', y: '9' })).toEqual({ ok: false, code: 'NOT_PLAYING' });
    expect(await service.resign(o, { roomId, gameId, version: 10, requestId: requestId() })).toEqual({ ok: false, code: 'NOT_PLAYING' });
    await flush();
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0].moves).toHaveLength(9);
  });

  it('answers a stale version with the current one, and since() returns exactly the missed moves', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    await playQuiet(service, store, roomId, 2);
    const room = roomOf(store, roomId);
    const { gameId } = room.game!;
    const x = socketOf(room, 'X');
    const o = socketOf(room, 'O');
    // O's client saw version 3; X plays twice more meanwhile (O once)
    const seen = room.game!.version;
    expect(seen).toBe(3);
    await playQuiet(service, store, roomId, 3);
    expect(await service.place(x, { roomId, gameId, version: seen, requestId: requestId(), x: '500', y: '500' })).toEqual({
      ok: false,
      code: 'STALE_STATE',
      version: 6,
    });
    const caught = ok(await service.since(o, { roomId, gameId, version: seen }));
    expect(caught).toEqual({
      ok: true,
      gameId,
      version: 6,
      moves: roomOf(store, roomId).game!.moves.slice(2),
      turn: 'O',
      status: 'playing',
      winner: null,
      reason: null,
      winLine: null,
    });
    expect((caught as { moves: { ply: number }[] }).moves.map(m => m.ply)).toEqual([3, 4, 5]);
    expect(ok(await service.since(o, { roomId, gameId, version: 6 }))).toEqual(expect.objectContaining({ version: 6, moves: [] }));
    expect(ok(await service.since(o, { roomId, gameId, version: 1 }))).toEqual(expect.objectContaining({ moves: roomOf(store, roomId).game!.moves }));
    // A client ahead of the server reloads; nonsense is refused
    expect(await service.since(o, { roomId, gameId, version: 7 })).toEqual({ ok: true, gameId, version: 6, resync: true });
    expect(await service.since(o, { roomId, gameId, version: 0 })).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect(await service.since(o, { roomId, gameId, version: '3' })).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect(await service.since('stranger', { roomId, gameId, version: 3 })).toEqual({ ok: false, code: 'NOT_SEATED' });

    // After a resignation (one more version, no move) the end comes with the missed moves
    ok(await service.resign(o, { roomId, gameId, version: 6, requestId: requestId() }));
    expect(ok(await service.since(x, { roomId, gameId, version: 5 }))).toEqual(
      expect.objectContaining({ version: 7, moves: [roomOf(store, roomId).game!.moves[4]], status: 'finished', winner: 'X', reason: 'resignation' }),
    );
    expect(ok(await service.since(x, { roomId, gameId, version: 6 }))).toEqual(expect.objectContaining({ version: 7, moves: [], status: 'finished' }));
  });

  it('asks a client that missed more than MAX_CATCH_UP moves to reload', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    await playQuiet(service, store, roomId, MAX_CATCH_UP + 2);
    const room = roomOf(store, roomId);
    const { gameId, version } = room.game!;
    const x = socketOf(room, 'X');
    expect(await service.since(x, { roomId, gameId, version: 1 })).toEqual({ ok: true, gameId, version, resync: true });
    const atLimit = ok(await service.since(x, { roomId, gameId, version: 3 })) as { moves: unknown[] };
    expect(atLimit.moves).toHaveLength(MAX_CATCH_UP);
  });

  it('answers a retried request id with the original answer and applies it only once', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const { gameId } = room.game!;
    const x = socketOf(room, 'X');
    const request = { roomId, gameId, version: 1, requestId: 'retry-request-1', x: '2', y: '2' };
    const first = await service.place(x, request);
    expect(first).toEqual({ ok: true, version: 2, move: { ply: 1, symbol: 'X', x: '2', y: '2' } });
    expect(await service.place(x, request)).toEqual(first);
    expect(await service.place(x, { ...request, x: '3' })).toEqual(first);
    expect(roomOf(store, roomId).game!.moves).toHaveLength(1);
    expect(emitter.events('five:move')).toHaveLength(1);

    // A refusal by the rules is remembered too; a stale version is not
    const o = socketOf(room, 'O');
    const taken = { roomId, gameId, version: 2, requestId: 'retry-request-2', x: '2', y: '2' };
    expect(await service.place(o, taken)).toEqual({ ok: false, code: 'CELL_TAKEN' });
    expect(await service.place(o, { ...taken, x: '5' })).toEqual({ ok: false, code: 'CELL_TAKEN' });
    const stale = { roomId, gameId, version: 1, requestId: 'retry-request-3', x: '6', y: '6' };
    expect(await service.place(o, stale)).toEqual({ ok: false, code: 'STALE_STATE', version: 2 });
    expect(ok(await service.place(o, { ...stale, version: 2 }))).toEqual(expect.objectContaining({ version: 3 }));
  });

  it('applies only one of two placements sent at the same version', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const { gameId } = room.game!;
    const x = socketOf(room, 'X');
    const [a, b] = await Promise.all([
      service.place(x, { roomId, gameId, version: 1, requestId: requestId(), x: '0', y: '0' }),
      service.place(x, { roomId, gameId, version: 1, requestId: requestId(), x: '1', y: '1' }),
    ]);
    expect(a).toEqual(expect.objectContaining({ ok: true, version: 2 }));
    expect(b).toEqual({ ok: false, code: 'STALE_STATE', version: 2 });
    expect(roomOf(store, roomId).game!.moves).toEqual([{ ply: 1, symbol: 'X', x: '0', y: '0' }]);
    expect(emitter.events('five:move')).toHaveLength(1);
  });

  it('broadcasts each placement as just the new move, whatever the length of the game', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    const roomViews = emitter.events('five:room').length;
    await playQuiet(service, store, roomId, 300);
    const moves = emitter.events('five:move');
    expect(moves).toHaveLength(300);
    // No five:room for ordinary moves
    expect(emitter.events('five:room')).toHaveLength(roomViews);
    for (const [i, entry] of moves.entries()) {
      const payload = entry.payload as FiveMoveEvent;
      expect(Object.keys(payload).sort()).toEqual(['gameId', 'move', 'roomId', 'status', 'turn', 'version', 'winLine', 'winner']);
      expect(payload.move.ply).toBe(i + 1);
      expect(payload.version).toBe(i + 2);
      expect(JSON.stringify(payload).length).toBeLessThan(300);
    }
    expect(JSON.stringify(moves[299].payload).length - JSON.stringify(moves[0].payload).length).toBeLessThan(20);
    // The room view stays bounded too: the last 40 moves only
    const x = socketOf(roomOf(store, roomId), 'X');
    ok(await service.pause(x, { roomId }));
    const view = emitter.room.get(roomId)!;
    expect(view.game!.moveCount).toBe(300);
    expect(view.game!.lastMoves).toHaveLength(40);
    expect(view.game!.lastMoves[39].ply).toBe(300);
    expect(JSON.stringify(view).length).toBeLessThan(5000);
  });

  it('never emits a browser key, socket id or account id', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    await playQuiet(service, store, roomId, 4);
    service.disconnected(sock(1));
    await flush();
    ok(await service.join('socket-0-tab2', user(0), { roomId, playerKey: key(0) }));
    ok(await service.rejoin(sock(1), user(1), { roomId, playerKey: key(1) }));
    const room = roomOf(store, roomId);
    ok(await service.area(sock(1), { roomId, gameId: room.game!.gameId, from: { x: '0', y: '0' }, to: { x: '20', y: '100' } }));
    ok(await service.resign(sock(1), { roomId, gameId: room.game!.gameId, version: room.game!.version, requestId: requestId() }));
    ok(await service.rematch(sock(1), { roomId }));
    expect(emitter.log.length).toBeGreaterThan(10);
    for (const entry of emitter.log) {
      const json = JSON.stringify(entry.payload);
      expect(json).not.toMatch(/browser-key|socket-|user-|playerKey|socketId|userId/);
    }
    service.onModuleDestroy();
  });
});

describe('Five-in-a-row board reads', () => {
  it('returns only the cells inside an area, anywhere on the grid, and refuses an area that is too large', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    const huge = 10n ** 300n;
    const cells: [bigint, bigint][] = [
      [0n, 0n],
      [-1n, -1n],
      [-40n, 33n],
      [31n, 32n],
      [huge, -huge],
      [huge + 1n, -huge],
      [-huge, huge],
    ];
    for (const [cx, cy] of cells) ok(await play(service, store, roomId, cx, cy));
    const room = roomOf(store, roomId);
    const { gameId, version } = room.game!;
    const o = socketOf(room, 'O');
    const area = (from: [bigint | number, bigint | number], to: [bigint | number, bigint | number]) =>
      service.area(o, { roomId, gameId, from: { x: String(from[0]), y: String(from[1]) }, to: { x: String(to[0]), y: String(to[1]) } });
    const sorted = (ack: FiveAck) => (ok(ack) as unknown as { cells: { x: string; y: string }[] }).cells.map(c => `${c.x},${c.y}`).sort();

    expect(ok(await area([-1, -1], [31, 32]))).toEqual({
      ok: true,
      gameId,
      version,
      cells: expect.arrayContaining([
        { x: '0', y: '0', symbol: 'X' },
        { x: '-1', y: '-1', symbol: 'O' },
        { x: '31', y: '32', symbol: 'O' },
      ]),
    });
    expect(sorted(await area([-1, -1], [31, 32]))).toEqual(['-1,-1', '0,0', '31,32']);
    // Corners in any order; inclusive edges; negative coordinates
    expect(sorted(await area([0, 33], [-40, 0]))).toEqual(['-40,33', '0,0']);
    expect(sorted(await area([-41, 34], [-41, 34]))).toEqual([]);
    // Near 10^300, both signs
    expect(sorted(await area([huge - 10n, -huge - 10n], [huge + 10n, -huge + 10n]))).toEqual([`${huge},-${huge}`, `${huge + 1n},-${huge}`].sort());
    expect(sorted(await area([-huge, huge], [-huge + 255n, huge - 255n]))).toEqual([`-${huge},${huge}`]);

    // At most MAX_AREA_SPAN cells per side
    const span = MAX_AREA_SPAN;
    ok(await area([0, 0], [span - 1n, span - 1n]));
    ok(await area([huge, -huge], [huge - span + 1n, -huge]));
    expect(await area([0, 0], [span, 0])).toEqual({ ok: false, code: 'AREA_TOO_LARGE' });
    expect(await area([0, -huge], [0, huge])).toEqual({ ok: false, code: 'AREA_TOO_LARGE' });
    expect(await area([-huge, 0], [huge, 0])).toEqual({ ok: false, code: 'AREA_TOO_LARGE' });
    expect(await service.area(o, { roomId, gameId, from: { x: 'a', y: '0' }, to: { x: '0', y: '0' } })).toEqual({ ok: false, code: 'BAD_CELL' });
    expect(await service.area(o, { roomId, gameId, from: { x: '0', y: '0' } })).toEqual({ ok: false, code: 'BAD_CELL' });
    expect(await service.area('stranger', { roomId, gameId, from: { x: '0', y: '0' }, to: { x: '1', y: '1' } })).toEqual({ ok: false, code: 'NOT_SEATED' });
  });

  it('pages through the history newest first', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    await playQuiet(service, store, roomId, 25);
    const room = roomOf(store, roomId);
    const { gameId } = room.game!;
    const x = socketOf(room, 'X');
    const page = async (input: object) => ok(await service.history(x, { roomId, gameId, ...input })) as unknown as { moves: { ply: number }[]; hasMore: boolean };

    const first = await page({ limit: 10 });
    expect(first.moves.map(m => m.ply)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
    expect(first.hasMore).toBe(true);
    const second = await page({ limit: 10, beforePly: 16 });
    expect(second.moves.map(m => m.ply)).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
    expect(second.hasMore).toBe(true);
    const last = await page({ limit: 10, beforePly: 6 });
    expect(last.moves.map(m => m.ply)).toEqual([5, 4, 3, 2, 1]);
    expect(last.hasMore).toBe(false);
    expect(await page({ beforePly: 1 })).toEqual({ ok: true, moves: [], hasMore: false });
    expect((await page({})).moves).toHaveLength(25);
    expect((await page({ beforePly: 1000, limit: 0 })).moves.map(m => m.ply)).toEqual([25]);
    expect(last.moves[4]).toEqual(room.game!.moves[0]);
    expect(await service.history(x, { roomId, gameId, beforePly: 0 })).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect(await service.history(x, { roomId, gameId, limit: 'all' })).toEqual({ ok: false, code: 'BAD_REQUEST' });

    // Never more than MAX_HISTORY_PAGE per page
    await playQuiet(service, store, roomId, MAX_HISTORY_PAGE);
    const big = await page({ limit: MAX_HISTORY_PAGE * 10 });
    expect(big.moves).toHaveLength(MAX_HISTORY_PAGE);
    expect(big.hasMore).toBe(true);
  });
});

describe('Five-in-a-row pause', () => {
  it('blocks placements until whoever paused resumes; resigning still works', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    const room = roomOf(store, roomId);
    const { gameId } = room.game!;
    const x = socketOf(room, 'X');
    const o = socketOf(room, 'O');
    ok(await service.pause(o, { roomId }));
    expect(emitter.room.get(roomId)!.paused).toEqual(expect.objectContaining({ byName: expect.any(String) }));
    const request = { roomId, gameId, version: 1, requestId: requestId(), x: '0', y: '0' };
    expect(await service.place(x, request)).toEqual({ ok: false, code: 'PAUSED' });
    expect(await service.resume(x, { roomId })).toEqual({ ok: false, code: 'NOT_PAUSER' });
    ok(await service.resume(o, { roomId }));
    // Not remembered: the same request goes through once resumed
    expect(ok(await service.place(x, request))).toEqual(expect.objectContaining({ version: 2 }));
    ok(await service.pause(x, { roomId }));
    ok(await service.resign(x, { roomId, gameId, version: 2, requestId: requestId() }));
    expect(roomOf(store, roomId).outcome).toEqual(expect.objectContaining({ winner: 'O', reason: 'resignation', moves: 1 }));
    expect(emitter.room.get(roomId)!.paused).toBeNull();
  });
});

describe('Five-in-a-row connections', () => {
  it('keeps the seat, symbol, turn and board through a refresh, and through a stored copy of the room', async () => {
    const { service, store, emitter } = setup();
    const roomId = await startedRoom(service);
    await playQuiet(service, store, roomId, 5);
    ok(await play(service, store, roomId, -(10n ** 300n), 10n ** 300n));
    const game = structuredClone(roomOf(store, roomId).game!);
    const o = roomOf(store, roomId).players.find(p => p.socketId === socketOf(roomOf(store, roomId), 'O'))!;

    service.disconnected(o.socketId);
    await flush();
    const away = emitter.room.get(roomId)!.seats[o.seat].player!;
    expect(away.connected).toBe(false);
    expect(away.graceEndsAt!).toBeGreaterThan(Date.now());

    const back = await service.rejoin('socket-new', user(o.seat), { roomId, playerKey: key(o.seat) });
    expect(back).toEqual({ ok: true, roomId, playerId: o.id, rejoined: true });
    expect(roomOf(store, roomId).game).toEqual(game);
    expect(socketOf(roomOf(store, roomId), 'O')).toBe('socket-new');
    expect(emitter.room.get(roomId)!.seats[o.seat]).toEqual(expect.objectContaining({ symbol: 'O', player: expect.objectContaining({ connected: true, graceEndsAt: null }) }));
    expect(emitter.room.get(roomId)!.game).toEqual(expect.objectContaining({ turn: 'X', version: 7, moveCount: 6 }));
    ok(await play(service, store, roomId, 1, 1)); // X
    ok(await play(service, store, roomId, 2, 2)); // the new socket plays O

    // Through the stored form (what Redis keeps) and a restart
    const saved = deserializeRoom(JSON.stringify(roomOf(store, roomId))) as FiveRoom;
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
    ok(await second.service.rejoin('after-restart-0', user(0), { roomId, playerKey: key(0) }));
    ok(await second.service.rejoin('after-restart-1', user(1), { roomId, playerKey: key(1) }));
    expect(roomOf(second.store, roomId).game).toEqual(roomOf(store, roomId).game);
    expect(second.emitter.room.get(roomId)!.seats.map(s => s.symbol)).toEqual(emitter.room.get(roomId)!.seats.map(s => s.symbol));
    const { gameId } = restored.game!;
    const x = socketOf(restored, 'X');
    const far = ok(
      await second.service.area(x, { roomId, gameId, from: { x: `-${10n ** 300n}`, y: `${10n ** 300n}` }, to: { x: `-${10n ** 300n - 5n}`, y: `${10n ** 300n - 5n}` } }),
    ) as unknown as { cells: unknown[] };
    expect(far.cells).toEqual([{ x: `-${10n ** 300n}`, y: `${10n ** 300n}`, symbol: 'O' }]);
    expect(await second.service.place(x, { roomId, gameId, version: restored.game!.version, requestId: requestId(), x: '2', y: '2' })).toEqual({ ok: false, code: 'CELL_TAKEN' });
    ok(await play(second.service, second.store, roomId, 3, 3));
    expect(roomOf(second.store, roomId).game!.moves).toHaveLength(9);
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
    expect(emitter.log).toContainEqual({ kind: 'socket', to: sock(1), event: 'five:seatLost', payload: { roomId } });
    expect(roomOf(store, roomId).players.find(p => p.seat === 1)!.socketId).toBe('socket-1-tab2');
    const { gameId, version } = roomOf(store, roomId).game!;
    expect(await service.resign(sock(1), { roomId, gameId, version, requestId: requestId() })).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(await service.since(sock(1), { roomId, gameId, version })).toEqual({ ok: false, code: 'NOT_SEATED' });
  });

  it('forfeits for the player who stays away past the grace period once a move was played', async () => {
    const previous = process.env.ROOM_GRACE_FIVE_MS;
    process.env.ROOM_GRACE_FIVE_MS = '30';
    try {
      const { service, emitter, store, results } = setup();
      const roomId = await startedRoom(service);
      await playQuiet(service, store, roomId, 1);
      const o = socketOf(roomOf(store, roomId), 'O');
      service.disconnected(o);
      await flush();
      expect(roomOf(store, roomId).status).toBe('playing'); // the seat is kept while the grace runs
      await sleep(60);
      await flush();
      const room = roomOf(store, roomId);
      expect(room.status).toBe('finished');
      expect(room.outcome).toEqual(expect.objectContaining({ winner: 'X', reason: 'forfeit', moves: 1, winLine: null }));
      expect(room.players).toHaveLength(1);
      expect(emitter.log).toContainEqual({ kind: 'socket', to: o, event: 'five:seatLost', payload: { roomId } });
      await flush();
      expect(results.saved).toHaveLength(1);
      expect(results.saved[0].outcome.reason).toBe('forfeit');
      expect(results.saved[0].moves).toEqual([{ ply: 1, symbol: 'X', x: '0', y: '0' }]);

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
      if (previous === undefined) delete process.env.ROOM_GRACE_FIVE_MS;
      else process.env.ROOM_GRACE_FIVE_MS = previous;
    }
  });

  it('records nothing when a player leaves before the first move, and a forfeit after it', async () => {
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
    await playQuiet(service, store, roomId, 1);
    const leaverSymbol = roomOf(store, roomId).gamePlayers!.find(g => g.seat === 1)!.symbol;
    ok(await service.leave(sock(2), { roomId }));
    await flush();
    expect(roomOf(store, roomId).outcome).toEqual(expect.objectContaining({ reason: 'forfeit', winner: leaverSymbol === 'X' ? 'O' : 'X' }));
    expect(results.saved).toHaveLength(1);
    expect(results.saved[0].players.map(p => p.userId).sort()).toEqual(['user-0', 'user-2']);
  });
});

describe('Five-in-a-row results', () => {
  it('saves a finished game exactly once, keeping it through a rematch and a restart while the database is down', async () => {
    const failing = new FakeResults();
    let down = true;
    const save = failing.save.bind(failing);
    failing.save = async (r: FiveResult) => {
      if (down) throw new Error('database unavailable');
      return save(r);
    };
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new RoomStore();
    const service = new FiveService(store, failing as never);
    service.attach(new FakeEmitter());
    service.random = seededRandom(3);
    const roomId = await startedRoom(service);
    ok(await playXWins(service, store, roomId));
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
    const restarted = new FiveService(restoredStore, failing as never);
    await restarted.onModuleInit();
    await flush();
    await flush();
    expect(failing.saved).toHaveLength(1);
    const result = failing.saved[0];
    expect(result.outcome).toEqual(expect.objectContaining({ gameId, winner: 'X', reason: 'five', moves: 9 }));
    expect(result.outcome.winLine).toEqual([0, 1, 2, 3, 4].map(i => ({ x: String(i), y: '0' })));
    expect(result.moves.map(m => m.ply)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.players.map(p => [p.seat, p.symbol, p.userId])).toEqual([
      [0, seededRandom(3)(2) === 0 ? 'X' : 'O', 'user-0'],
      [1, seededRandom(3)(2) === 0 ? 'O' : 'X', 'user-1'],
    ]);
    expect(result.rulesVersion).toBe('five-in-a-row-1');
    expect(restoredStore.getFive(roomId)).toBeUndefined();
    error.mockRestore();
    service.onModuleDestroy();
    restarted.onModuleDestroy();
  });
});

describe('Five-in-a-row and other games', () => {
  it("answers WRONG_GAME for another game's code, and the other games do the same for a five-in-a-row code", async () => {
    const store = new RoomStore();
    const { service } = setup(store);
    const casino = new CasinoService(store, { save: async () => true } as never);
    const dominoes = new DominoesService(store, { save: async () => true } as never);
    const draughts = new DraughtsService(store, { save: async () => true } as never);
    const casinoRoom = await casino.create('c0', user(8), { playerKey: key(8), players: 2 });
    const draughtsRoom = await draughts.create('d0', user(9), { playerKey: key(9) });
    if (!casinoRoom.ok || !draughtsRoom.ok) throw new Error('rooms not created');
    expect(await service.join(sock(1), user(1), { roomId: casinoRoom.roomId, playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'african-casino' },
    });
    expect(await service.rejoin(sock(1), user(1), { roomId: draughtsRoom.roomId.toLowerCase(), playerKey: key(1) })).toEqual({
      ok: false,
      code: 'WRONG_GAME',
      params: { gameType: 'international-draughts' },
    });

    const { roomId } = ok(await service.create(sock(0), user(0), { playerKey: key(0) }));
    const wrong = { ok: false, code: 'WRONG_GAME', params: { gameType: 'five-in-a-row' } };
    expect(await casino.join('c1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await dominoes.join('d1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await draughts.join('d1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await draughts.rejoin('d1', user(1), { roomId, playerKey: key(1) })).toEqual(wrong);
    expect(await service.join(sock(1), user(1), { roomId: 'NOPE42', playerKey: key(1) })).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });

    // Memory lookups never see five-in-a-row rooms; each game's list holds only its own
    expect(store.get(roomId)).toBeUndefined();
    expect(store.values()).toEqual([]);
    expect(store.fiveRooms().map(r => r.id)).toEqual([roomId]);
    expect(store.draughtsRooms().map(r => r.id)).toEqual([draughtsRoom.roomId]);
    expect(store.getDraughts(roomId)).toBeUndefined();
    expect(store.getFive(draughtsRoom.roomId)).toBeUndefined();
    draughts.onModuleDestroy();
  });

  it('restores a stored game through the engine, and drops one that fails its checks', async () => {
    const { service, store } = setup();
    const roomId = await startedRoom(service);
    await playQuiet(service, store, roomId, 3);
    const json = JSON.stringify(roomOf(store, roomId));
    const restored = deserializeRoom(json) as FiveRoom;
    expect(restored.gameType).toBe('five-in-a-row');
    expect(restored.game).toEqual(roomOf(store, roomId).game);

    const broken = JSON.parse(json) as FiveRoom;
    broken.game!.moves[1].symbol = 'X'; // symbols no longer alternate
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const dropped = deserializeRoom(JSON.stringify(broken)) as FiveRoom;
    error.mockRestore();
    expect(dropped.game).toBeNull();
    expect(dropped.status).toBe('lobby');
    expect(dropped.players).toHaveLength(2);
  });
});
