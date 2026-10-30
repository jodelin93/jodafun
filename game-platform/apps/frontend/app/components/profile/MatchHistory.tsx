'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useGuestPlay } from '../../lib/useGuestPlay';
import { useLocale, useT } from '../../i18n/I18nProvider';
import { profileMessages } from '../../i18n/messages/profile';
import type { PlayableGameId } from '../../lib/games';
import { useGameTitle } from '../../lib/useGameTitle';
import {
  fetchMyCasinoHistory,
  fetchMyDominoesHistory,
  fetchMyDraughtsHistory,
  fetchMyHistory,
  relativeDate,
  UnauthorizedError,
  type CasinoHistoryItem,
  type CasinoPlayer,
  type DraughtsHistoryItem,
  type GameResult,
  type HistoryItem,
} from '../../lib/users';

const HISTORY_GAMES: PlayableGameId[] = ['joda-memory', 'african-casino', 'dominoes', 'international-draughts'];

// The ways a draughts game ends, as the history labels them (EndReason on the server)
const DRAUGHTS_REASONS = ['no-pieces', 'blocked', 'resignation', 'forfeit', 'agreement', 'repetition', 'kings-25', 'endgame-16', 'long-diagonal-5', 'endgame-5'] as const;

function ResultChips({ result, forfeit }: { result: GameResult; forfeit: boolean }) {
  const t = useT(profileMessages);
  const won = result === 'win';
  return (
    <>
      <span
        className={`chip px-2.5 py-0.5 font-semibold ${won ? 'bg-gold/10 text-white ring-2 ring-gold' : result === 'draw' ? 'text-white ring-chalk/60' : ''}`}
      >
        {won ? t('win') : result === 'draw' ? t('draw') : t('loss')}
      </span>
      {forfeit && <span className="chip px-2.5 py-0.5">{t('forfeit')}</span>}
    </>
  );
}

function PlayedAt({ iso }: { iso: string }) {
  const t = useT(profileMessages);
  const { intlLocale } = useLocale();
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString(intlLocale)} className="w-full text-xs text-chalk sm:w-auto">
      {relativeDate(iso, intlLocale, t('justNow'))}
    </time>
  );
}

function HistoryRow({ g }: { g: HistoryItem }) {
  const t = useT(profileMessages);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
      <ResultChips result={g.result} forfeit={g.forfeit} />
      <span className="min-w-0 flex-1 break-words font-semibold">{g.opponentName ?? t('anonymousPlayer')}</span>
      <span className="text-sm text-chalk">
        {t('score', { won: g.roundsWon, lost: g.roundsLost })}
        {g.difficulty ? `, ${g.difficulty === 'easy' || g.difficulty === 'medium' || g.difficulty === 'hard' ? t(g.difficulty) : g.difficulty}` : ''}
      </span>
      <PlayedAt iso={g.playedAt} />
    </li>
  );
}

// Joda Casino and Dominoes rows share a shape; Dominoes names its modes instead of a player count
function CasinoRow({ g, game = 'african-casino' }: { g: CasinoHistoryItem; game?: 'african-casino' | 'dominoes' }) {
  const t = useT(profileMessages);
  // "Ana", "Ana and Ben", "Ana, Ben and Cy"
  const names = (players: CasinoPlayer[]) => {
    const list = players.map((p) => p.name || t('anonymousPlayer'));
    if (list.length < 2) return list[0] ?? t('anonymousPlayer');
    return t('namesAnd', { rest: list.slice(0, -1).join(', '), last: list[list.length - 1]! });
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
      <ResultChips result={g.result} forfeit={g.forfeit} />
      <span className="chip px-2.5 py-0.5">
        {game === 'dominoes' ? t((g.mode ?? (g.players === 4 ? 'partners' : 'head-to-head')) === 'partners' ? 'dominoesPartners' : 'dominoesHeadToHead') : t('casinoPlayers', { n: g.players })}
      </span>
      <span className="min-w-0 flex-1 break-words">
        {g.players === 4 && g.teammates.length > 0 && (
          <span className="text-chalk">{t('casinoWith', { names: names(g.teammates) })} </span>
        )}
        <span className="font-semibold">{t('casinoVs', { names: names(g.opponents) })}</span>
      </span>
      <span className="text-sm text-chalk">
        <span aria-hidden="true">
          {g.teamPoints}–{g.opponentPoints}
        </span>
        <span className="sr-only">{t('casinoScoreSr', { for: g.teamPoints, against: g.opponentPoints })}</span>
      </span>
      <PlayedAt iso={g.playedAt} />
    </li>
  );
}

// A draughts game: result, colour played, opponent, how it ended and its length
function DraughtsRow({ g }: { g: DraughtsHistoryItem }) {
  const t = useT(profileMessages);
  const known = (DRAUGHTS_REASONS as readonly (string | null)[]).includes(g.reason);
  const reason = known ? t(`reason_${g.reason as (typeof DRAUGHTS_REASONS)[number]}`) : g.reason;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
      <ResultChips result={g.result} forfeit={g.forfeit} />
      <span className="chip px-2.5 py-0.5">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ring-1 ${g.color === 'white' ? 'bg-card ring-ink/30' : 'bg-ink ring-white/40'}`}
        />
        {g.color === 'white' ? t('playedWhite') : t('playedBlack')}
      </span>
      <span className="min-w-0 flex-1 break-words font-semibold">{t('casinoVs', { names: g.opponent?.name || t('anonymousPlayer') })}</span>
      <span className="text-sm text-chalk" title={g.rulesVersion ? t('draughtsRules', { version: g.rulesVersion }) : undefined}>
        {reason ? `${reason} · ` : ''}
        {t('draughtsMoves', { n: g.moves })}
      </span>
      <PlayedAt iso={g.finishedAt} />
    </li>
  );
}

// One game's history: its own loading, empty, error and "load more" states
function HistoryList<T extends { id: string }>({
  fetchPage,
  renderRow,
  emptyText,
  playPath,
  onUnauthorized,
}: {
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<{ items: T[]; nextCursor: string | null }>;
  renderRow: (item: T) => ReactNode;
  emptyText: string;
  playPath: string;
  onUnauthorized: () => void;
}) {
  const t = useT(profileMessages);
  const { play, loading: starting, error: playError } = useGuestPlay();
  const [items, setItems] = useState<T[] | null>(null);
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
      fetchPage(from, c.signal)
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
    [fetchPage, onUnauthorized],
  );

  useEffect(() => {
    load(null);
    return () => controller.current?.abort();
  }, [load, attempt]);

  return (
    <>
      {failed && (
        <div className="panel mt-3 max-w-xl p-5" role="alert">
          <p className="text-chalk">{t('historyLoadFailed')}</p>
          <button
            type="button"
            className="btn-quiet mt-4"
            onClick={() => (items ? load(cursor) : setAttempt((n) => n + 1))}
          >
            {t('tryAgain')}
          </button>
        </div>
      )}
      {!failed && items === null && (
        <div className="panel mt-3 overflow-hidden" role="status" aria-label={t('loadingHistory')}>
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
          <p className="text-chalk">{emptyText}</p>
          <button type="button" className="btn-gold mt-4" disabled={starting} onClick={() => play(playPath)}>
            {t('startGame')}
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
          <ul className="divide-y divide-table-rim">{items.map(renderRow)}</ul>
        </div>
      )}
      {items && items.length > 0 && cursor && !failed && (
        <button type="button" className="btn-quiet mt-4" disabled={more} onClick={() => load(cursor)}>
          {more ? t('loading') : t('loadMore')}
        </button>
      )}
    </>
  );
}

export default function MatchHistory({ onUnauthorized }: { onUnauthorized: () => void }) {
  const t = useT(profileMessages);
  const { title: gameTitle } = useGameTitle();
  const [game, setGame] = useState<PlayableGameId>('joda-memory');
  // A game's list loads the first time its tab opens, then stays mounted so switching back keeps its pages
  const [opened, setOpened] = useState<PlayableGameId[]>(['joda-memory']);
  const tabRefs = useRef<Partial<Record<PlayableGameId, HTMLButtonElement | null>>>({});

  const select = (id: PlayableGameId) => {
    setGame(id);
    setOpened((list) => (list.includes(id) ? list : [...list, id]));
  };

  // Arrow keys move between tabs, as in any tab list
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = HISTORY_GAMES.indexOf(game);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (i + 1) % HISTORY_GAMES.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + HISTORY_GAMES.length) % HISTORY_GAMES.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = HISTORY_GAMES.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = HISTORY_GAMES[next]!;
    select(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <section aria-labelledby="hist-h" className="mt-8">
      <h2 id="hist-h" className="title-md">
        {t('matchHistory')}
      </h2>
      <div
        role="tablist"
        aria-label={t('historyGame')}
        onKeyDown={onTabKey}
        className="mt-3 inline-flex max-w-full overflow-x-auto rounded-full bg-white/5 p-1 ring-1 ring-inset ring-white/10"
      >
        {HISTORY_GAMES.map((id) => {
          const active = id === game;
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`hist-tab-${id}`}
              aria-selected={active}
              aria-controls={`hist-panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(id)}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 focus-visible:[outline-offset:-3px] text-sm font-semibold transition ${
                active ? 'bg-gold text-ink' : 'text-chalk hover:text-white'
              }`}
            >
              {gameTitle(id)}
            </button>
          );
        })}
      </div>
      {HISTORY_GAMES.filter((id) => opened.includes(id)).map((id) => (
        <div key={id} role="tabpanel" id={`hist-panel-${id}`} aria-labelledby={`hist-tab-${id}`} hidden={id !== game}>
          {id === 'international-draughts' ? (
            <HistoryList
              fetchPage={fetchMyDraughtsHistory}
              renderRow={(g) => <DraughtsRow key={g.id} g={g} />}
              emptyText={t('noDraughtsGamesYet')}
              playPath="/games/international-draughts"
              onUnauthorized={onUnauthorized}
            />
          ) : id === 'dominoes' ? (
            <HistoryList
              fetchPage={fetchMyDominoesHistory}
              renderRow={(g) => <CasinoRow key={g.id} g={g} game="dominoes" />}
              emptyText={t('noDominoesGamesYet')}
              playPath="/games/dominoes"
              onUnauthorized={onUnauthorized}
            />
          ) : id === 'african-casino' ? (
            <HistoryList
              fetchPage={fetchMyCasinoHistory}
              renderRow={(g) => <CasinoRow key={g.id} g={g} />}
              emptyText={t('noCasinoGamesYet')}
              playPath="/games/african-casino"
              onUnauthorized={onUnauthorized}
            />
          ) : (
            <HistoryList
              fetchPage={fetchMyHistory}
              renderRow={(g) => <HistoryRow key={g.id} g={g} />}
              emptyText={t('noGamesYet')}
              playPath="/games/joda-memory"
              onUnauthorized={onUnauthorized}
            />
          )}
        </div>
      ))}
    </section>
  );
}
