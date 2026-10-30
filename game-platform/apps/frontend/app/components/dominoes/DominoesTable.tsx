'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Hand, Play, WifiOff, X } from 'lucide-react';
import { partnerOfSeat, teamOfSeat, type DominoError, type End, type PrivateDominoView, type PublicDominoView, type TileId } from '../../lib/dominoes/types';
import { countdown, describeAction, endName, errorMessage, tileIdName } from '../../lib/dominoes/describe';
import { useT } from '../../i18n/I18nProvider';
import { dominoesMessages } from '../../i18n/messages/dominoes';
import DominoBoard from './DominoBoard';
import DominoTile from './DominoTile';
import HandResultView from './HandResultView';
import PlayerTiles from './PlayerTiles';

export type SeatInfo = { seat: number; name: string; connected: boolean; graceEndsAt: number | null };
export type Answer = { ok: true } | { ok: false; error: DominoError };

type Props = {
  match: PublicDominoView;
  me: PrivateDominoView;
  seats: SeatInfo[];
  onPlay: (tile: TileId, end: End | null) => Promise<Answer>;
  onPass: () => Promise<Answer>;
  sending: boolean;
  connectionNote?: string | null;
  submitLabel?: string;
  // Pops up each finished hand's breakdown (off in the tutorial, which shows its own)
  showHandResults?: boolean;
};

// The table during a hand: other players around the top, the chain in the middle, the player's tiles
// and the Play / Pass controls fixed at the bottom
export default function DominoesTable({ match, me, seats, onPlay, onPass, sending, connectionNote, submitLabel, showHandResults = true }: Props) {
  const t = useT(dominoesMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const players = match.players;
  const mySeat = me.seat;
  const myTeam = teamOfSeat(players, mySeat);
  const partner = partnerOfSeat(players, mySeat);
  const myTurn = match.status === 'playing' && match.turn === mySeat;

  const nameOf = (s: number) => (s === mySeat ? t('you') : (seats.find(x => x.seat === s)?.name ?? t('seatN', { n: s + 1 })));
  const sideName = (team: number) => (players === 4 ? (team === myTeam ? t('yourSide') : t('theirSide')) : nameOf(team));

  const [selected, setSelected] = useState<TileId | null>(null);
  const [end, setEnd] = useState<End | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = busy || sending;

  // Any change to the match starts a fresh choice
  useEffect(() => {
    setSelected(null);
    setEnd(null);
    setNotice(null);
  }, [match.version]);

  const playable = useMemo(() => new Set(me.moves.map(m => m.tile)), [me.moves]);
  const endsFor = (tile: TileId) => me.moves.filter(m => m.tile === tile).map(m => m.end);
  const choices: End[] = selected ? endsFor(selected).filter((e): e is End => e !== null) : [];
  const opening = !!selected && endsFor(selected).includes(null);
  const needsEnd = !!selected && !opening && choices.length > 1 && end === null;
  const ready = !!selected && (opening || end !== null);

  const select = (tile: TileId) => {
    setNotice(null);
    if (selected === tile) {
      setSelected(null);
      setEnd(null);
      return;
    }
    const options = endsFor(tile);
    setSelected(tile);
    setEnd(options.length === 1 ? (options[0] ?? null) : null);
  };

  const play = async () => {
    if (!selected || !ready || locked) return;
    setBusy(true);
    const answer = await onPlay(selected, opening ? null : end);
    setBusy(false);
    if (!answer.ok) setNotice(errorMessage(tx, answer.error));
  };

  const pass = async () => {
    if (!myTurn || !me.canPass || locked) return;
    setBusy(true);
    const answer = await onPass();
    setBusy(false);
    if (!answer.ok) setNotice(errorMessage(tx, answer.error));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && selected) {
      setSelected(null);
      setEnd(null);
    }
  };

  // Grace countdowns tick once a second while someone is away
  const anyAway = seats.some(s => !s.connected && s.graceEndsAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyAway) return;
    setNow(Date.now()); // the clock may be stale from before anyone was away
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyAway]);

  // A finished hand pops up its breakdown until dismissed
  const [seenResults, setSeenResults] = useState(match.results.length);
  const newResult = showHandResults && match.results.length > seenResults ? match.results[match.results.length - 1] : undefined;

  // Opponents placed around the table: seat + 1 is on our right (play goes anticlockwise)
  const around = players === 4 ? [3, 2, 1] : [1];
  const lastText = match.lastAction ? describeAction(tx, match.lastAction, nameOf(match.lastAction.seat)) : null;
  const turnText = myTurn ? t('yourTurn') : t('turnOf', { name: nameOf(match.turn) });

  // Spoken summary for screen readers whenever the turn moves on
  const [announce, setAnnounce] = useState('');
  const lastAnnounced = useRef('');
  useEffect(() => {
    const text = [lastText, turnText].filter(Boolean).join('. ');
    if (text === lastAnnounced.current) return;
    lastAnnounced.current = text;
    setAnnounce(text);
  }, [lastText, turnText]);

  const status = !myTurn
    ? t('waitingFor', { name: nameOf(match.turn) })
    : me.canPass
      ? t('mustPass')
      : !selected
        ? t('pickTile')
        : needsEnd
          ? t('chooseEnd', { tile: tileIdName(tx, selected) })
          : opening
            ? t('readyToOpen', { tile: tileIdName(tx, selected) })
            : t('readyToPlay', { tile: tileIdName(tx, selected), end: endName(tx, end ?? 'right') });

  return (
    <div className="space-y-4 pb-4" onKeyDown={onKey}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      {connectionNote && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">
          <WifiOff className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          {connectionNote}
        </p>
      )}

      {/* Scores, target, hand and whose turn it is */}
      <section aria-label={t('scoreLabel')} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          {[myTeam, 1 - myTeam].map(tm => (
            <div key={tm} className={`rounded-xl px-3 py-1.5 ${tm === myTeam ? 'bg-gold/10 ring-1 ring-gold/50' : 'bg-felt-deep ring-1 ring-sky-300/40'}`}>
              <p className="max-w-[9rem] truncate text-xs text-chalk">{sideName(tm)}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums">{match.scores[tm] ?? 0}</p>
            </div>
          ))}
          <p className="text-xs text-chalk">
            {t('firstTo', { n: match.targetScore })}
            <br />
            {t('handN', { n: match.handNumber })}
          </p>
        </div>
        <p className={`rounded-full px-3 py-1 text-sm font-semibold ${myTurn ? 'bg-gold text-ink' : 'bg-white/5'}`}>{turnText}</p>
      </section>

      {/* The other players */}
      <ul className={`grid gap-2 ${players === 4 ? 'grid-cols-3' : 'grid-cols-1'}`}>
        {around.map(rel => {
          const s = (mySeat + rel) % players;
          const info = seats.find(x => x.seat === s);
          const isPartner = s === partner;
          const count = match.handCounts[s] ?? 0;
          const passed = match.lastAction?.type === 'pass' && match.lastAction.seat === s;
          const theirTurn = match.status === 'playing' && match.turn === s;
          return (
            <li
              key={s}
              className={`min-w-0 rounded-2xl p-2.5 ring-1 ring-inset transition motion-reduce:transition-none ${
                theirTurn ? 'bg-gold/10 ring-2 ring-gold' : 'bg-table ring-table-rim'
              }`}
            >
              <p className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${teamOfSeat(players, s) === myTeam ? 'bg-gold' : 'bg-sky-300'}`} />
                <span className="truncate font-semibold">{nameOf(s)}</span>
              </p>
              <p className="text-xs text-chalk">
                {isPartner ? t('partner') : t('opponent')}
                {players === 4 && <> · {rel === 1 ? t('onYourRight') : rel === 3 ? t('onYourLeft') : t('opposite')}</>}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label={t('tilesInHand', { n: count })} role="img">
                {Array.from({ length: count }, (_, i) => (
                  <DominoTile key={i} faceDown className="h-5 w-2.5 sm:h-6 sm:w-3" />
                ))}
                <span className="ml-1 text-xs tabular-nums text-chalk" aria-hidden="true">
                  {count}
                </span>
              </div>
              {(passed || theirTurn || (info && !info.connected)) && (
                <p className="mt-1 text-xs font-semibold">
                  {info && !info.connected ? (
                    <span className="text-signal">
                      {info.graceEndsAt ? t('awayCountdown', { time: countdown(info.graceEndsAt - now) }) : t('away')}
                    </span>
                  ) : theirTurn ? (
                    <span className="text-gold">{t('playing')}</span>
                  ) : (
                    <span className="text-chalk">{t('passedBadge')}</span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {lastText && (
        <p className="text-sm text-chalk">
          <span className="font-semibold text-white">{t('lastMove')}:</span> {lastText}
        </p>
      )}

      <DominoBoard
        tx={tx}
        board={match.board}
        ends={match.ends}
        lastTile={match.lastAction?.type === 'play' ? match.lastAction.tile : null}
        preview={selected && (opening || end) ? { tile: selected, end: opening ? null : end } : null}
        choices={myTurn && !locked ? choices : []}
        chosen={end}
        onChoose={e => {
          setEnd(e);
          setNotice(null);
        }}
      />

      {/* Controls and tiles stay within reach at the bottom of the screen */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-white/10 bg-felt-deep/95 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 basis-48 text-sm text-chalk">{status}</p>
          {myTurn && choices.length > 1 && !opening && (
            <div role="group" aria-label={t('chooseEndGroup')} className="flex gap-1.5">
              {choices.map(c => (
                <button
                  key={c}
                  type="button"
                  disabled={locked}
                  aria-pressed={end === c}
                  onClick={() => setEnd(c)}
                  className={`btn btn-sm min-h-11 ring-1 ring-inset ${end === c ? 'bg-gold text-ink ring-gold' : 'bg-white/5 text-white ring-gold/60 hover:bg-white/10'}`}
                >
                  {c === 'left' ? t('leftEndN', { n: match.ends?.left ?? 0 }) : t('rightEndN', { n: match.ends?.right ?? 0 })}
                </button>
              ))}
            </div>
          )}
          {myTurn && selected && (
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setEnd(null);
              }}
              className="btn-quiet btn-sm min-h-11"
              aria-label={t('clearSelection')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {myTurn && (
            <>
              <button type="button" className="btn-gold btn-sm min-h-11" disabled={!ready || locked} onClick={play}>
                <Play className="h-4 w-4" aria-hidden="true" />
                {locked ? t('sending') : (submitLabel ?? t('playTile'))}
              </button>
              <button type="button" className="btn-quiet btn-sm min-h-11" disabled={!me.canPass || locked} onClick={pass}>
                <Hand className="h-4 w-4" aria-hidden="true" />
                {t('pass')}
              </button>
            </>
          )}
        </div>
        {notice && (
          <p role="alert" className="mt-2 rounded-xl bg-signal/15 px-3 py-2 text-sm text-white ring-1 ring-inset ring-signal/60">
            {notice}
          </p>
        )}
        <PlayerTiles tx={tx} tiles={me.hand} playable={playable} selected={selected} myTurn={myTurn} disabled={locked} onSelect={select} />
      </div>

      {newResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-felt-deep/80 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="hand-result-title" className="panel flex max-h-[90vh] w-full max-w-lg flex-col p-5 shadow-lift">
            <h2 id="hand-result-title" className="title-md">
              {t('handOver', { n: newResult.hand })}
            </h2>
            <div className="mt-3 min-h-0 overflow-y-auto pr-1">
              <HandResultView tx={tx} result={newResult} players={players} mySeat={mySeat} nameOf={nameOf} sideName={sideName} />
            </div>
            <button type="button" className="btn-gold mt-4 min-h-11" autoFocus onClick={() => setSeenResults(match.results.length)}>
              {match.status === 'playing' ? t('nextHand') : t('continue')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
