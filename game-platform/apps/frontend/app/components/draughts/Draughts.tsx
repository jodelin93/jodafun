'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, CircleDot, GraduationCap, Swords } from 'lucide-react';
import SiteHeader from '../ui/SiteHeader';
import SiteFooter from '../ui/SiteFooter';
import Loading from '../ui/Loading';
import TableMenu from '../ui/TableMenu';
import MatchStatus from './MatchStatus';
import { useAuth } from '../../contexts/AuthContext';
import { useGuestPlay } from '../../lib/useGuestPlay';
import { clearCurrentRoom, roomPath, saveCurrentRoom } from '../../lib/currentRoom';
import { isPlayableGameId, type PlayableGameId } from '../../lib/games';
import { useGameTitle } from '../../lib/useGameTitle';
import { getPlayerKey } from '../../lib/playerKey';
import { useDraughtsRoom } from '../../lib/draughts/useDraughtsRoom';
import { countdown, type Tx } from '../../lib/draughts/describe';
import type { DraughtsAck, Route } from '../../lib/draughts/types';
import { useT } from '../../i18n/I18nProvider';
import { draughtsMessages } from '../../i18n/messages/draughts';
import DraughtsLobby from './DraughtsLobby';
import DraughtsTable from './DraughtsTable';
import DraughtsResults from './DraughtsResults';
import DraughtsRules from './DraughtsRules';
import DraughtsTutorial from './DraughtsTutorial';
import type { Answer } from './MovePicker';

type Screen = 'menu' | 'rules' | 'tutorial';
type Invite = { inviteId: string; fromName: string; game: PlayableGameId; capacity?: number; expiresAt: number };

const GAME: PlayableGameId = 'international-draughts';
const isDefaultGuestName = (name: string | null | undefined) => !name || /^Guest [0-9a-f]{8}$/i.test(name);
const ROOM_HOLD_MS = 5 * 60 * 1000;
const PLAYING_HOLD_MS = 3 * 60 * 1000;

// International draughts: menu, joining by code or link, lobby, board, results, rules and tutorial
export default function Draughts() {
  const t = useT(draughtsMessages);
  const tx = t as unknown as Tx;
  const { title: gameTitle, subtitle: gameSubtitle } = useGameTitle();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isPending } = useAuth();
  const { play: startAsGuest, loading: guestLoading, error: guestError } = useGuestPlay();
  const [screen, setScreen] = useState<Screen>('menu');
  const [name, setName] = useState('');
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

  const draughts = useDraughtsRoom(onSeatLost, user?.id ?? null);
  const { room, playerId, connection, socket, sending } = draughts;
  const mySeat = room?.seats.find(s => s.player && s.player.id === playerId) ?? null;
  const inRoom = !!room && !!mySeat;
  const opponentSeat = room?.seats.find(s => s !== mySeat) ?? null;

  // A code from another game: that game's page takes over
  const otherGame = useCallback(
    (ack: DraughtsAck, roomId: string) => {
      if (ack.ok || ack.code !== 'WRONG_GAME') return false;
      const gameType = ack.params?.gameType;
      if (!isPlayableGameId(gameType) || gameType === GAME) return false;
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
    void draughts.rejoin(urlRoom).then(ack => {
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
    saveCurrentRoom(room.id, hold, GAME);
    const refresh = setInterval(() => saveCurrentRoom(room.id, hold, GAME), 20000);
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

  // Ticks the invitation countdown
  useEffect(() => {
    if (!invite) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [invite]);

  // Ticks the opponent's grace period while they are away
  const opponentAway = !!opponentSeat?.player && !opponentSeat.player.connected && !!opponentSeat.player.graceEndsAt;
  useEffect(() => {
    if (!opponentAway) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [opponentAway]);

  const answerInvite = (accept: boolean) => {
    if (!invite) return;
    const current = invite;
    setInvite(null);
    socket.emit('invite:respond', { inviteId: current.inviteId, accept, playerKey: getPlayerKey() }, (res: { success: boolean; game?: string; roomId?: string; room?: { id: string } }) => {
      if (!accept || !res?.success) return;
      if (res.game === GAME && res.roomId) {
        setUrlRoom(res.roomId);
        void draughts.rejoin(res.roomId);
      } else if (isPlayableGameId(res.game) && res.roomId) {
        router.push(roomPath(res.roomId, res.game));
      } else if (res.room) {
        router.push(roomPath(res.room.id, 'joda-memory'));
      }
    });
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const ack = await draughts.create(name.trim());
    setBusy(false);
    if (ack.ok) setUrlRoom(ack.roomId);
    else setError(errorText(ack.code));
  };

  const join = async (roomId: string) => {
    const codeName = roomId.trim().toUpperCase();
    if (!codeName) return;
    setBusy(true);
    setError(null);
    const ack = await draughts.join(codeName, name.trim());
    setBusy(false);
    if (ack.ok) {
      setUrlRoom(ack.roomId);
      setLinkRoom(null);
    } else if (!otherGame(ack, codeName)) setError(errorText(ack.code));
  };

  const leave = async () => {
    await draughts.leaveRoom();
    clearCurrentRoom();
    setUrlRoom(null);
    setLinkRoom(null);
  };

  const game = room?.game ?? null;
  const version = game?.version ?? 0;
  const toAnswer = (ack: DraughtsAck<{ version: number }>): Answer => (ack.ok ? { ok: true } : { ok: false, error: { code: ack.code, params: ack.params } });
  const onMove = async (route: Route) => toAnswer(await draughts.move(version, route.from, route.path));
  const onResign = async () => toAnswer(await draughts.resign(version));
  const onOfferDraw = async () => toAnswer(await draughts.offerDraw(version));
  const onRespondDraw = async (accept: boolean) => {
    const offer = game?.drawOffer;
    if (!offer) return { ok: false, error: { code: 'NO_DRAW_OFFER' } } as Answer;
    return toAnswer(await draughts.respondDraw(version, offer.version, accept));
  };

  const opponent = opponentSeat?.player ?? null;
  const opponentName = opponent?.name ?? t('opponent');
  const connectionNote =
    connection === 'offline'
      ? t('offline')
      : opponent && !opponent.connected
        ? opponent.graceEndsAt
          ? t('playerAwayCountdown', { name: opponent.name, time: countdown(opponent.graceEndsAt - now) })
          : t('playerAway', { name: opponent.name })
        : null;

  const titleBlock = (
    <div>
      <h1 className="title-lg flex items-center gap-3">
        <CircleDot className="h-8 w-8 text-gold" aria-hidden="true" />
        {gameTitle(GAME)}
      </h1>
      <p className="mt-1 font-semibold text-chalk">{gameSubtitle(GAME)}</p>
    </div>
  );

  let content: React.ReactNode;
  if (isPending) {
    content = <Loading />;
  } else if (!user) {
    content = (
      <div className="panel max-w-xl p-5 sm:p-6">
        {titleBlock}
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
    content = <DraughtsRules onBack={() => setScreen('menu')} />;
  } else if (screen === 'tutorial') {
    content = <DraughtsTutorial socket={socket} onBack={() => setScreen('menu')} />;
  } else if (room && mySeat && room.status === 'lobby') {
    content = (
      <>
        <div className="mb-4">{titleBlock}</div>
        {room.outcome?.reason === 'forfeit' && (
          <p className="mb-4 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">{t('forfeitNotice')}</p>
        )}
        {room.series && room.series.games > 0 && room.series.winnerSeat === null && (
          <MatchStatus tx={tx} series={room.series} seats={room.seats} mySeat={mySeat.seat} />
        )}
        <DraughtsLobby room={room} myPlayerId={playerId} socket={socket} onAction={draughts.roomAction} onLeave={leave} errorText={errorText} />
      </>
    );
  } else if (room && mySeat && room.status === 'finished' && (game?.result || room.outcome)) {
    const result = game?.result ?? { winner: room.outcome!.winner, reason: room.outcome!.reason };
    content = (
      <DraughtsResults
        tx={tx}
        result={result}
        moves={game?.moves.length ?? room.outcome?.moves ?? 0}
        myColor={mySeat.color}
        opponentName={opponentName}
        view={game}
        series={room.series}
        seats={room.seats}
        mySeat={mySeat.seat}
        onRematch={() => {
          void draughts.roomAction('draughts:rematch').then(ack => !ack.ok && setError(errorText(ack.code)));
        }}
        onLeave={leave}
      />
    );
  } else if (room && mySeat && game && mySeat.color) {
    const pauser = room.paused ? room.seats.find(s => s.player?.id === room.paused?.byId)?.player : null;
    content = (
      <>
        <h1 className="sr-only">{gameTitle(GAME)}</h1>
        <TableMenu
          paused={room.paused}
          myPlayerId={playerId ?? ''}
          pauserAway={!pauser || !pauser.connected}
          onPause={() => draughts.roomAction('draughts:pause')}
          onResume={() => draughts.roomAction('draughts:resume')}
          onLeave={() => void leave()}
          rules={close => <DraughtsRules onBack={close} />}
          errorText={errorText}
        />
        {room.series && <MatchStatus tx={tx} series={room.series} seats={room.seats} mySeat={mySeat.seat} />}
        <DraughtsTable
          tx={tx}
          view={game}
          myColor={mySeat.color}
          opponent={opponent ? { name: opponent.name, connected: opponent.connected, graceEndsAt: opponent.graceEndsAt } : null}
          canPlay={!room.paused}
          sending={sending}
          connectionNote={connectionNote}
          onMove={onMove}
          onResign={onResign}
          onOfferDraw={onOfferDraw}
          onRespondDraw={onRespondDraw}
        />
      </>
    );
  } else if (restoring || (urlRoom && connection === 'connecting') || (room && mySeat)) {
    content = <Loading label={t('loadingRoom')} />;
  } else {
    content = (
      <div className="space-y-6">
        <div>
          {titleBlock}
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
          <label htmlFor="draughts-name" className="field-label">
            {t('yourName')}
          </label>
          <input id="draughts-name" className="field" value={name} maxLength={20} autoComplete="nickname" placeholder={t('namePlaceholder')} onChange={e => setName(e.target.value)} />
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
              <p className="text-sm text-chalk">{t('newGameHint')}</p>
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
            </section>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => setScreen('rules')}>
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                {t('rules')}
              </button>
              <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => setScreen('tutorial')}>
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                {t('tutorial')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const inviteBody = (i: Invite) =>
    i.game === GAME
      ? t('inviteDraughts', { name: i.fromName, game: gameTitle(GAME) })
      : i.game === 'dominoes'
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
          <div role="dialog" aria-modal="true" aria-labelledby="draughts-invite-title" className="panel w-full max-w-sm p-6 shadow-lift">
            <Swords className="h-8 w-8 text-gold" aria-hidden="true" />
            <h2 id="draughts-invite-title" className="title-lg mt-3">
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
