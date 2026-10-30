'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../socket';
import { getPlayerKey } from '../playerKey';
import type { CasinoAck, CasinoPrivateView, CasinoRoomView, RuleError, TurnAction, TurnProposal } from './types';

export type Connection = 'connecting' | 'online' | 'offline';

const ACK_TIMEOUT_MS = 8000;
const newRequestId = () => crypto.randomUUID();

// Sends an event and resolves with the server's answer, or a synthetic error when there is none
function ask<T>(socket: Socket, event: string, payload: unknown): Promise<CasinoAck<T>> {
  return new Promise(resolve => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, res: CasinoAck<T>) => {
      resolve(err || !res ? ({ ok: false, code: 'NO_ANSWER' } as CasinoAck<T>) : res);
    });
  });
}

/**
 * Everything the Casino page needs from the server: the room everyone sees, this player's own hand,
 * the connection, and the actions. A turn keeps its request id until the server answers, so a
 * retry after a dropped connection can never be applied twice.
 */
export function useCasinoRoom(onSeatLost: () => void, userId: string | null) {
  const [socket] = useState(() => getSocket());
  const [connection, setConnection] = useState<Connection>('connecting');
  const [room, setRoom] = useState<CasinoRoomView | null>(null);
  const [mine, setMine] = useState<CasinoPrivateView | null>(null);
  const roomIdRef = useRef<string | null>(null);
  // True only once a join or rejoin succeeded (roomIdRef is set earlier, while one is in flight)
  const seatedRef = useRef(false);
  // The latest views of each room, kept even before we know we're in it: the first broadcast can
  // arrive before the answer to create or join
  const latest = useRef(new Map<string, { room?: CasinoRoomView; mine?: CasinoPrivateView }>());
  const pendingTurn = useRef<{ event: string; payload: Record<string, unknown>; resolve: (ack: CasinoAck<{ version: number }>) => void } | null>(null);
  const onSeatLostRef = useRef(onSeatLost);
  onSeatLostRef.current = onSeatLost;

  const sendPending = useCallback(async () => {
    const pending = pendingTurn.current;
    if (!pending || !socket.connected) return;
    const ack = await ask<{ version: number }>(socket, pending.event, pending.payload);
    // No answer: keep it and send the same request again after reconnecting
    if (!ack.ok && ack.code === 'NO_ANSWER') return;
    if (pendingTurn.current === pending) pendingTurn.current = null;
    pending.resolve(ack);
  }, [socket]);

  useEffect(() => {
    const onRoom = (view: CasinoRoomView) => {
      latest.current.set(view.id, { ...latest.current.get(view.id), room: view });
      if (view.id === roomIdRef.current) setRoom(view);
    };
    const onPrivate = (view: CasinoPrivateView) => {
      latest.current.set(view.roomId, { ...latest.current.get(view.roomId), mine: view });
      if (view.roomId === roomIdRef.current) setMine(view);
    };
    // Every (re)connect takes the seat back, then retries a turn that never got an answer
    const onConnect = async () => {
      setConnection('online');
      const roomId = roomIdRef.current;
      // A newcomer still asking for a seat hasn't lost one
      if (!roomId || !seatedRef.current) return;
      const ack = await ask(socket, 'casino:rejoin', { roomId, playerKey: getPlayerKey() });
      if (!ack.ok && (ack.code === 'NOT_SEATED' || ack.code === 'ROOM_NOT_FOUND')) {
        onSeatLostRef.current();
        return;
      }
      void sendPending();
    };
    const onDisconnect = () => setConnection('offline');
    socket.on('casino:room', onRoom);
    socket.on('casino:private', onPrivate);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    connectSocket();
    if (socket.connected) setConnection('online');
    return () => {
      socket.off('casino:room', onRoom);
      socket.off('casino:private', onPrivate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
    };
  }, [socket, sendPending]);

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

  const enter = useCallback((roomId: string | null) => {
    roomIdRef.current = roomId;
    seatedRef.current = roomId !== null;
    const known = roomId ? latest.current.get(roomId) : undefined;
    setRoom(known?.room ?? null);
    setMine(known?.mine ?? null);
  }, []);

  const create = useCallback(
    async (name: string, players: 2 | 4, targetPoints: number) => {
      const ack = await ask<{ roomId: string; playerId: string }>(socket, 'casino:create', { name, players, targetPoints, playerKey: getPlayerKey() });
      if (ack.ok) enter(ack.roomId);
      return ack;
    },
    [socket, enter],
  );

  const join = useCallback(
    async (roomId: string, name: string) => {
      roomIdRef.current = roomId;
      const ack = await ask<{ roomId: string; playerId: string }>(socket, 'casino:join', { roomId, name, playerKey: getPlayerKey() });
      enter(ack.ok ? ack.roomId : null);
      return ack;
    },
    [socket, enter],
  );

  // Takes back a seat this browser already holds; true when it did
  const rejoin = useCallback(
    async (roomId: string) => {
      roomIdRef.current = roomId;
      const ack = await ask(socket, 'casino:rejoin', { roomId, playerKey: getPlayerKey() });
      enter(ack.ok ? roomId : null);
      return ack;
    },
    [socket, enter],
  );

  const roomAction = useCallback(
    <T = object>(event: string, payload: Record<string, unknown> = {}) => ask<T>(socket, event, { roomId: roomIdRef.current, ...payload }),
    [socket],
  );

  // One submission at a time; the same request id is reused until the server answers
  const submit = useCallback(
    (event: 'casino:submitTurn' | 'casino:takeFromPile', payload: Record<string, unknown>) =>
      new Promise<CasinoAck<{ version: number }>>(resolve => {
        if (pendingTurn.current) {
          resolve({ ok: false, code: 'BUSY' });
          return;
        }
        pendingTurn.current = { event, payload: { roomId: roomIdRef.current, requestId: newRequestId(), ...payload }, resolve };
        void sendPending();
      }),
    [sendPending],
  );

  const submitTurn = useCallback((version: number, turn: TurnProposal) => submit('casino:submitTurn', { version, turn }), [submit]);
  const takeFromPile = useCallback((version: number, action: TurnAction) => submit('casino:takeFromPile', { version, action }), [submit]);
  const preview = useCallback(
    (version: number, turn: TurnProposal) => roomAction<{ valid: boolean; error?: RuleError }>('casino:previewTurn', { version, turn }),
    [roomAction],
  );

  return {
    socket,
    connection,
    room,
    mine,
    enter,
    create,
    join,
    rejoin,
    roomAction,
    submitTurn,
    takeFromPile,
    preview,
    leaveRoom: async () => {
      const ack = await roomAction('casino:leave');
      enter(null);
      return ack;
    },
  };
}
