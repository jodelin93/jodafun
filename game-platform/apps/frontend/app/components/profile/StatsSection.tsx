import Link from 'next/link';
import { formatTime, type Difficulty } from '../../lib/leaderboard';
import type { UserStats } from '../../lib/users';
import { useT } from '../../i18n/I18nProvider';
import { profileMessages } from '../../i18n/messages/profile';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

export default function StatsSection({ stats, canPlay }: { stats: UserStats; canPlay: boolean }) {
  const t = useT(profileMessages);
  const figures = [
    { label: t('games'), value: stats.gamesPlayed },
    { label: t('wins'), value: stats.wins },
    { label: t('winRate'), value: `${stats.winRate}%` },
    { label: t('bestStreak'), value: stats.bestStreak },
    { label: t('currentStreak'), value: stats.currentStreak },
  ];
  return (
    <>
      <section aria-labelledby="stats-h" className="mt-8">
        <h2 id="stats-h" className="title-md">
          {t('statsWithFriends')}
        </h2>
        <dl className="panel mt-3 grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-5 sm:p-5">
          {figures.map((f) => (
            <div key={f.label}>
              <dt className="text-sm text-chalk">{f.label}</dt>
              <dd className="font-display text-2xl font-bold">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="solo-h" className="mt-8">
        <h2 id="solo-h" className="title-md">
          {t('soloBests')}
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {DIFFS.map((id) => {
            const best = stats.solo?.[id] ?? null;
            return (
              <li key={id} className="panel p-4">
                <h3 className="font-semibold">{t(id)}</h3>
                {best ? (
                  <>
                    <p className="mt-1 font-display text-2xl font-bold">{formatTime(best.bestTimeSeconds)}</p>
                    <p className="text-sm text-chalk">
                      {t(best.runs === 1 ? 'movesRunsOne' : 'movesRunsOther', { moves: best.bestMoves, runs: best.runs })}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-chalk">
                    {t('noRunsYet')}
                    {canPlay && (
                      <>
                        {'. '}
                        <Link href="/games/joda-memory" className="underline underline-offset-2 hover:text-white">
                          {t('playSolo')}
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
