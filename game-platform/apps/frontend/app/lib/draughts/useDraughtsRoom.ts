'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../socket';
import { getPlayerKey } from '../playerKey';
import type { DraughtsAck, DraughtsRoomView, Square } from './types';

export type Connection = 'connecting' | 'online' | 'offline';

const ACK_TIMEOUT_MS = 8000;
const newRequestId = () => crypto.randomUUID();

// Sends an event and resolves with the server's answer, or a synthetic error when there is none
export function ask<T>(socket: Socket, event: string, payload: unknown): Promise<DraughtsAck<T>> {
  return new Promise(resolve => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, res: DraughtsAck<T>) => {
      resolve(err || !res ? ({ ok: false, code: 'NO_ANSWER' } as DraughtsAck<T>) : res);
    });
  });
}

type GameEvent = 'draughts:move' | 'draughts:resign' | 'draughts:offerDraw' | 'draughts:respondDraw';
type Pending = { event: GameEvent; payload: Record<string, unknown>; resolve: (ack: DraughtsAck<{ version: number }>) => void };
type SeatAck = DraughtsAck<{ roomId: string; playerId: string; rejoined?: boolean }>;

/**
 * Everything the draughts page needs from the server: the room everyone sees, which seat is ours,
 * the connection, and the actions. A move (or resignation, or draw offer/answer) keeps its request id
 * until the server answers, so a retry after a dropped connection can never be applied twice; only
 * one is in flight at a time (`sending`).
 */
export function useDraughtsRoom(onSeatLost: () => void, userId: string | null) {
  const [socket] = useState(() => getSocket());
  const [connection, setConnection] = useState<Connection>('connecting');
  const [room, setRoom] = useState<DraughtsRoomView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const roomIdRef = useRef<string | null>(null);
  // True only once a create, join or rejoin succeeded (roomIdRef is set earlier, while one is in flight)
  const seatedRef = useRef(false);
  // The latest view of each room, kept even before we know we're in it: the first broadcast can
  // arrive before the answer to create or join
  const latest = useRef(new Map<string, DraughtsRoomView>());
  const pendingMove = useRef<Pending | null>(null);
  const onSeatLostRef = useRef(onSeatLost);
  onSeatLostRef.current = onSeatLost;

  const settle = useCallback((pending: Pending, ack: DraughtsAck<{ version: number }>) => {
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

  const enter = useCallback((roomId: string | null, id: string | null) => {
    roomIdRef.current = roomId;
    seatedRef.current = roomId !== null;
    setPlayerId(roomId ? id : null);
    setRoom(roomId ? (latest.current.get(roomId) ?? null) : null);
  }, []);

  // The seat is gone: a request still waiting for an answer can never be played
  const loseSeat = useCallback(() => {
    const pending = pendingMove.current;
    if (pending) settle(pending, { ok: false, code: 'NOT_SEATED' });
    enter(null, null);
    onSeatLostRef.current();
  }, [enter, settle]);

  useEffect(() => {
    const onRoom = (view: DraughtsRoomView) => {
      latest.current.set(view.id, view);
      if (view.id === roomIdRef.current) setRoom(view);
    };
    const onLost = (data: { roomId?: string }) => {
      if (data?.roomId && data.roomId === roomIdRef.current) loseSeat();
    };
    // Every (re)connect takes the seat back, then retries a request that never got an answer
    const onConnect = async () => {
      setConnection('online');
      const roomId = roomIdRef.current;
      // A newcomer still asking for a seat hasn't lost one
      if (!roomId || !seatedRef.current) return;
      const ack: SeatAck = await ask(socket, 'draughts:rejoin', { roomId, playerKey: getPlayerKey() });
      if (!ack.ok && (ack.code === 'NOT_SEATED' || ack.code === 'ROOM_NOT_FOUND')) {
        loseSeat();
        return;
      }
      if (ack.ok && roomIdRef.current === roomId) setPlayerId(ack.playerId);
      void sendPending();
    };
    const onDisconnect = () => setConnection('offline');
    socket.on('draughts:room', onRoom);
    socket.on('draughts:seatLost', onLost);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    connectSocket();
    if (socket.connected) setConnection('online');
    return () => {
      socket.off('draughts:room', onRoom);
      socket.off('draughts:seatLost', onLost);
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
    async (name: string) => {
      const ack: SeatAck = await ask(socket, 'draughts:create', { name, playerKey: getPlayerKey() });
      if (ack.ok) enter(ack.roomId, ack.playerId);
      return ack;
    },
    [socket, enter],
  );

  const join = useCallback(
    async (roomId: string, name: string) => {
      roomIdRef.current = roomId;
      const ack: SeatAck = await ask(socket, 'draughts:join', { roomId, name, playerKey: getPlayerKey() });
      if (ack.ok) enter(ack.roomId, ack.playerId);
      else enter(null, null);
      return ack;
    },
    [socket, enter],
  );

  // Takes back a seat this browser already holds
  const rejoin = useCallback(
    async (roomId: string) => {
      roomIdRef.current = roomId;
      const ack: SeatAck = await ask(socket, 'draughts:rejoin', { roomId, playerKey: getPlayerKey() });
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
      new Promise<DraughtsAck<{ version: number }>>(resolve => {
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

  const move = useCallback((version: number, from: Square, path: Square[]) => submit('draughts:move', { version, from, path }), [submit]);
  const resign = useCallback((version: number) => submit('draughts:resign', { version }), [submit]);
  const offerDraw = useCallback((version: number) => submit('draughts:offerDraw', { version }), [submit]);
  const respondDraw = useCallback(
    (version: number, offerVersion: number, accept: boolean) => submit('draughts:respondDraw', { version, offerVersion, accept }),
    [submit],
  );

  const leaveRoom = useCallback(async () => {
    const ack = await roomAction('draughts:leave');
    enter(null, null);
    return ack;
  }, [roomAction, enter]);

  return { socket, connection, room, playerId, sending, create, join, rejoin, roomAction, move, resign, offerDraw, respondDraw, leaveRoom };
}
