'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, GraduationCap, Spade, Swords } from 'lucide-react';
import SiteHeader from '../ui/SiteHeader';
import SiteFooter from '../ui/SiteFooter';
import Loading from '../ui/Loading';
import { useAuth } from '../../contexts/AuthContext';
import { useGuestPlay } from '../../lib/useGuestPlay';
import { clearCurrentRoom, saveCurrentRoom } from '../../lib/currentRoom';
import { getPlayerKey } from '../../lib/playerKey';
import { useCasinoRoom } from '../../lib/casino/useCasinoRoom';
import { teamOfSeat, type TurnAction, type TurnProposal } from '../../lib/casino/types';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';
import CasinoLobby from './CasinoLobby';
import CasinoTable, { type SeatInfo } from './CasinoTable';
import CasinoResults from './CasinoResults';
import CasinoRules from './CasinoRules';
import CasinoTutorial from './CasinoTutorial';

type Screen = 'menu' | 'rules' | 'tutorial';
type Invite = { inviteId: string; fromName: string; game: 'joda-memory' | 'african-casino'; capacity?: number; expiresAt: number };

const isDefaultGuestName = (name: string | null | undefined) => !name || /^Guest [0-9a-f]{8}$/i.test(name);
const ROOM_HOLD_MS = 5 * 60 * 1000;

// Joda Casino: menu, joining by code or link, lobby, table, results, rules and tutorial
export default function AfricanCasino() {
  const t = useT(casinoMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isPending } = useAuth();
  const { play: startAsGuest, loading: guestLoading, error: guestError } = useGuestPlay();
  const [screen, setScreen] = useState<Screen>('menu');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState<2 | 4>(2);
  const [target, setTarget] = useState(21);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkRoom, setLinkRoom] = useState<string | null>(null); // a room from the URL we have no seat in yet
  const [restoring, setRestoring] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const errorText = useCallback(
    (codeName: string) => {
      const text = tx(`err_${codeName}`);
      return text === `err_${codeName}` ? tx('errUnknown', { code: codeName }) : text;
    },
    [tx],
  );

  const setUrlRoom = useCallback((roomId: string | null) => {
    const url = new URL(window.location.href);
    if (roomId) url.searchParams.set('roomId', roomId);
    else url.searchParams.delete('roomId');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const onSeatLost = useCallback(() => {
    clearCurrentRoom();
    setUrlRoom(null);
    setError(tx('err_NOT_SEATED'));
  }, [setUrlRoom, tx]);

  const casino = useCasinoRoom(onSeatLost, user?.id ?? null);
  const { room, mine, connection, socket } = casino;
  const inRoom = !!room && !!mine;

  // The account's chosen name, but not an auto-generated guest one
  useEffect(() => {
    if (user && !name && !isDefaultGuestName(user.name)) setName(user.name);
  }, [user, name]);

  // Opening a room link: take back our seat if we have one, otherwise offer to join it
  const urlRoom = searchParams?.get('roomId')?.toUpperCase() ?? null;
  useEffect(() => {
    if (!user || !urlRoom || room?.id === urlRoom || connection !== 'online') return;
    let live = true;
    setRestoring(true);
    void casino.rejoin(urlRoom).then(ack => {
      if (!live) return;
      setRestoring(false);
      if (!ack.ok) {
        if (ack.code === 'ROOM_NOT_FOUND') {
          setError(errorText('ROOM_NOT_FOUND'));
          setUrlRoom(null);
        } else setLinkRoom(urlRoom);
      }
    });
    return () => {
      live = false;
    };
  }, [user, urlRoom, connection]); // eslint-disable-line react-hooks/exhaustive-deps

  // While seated, remember the room so the header can offer a way back
  useEffect(() => {
    if (!room || !inRoom) return;
    const hold = room.status === 'playing' ? 3 * 60 * 1000 : ROOM_HOLD_MS;
    saveCurrentRoom(room.id, hold, 'african-casino');
    const refresh = setInterval(() => saveCurrentRoom(room.id, hold, 'african-casino'), 20000);
    return () => clearInterval(refresh);
  }, [room?.id, room?.status, inRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listed as online (so others can invite us) whenever we're on this page and not seated
  useEffect(() => {
    if (!user) return;
    const send = () => socket.emit('presence:update', { available: !inRoom, name: name.trim() || undefined, playerKey: getPlayerKey() }, () => {});
    const timer = setTimeout(() => socket.connected && send(), 400);
    socket.on('connect', send);
    return () => {
      clearTimeout(timer);
      socket.off('connect', send);
    };
  }, [socket, user, inRoom, name]);

  // Requests from other players, for either game
  useEffect(() => {
    const received = (d: { inviteId: string; from?: { name?: string }; game?: string; capacity?: number; expiresAt: number }) => {
      setNow(Date.now());
      setInvite({ inviteId: d.inviteId, fromName: d.from?.name ?? '', game: d.game === 'african-casino' ? 'african-casino' : 'joda-memory', capacity: d.capacity, expiresAt: d.expiresAt });
    };
    const drop = (d: { inviteId: string }) => setInvite(i => (i?.inviteId === d.inviteId ? null : i));
    socket.on('invite:received', received);
    socket.on('invite:cancelled', drop);
    socket.on('invite:expired', drop);
    return () => {
      socket.off('invite:received', received);
      socket.off('invite:cancelled', drop);
      socket.off('invite:expired', drop);
    };
  }, [socket]);
  useEffect(() => {
    if (!invite) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [invite]);

  const answerInvite = (accept: boolean) => {
    if (!invite) return;
    const current = invite;
    setInvite(null);
    socket.emit('invite:respond', { inviteId: current.inviteId, accept, playerKey: getPlayerKey() }, (res: { success: boolean; game?: string; roomId?: string; room?: { id: string } }) => {
      if (!accept || !res?.success) return;
      if (res.game === 'african-casino' && res.roomId) {
        setUrlRoom(res.roomId);
        void casino.rejoin(res.roomId);
      } else if (res.room) {
        router.push(`/games/joda-memory?roomId=${res.room.id}`);
      }
    });
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const ack = await casino.create(name.trim(), players, target);
    setBusy(false);
    if (ack.ok) setUrlRoom(ack.roomId);
    else setError(errorText(ack.code));
  };

  const join = async (roomId: string) => {
    const codeName = roomId.trim().toUpperCase();
    if (!codeName) return;
    setBusy(true);
    setError(null);
    const ack = await casino.join(codeName, name.trim());
    setBusy(false);
    if (ack.ok) {
      setUrlRoom(ack.roomId);
      setLinkRoom(null);
    } else setError(errorText(ack.code));
  };

  const leave = async () => {
    await casino.leaveRoom();
    clearCurrentRoom();
    setUrlRoom(null);
    setLinkRoom(null);
  };

  // Turn handlers for the live table
  const version = room?.match?.version ?? 0;
  const preview = useCallback(
    async (actions: TurnAction[]) => {
      const ack = await casino.preview(version, { actions });
      if (!ack.ok) return ack.code === 'STALE_STATE' ? null : { valid: false, error: { code: ack.code, params: ack.params } };
      return { valid: ack.valid, error: ack.error };
    },
    [casino, version],
  );
  const playTurn = async (actions: TurnAction[]) => {
    const ack = await casino.submitTurn(version, { actions });
    return ack.ok ? { ok: true } : { ok: false, error: { code: ack.code, params: ack.params } };
  };
  const take = async (action: TurnAction) => {
    const ack = await casino.takeFromPile(version, action);
    return ack.ok ? { ok: true } : { ok: false, error: { code: ack.code, params: ack.params } };
  };
  const hint = async () => {
    const ack = await casino.roomAction<{ turn: TurnProposal | null }>('casino:hint');
    return ack.ok ? ack.turn : null;
  };
  const hold = async (value: number) => {
    const ack = await casino.roomAction('casino:hold', { value });
    return ack.ok ? { ok: true } : { ok: false, error: { code: ack.code, params: ack.params } };
  };

  const seats: SeatInfo[] = useMemo(
    () => (room?.seats ?? []).flatMap(s => (s.player ? [{ seat: s.seat, name: s.player.name, connected: s.player.connected }] : [])),
    [room],
  );
  const away = seats.filter(s => !s.connected && s.seat !== mine?.seat);
  const connectionNote =
    connection === 'offline' ? t('offline') : away.length > 0 ? away.map(s => t('playerAway', { name: s.name })).join(' ') : null;

  const teamNames = room
    ? [0, 1].map(tm => {
        const members = room.seats.filter(s => s.team === tm && s.player).map(s => (s.seat === mine?.seat ? t('you') : s.player!.name));
        return members.join(' & ') || (tm === 0 ? t('teamA') : t('teamB'));
      })
    : [];

  let content: React.ReactNode;
  if (isPending) {
    content = <Loading />;
  } else if (!user) {
    content = (
      <div className="panel max-w-xl p-5 sm:p-6">
        <h1 className="title-lg">{t('title')}</h1>
        <p className="mt-2 text-chalk">{t('tagline')}</p>
        <p className="mt-3 text-chalk">{t('err_AUTH_REQUIRED')}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-gold" disabled={guestLoading} onClick={() => startAsGuest(window.location.pathname + window.location.search)}>
            {guestLoading ? t('guestStarting') : t('playAsGuest')}
          </button>
          <Link href="/login" className="btn-quiet">
            {t('signIn')}
          </Link>
        </div>
        {guestError && (
          <p role="alert" className="mt-3 text-sm">
            {guestError}
          </p>
        )}
      </div>
    );
  } else if (screen === 'rules') {
    content = <CasinoRules onBack={() => setScreen('menu')} />;
  } else if (screen === 'tutorial') {
    content = <CasinoTutorial socket={socket} onBack={() => setScreen('menu')} />;
  } else if (room && mine && room.status === 'lobby') {
    content = (
      <>
        <h1 className="title-lg mb-4">{t('title')}</h1>
        {room.outcome && (
          <p className="mb-4 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">
            {room.outcome.forfeit && (room.outcome.winnerTeam === teamOfSeat(room.capacity, mine.seat) ? t('forfeitWin') : t('forfeitLoss'))}
          </p>
        )}
        <CasinoLobby room={room} myPlayerId={mine.playerId} socket={socket} onAction={casino.roomAction} onLeave={leave} errorText={errorText} />
      </>
    );
  } else if (room && mine && room.status === 'finished' && room.outcome) {
    content = (
      <CasinoResults
        outcome={room.outcome}
        myTeam={teamOfSeat(room.capacity, mine.seat)}
        capacity={room.capacity}
        teamNames={teamNames}
        onPlayAgain={() => void casino.roomAction('casino:rematch')}
        onLeave={leave}
      />
    );
  } else if (room?.match && mine?.match) {
    content = (
      <CasinoTable
        match={room.match}
        mine={mine.match}
        seats={seats}
        capacity={room.capacity}
        onPreview={preview}
        onPlay={playTurn}
        onTake={take}
        onHint={hint}
        onHold={room.capacity === 4 ? hold : undefined}
        connectionNote={connectionNote}
      />
    );
  } else if (restoring || (urlRoom && connection === 'connecting')) {
    content = <Loading label={t('loadingRoom')} />;
  } else {
    content = (
      <div className="space-y-6">
        <div>
          <h1 className="title-lg flex items-center gap-3">
            <Spade className="h-8 w-8 text-gold" aria-hidden="true" />
            {t('title')}
          </h1>
          <p className="mt-2 max-w-xl text-chalk">{t('tagline')}</p>
        </div>
        {error && (
          <p role="alert" className="max-w-xl rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-signal/60">
            {error}
          </p>
        )}
        <div className="max-w-xl">
          <label htmlFor="casino-name" className="field-label">
            {t('yourName')}
          </label>
          <input id="casino-name" className="field" value={name} maxLength={20} autoComplete="nickname" placeholder={t('namePlaceholder')} onChange={e => setName(e.target.value)} />
        </div>

        {linkRoom ? (
          <section className="panel max-w-xl p-5">
            <h2 className="title-md">{t('joinRoomTitle', { code: linkRoom })}</h2>
            <button type="button" className="btn-gold mt-4 min-h-11" disabled={busy} onClick={() => join(linkRoom)}>
              {busy ? t('joining') : t('join')}
            </button>
          </section>
        ) : (
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            <section aria-labelledby="new-title" className="panel space-y-4 p-5">
              <h2 id="new-title" className="title-md">
                {t('newGame')}
              </h2>
              <div role="radiogroup" aria-labelledby="new-title" className="grid grid-cols-2 gap-2">
                {([2, 4] as const).map(n => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={players === n}
                    onClick={() => setPlayers(n)}
                    className={`rounded-xl p-3 text-left ring-1 ring-inset transition ${players === n ? 'bg-card text-ink ring-gold' : 'bg-felt-deep ring-table-rim hover:bg-white/5'}`}
                  >
                    <span className="block font-semibold">{n === 2 ? t('twoPlayers') : t('fourPlayers')}</span>
                    <span className={`block text-xs ${players === n ? 'text-ink-soft' : 'text-chalk'}`}>{n === 2 ? t('twoPlayersDesc') : t('fourPlayersDesc')}</span>
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="new-target" className="field-label">
                  {t('targetLabel')}
                </label>
                <select id="new-target" className="field" value={target} onChange={e => setTarget(Number(e.target.value))}>
                  {[11, 21, 31, 41, 61].map(n => (
                    <option key={n} value={n}>
                      {t('targetPoints', { n })}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-gold w-full min-h-11" disabled={busy} onClick={create}>
                {busy ? t('creating') : t('createRoom')}
              </button>
            </section>
            <section aria-labelledby="join-title" className="panel space-y-4 p-5">
              <h2 id="join-title" className="title-md">
                {t('joinTitle')}
              </h2>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void join(code);
                }}
                className="space-y-3"
              >
                <label htmlFor="join-code" className="field-label">
                  {t('codeLabel')}
                </label>
                <input
                  id="join-code"
                  className="field font-display tracking-[0.2em] uppercase"
                  value={code}
                  maxLength={6}
                  autoComplete="off"
                  onChange={e => setCode(e.target.value.toUpperCase())}
                />
                <button type="submit" className="btn-quiet w-full min-h-11" disabled={busy || code.trim().length < 6}>
                  {busy ? t('joining') : t('join')}
                </button>
              </form>
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => setScreen('rules')}>
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {t('rules')}
                </button>
                <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => setScreen('tutorial')}>
                  <GraduationCap className="h-4 w-4" aria-hidden="true" />
                  {t('tutorial')}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-6 sm:py-10">{content}</main>
      <SiteFooter />

      {invite && !inRoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-felt-deep/80 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="casino-invite-title" className="panel w-full max-w-sm p-6 shadow-lift">
            <Swords className="h-8 w-8 text-gold" aria-hidden="true" />
            <h2 id="casino-invite-title" className="title-lg mt-3">
              {t('inviteTitle', { name: invite.fromName })}
            </h2>
            <p className="mt-2 text-chalk">
              {invite.game === 'african-casino'
                ? t('inviteCasino', { name: invite.fromName, n: invite.capacity ?? 2 })
                : t('inviteMemory', { name: invite.fromName })}{' '}
              {t('expiresIn', { seconds: Math.max(0, Math.ceil((invite.expiresAt - now) / 1000)) })}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={() => answerInvite(true)} className="btn-gold" autoFocus>
                {t('accept')}
              </button>
              <button type="button" onClick={() => answerInvite(false)} className="btn-quiet">
                {t('decline')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
