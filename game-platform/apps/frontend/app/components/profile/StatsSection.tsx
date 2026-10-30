import Link from 'next/link';
import { formatTime, type Difficulty } from '../../lib/leaderboard';
import { GAME_TITLES } from '../../lib/games';
import { useGameTitle } from '../../lib/useGameTitle';
import type { UserStats } from '../../lib/users';
import { useT } from '../../i18n/I18nProvider';
import { profileMessages } from '../../i18n/messages/profile';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

export default function StatsSection({ stats, canPlay }: { stats: UserStats; canPlay: boolean }) {
  const t = useT(profileMessages);
  const { title: gameTitle } = useGameTitle();
  const figures = [
    { label: t('games'), value: stats.gamesPlayed },
    { label: t('wins'), value: stats.wins },
    { label: t('winRate'), value: `${stats.winRate}%` },
    { label: t('bestStreak'), value: stats.bestStreak },
    { label: t('currentStreak'), value: stats.currentStreak },
  ];
  // Its own section: Casino points are match points and never add up with Memory numbers
  const casino = stats.casino;
  const casinoFigures = casino
    ? [
        { label: t('games'), value: casino.gamesPlayed },
        { label: t('wins'), value: casino.wins },
        { label: t('winRate'), value: `${casino.winRate}%` },
        { label: t('casinoGamesTwo'), value: casino.twoPlayer },
        { label: t('casinoGamesFour'), value: casino.fourPlayer },
        { label: t('pointsFor'), value: casino.pointsFor },
        { label: t('pointsAgainst'), value: casino.pointsAgainst },
      ]
    : [];
  // Dominoes points are match points too, kept apart from both other games
  const dominoes = stats.dominoes;
  const dominoesFigures = dominoes
    ? [
        { label: t('games'), value: dominoes.gamesPlayed },
        { label: t('wins'), value: dominoes.wins },
        { label: t('winRate'), value: `${dominoes.winRate}%` },
        { label: t('dominoesGamesTwo'), value: dominoes.twoPlayer },
        { label: t('dominoesGamesFour'), value: dominoes.fourPlayer },
        { label: t('pointsFor'), value: dominoes.pointsFor },
        { label: t('pointsAgainst'), value: dominoes.pointsAgainst },
      ]
    : [];
  // Draughts games can be drawn: draws are shown on their own and never count as wins
  const draughts = stats.draughts;
  const draughtsFigures = draughts
    ? [
        { label: t('games'), value: draughts.gamesPlayed },
        { label: t('wins'), value: draughts.wins },
        { label: t('draws'), value: draughts.draws },
        { label: t('losses'), value: draughts.losses },
        { label: t('winRate'), value: `${draughts.winRate}%` },
        { label: t('currentStreak'), value: draughts.currentStreak },
        { label: t('bestStreak'), value: draughts.bestStreak },
      ]
    : [];
  const byColor = draughts
    ? ([
        ['white', t('draughtsAsWhite'), draughts.asWhite],
        ['black', t('draughtsAsBlack'), draughts.asBlack],
      ] as const)
    : [];
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

      {casino && (
        <section aria-labelledby="casino-h" className="mt-8">
          <h2 id="casino-h" className="title-md">
            {GAME_TITLES['african-casino']}
          </h2>
          <dl className="panel mt-3 grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-4 sm:p-5">
            {casinoFigures.map((f) => (
              <div key={f.label}>
                <dt className="text-sm text-chalk">{f.label}</dt>
                <dd className="font-display text-2xl font-bold">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm text-chalk">{t('casinoPointsNote')}</p>
        </section>
      )}

      {dominoes && (
        <section aria-labelledby="dominoes-h" className="mt-8">
          <h2 id="dominoes-h" className="title-md">
            {GAME_TITLES.dominoes}
          </h2>
          <dl className="panel mt-3 grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-4 sm:p-5">
            {dominoesFigures.map((f) => (
              <div key={f.label}>
                <dt className="text-sm text-chalk">{f.label}</dt>
                <dd className="font-display text-2xl font-bold">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm text-chalk">{t('dominoesPointsNote')}</p>
        </section>
      )}

      {draughts && (
        <section aria-labelledby="draughts-h" className="mt-8">
          <h2 id="draughts-h" className="title-md">
            {gameTitle('international-draughts')}
          </h2>
          <dl className="panel mt-3 grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-4 sm:p-5">
            {draughtsFigures.map((f) => (
              <div key={f.label}>
                <dt className="text-sm text-chalk">{f.label}</dt>
                <dd className="font-display text-2xl font-bold">{f.value}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {byColor.map(([color, label, c]) => (
              <li key={color} className="panel p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <span
                    aria-hidden="true"
                    className={`h-3 w-3 rounded-full ring-1 ${color === 'white' ? 'bg-card ring-ink/30' : 'bg-ink ring-white/40'}`}
                  />
                  {label}
                </h3>
                <p className="mt-1 font-display text-2xl font-bold">{c.gamesPlayed}</p>
                <p className="text-sm text-chalk">{t('draughtsColorLine', { wins: c.wins, draws: c.draws, losses: c.losses })}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-chalk">{t('draughtsNote')}</p>
        </section>
      )}
    </>
  );
}
