'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../socket';
import { getPlayerKey } from '../playerKey';
import type { DominoAck, DominoPrivateView, DominoRoomView, End, Mode, TileId } from './types';

export type Connection = 'connecting' | 'online' | 'offline';

const ACK_TIMEOUT_MS = 8000;
const newRequestId = () => crypto.randomUUID();

// Sends an event and resolves with the server's answer, or a synthetic error when there is none
export function ask<T>(socket: Socket, event: string, payload: unknown): Promise<DominoAck<T>> {
  return new Promise(resolve => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, res: DominoAck<T>) => {
      resolve(err || !res ? ({ ok: false, code: 'NO_ANSWER' } as DominoAck<T>) : res);
    });
  });
}

type Pending = { event: string; payload: Record<string, unknown>; resolve: (ack: DominoAck<{ version: number }>) => void };

/**
 * Everything the Dominoes page needs from the server: the room everyone sees, this player's own
 * tiles and moves, the connection, and the actions. A move keeps its request id until the server
 * answers, so a retry after a dropped connection can never be applied twice; only one move is in
 * flight at a time (`sending`).
 */
export function useDominoesRoom(onSeatLost: () => void, userId: string | null) {
  const [socket] = useState(() => getSocket());
  const [connection, setConnection] = useState<Connection>('connecting');
  const [room, setRoom] = useState<DominoRoomView | null>(null);
  const [mine, setMine] = useState<DominoPrivateView | null>(null);
  const [sending, setSending] = useState(false);
  const roomIdRef = useRef<string | null>(null);
  // True only once a join or rejoin succeeded (roomIdRef is set earlier, while one is in flight)
  const seatedRef = useRef(false);
  // The latest views of each room, kept even before we know we're in it: the first broadcast can
  // arrive before the answer to create or join
  const latest = useRef(new Map<string, { room?: DominoRoomView; mine?: DominoPrivateView }>());
  const pendingMove = useRef<Pending | null>(null);
  const onSeatLostRef = useRef(onSeatLost);
  onSeatLostRef.current = onSeatLost;

  const settle = useCallback((pending: Pending, ack: DominoAck<{ version: number }>) => {
    if (pendingMove.current === pending) {
      pendingMove.current = null;
      setSending(false);
    }
    pending.resolve(ack);
  }, []);

  const sendPending = useCallback(async () => {
    const pending = pendingMove.current;
    if (!pending || !socket.connected) return;
    const ack = await ask<{ version: number }>(socket, pending.event, pending.payload);
    // No answer: keep it and send the same request again after reconnecting
    if (!ack.ok && ack.code === 'NO_ANSWER') return;
    settle(pending, ack);
  }, [socket, settle]);

  const enter = useCallback((roomId: string | null) => {
    roomIdRef.current = roomId;
    seatedRef.current = roomId !== null;
    const known = roomId ? latest.current.get(roomId) : undefined;
    setRoom(known?.room ?? null);
    setMine(known?.mine ?? null);
  }, []);

  // The seat is gone: a move still waiting for an answer can never be played
  const loseSeat = useCallback(() => {
    const pending = pendingMove.current;
    if (pending) settle(pending, { ok: false, code: 'NOT_SEATED' });
    enter(null);
    onSeatLostRef.current();
  }, [enter, settle]);

  useEffect(() => {
    const onRoom = (view: DominoRoomView) => {
      latest.current.set(view.id, { ...latest.current.get(view.id), room: view });
      if (view.id === roomIdRef.current) setRoom(view);
    };
    const onPrivate = (view: DominoPrivateView) => {
      latest.current.set(view.roomId, { ...latest.current.get(view.roomId), mine: view });
      if (view.roomId === roomIdRef.current) setMine(view);
    };
    const onLost = (data: { roomId?: string }) => {
      if (data?.roomId && data.roomId === roomIdRef.current) loseSeat();
    };
    // Every (re)connect takes the seat back, then retries a move that never got an answer
    const onConnect = async () => {
      setConnection('online');
      const roomId = roomIdRef.current;
      // A newcomer still asking for a seat hasn't lost one
      if (!roomId || !seatedRef.current) return;
      const ack = await ask(socket, 'dominoes:rejoin', { roomId, playerKey: getPlayerKey() });
      if (!ack.ok && (ack.code === 'NOT_SEATED' || ack.code === 'ROOM_NOT_FOUND')) {
        loseSeat();
        return;
      }
      void sendPending();
    };
    const onDisconnect = () => setConnection('offline');
    socket.on('dominoes:room', onRoom);
    socket.on('dominoes:private', onPrivate);
    socket.on('dominoes:seatLost', onLost);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    connectSocket();
    if (socket.connected) setConnection('online');
    return () => {
      socket.off('dominoes:room', onRoom);
      socket.off('dominoes:private', onPrivate);
      socket.off('dominoes:seatLost', onLost);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
    };
  }, [socket, sendPending, loseSeat]);

  // Leaving the page lets the seat go into its grace period
  useEffect(() => () => disconnectSocket(), []);

  // The server reads who we are from the session cookie when the socket connects, so signing in
  // (or becoming a guest) on this page needs a fresh connection
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
    async (name: string, mode: Mode, targetScore: number) => {
      const ack = await ask<{ roomId: string; playerId: string }>(socket, 'dominoes:create', { name, mode, targetScore, playerKey: getPlayerKey() });
      if (ack.ok) enter(ack.roomId);
      return ack;
    },
    [socket, enter],
  );

  const join = useCallback(
    async (roomId: string, name: string) => {
      roomIdRef.current = roomId;
      const ack = await ask<{ roomId: string; playerId: string; rejoined: boolean }>(socket, 'dominoes:join', { roomId, name, playerKey: getPlayerKey() });
      enter(ack.ok ? ack.roomId : null);
      return ack;
    },
    [socket, enter],
  );

  // Takes back a seat this browser already holds
  const rejoin = useCallback(
    async (roomId: string) => {
      roomIdRef.current = roomId;
      const ack = await ask<{ roomId: string; playerId: string; rejoined: boolean }>(socket, 'dominoes:rejoin', { roomId, playerKey: getPlayerKey() });
      enter(ack.ok ? roomId : null);
      return ack;
    },
    [socket, enter],
  );

  const roomAction = useCallback(
    <T = object>(event: string, payload: Record<string, unknown> = {}) => ask<T>(socket, event, { roomId: roomIdRef.current, ...payload }),
    [socket],
  );

  // One move at a time; the same request id is reused until the server answers
  const submit = useCallback(
    (event: 'dominoes:play' | 'dominoes:pass', payload: Record<string, unknown>) =>
      new Promise<DominoAck<{ version: number }>>(resolve => {
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

  const play = useCallback((version: number, tile: TileId, end: End | null) => submit('dominoes:play', { version, tile, end }), [submit]);
  const pass = useCallback((version: number) => submit('dominoes:pass', { version }), [submit]);

  const leaveRoom = useCallback(async () => {
    const ack = await roomAction('dominoes:leave');
    enter(null);
    return ack;
  }, [roomAction, enter]);

  return { socket, connection, room, mine, sending, enter, create, join, rejoin, roomAction, play, pass, leaveRoom };
}
