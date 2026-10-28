'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Medal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useGuestPlay } from '../lib/useGuestPlay';
import { fetchFriendsLeaderboard, type FriendsEntry, type Period } from '../lib/leaderboard';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import Loading from '../components/ui/Loading';

// Only games played with a friend count here, and only once they reached round 4 (the server filters)
type Entry = FriendsEntry;

const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

const MEDAL_RING = { 1: 'ring-[#FFC23D]', 2: 'ring-[#C9D1D3]', 3: 'ring-[#D08A52]' } as const;
const MEDAL_ICON = { 1: 'text-[#B9800A]', 2: 'text-[#6B7678]', 3: 'text-[#A8602B]' } as const;
const MEDAL_NAME = { 1: '1st place', 2: '2nd place', 3: '3rd place' } as const;

const COLS = 'grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem]';

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
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
  const top = entries.slice(0, 3);
  return (
    <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end" aria-label="Top three players">
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
            <p className="mt-1 text-sm font-semibold text-ink-soft">{MEDAL_NAME[rank]}</p>
            <h3 className="title-md mt-2 max-w-full break-words">
              <Link href={`/profile/${e.userId}`} className="underline-offset-2 hover:underline">
                {e.name}
              </Link>
            </h3>
            {(e.isGuest || e.userId === youId) && (
              <p className="mt-1 flex flex-wrap justify-center gap-1.5 text-xs font-semibold text-ink-soft">
                {e.isGuest && <span className="rounded-full bg-ink/10 px-2 py-0.5">Guest</span>}
                {e.userId === youId && <span className="rounded-full bg-ink/10 px-2 py-0.5">You</span>}
              </p>
            )}
            <p className="mt-2 font-display text-3xl font-extrabold">{e.wins}</p>
            <p className="text-sm text-ink-soft">{e.wins === 1 ? 'win' : 'wins'}</p>
            <p className="mt-2 text-sm text-ink-soft">
              {e.games} {e.games === 1 ? 'game' : 'games'}, {e.winRate}% won
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function RankedList({ entries, youId }: { entries: Entry[]; youId?: string }) {
  const cols = COLS;
  return (
    <div className="panel mt-8 overflow-hidden">
      <div className={`grid ${cols} items-center gap-3 border-b border-table-rim px-4 py-3 text-sm text-chalk sm:px-5`}>
        <div>Rank</div>
        <div>Player</div>
        <div className="text-right">Wins</div>
        <div className="hidden text-right sm:block">Games</div>
        <div className="hidden text-right sm:block">Win rate</div>
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
                {e.isGuest && <span className="chip ml-2 px-2 py-0.5 text-xs">Guest</span>}
                {isYou && <span className="chip ml-2 px-2 py-0.5 text-xs">You</span>}
                <p className="text-xs text-chalk sm:hidden">
                  {`${e.wins} ${e.wins === 1 ? 'win' : 'wins'}, ${e.games} ${e.games === 1 ? 'game' : 'games'}`}
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
  return (
    <div className="panel mt-8 overflow-hidden" role="status" aria-label="Loading the leaderboard">
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
      <h1 className="title-lg">Leaderboard</h1>
      <p className="mt-2 max-w-xl text-chalk">
        Wins in games played with friends. A game counts once it reaches round 4.
      </p>

      <div>
        <div className="panel mt-6 p-4 sm:p-5">
          <Segmented label="Time frame" options={PERIODS} value={period} onChange={setPeriod} />
        </div>

        {failed ? (
          <div className="panel mt-8 max-w-xl p-5 sm:p-6" role="alert">
            <p className="text-chalk">Couldn&apos;t load the leaderboard. Check your connection and try again.</p>
            <button type="button" className="btn-quiet mt-4" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : entries === null ? (
          <SkeletonList />
        ) : entries.length === 0 ? (
          <div className="panel mt-8 max-w-xl p-5 sm:p-6">
            <p className="text-chalk">
              No games with friends have reached round 4 in this period yet. Start a game and send your friend the link.
            </p>
            <button type="button" className="btn-gold mt-4" disabled={starting} onClick={() => play('/games/joda-memory')}>
              Start a game
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
          <h2 className="title-md">Save your scores</h2>
          {isGuestUser ? (
            <>
              <p className="mt-2 text-chalk">Create an account to keep your scores on any device.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/convert-account" className="btn-quiet">
                  Create account
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-chalk">Create an account to keep your results and show up here later.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/signup" className="btn-quiet">
                  Create account
                </Link>
                <Link href="/login" className="btn-quiet">
                  Sign in
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
