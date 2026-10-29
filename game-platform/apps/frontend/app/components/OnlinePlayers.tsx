'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ArrowLeft, Clock, Users, X } from 'lucide-react';
import { useT } from '../i18n/I18nProvider';
import { gameMessages } from '../i18n/messages/game';
import { alternateMessages } from '../i18n/messages/alternate';

export type OnlinePlayer = { id: string; name: string; isGuest: boolean; since: number };

// The room the server creates when a request is accepted (same shape as a rejoin answer's room)
export type InviteRoom = {
  id: string;
  mode?: 'classic' | 'alternate';
  alt?: null;
  players: { id: string; name: string; isHost: boolean; isReady: boolean; socketId: string; score: number }[];
  difficulty: 'easy' | 'medium' | 'hard';
  showOpponentMoves: boolean;
  gameStarted: boolean;
};

type Outgoing =
  | { status: 'waiting'; inviteId: string; toName: string; expiresAt: number }
  | { status: 'declined' | 'expired'; inviteId: string; toName: string };

type Props = {
  socket: Socket | null;
  name: string;
  onNameChange: (name: string) => void;
  playerKey: string;
  difficulty: 'easy' | 'medium' | 'hard';
  onBack: () => void;
  onRoomReady: (room: InviteRoom) => void;
};

// Lists players who have Joda Memory open and aren't in a room, and sends them game requests
export default function OnlinePlayers({ socket, name, onNameChange, playerKey, difficulty, onBack, onRoomReady }: Props) {
  const t = useT(gameMessages);
  const ta = useT(alternateMessages);
  const [players, setPlayers] = useState<OnlinePlayer[] | null>(null);
  // The kind of game a request asks for: turns on one board, or "Play alternate"
  const [mode, setMode] = useState<'classic' | 'alternate'>('classic');
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null);
  // The server's error text and who the request was for; translated when shown
  const [sendError, setSendError] = useState<{ name: string; error?: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Keep the list fresh: on open, whenever the server says it changed, after reconnects, and as a fallback every 15s
  useEffect(() => {
    if (!socket) return;
    const load = () => socket.emit('presence:list', {}, (res: { players?: OnlinePlayer[] }) => setPlayers(res?.players ?? []));
    load();
    socket.on('presence:changed', load);
    socket.on('connect', load);
    const timer = setInterval(load, 15000);
    return () => {
      socket.off('presence:changed', load);
      socket.off('connect', load);
      clearInterval(timer);
    };
  }, [socket]);

  // Answers to the request we sent
  useEffect(() => {
    if (!socket) return;
    const declined = (d: { inviteId: string }) =>
      setOutgoing(o => (o && o.inviteId === d.inviteId ? { status: 'declined', inviteId: o.inviteId, toName: o.toName } : o));
    const expired = (d: { inviteId: string }) =>
      setOutgoing(o => (o && o.inviteId === d.inviteId && o.status === 'waiting' ? { status: 'expired', inviteId: o.inviteId, toName: o.toName } : o));
    const accepted = (d: { inviteId: string; room: InviteRoom }) => {
      setOutgoing(null);
      onRoomReady(d.room);
    };
    socket.on('invite:declined', declined);
    socket.on('invite:expired', expired);
    socket.on('invite:accepted', accepted);
    return () => {
      socket.off('invite:declined', declined);
      socket.off('invite:expired', expired);
      socket.off('invite:accepted', accepted);
    };
  }, [socket, onRoomReady]);

  // Countdown while a request is waiting
  useEffect(() => {
    if (outgoing?.status !== 'waiting') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [outgoing?.status]);

  const sendRequest = (player: OnlinePlayer) => {
    if (!socket) return;
    setSendError(null);
    socket.emit(
      'invite:send',
      { toId: player.id, playerKey, difficulty, mode },
      (res: { success: boolean; inviteId?: string; expiresAt?: number; error?: string }) => {
        if (!res?.success || !res.inviteId) {
          setSendError({ name: player.name, error: res?.error });
          return;
        }
        setNow(Date.now());
        setOutgoing({ status: 'waiting', inviteId: res.inviteId, toName: player.name, expiresAt: res.expiresAt ?? Date.now() + 30000 });
      },
    );
  };

  const cancelRequest = () => {
    if (!socket || outgoing?.status !== 'waiting') return;
    socket.emit('invite:cancel', { inviteId: outgoing.inviteId }, () => {});
    setOutgoing(null);
  };

  // Known server errors in the visitor's language; anything else as sent
  const sendErrorText = (e: { name: string; error?: string }) =>
    e.error === 'Player not available'
      ? t('notAvailable', { name: e.name })
      : e.error === 'You are already in a room'
        ? t('errAlreadyInRoom')
        : e.error === 'You already have a pending request'
          ? t('errPendingRequest')
          : e.error === 'They already have a request'
            ? t('errTheyHaveRequest')
            : e.error === 'Too many requests'
              ? t('errTooMany')
              : e.error ?? t('sendFailed');

  // Splits a "{name} …" message so the name keeps its emphasis
  const [waitBefore, waitAfter = ''] = t('waitingAnswer').split('{name}');
  const [declinedBefore, declinedAfter = ''] = t('declinedRequest').split('{name}');
  const [noAnswerBefore, noAnswerAfter = ''] = t('noAnswer').split('{name}');

  const secondsLeft = outgoing?.status === 'waiting' ? Math.max(0, Math.ceil((outgoing.expiresAt - now) / 1000)) : 0;

  return (
    <section aria-labelledby="online-title" className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="online-title" className="title-md">{t('playersOnline')}</h2>
        <button type="button" onClick={onBack} className="btn-quiet btn-sm min-h-11">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('back')}
        </button>
      </div>
      <p className="text-chalk">{t('onlineIntro')}</p>

      <div className="panel p-5">
        <label htmlFor="online-name" className="field-label">
          {t('onlineNameLabel')}
        </label>
        <input
          id="online-name"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          placeholder={t('chooseNamePlaceholder')}
          className="field"
        />
      </div>

      <div className="panel p-5">
        <p id="online-mode-label" className="field-label">{ta('gameTypeLabel')}</p>
        <div
          role="group"
          aria-labelledby="online-mode-label"
          className="grid grid-cols-2 gap-1 rounded-2xl bg-felt-deep p-1 ring-1 ring-inset ring-table-rim"
        >
          {([
            ['classic', t('playFriend')],
            ['alternate', ta('playAlternate')],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              disabled={outgoing?.status === 'waiting'}
              className={`min-h-11 rounded-xl px-2 py-2 font-semibold transition ${
                mode === value ? 'bg-card text-ink shadow-rest' : 'text-chalk hover:bg-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-chalk">{mode === 'alternate' ? ta('playAlternateDesc') : t('playFriendDesc')}</p>
      </div>

      {outgoing && (
        <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-2xl bg-felt-deep p-4 ring-1 ring-inset ring-gold/40">
          <p className="text-sm text-chalk">
            {outgoing.status === 'waiting' && (
              <>
                <Clock className="mr-1.5 inline h-4 w-4 align-[-2px] text-gold" aria-hidden="true" />
                {waitBefore}
                <span className="font-semibold text-white">{outgoing.toName}</span>
                {waitAfter.replace('{seconds}', String(secondsLeft))}
              </>
            )}
            {outgoing.status === 'declined' && (
              <>
                {declinedBefore}
                <span className="font-semibold text-white">{outgoing.toName}</span>
                {declinedAfter}
              </>
            )}
            {outgoing.status === 'expired' && (
              <>
                {noAnswerBefore}
                <span className="font-semibold text-white">{outgoing.toName}</span>
                {noAnswerAfter}
              </>
            )}
          </p>
          {outgoing.status === 'waiting' ? (
            <button type="button" onClick={cancelRequest} className="btn-quiet btn-sm min-h-11 shrink-0">
              {t('cancel')}
            </button>
          ) : (
            <button type="button" onClick={() => setOutgoing(null)} className="btn btn-sm min-h-11 shrink-0 text-chalk hover:text-white" aria-label={t('dismiss')}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {sendError && (
        <p role="alert" className="text-sm text-white">
          {sendErrorText(sendError)}
        </p>
      )}

      {players === null ? (
        <div className="panel p-5 text-chalk" role="status">
          {t('lookingForPlayers')}
        </div>
      ) : players.length === 0 ? (
        <div className="panel p-5">
          <Users className="h-8 w-8 text-chalk" strokeWidth={1.5} aria-hidden="true" />
          <p className="mt-3 font-semibold">{t('nobodyOnline')}</p>
          <p className="mt-1 text-sm text-chalk">
            {t('nobodyOnlineHint')}
          </p>
        </div>
      ) : (
        <ul className="panel divide-y divide-table-rim overflow-hidden" aria-label={t('playersOnline')}>
          {players.map(player => (
            <li key={player.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate font-semibold">{player.name}</p>
                {player.isGuest && <span className="chip mt-1 px-2 py-0.5 text-xs">{t('guest')}</span>}
              </div>
              <button
                type="button"
                onClick={() => sendRequest(player)}
                disabled={outgoing?.status === 'waiting'}
                className="btn-gold btn-sm min-h-11 shrink-0"
              >
                {t('requestGame')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
