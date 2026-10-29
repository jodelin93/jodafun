'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Play, Trophy } from 'lucide-react';
import ShareRoomButton from './ShareRoomButton';
import { useT } from '../i18n/I18nProvider';
import { gameMessages } from '../i18n/messages/game';
import { alternateMessages } from '../i18n/messages/alternate';

type Difficulty = 'easy' | 'medium' | 'hard';

export type AltResult = { moves: number; timeMs: number };
export type AltSeatState = {
  results: AltResult[];
  playing: null | { round: number; moves: number; pairs: number; totalPairs: number; elapsedMs: number; running: boolean };
  canPlay: boolean;
};
export type AltPublic = { rounds: number; finished: boolean; winnerIndex: number | null; seats: AltSeatState[] };
export type AltPlayer = { id: string; name: string; score: number; isReady: boolean; isHost: boolean; socketId: string; connected?: boolean };
// The server's 'altUpdate' snapshot; receivedAt lets a running clock keep ticking between updates
export type AltRoomState = {
  id: string;
  players: AltPlayer[];
  difficulty: Difficulty;
  gameStarted: boolean;
  alt: AltPublic | null;
  receivedAt: number;
};

// Round times are compared to the millisecond, so tenths show why one player won a close race
export function formatAltTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const mins = Math.floor(tenths / 600);
  const secs = Math.floor((tenths % 600) / 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths % 10}`;
}

const totalsOf = (seat: AltSeatState | undefined) =>
  (seat?.results ?? []).reduce((sum, r) => ({ moves: sum.moves + r.moves, timeMs: sum.timeMs + r.timeMs }), { moves: 0, timeMs: 0 });

// Re-renders every second while some clock in the room is running
function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function liveElapsed(playing: NonNullable<AltSeatState['playing']>, receivedAt: number, now: number) {
  return playing.elapsedMs + (playing.running ? Math.max(0, now - receivedAt) : 0);
}

// One line about the other player: what they are doing right now, or whether they are around
function OpponentStatus({ room, mySeat }: { room: AltRoomState; mySeat: number }) {
  const ta = useT(alternateMessages);
  const other = room.players[mySeat === 0 ? 1 : 0];
  const seat = room.alt?.seats[mySeat === 0 ? 1 : 0];
  const now = useTick(Boolean(seat?.playing?.running));
  if (!other) return null;
  const name = other.name || ta('yourFriend');
  const playing = seat?.playing;
  if (playing) {
    return (
      <p className="text-sm text-chalk" aria-live="polite">
        {playing.running
          ? ta('themPlaying', {
              name,
              round: playing.round,
              moves: playing.moves,
              pairs: playing.pairs,
              total: playing.totalPairs,
              time: formatAltTime(liveElapsed(playing, room.receivedAt, now)),
            })
          : ta('themPaused', { name, round: playing.round, moves: playing.moves })}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-chalk">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${other.connected === false ? 'bg-white/30' : 'bg-gold'}`}
        aria-hidden="true"
      />
      {other.connected === false ? ta('themAway', { name }) : ta('themOnline', { name })}
    </p>
  );
}

// Shown above the board while you play a round: the round number and the other player's progress
export function AltOpponentLine({ room, mySeat, round }: { room: AltRoomState; mySeat: number; round: number }) {
  const ta = useT(alternateMessages);
  return (
    <section className="mx-auto mb-4 max-w-3xl space-y-1 md:mb-6">
      <p className="font-display text-lg font-bold">
        {ta('roundN', { n: round })} / {room.alt?.rounds ?? 4}
      </p>
      <OpponentStatus room={room} mySeat={mySeat} />
    </section>
  );
}

type Props = {
  room: AltRoomState;
  mySeat: number;
  copiedLink: boolean;
  error: string | null;
  onCopyLink: () => void;
  onSetDifficulty: (difficulty: Difficulty) => void;
  onReady: (ready: boolean) => void;
  onPlay: () => void;
  onRematch: () => void;
  onLeave: () => void;
};

export default function AlternateRoom({ room, mySeat, copiedLink, error, onCopyLink, onSetDifficulty, onReady, onPlay, onRematch, onLeave }: Props) {
  const t = useT(gameMessages);
  const ta = useT(alternateMessages);
  const otherSeat = mySeat === 0 ? 1 : 0;
  const me = room.players[mySeat];
  const other = room.players[otherSeat];
  const otherName = other?.name || ta('yourFriend');
  const alt = room.alt;
  const levelName = t(room.difficulty);
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/games/joda-memory?roomId=${room.id}`;

  const share = (
    <div className="panel p-5">
      <p className="text-sm text-chalk">{t('roomCode')}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <span className="break-all font-display text-2xl font-extrabold sm:text-3xl">{room.id}</span>
        <div className="flex flex-wrap items-center gap-2">
          <ShareRoomButton url={url} code={room.id} onCopy={onCopyLink} />
          <button type="button" onClick={onCopyLink} className="btn-quiet btn-sm min-h-11">
            {copiedLink ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copiedLink ? t('copied') : t('copyLink')}
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm text-chalk">{ta('shareHint')}</p>
    </div>
  );

  const errorLine = error ? (
    <p role="alert" className="text-sm text-white">
      {error}
    </p>
  ) : null;

  // Before the game: pick and confirm the level together
  if (!room.gameStarted || !alt) {
    const status =
      room.players.length < 2
        ? ta('statusWaitJoin')
        : !me?.isReady
          ? ta('statusConfirmYou')
          : ta('statusConfirmThem', { name: otherName });
    return (
      <section aria-labelledby="alt-room-title" className="max-w-2xl space-y-4">
        <div>
          <h2 id="alt-room-title" className="title-md">{ta('roomTitle')}</h2>
          <p className="mt-2 text-chalk">{ta('rulesSummary')}</p>
        </div>

        {share}

        <div className="panel p-5">
          <h3 className="font-display text-lg font-bold">{ta('playersTitle')}</h3>
          <ul className="mt-3 space-y-2">
            {room.players.map((player, index) => (
              <li key={player.id} className="flex items-center justify-between gap-3 rounded-xl bg-felt-deep/60 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${player.connected === false ? 'bg-white/30' : 'bg-gold'}`}
                    aria-hidden="true"
                  />
                  <span className="truncate font-semibold">{player.name}</span>
                  {index === mySeat && <span className="chip px-2 py-0.5 text-xs">{t('you')}</span>}
                  <span className="sr-only">{player.connected === false ? ta('away') : ta('online')}</span>
                </div>
                {player.isReady ? (
                  <span className="chip shrink-0 text-white ring-gold/50">
                    <Check className="h-4 w-4 text-gold" aria-hidden="true" />
                    {ta('confirmed')}
                  </span>
                ) : (
                  <span className="chip shrink-0">{ta('notConfirmed')}</span>
                )}
              </li>
            ))}
            {room.players.length < 2 && (
              <li className="rounded-xl border border-dashed border-white/20 px-4 py-3 text-chalk">{t('waitingFriendJoin')}</li>
            )}
          </ul>
        </div>

        <div className="panel p-5">
          <h3 id="alt-level-title" className="font-display text-lg font-bold">{ta('levelTitle')}</h3>
          <div
            role="group"
            aria-labelledby="alt-level-title"
            className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-felt-deep p-1 ring-1 ring-inset ring-table-rim"
          >
            {([
              ['easy', t('easy'), 8],
              ['medium', t('medium'), 16],
              ['hard', t('hard'), 24],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={room.difficulty === value}
                onClick={() => onSetDifficulty(value)}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-2 py-2 transition ${
                  room.difficulty === value ? 'bg-card text-ink shadow-rest' : 'text-chalk hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className={`text-xs ${room.difficulty === value ? 'text-ink-soft' : 'text-chalk/80'}`}>
                  {t('cardsCount', { count })}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-chalk">{ta('levelHint')}</p>
        </div>

        <p className="text-chalk" aria-live="polite">{status}</p>
        {errorLine}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => onReady(!me?.isReady)}
            disabled={room.players.length < 2}
            aria-pressed={Boolean(me?.isReady)}
            className={me?.isReady ? 'btn-quiet' : 'btn-gold'}
          >
            {me?.isReady ? <Check className="h-4 w-4 text-gold" aria-hidden="true" /> : null}
            {me?.isReady ? ta('levelConfirmed') : ta('confirmLevel')}
          </button>
          <button type="button" onClick={onLeave} className="btn-quiet sm:ml-auto">
            {t('leaveRoom')}
          </button>
        </div>
      </section>
    );
  }

  // During and after the game: the score table, the other player's progress and what you can do next
  const mine = alt.seats[mySeat];
  const theirs = alt.seats[otherSeat];
  const myTotals = totalsOf(mine);
  const theirTotals = totalsOf(theirs);
  const nextRound = (mine?.results.length ?? 0) + 1;
  // Lead only means something once both have played the same rounds
  const sameRounds = Math.min(mine?.results.length ?? 0, theirs?.results.length ?? 0);
  const leadBy =
    (theirs?.results.slice(0, sameRounds).reduce((s, r) => s + r.moves, 0) ?? 0) -
    (mine?.results.slice(0, sameRounds).reduce((s, r) => s + r.moves, 0) ?? 0);

  const cell = (seat: AltSeatState | undefined, round: number) => {
    const result = seat?.results[round];
    if (result) return ta('movesTime', { moves: result.moves, time: formatAltTime(result.timeMs) });
    if (seat?.playing?.round === round + 1) return ta('playingCell');
    return '—';
  };

  return (
    <section aria-labelledby="alt-room-title" className="max-w-2xl space-y-4">
      <div>
        <h2 id="alt-room-title" className="title-md">{ta('roomTitle')}</h2>
        <p className="mt-1 text-sm text-chalk">{ta('level', { level: levelName })}</p>
      </div>

      {alt.finished && (
        <div className="panel p-5 ring-2 ring-gold" role="status">
          <Trophy className="h-8 w-8 text-gold" aria-hidden="true" />
          <h3 className="title-lg mt-3">
            {alt.winnerIndex === null ? ta('draw') : alt.winnerIndex === mySeat ? ta('youWin') : ta('theyWin', { name: otherName })}
          </h3>
          <p className="mt-2 text-chalk">
            {alt.winnerIndex === null
              ? ta('drawBody')
              : myTotals.moves !== theirTotals.moves
                ? ta('wonOnMoves', {
                    a: Math.min(myTotals.moves, theirTotals.moves),
                    b: Math.max(myTotals.moves, theirTotals.moves),
                  })
                : ta('wonOnTime', {
                    moves: myTotals.moves,
                    a: formatAltTime(Math.min(myTotals.timeMs, theirTotals.timeMs)),
                    b: formatAltTime(Math.max(myTotals.timeMs, theirTotals.timeMs)),
                  })}
          </p>
        </div>
      )}

      <div className="panel overflow-x-auto p-5">
        <h3 className="font-display text-lg font-bold">{ta('scoresTitle')}</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-chalk">
              <th scope="col" className="py-2 pr-3 font-medium">
                <span className="sr-only">{t('round')}</span>
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-white">{t('you')}</th>
              <th scope="col" className="max-w-[8rem] truncate py-2 font-semibold text-white">{otherName}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {Array.from({ length: alt.rounds }, (_, round) => (
              <tr key={round}>
                <th scope="row" className="whitespace-nowrap py-2 pr-3 font-medium text-chalk">{ta('roundN', { n: round + 1 })}</th>
                <td className="py-2 pr-3 tabular-nums">{cell(mine, round)}</td>
                <td className="py-2 tabular-nums">{cell(theirs, round)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/20 font-semibold">
              <th scope="row" className="py-2 pr-3">{ta('total')}</th>
              <td className="py-2 pr-3 tabular-nums">{ta('movesTime', { moves: myTotals.moves, time: formatAltTime(myTotals.timeMs) })}</td>
              <td className="py-2 tabular-nums">{ta('movesTime', { moves: theirTotals.moves, time: formatAltTime(theirTotals.timeMs) })}</td>
            </tr>
          </tfoot>
        </table>
        {!alt.finished && sameRounds > 0 && leadBy !== 0 && (
          <p className="mt-3 text-sm text-chalk">
            {leadBy > 0 ? ta('youLead', { count: leadBy }) : ta('theyLead', { name: otherName, count: -leadBy })}
          </p>
        )}
      </div>

      {!alt.finished && (
        <div className="panel space-y-4 p-5">
          <OpponentStatus room={room} mySeat={mySeat} />
          {mine?.playing ? (
            <button type="button" onClick={onPlay} className="btn-gold w-full sm:w-auto" autoFocus>
              <Play className="h-4 w-4" aria-hidden="true" />
              {ta('resumeRound', { round: mine.playing.round })}
            </button>
          ) : mine?.canPlay ? (
            <button type="button" onClick={onPlay} className="btn-gold w-full sm:w-auto" autoFocus>
              <Play className="h-4 w-4" aria-hidden="true" />
              {ta('playRound', { round: nextRound })}
            </button>
          ) : (
            <p className="text-chalk" aria-live="polite">
              {(mine?.results.length ?? 0) >= alt.rounds
                ? ta('allDoneWaiting', { name: otherName })
                : ta('waitingTurn', { name: otherName, round: nextRound - 1 })}
            </p>
          )}
          {errorLine}
        </div>
      )}

      {share}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {alt.finished && (
          <button type="button" onClick={onRematch} className="btn-gold">
            {ta('rematch')}
          </button>
        )}
        <button type="button" onClick={onLeave} className="btn-quiet sm:ml-auto">
          {alt.finished ? t('leaveRoom') : t('quitGame')}
        </button>
      </div>
      <p className="text-sm text-chalk">{alt.finished ? ta('rematchHint') : ta('quitHint', { name: otherName })}</p>
    </section>
  );
}
