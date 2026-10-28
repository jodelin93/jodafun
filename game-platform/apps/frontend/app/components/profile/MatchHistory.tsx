'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuestPlay } from '../../lib/useGuestPlay';
import { fetchMyHistory, relativeDate, UnauthorizedError, type HistoryItem } from '../../lib/users';

function HistoryRow({ g }: { g: HistoryItem }) {
  const won = g.result === 'win';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
      <span
        className={`chip px-2.5 py-0.5 font-semibold ${won ? 'bg-gold/10 text-white ring-2 ring-gold' : ''}`}
      >
        {won ? 'Win' : 'Loss'}
      </span>
      {g.forfeit && <span className="chip px-2.5 py-0.5">Forfeit</span>}
      <span className="min-w-0 flex-1 break-words font-semibold">{g.opponentName ?? 'Anonymous player'}</span>
      <span className="text-sm text-chalk">
        {g.roundsWon} to {g.roundsLost}
        {g.difficulty ? `, ${g.difficulty}` : ''}
      </span>
      <time dateTime={g.playedAt} title={new Date(g.playedAt).toLocaleString()} className="w-full text-xs text-chalk sm:w-auto">
        {relativeDate(g.playedAt)}
      </time>
    </li>
  );
}

export default function MatchHistory({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { play, loading: starting, error: playError } = useGuestPlay();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    (from: string | null) => {
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;
      setFailed(false);
      setMore(from !== null);
      fetchMyHistory(from, c.signal)
        .then((page) => {
          setItems((prev) => (from ? [...(prev ?? []), ...page.items] : page.items));
          setCursor(page.nextCursor);
          setMore(false);
        })
        .catch((err) => {
          if (c.signal.aborted) return;
          if (err instanceof UnauthorizedError) return onUnauthorized();
          console.error('Failed to load history:', err);
          setFailed(true);
          setMore(false);
        });
    },
    [onUnauthorized],
  );

  useEffect(() => {
    load(null);
    return () => controller.current?.abort();
  }, [load, attempt]);

  return (
    <section aria-labelledby="hist-h" className="mt-8">
      <h2 id="hist-h" className="title-md">
        Match history
      </h2>
      {failed && (
        <div className="panel mt-3 max-w-xl p-5" role="alert">
          <p className="text-chalk">Couldn&apos;t load your match history. Check your connection and try again.</p>
          <button
            type="button"
            className="btn-quiet mt-4"
            onClick={() => (items ? load(cursor) : setAttempt((n) => n + 1))}
          >
            Try again
          </button>
        </div>
      )}
      {!failed && items === null && (
        <div className="panel mt-3 overflow-hidden" role="status" aria-label="Loading match history">
          <ul className="divide-y divide-table-rim">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="px-4 py-3 sm:px-5">
                <div className="h-6 rounded bg-white/10" />
              </li>
            ))}
          </ul>
        </div>
      )}
      {items && items.length === 0 && !failed && (
        <div className="panel mt-3 max-w-xl p-5 sm:p-6">
          <p className="text-chalk">No games with friends yet. Start a game and send your friend the link.</p>
          <button type="button" className="btn-gold mt-4" disabled={starting} onClick={() => play('/games/joda-memory')}>
            Start a game
          </button>
          {playError && (
            <p className="mt-3 text-sm text-chalk" role="alert">
              {playError}
            </p>
          )}
        </div>
      )}
      {items && items.length > 0 && (
        <div className="panel mt-3 overflow-hidden">
          <ul className="divide-y divide-table-rim">
            {items.map((g) => (
              <HistoryRow key={g.id} g={g} />
            ))}
          </ul>
        </div>
      )}
      {items && items.length > 0 && cursor && !failed && (
        <button type="button" className="btn-quiet mt-4" disabled={more} onClick={() => load(cursor)}>
          {more ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
