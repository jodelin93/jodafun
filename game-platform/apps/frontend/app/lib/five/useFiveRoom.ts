'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../socket';
import { getPlayerKey } from '../playerKey';
import { BoardCache, type AreaRequest } from './cache';
import { fromWire, toWire, type Cell, type Rect } from './coords';
import {
  HISTORY_PAGE,
  type AreaAck,
  type FiveAck,
  type FiveMove,
  type FiveMoveEvent,
  type FiveRoomView,
  type FiveSummary,
  type HistoryAck,
  type PlaceAck,
  type SinceAck,
} from './types';

export type Connection = 'connecting' | 'online' | 'offline';

const ACK_TIMEOUT_MS = 8000;
const RECENT = 40;
const AREA_RETRY_MS = 2500;
const newRequestId = () => crypto.randomUUID();

// Sends an event and resolves with the server's answer, or a synthetic error when there is none
export function ask<T>(socket: Socket, event: string, payload: unknown): Promise<FiveAck<T>> {
  return new Promise(resolve => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, res: FiveAck<T>) => {
      resolve(err || !res ? ({ ok: false, code: 'NO_ANSWER' } as FiveAck<T>) : res);
    });
  });
}

type GameEvent = 'five:place' | 'five:resign';
type Pending = { event: GameEvent; payload: Record<string, unknown>; resolve: (ack: PlaceAck) => void };
type SeatAck = FiveAck<{ roomId: string; playerId: string; rejoined?: boolean }>;

// Keeps the most recent moves, oldest first, without duplicates
function mergeRecent(a: FiveMove[], b: FiveMove[]): FiveMove[] {
  const byPly = new Map<number, FiveMove>();
  for (const m of [...a, ...b]) byPly.set(m.ply, m);
  return [...byPly.values()].sort((p, q) => p.ply - q.ply).slice(-RECENT);
}

/**
 * Everything the five-in-a-row page needs from the server: the room, which seat is ours, the
 * connection, the game as this client knows it (kept current from single-move events, with a
 * catch-up through five:since when one is missed), the board cache filled area by area, and the
 * actions. A placement or resignation keeps its request id until the server answers, so a retry
 * after a dropped connection is never applied twice; only one is in flight at a time (`sending`).
 */
export function useFiveRoom(onSeatLost: () => void, userId: string | null) {
  const [socket] = useState(() => getSocket());
  const [connection, setConnection] = useState<Connection>('connecting');
  const [room, setRoom] = useState<FiveRoomView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [game, setGame] = useState<FiveSummary | null>(null);
  const [cache] = useState(() => new BoardCache());
  const [cacheRev, setCacheRev] = useState(0);
  const roomIdRef = useRef<string | null>(null);
  const seatedRef = useRef(false);
  const latest = useRef(new Map<string, FiveRoomView>());
  const gameRef = useRef<FiveSummary | null>(null);
  const pendingMove = useRef<Pending | null>(null);
  const catchingUp = useRef<{ again: boolean } | null>(null);
  const lastArea = useRef<Rect | null>(null);
  const areaRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSeatLostRef = useRef(onSeatLost);
  onSeatLostRef.current = onSeatLost;

  const bump = useCallback(() => setCacheRev(cache.rev), [cache]);

  const setGameState = useCallback((next: FiveSummary | null) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  // A summary from a room broadcast: a new game empties the cache; a newer version replaces ours
  const applySummary = useCallback(
    (s: FiveSummary | null) => {
      const cur = gameRef.current;
      if (!s) {
        if (cur) {
          cache.clear();
          bump();
          setGameState(null);
        }
        return;
      }
      if (!cur || cur.gameId !== s.gameId) {
        cache.clear();
        s.lastMoves.forEach(m => cache.put(fromWire(m), m.symbol));
        bump();
        setGameState({ ...s, lastMoves: mergeRecent([], s.lastMoves) });
        return;
      }
      s.lastMoves.forEach(m => cache.put(fromWire(m), m.symbol));
      bump();
      if (s.version >= cur.version) setGameState({ ...s, lastMoves: mergeRecent(cur.lastMoves, s.lastMoves) });
    },
    [cache, bump, setGameState],
  );

  const sinceRef = useRef<() => void>(() => {});
  const loadAreaRef = useRef<(r: Rect) => void>(() => {});

  // One new move (from five:move): applied only on top of the version we hold
  const applyMove = useCallback(
    (ev: FiveMoveEvent) => {
      const cur = gameRef.current;
      if (!cur || ev.gameId !== cur.gameId) return;
      if (ev.version < cur.version) return;
      if (ev.version === cur.version) {
        // Already applied (from a catch-up): only the result can be new
        if (ev.move.ply === cur.moveCount && (cur.status !== ev.status || cur.winner !== ev.winner)) {
          setGameState({ ...cur, status: ev.status, winner: ev.winner, winLine: ev.winLine, reason: ev.status === 'finished' ? (cur.reason ?? 'five') : cur.reason });
        }
        return;
      }
      if (ev.version !== cur.version + 1) {
        sinceRef.current();
        return;
      }
      cache.put(fromWire(ev.move), ev.move.symbol);
      bump();
      setGameState({
        ...cur,
        version: ev.version,
        turn: ev.turn,
        moveCount: Math.max(cur.moveCount, ev.move.ply),
        lastMoves: mergeRecent(cur.lastMoves, [ev.move]),
        status: ev.status,
        winner: ev.winner,
        winLine: ev.winLine,
        reason: ev.status === 'finished' ? 'five' : cur.reason,
      });
    },
    [cache, bump, setGameState],
  );

  // Fetches the moves we missed (or, after too many, forgets what was loaded and reloads it)
  const catchUp = useCallback(async () => {
    if (catchingUp.current) {
      catchingUp.current.again = true;
      return;
    }
    const flag = { again: false };
    catchingUp.current = flag;
    try {
      do {
        flag.again = false;
        const cur = gameRef.current;
        const roomId = roomIdRef.current;
        if (!cur || !roomId || !socket.connected) return;
        const ack = (await ask(socket, 'five:since', { roomId, gameId: cur.gameId, version: cur.version })) as SinceAck;
        const now = gameRef.current;
        if (!ack.ok || !now || ack.gameId !== now.gameId) return;
        if (ack.resync) {
          // Too many missed moves (or we were ahead): take the server's version, reload the
          // visible area, and ask for the room again (a rejoin re-sends five:room with the summary)
          cache.forgetLoaded();
          bump();
          setGameState({ ...now, version: ack.version });
          if (lastArea.current) loadAreaRef.current(lastArea.current);
          await ask(socket, 'five:rejoin', { roomId, playerKey: getPlayerKey() });
          continue;
        }
        const moves = ack.moves ?? [];
        moves.forEach(m => cache.put(fromWire(m), m.symbol));
        bump();
        if (ack.version <= now.version) continue;
        const count = Math.max(now.moveCount, ...moves.map(m => m.ply));
        setGameState({
          ...now,
          version: ack.version,
          moveCount: count,
          lastMoves: mergeRecent(now.lastMoves, moves),
          // The end of the game (a resignation we missed included) comes with the answer
          turn: ack.turn ?? (count % 2 === 0 ? 'X' : 'O'),
          status: ack.status ?? now.status,
          winner: ack.winner !== undefined ? ack.winner : now.winner,
          reason: ack.reason !== undefined ? ack.reason : now.reason,
          winLine: ack.winLine !== undefined ? ack.winLine : now.winLine,
        });
      } while (flag.again);
    } finally {
      catchingUp.current = null;
    }
  }, [socket, cache, bump, setGameState]);
  sinceRef.current = () => void catchUp();

  // Loads the blocks of a rectangle that aren't loaded yet (split into requests of at most 256×256)
  const loadArea = useCallback(
    (rect: Rect) => {
      lastArea.current = rect;
      cache.touch(rect);
      const cur = gameRef.current;
      const roomId = roomIdRef.current;
      if (!cur || !roomId || !socket.connected) return;
      const requests = cache.requestsFor(rect);
      requests.forEach((req: AreaRequest) => {
        void ask<{ gameId: string; version: number; cells: { x: string; y: string; symbol: 'X' | 'O' }[] }>(socket, 'five:area', {
          roomId,
          gameId: cur.gameId,
          from: toWire({ x: req.rect.minX, y: req.rect.minY }),
          to: toWire({ x: req.rect.maxX, y: req.rect.maxY }),
        }).then(raw => {
          const ack = raw as AreaAck;
          const now = gameRef.current;
          if (ack.ok && now && ack.gameId === now.gameId) {
            cache.loaded(req, ack.cells);
            bump();
            if (ack.version > now.version) void catchUp();
            return;
          }
          cache.failed(req);
          // Try again a little later (the view may have moved on by then)
          if (!areaRetry.current) {
            areaRetry.current = setTimeout(() => {
              areaRetry.current = null;
              if (lastArea.current) loadAreaRef.current(lastArea.current);
            }, AREA_RETRY_MS);
          }
        });
      });
    },
    [socket, cache, bump, catchUp],
  );
  loadAreaRef.current = loadArea;
  useEffect(
    () => () => {
      if (areaRetry.current) clearTimeout(areaRetry.current);
    },
    [],
  );

  // Older moves, newest first (for the move list)
  const loadHistory = useCallback(
    async (beforePly?: number) => {
      const cur = gameRef.current;
      if (!cur) return { ok: false, code: 'NOT_PLAYING' } as HistoryAck;
      const ack = (await ask<{ moves: FiveMove[]; hasMore: boolean }>(socket, 'five:history', {
        roomId: roomIdRef.current,
        gameId: cur.gameId,
        beforePly,
        limit: HISTORY_PAGE,
      })) as HistoryAck;
      if (ack.ok) {
        ack.moves.forEach(m => cache.put(fromWire(m), m.symbol));
        bump();
      }
      return ack;
    },
    [socket, cache, bump],
  );

  const settle = useCallback((pending: Pending, ack: PlaceAck) => {
    if (pendingMove.current === pending) {
      pendingMove.current = null;
      setSending(false);
    }
    pending.resolve(ack);
  }, []);

  const sendPending = useCallback(async () => {
    const pending = pendingMove.current;
    if (!pending || !socket.connected) return;
    const ack = await ask<{ version: number; move?: FiveMove }>(socket, pending.event, pending.payload);
    // No answer: keep it and send the same request again after reconnecting
    if (!ack.ok && ack.code === 'NO_ANSWER') return;
    settle(pending, ack);
  }, [socket, settle]);

  const enter = useCallback(
    (roomId: string | null, id: string | null) => {
      roomIdRef.current = roomId;
      seatedRef.current = roomId !== null;
      setPlayerId(roomId ? id : null);
      const view = roomId ? (latest.current.get(roomId) ?? null) : null;
      setRoom(view);
      applySummary(view?.game ?? null);
    },
    [applySummary],
  );

  const loseSeat = useCallback(() => {
    const pending = pendingMove.current;
    if (pending) settle(pending, { ok: false, code: 'NOT_SEATED' });
    enter(null, null);
    onSeatLostRef.current();
  }, [enter, settle]);

  useEffect(() => {
    const onRoom = (view: FiveRoomView) => {
      latest.current.set(view.id, view);
      if (view.id !== roomIdRef.current) return;
      setRoom(view);
      applySummary(view.game);
    };
    const onMove = (ev: FiveMoveEvent) => {
      if (ev?.roomId === roomIdRef.current) applyMove(ev);
    };
    const onLost = (data: { roomId?: string }) => {
      if (data?.roomId && data.roomId === roomIdRef.current) loseSeat();
    };
    // Every (re)connect takes the seat back, catches up on missed moves, then retries a request
    // that never got an answer
    const onConnect = async () => {
      setConnection('online');
      const roomId = roomIdRef.current;
      if (!roomId || !seatedRef.current) return;
      const ack: SeatAck = await ask(socket, 'five:rejoin', { roomId, playerKey: getPlayerKey() });
      if (!ack.ok && (ack.code === 'NOT_SEATED' || ack.code === 'ROOM_NOT_FOUND')) {
        loseSeat();
        return;
      }
      if (ack.ok && roomIdRef.current === roomId) setPlayerId(ack.playerId);
      void catchUp();
      if (lastArea.current) loadAreaRef.current(lastArea.current);
      void sendPending();
    };
    const onDisconnect = () => setConnection('offline');
    socket.on('five:room', onRoom);
    socket.on('five:move', onMove);
    socket.on('five:seatLost', onLost);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    connectSocket();
    if (socket.connected) setConnection('online');
    return () => {
      socket.off('five:room', onRoom);
      socket.off('five:move', onMove);
      socket.off('five:seatLost', onLost);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
    };
  }, [socket, sendPending, loseSeat, applySummary, applyMove, catchUp]);

  // Leaving the page lets the seat go into its grace period
  useEffect(() => () => disconnectSocket(), []);

  // Signing in (or becoming a guest) on this page needs a fresh connection
  const connectedAs = useRef(userId);
  useEffect(() => {
    if (connectedAs.current === userId) return;
    connectedAs.current = userId;
    if (socket.connected) {
      socket.disconnect();
      socket.connect();
    }
  }, [socket, userId]);

  const create = useCallback(
    async (name: string) => {
      const ack: SeatAck = await ask(socket, 'five:create', { name, playerKey: getPlayerKey() });
      if (ack.ok) enter(ack.roomId, ack.playerId);
      return ack;
    },
    [socket, enter],
  );

  const join = useCallback(
    async (roomId: string, name: string) => {
      roomIdRef.current = roomId;
      const ack: SeatAck = await ask(socket, 'five:join', { roomId, name, playerKey: getPlayerKey() });
      if (ack.ok) enter(ack.roomId, ack.playerId);
      else enter(null, null);
      return ack;
    },
    [socket, enter],
  );

  const rejoin = useCallback(
    async (roomId: string) => {
      roomIdRef.current = roomId;
      const ack: SeatAck = await ask(socket, 'five:rejoin', { roomId, playerKey: getPlayerKey() });
      if (ack.ok) enter(ack.roomId ?? roomId, ack.playerId);
      else enter(null, null);
      return ack;
    },
    [socket, enter],
  );

  const roomAction = useCallback(
    <T = object>(event: string, payload: Record<string, unknown> = {}) => ask<T>(socket, event, { roomId: roomIdRef.current, ...payload }),
    [socket],
  );

  // One request at a time; the same request id is reused until the server answers
  const submit = useCallback(
    (event: GameEvent, payload: Record<string, unknown>) =>
      new Promise<PlaceAck>(resolve => {
        if (pendingMove.current) {
          resolve({ ok: false, code: 'BUSY' });
          return;
        }
        pendingMove.current = { event, payload: { roomId: roomIdRef.current, requestId: newRequestId(), ...payload }, resolve };
        setSending(true);
        void sendPending();
      }),
    [sendPending],
  );

  // Places our symbol. The move itself is shown at once; the turn, version and result follow the
  // five:move broadcast (or a catch-up if it never comes).
  const place = useCallback(
    async (cell: Cell) => {
      const cur = gameRef.current;
      if (!cur) return { ok: false, code: 'NOT_PLAYING' } as PlaceAck;
      const ack = await submit('five:place', { gameId: cur.gameId, version: cur.version, ...toWire(cell) });
      if (ack.ok) {
        if (ack.move) {
          cache.put(fromWire(ack.move), ack.move.symbol);
          bump();
        }
        const expected = ack.version;
        setTimeout(() => {
          const now = gameRef.current;
          if (now && now.gameId === cur.gameId && now.version < expected) void catchUp();
        }, 1500);
      } else if (ack.code === 'STALE_STATE' || ack.code === 'CELL_TAKEN' || ack.code === 'NOT_YOUR_TURN') {
        void catchUp();
      }
      return ack;
    },
    [submit, cache, bump, catchUp],
  );

  const resign = useCallback(async () => {
    const cur = gameRef.current;
    if (!cur) return { ok: false, code: 'NOT_PLAYING' } as PlaceAck;
    const ack = await submit('five:resign', { gameId: cur.gameId, version: cur.version });
    if (!ack.ok && ack.code === 'STALE_STATE') void catchUp();
    return ack;
  }, [submit, catchUp]);

  const leaveRoom = useCallback(async () => {
    const ack = await roomAction('five:leave');
    enter(null, null);
    return ack;
  }, [roomAction, enter]);

  return { socket, connection, room, playerId, sending, game, cache, cacheRev, create, join, rejoin, roomAction, place, resign, leaveRoom, loadArea, loadHistory };
}
