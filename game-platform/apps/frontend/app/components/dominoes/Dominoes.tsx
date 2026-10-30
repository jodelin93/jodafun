'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Dices, GraduationCap, Swords } from 'lucide-react';
import SiteHeader from '../ui/SiteHeader';
import SiteFooter from '../ui/SiteFooter';
import Loading from '../ui/Loading';
import { useAuth } from '../../contexts/AuthContext';
import { useGuestPlay } from '../../lib/useGuestPlay';
import { clearCurrentRoom, roomPath, saveCurrentRoom } from '../../lib/currentRoom';
import { isPlayableGameId, type PlayableGameId } from '../../lib/games';
import { getPlayerKey } from '../../lib/playerKey';
import { useDominoesRoom } from '../../lib/dominoes/useDominoesRoom';
import { countdown } from '../../lib/dominoes/describe';
import { DEFAULT_TARGET, TARGETS, teamOfSeat, type DominoAck, type End, type Mode, type TileId } from '../../lib/dominoes/types';
import { useT } from '../../i18n/I18nProvider';
import { dominoesMessages } from '../../i18n/messages/dominoes';
import DominoesLobby from './DominoesLobby';
import DominoesTable, { type Answer, type SeatInfo } from './DominoesTable';
import DominoesResults from './DominoesResults';
import DominoesRules from './DominoesRules';
import TableMenu from '../ui/TableMenu';
import DominoesTutorial from './DominoesTutorial';

type Screen = 'menu' | 'rules' | 'tutorial';
type Invite = { inviteId: string; fromName: string; game: PlayableGameId; capacity?: number; expiresAt: number };

const isDefaultGuestName = (name: string | null | undefined) => !name || /^Guest [0-9a-f]{8}$/i.test(name);
const ROOM_HOLD_MS = 5 * 60 * 1000;
const PLAYING_HOLD_MS = 3 * 60 * 1000;

// Dominoes: menu, joining by code or link, lobby, table, results, rules and tutorial
export default function Dominoes() {
  const t = useT(dominoesMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isPending } = useAuth();
  const { play: startAsGuest, loading: guestLoading, error: guestError } = useGuestPlay();
  const [screen, setScreen] = useState<Screen>('menu');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('head-to-head');
  const [target, setTarget] = useState(DEFAULT_TARGET);
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
    setError(tx('seatLost'));
  }, [setUrlRoom, tx]);

  const dominoes = useDominoesRoom(onSeatLost, user?.id ?? null);
  const { room, mine, connection, socket, sending } = dominoes;
  const inRoom = !!room && !!mine;

  // A code from another game: that game's page takes over
  const otherGame = useCallback(
    (ack: DominoAck, roomId: string) => {
      if (ack.ok || ack.code !== 'WRONG_GAME') return false;
      const gameType = ack.params?.gameType;
      if (!isPlayableGameId(gameType) || gameType === 'dominoes') return false;
      router.replace(roomPath(roomId, gameType));
      return true;
    },
    [router],
  );

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
    void dominoes.rejoin(urlRoom).then(ack => {
      if (!live) return;
      setRestoring(false);
      if (ack.ok || otherGame(ack, urlRoom)) return;
      if (ack.code === 'ROOM_NOT_FOUND') {
        setError(errorText('ROOM_NOT_FOUND'));
        setUrlRoom(null);
      } else setLinkRoom(urlRoom);
    });
    return () => {
      live = false;
    };
  }, [user, urlRoom, connection]); // eslint-disable-line react-hooks/exhaustive-deps

  // While seated, remember the room so the header can offer a way back
  useEffect(() => {
    if (!room || !inRoom) return;
    const hold = room.status === 'playing' ? PLAYING_HOLD_MS : ROOM_HOLD_MS;
    saveCurrentRoom(room.id, hold, 'dominoes');
    const refresh = setInterval(() => saveCurrentRoom(room.id, hold, 'dominoes'), 20000);
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

  // Requests from other players, for any game
  useEffect(() => {
    const received = (d: { inviteId: string; from?: { name?: string }; game?: string; capacity?: number; expiresAt: number }) => {
      setNow(Date.now());
      setInvite({ inviteId: d.inviteId, fromName: d.from?.name ?? '', game: isPlayableGameId(d.game) ? d.game : 'joda-memory', capacity: d.capacity, expiresAt: d.expiresAt });
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

  // Ticks invitation and grace-period countdowns
  const away = useMemo(() => (room?.seats ?? []).filter(s => s.player && !s.player.connected && s.seat !== mine?.seat), [room, mine?.seat]);
  useEffect(() => {
    if (!invite && away.length === 0) return;
    setNow(Date.now()); // the clock may be stale from before anyone was away
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [invite, away.length]);

  const answerInvite = (accept: boolean) => {
    if (!invite) return;
    const current = invite;
    setInvite(null);
    socket.emit('invite:respond', { inviteId: current.inviteId, accept, playerKey: getPlayerKey() }, (res: { success: boolean; game?: string; roomId?: string; room?: { id: string } }) => {
      if (!accept || !res?.success) return;
      if (res.game === 'dominoes' && res.roomId) {
        setUrlRoom(res.roomId);
        void dominoes.rejoin(res.roomId);
      } else if (res.game === 'african-casino' && res.roomId) {
        router.push(roomPath(res.roomId, 'african-casino'));
      } else if (res.room) {
        router.push(roomPath(res.room.id, 'joda-memory'));
      }
    });
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const ack = await dominoes.create(name.trim(), mode, target);
    setBusy(false);
    if (ack.ok) setUrlRoom(ack.roomId);
    else setError(errorText(ack.code));
  };

  const join = async (roomId: string) => {
    const codeName = roomId.trim().toUpperCase();
    if (!codeName) return;
    setBusy(true);
    setError(null);
    const ack = await dominoes.join(codeName, name.trim());
    setBusy(false);
    if (ack.ok) {
      setUrlRoom(ack.roomId);
      setLinkRoom(null);
    } else if (!otherGame(ack, codeName)) setError(errorText(ack.code));
  };

  const leave = async () => {
    await dominoes.leaveRoom();
    clearCurrentRoom();
    setUrlRoom(null);
    setLinkRoom(null);
  };

  const version = room?.match?.version ?? 0;
  const toAnswer = (ack: DominoAck<{ version: number }>): Answer => (ack.ok ? { ok: true } : { ok: false, error: { code: ack.code, params: ack.params } });
  const playTile = async (tile: TileId, end: End | null) => toAnswer(await dominoes.play(version, tile, end));
  const passTurn = async () => toAnswer(await dominoes.pass(version));

  const seats: SeatInfo[] = useMemo(
    () =>
      (room?.seats ?? []).flatMap(s => (s.player ? [{ seat: s.seat, name: s.player.name, connected: s.player.connected, graceEndsAt: s.player.graceEndsAt }] : [])),
    [room],
  );
  const nameOf = (seat: number) => (seat === mine?.seat ? t('you') : (seats.find(s => s.seat === seat)?.name ?? t('seatN', { n: seat + 1 })));
  const connectionNote =
    connection === 'offline'
      ? t('offline')
      : away.length > 0
        ? away
            .map(s =>
              s.player!.graceEndsAt
                ? t('playerAwayCountdown', { name: s.player!.name, time: countdown(s.player!.graceEndsAt - now) })
                : t('playerAway', { name: s.player!.name }),
            )
            .join(' ')
        : null;

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
    content = <DominoesRules onBack={() => setScreen('menu')} />;
  } else if (screen === 'tutorial') {
    content = <DominoesTutorial socket={socket} onBack={() => setScreen('menu')} />;
  } else if (room && mine && room.status === 'lobby') {
    content = (
      <>
        <h1 className="title-lg mb-4">{t('title')}</h1>
        {room.outcome?.forfeit && (
          <p className="mb-4 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">
            {room.outcome.winnerTeam === teamOfSeat(room.capacity, mine.seat) ? t('forfeitWin') : t('forfeitLoss')}
          </p>
        )}
        <DominoesLobby room={room} myPlayerId={mine.playerId} socket={socket} onAction={dominoes.roomAction} onLeave={leave} errorText={errorText} />
      </>
    );
  } else if (room && mine && room.status === 'finished' && room.outcome) {
    content = (
      <DominoesResults
        outcome={room.outcome}
        players={room.capacity}
        mySeat={mine.seat}
        nameOf={nameOf}
        onRematch={() => {
          void dominoes.roomAction('dominoes:rematch').then(ack => !ack.ok && setError(errorText(ack.code)));
        }}
        onLeave={leave}
      />
    );
  } else if (room?.match && mine?.match) {
    const pauser = room.paused ? room.seats.find(s => s.player?.id === room.paused?.byId)?.player : null;
    content = (
      <>
        <h1 className="sr-only">{t('title')}</h1>
        <TableMenu
          paused={room.paused}
          myPlayerId={mine.playerId}
          pauserAway={!pauser || !pauser.connected}
          onPause={() => dominoes.roomAction('dominoes:pause')}
          onResume={() => dominoes.roomAction('dominoes:resume')}
          onLeave={() => void leave()}
          rules={close => <DominoesRules onBack={close} />}
          errorText={errorText}
        />
        <DominoesTable match={room.match} me={mine.match} seats={seats} onPlay={playTile} onPass={passTurn} sending={sending} connectionNote={connectionNote} />
      </>
    );
  } else if (restoring || (urlRoom && connection === 'connecting')) {
    content = <Loading label={t('loadingRoom')} />;
  } else {
    content = (
      <div className="space-y-6">
        <div>
          <h1 className="title-lg flex items-center gap-3">
            <Dices className="h-8 w-8 text-gold" aria-hidden="true" />
            {t('title')}
          </h1>
          <p className="mt-2 max-w-xl text-chalk">{t('tagline')}</p>
        </div>
        {connection === 'offline' && (
          <p role="status" className="max-w-xl rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">
            {t('offline')}
          </p>
        )}
        {error && (
          <p role="alert" className="max-w-xl rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-signal/60">
            {error}
          </p>
        )}
        <div className="max-w-xl">
          <label htmlFor="dominoes-name" className="field-label">
            {t('yourName')}
          </label>
          <input id="dominoes-name" className="field" value={name} maxLength={20} autoComplete="nickname" placeholder={t('namePlaceholder')} onChange={e => setName(e.target.value)} />
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
                {(['head-to-head', 'partners'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`rounded-xl p-3 text-left ring-1 ring-inset transition ${mode === m ? 'bg-card text-ink ring-gold' : 'bg-felt-deep ring-table-rim hover:bg-white/5'}`}
                  >
                    <span className="block font-semibold">{m === 'partners' ? t('modePartners') : t('modeHeadToHead')}</span>
                    <span className={`block text-xs ${mode === m ? 'text-ink-soft' : 'text-chalk'}`}>{m === 'partners' ? t('modePartnersDesc') : t('modeHeadToHeadDesc')}</span>
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="new-target" className="field-label">
                  {t('targetLabel')}
                </label>
                <select id="new-target" className="field" value={target} onChange={e => setTarget(Number(e.target.value))}>
                  {TARGETS.map(n => (
                    <option key={n} value={n}>
                      {n === DEFAULT_TARGET ? t('targetPointsDefault', { n }) : t('targetPoints', { n })}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-gold w-full min-h-11" disabled={busy || connection !== 'online'} onClick={create}>
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

  const inviteBody = (i: Invite) =>
    i.game === 'dominoes'
      ? t(i.capacity === 4 ? 'inviteDominoesTeams' : 'inviteDominoes', { name: i.fromName })
      : i.game === 'african-casino'
        ? t('inviteCasino', { name: i.fromName, n: i.capacity ?? 2 })
        : t('inviteMemory', { name: i.fromName });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-6 sm:py-10">{content}</main>
      <SiteFooter />

      {invite && !inRoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-felt-deep/80 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="dominoes-invite-title" className="panel w-full max-w-sm p-6 shadow-lift">
            <Swords className="h-8 w-8 text-gold" aria-hidden="true" />
            <h2 id="dominoes-invite-title" className="title-lg mt-3">
              {t('inviteTitle', { name: invite.fromName })}
            </h2>
            <p className="mt-2 text-chalk">
              {inviteBody(invite)} {t('expiresIn', { seconds: Math.max(0, Math.ceil((invite.expiresAt - now) / 1000)) })}
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
