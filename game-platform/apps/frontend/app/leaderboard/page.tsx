'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Medal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n/I18nProvider';
import { homeMessages } from '../i18n/messages/home';
import { useGuestPlay } from '../lib/useGuestPlay';
import { fetchFriendsLeaderboard, type FriendsEntry, type Period } from '../lib/leaderboard';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import Loading from '../components/ui/Loading';

// Only games played with a friend count here, and only once they reached round 4 (the server filters)
type Entry = FriendsEntry;

const PERIODS = [
  { id: 'day', label: 'periodDay' },
  { id: 'week', label: 'periodWeek' },
  { id: 'month', label: 'periodMonth' },
  { id: 'all', label: 'periodAll' },
] as const;

const MEDAL_RING = { 1: 'ring-[#FFC23D]', 2: 'ring-[#C9D1D3]', 3: 'ring-[#D08A52]' } as const;
const MEDAL_ICON = { 1: 'text-[#B9800A]', 2: 'text-[#6B7678]', 3: 'text-[#A8602B]' } as const;
const MEDAL_NAME = { 1: 'place1', 2: 'place2', 3: 'place3' } as const;

const COLS = 'grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem]';

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const labelId = `lb-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={labelId}>
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={`btn btn-sm min-h-[44px] ring-1 ring-inset ${
              value === o.id ? 'bg-white text-ink ring-white' : 'bg-white/5 text-white ring-white/20 hover:bg-white/10'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Podium({ entries, youId }: { entries: Entry[]; youId?: string }) {
  const t = useT(homeMessages);
  const count = (n: number, one: 'gameCountOne' | 'winCountOne', other: 'gameCountOther' | 'winCountOther') =>
    t(n === 1 ? one : other, { n });
  const top = entries.slice(0, 3);
  return (
    <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end" aria-label={t('topThree')}>
      {top.map((e, i) => {
        const rank = (i + 1) as 1 | 2 | 3;
        return (
          <li
            key={e.userId}
            className={`flex min-w-0 flex-col items-center rounded-card bg-card p-5 text-center text-ink shadow-rest ring-4 ${MEDAL_RING[rank]} ${
              rank === 1 ? 'sm:order-2 sm:py-10' : rank === 2 ? 'sm:order-1' : 'sm:order-3'
            }`}
          >
            <Medal className={`h-8 w-8 ${MEDAL_ICON[rank]}`} aria-hidden="true" />
            <p className="mt-1 text-sm font-semibold text-ink-soft">{t(MEDAL_NAME[rank])}</p>
            <h3 className="title-md mt-2 max-w-full break-words">
              <Link href={`/profile/${e.userId}`} className="underline-offset-2 hover:underline">
                {e.name}
              </Link>
            </h3>
            {(e.isGuest || e.userId === youId) && (
              <p className="mt-1 flex flex-wrap justify-center gap-1.5 text-xs font-semibold text-ink-soft">
                {e.isGuest && <span className="rounded-full bg-ink/10 px-2 py-0.5">{t('guest')}</span>}
                {e.userId === youId && <span className="rounded-full bg-ink/10 px-2 py-0.5">{t('you')}</span>}
              </p>
            )}
            <p className="mt-2 font-display text-3xl font-extrabold">{e.wins}</p>
            <p className="text-sm text-ink-soft">{t(e.wins === 1 ? 'winOne' : 'winOther')}</p>
            <p className="mt-2 text-sm text-ink-soft">
              {t('podiumStats', { games: count(e.games, 'gameCountOne', 'gameCountOther'), rate: e.winRate })}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function RankedList({ entries, youId }: { entries: Entry[]; youId?: string }) {
  const t = useT(homeMessages);
  const cols = COLS;
  return (
    <div className="panel mt-8 overflow-hidden">
      <div className={`grid ${cols} items-center gap-3 border-b border-table-rim px-4 py-3 text-sm text-chalk sm:px-5`}>
        <div>{t('colRank')}</div>
        <div>{t('colPlayer')}</div>
        <div className="text-right">{t('colWins')}</div>
        <div className="hidden text-right sm:block">{t('colGames')}</div>
        <div className="hidden text-right sm:block">{t('colWinRate')}</div>
      </div>
      <ul className="divide-y divide-table-rim">
        {entries.map((e) => {
          const isYou = e.userId === youId;
          return (
            <li
              key={e.userId}
              className={`grid ${cols} items-center gap-3 px-4 py-3 sm:px-5 ${isYou ? 'bg-white/10' : ''}`}
            >
              <div className="font-display text-lg font-bold">{e.rank}</div>
              <div className="min-w-0">
                <Link href={`/profile/${e.userId}`} className="break-words font-semibold underline-offset-2 hover:underline">
                  {e.name}
                </Link>
                {e.isGuest && <span className="chip ml-2 px-2 py-0.5 text-xs">{t('guest')}</span>}
                {isYou && <span className="chip ml-2 px-2 py-0.5 text-xs">{t('you')}</span>}
                <p className="text-xs text-chalk sm:hidden">
                  {`${t(e.wins === 1 ? 'winCountOne' : 'winCountOther', { n: e.wins })}, ${t(e.games === 1 ? 'gameCountOne' : 'gameCountOther', { n: e.games })}`}
                </p>
              </div>
              <div className="text-right font-semibold">{e.wins}</div>
              <div className="hidden text-right sm:block">{e.games}</div>
              <div className="hidden text-right sm:block">{e.winRate}%</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SkeletonList() {
  const t = useT(homeMessages);
  return (
    <div className="panel mt-8 overflow-hidden" role="status" aria-label={t('lbLoadingAria')}>
      <ul className="divide-y divide-table-rim">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="h-6 w-8 rounded bg-white/10" />
            <div className="h-6 flex-1 rounded bg-white/10" />
            <div className="h-6 w-14 rounded bg-white/10" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeaderboardContent() {
  const t = useT(homeMessages);
  const { user, isPending } = useAuth();
  const { play, loading: starting, error: playError } = useGuestPlay();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const pParam = params.get('period');
  const period: Period = pParam === 'day' || pParam === 'week' || pParam === 'month' ? pParam : 'all';

  const setPeriod = (next: Period) => {
    router.replace(`${pathname}?period=${next}`, { scroll: false });
  };

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setEntries(null);
    setFailed(false);
    fetchFriendsLeaderboard(period, controller.signal)
      .then((data) => setEntries(data))
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load leaderboard:', err);
        setFailed(true);
      });
    return () => controller.abort();
  }, [period, attempt]);

  const isGuestUser = !!user && user.email.endsWith('@guest.local');

  if (isPending) return <Loading />;

  return (
    <>
      <h1 className="title-lg">{t('lbTitle')}</h1>
      <p className="mt-2 max-w-xl text-chalk">
        {t('lbIntro')}
      </p>

      <div>
        <div className="panel mt-6 p-4 sm:p-5">
          <Segmented label={t('timeFrame')} options={PERIODS.map((p) => ({ id: p.id, label: t(p.label) }))} value={period} onChange={setPeriod} />
        </div>

        {failed ? (
          <div className="panel mt-8 max-w-xl p-5 sm:p-6" role="alert">
            <p className="text-chalk">{t('lbFailed')}</p>
            <button type="button" className="btn-quiet mt-4" onClick={() => setAttempt((n) => n + 1)}>
              {t('tryAgain')}
            </button>
          </div>
        ) : entries === null ? (
          <SkeletonList />
        ) : entries.length === 0 ? (
          <div className="panel mt-8 max-w-xl p-5 sm:p-6">
            <p className="text-chalk">
              {t('lbEmpty')}
            </p>
            <button type="button" className="btn-gold mt-4" disabled={starting} onClick={() => play('/games/joda-memory')}>
              {t('startGame')}
            </button>
            {playError && (
              <p className="mt-3 text-sm text-chalk" role="alert">
                {playError}
              </p>
            )}
          </div>
        ) : (
          <>
            <Podium entries={entries} youId={user?.id} />
            <RankedList entries={entries} youId={user?.id} />
          </>
        )}
      </div>

      {(!user || isGuestUser) && (
        <div className="panel mt-8 max-w-xl p-5 sm:p-6">
          <h2 className="title-md">{t('saveScores')}</h2>
          {isGuestUser ? (
            <>
              <p className="mt-2 text-chalk">{t('saveScoresGuest')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/convert-account" className="btn-quiet">
                  {t('createAccountShort')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-chalk">{t('saveScoresNew')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/signup" className="btn-quiet">
                  {t('createAccountShort')}
                </Link>
                <Link href="/login" className="btn-quiet">
                  {t('signIn')}
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function LeaderboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-8 sm:py-12">
        <Suspense fallback={<Loading />}>
          <LeaderboardContent />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
