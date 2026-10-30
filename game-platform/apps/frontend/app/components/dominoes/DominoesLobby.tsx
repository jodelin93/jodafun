'use client';

import { useEffect, useState } from 'react';
import OnlineInvites from '../ui/OnlineInvites';
import type { Socket } from 'socket.io-client';
import { Check, Copy, Crown, LogOut, Play } from 'lucide-react';
import ShareRoomButton from '../ShareRoomButton';
import { TARGETS, type DominoAck, type DominoRoomView, type PublicDominoSeat } from '../../lib/dominoes/types';
import { countdown } from '../../lib/dominoes/describe';
import { useT } from '../../i18n/I18nProvider';
import { dominoesMessages } from '../../i18n/messages/dominoes';

type Props = {
  room: DominoRoomView;
  myPlayerId: string | null;
  socket: Socket;
  onAction: (event: string, payload?: Record<string, unknown>) => Promise<DominoAck>;
  onLeave: () => void;
  errorText: (code: string) => string;
};

// Seats (partners opposite, in team colours), readiness and the target before a match. The host
// chooses the target and starts once every seat is filled, connected and ready.
export default function DominoesLobby({ room, myPlayerId, socket, onAction, onLeave, errorText }: Props) {
  const t = useT(dominoesMessages);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const me = room.seats.find(s => s.player?.id === myPlayerId)?.player ?? null;
  const isHost = !!me?.isHost;
  const missing = room.seats.filter(s => !s.player).length;
  const allSet = room.seats.every(s => s.player && s.player.connected && s.player.isReady);
  const partners = room.capacity === 4;
  const url = typeof window !== 'undefined' ? `${window.location.origin}/games/dominoes?roomId=${room.id}` : '';

  const anyAway = room.seats.some(s => s.player && !s.player.connected && s.player.graceEndsAt);
  useEffect(() => {
    if (!anyAway) return;
    setNow(Date.now()); // the clock may be stale from before anyone was away
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyAway]);

  const run = async (event: string, payload?: Record<string, unknown>) => {
    setError(null);
    const ack = await onAction(event, payload);
    if (!ack.ok) setError(errorText(ack.code));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen
    }
  };

  const seatRow = (s: PublicDominoSeat) => (
    <li
      key={s.seat}
      className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl p-3 ring-1 ring-inset ${
        s.team === 0 ? 'bg-table ring-gold/50' : 'bg-felt-deep ring-sky-300/40'
      }`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs text-chalk">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${s.team === 0 ? 'bg-gold' : 'bg-sky-300'}`} />
          {t('seatN', { n: s.seat + 1 })}
          {partners && <> · {s.team === 0 ? t('teamA') : t('teamB')}</>}
        </span>
        {s.player ? (
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{s.player.id === myPlayerId ? `${s.player.name} (${t('you')})` : s.player.name}</span>
            {s.player.isHost && <Crown className="h-4 w-4 shrink-0 text-gold" aria-label={t('host')} />}
          </span>
        ) : (
          <span className="text-chalk">{t('emptySeat')}</span>
        )}
      </span>
      {s.player ? (
        <span className={`chip shrink-0 px-2.5 py-0.5 text-xs ${s.player.isReady && s.player.connected ? 'bg-gold/10 text-white ring-gold' : ''}`}>
          {!s.player.connected
            ? s.player.graceEndsAt
              ? t('awayCountdown', { time: countdown(s.player.graceEndsAt - now) })
              : t('away')
            : s.player.isReady
              ? t('ready')
              : t('notReady')}
        </span>
      ) : (
        <button type="button" onClick={() => run('dominoes:chooseSeat', { seat: s.seat })} className="btn-quiet btn-sm min-h-11 shrink-0">
          {t('sitHere')}
        </button>
      )}
    </li>
  );

  const targets = TARGETS.includes(room.targetScore) ? TARGETS : [...TARGETS, room.targetScore].sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-chalk">{t('roomCode')}</p>
          <p className="font-display text-3xl font-extrabold tracking-[0.15em]">{room.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="btn-quiet btn-sm min-h-11">
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? t('linkCopied') : t('copyLink')}
          </button>
          <ShareRoomButton url={url} code={room.id} onCopy={copy} game="dominoes" />
        </div>
      </div>

      <section aria-labelledby="seats-title">
        <h2 id="seats-title" className="title-md">
          {partners ? t('modePartners') : t('modeHeadToHead')}
        </h2>
        <p className="mt-1 text-sm text-chalk">{partners ? t('partnersHint') : t('headToHeadHint')}</p>
        {partners ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[0, 1].map(team => (
              <div key={team}>
                <h3 className="mb-2 text-sm font-semibold">{team === 0 ? t('teamASeats') : t('teamBSeats')}</h3>
                <ul className="grid gap-2">{room.seats.filter(s => s.team === team).map(seatRow)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{room.seats.map(seatRow)}</ul>
        )}
      </section>

      <div className="panel space-y-4 p-4">
        <div>
          <label htmlFor="dominoes-target" className="field-label">
            {t('targetLabel')}
          </label>
          <select
            id="dominoes-target"
            className="field"
            value={room.targetScore}
            disabled={!isHost}
            onChange={e => run('dominoes:setTarget', { targetScore: Number(e.target.value) })}
          >
            {targets.map(n => (
              <option key={n} value={n}>
                {t('targetPoints', { n })}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-chalk">{isHost ? t('targetFixedNote') : t('onlyHostTarget')}</p>
        </div>
        <p role="status" className="text-sm text-chalk">
          {missing > 0
            ? missing === 1
              ? t('waitingOne')
              : t('waitingOther', { n: missing })
            : !allSet
              ? t('waitingReady')
              : isHost
                ? t('everyoneReadyHost')
                : t('everyoneReadyGuest')}
        </p>
        {error && (
          <p role="alert" className="text-sm text-white">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run('dominoes:ready', { ready: !me?.isReady })} className={me?.isReady ? 'btn-quiet min-h-11' : 'btn-gold min-h-11'}>
            {me?.isReady ? t('notReadyYet') : t('imReady')}
          </button>
          {isHost && (
            <button type="button" onClick={() => run('dominoes:start')} disabled={!allSet} className="btn-gold min-h-11">
              <Play className="h-4 w-4" aria-hidden="true" />
              {t('startMatch')}
            </button>
          )}
          <button type="button" onClick={onLeave} className="btn-quiet min-h-11">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('leaveRoom')}
          </button>
        </div>
      </div>

      {missing > 0 && <OnlineInvites socket={socket} game="dominoes" roomId={room.id} />}
    </div>
  );
}
