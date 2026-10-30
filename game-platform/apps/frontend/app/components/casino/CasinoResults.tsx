'use client';

import { Trophy } from 'lucide-react';
import type { CasinoOutcome } from '../../lib/casino/types';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';
import ScoreBreakdown from './ScoreBreakdown';

type Props = {
  outcome: CasinoOutcome;
  myTeam: number;
  capacity: 2 | 4;
  teamNames: string[];
  onPlayAgain: () => void;
  onLeave: () => void;
};

// The end of a match: who won, the final score and each hand's points
export default function CasinoResults({ outcome, myTeam, capacity, teamNames, onPlayAgain, onLeave }: Props) {
  const t = useT(casinoMessages);
  const won = outcome.winnerTeam === myTeam;
  const headline = outcome.forfeit
    ? won
      ? t('forfeitWin')
      : t('forfeitLoss')
    : won
      ? capacity === 4
        ? t('yourTeamWins')
        : t('youWin')
      : t('winsMatch', { name: teamNames[outcome.winnerTeam ?? 0] ?? '' });
  return (
    <section aria-labelledby="result-title" className="panel space-y-4 p-5">
      <Trophy className={`h-9 w-9 ${won ? 'text-gold' : 'text-chalk'}`} aria-hidden="true" />
      <h2 id="result-title" className="title-lg">
        {headline}
      </h2>
      <p className="font-display text-2xl font-bold tabular-nums">
        {t('finalScore')}: {teamNames[0]} {outcome.scores[0]} – {outcome.scores[1]} {teamNames[1]}
      </p>
      {outcome.results.length > 0 && (
        <div>
          <h3 className="font-semibold">{t('handsTitle')}</h3>
          <ol className="mt-2 space-y-3">
            {outcome.results.map(r => (
              <li key={r.hand} className="rounded-xl bg-felt-deep p-3">
                <p className="text-sm font-semibold">
                  {t('handN', { n: r.hand })} · {t('matchTotal', { a: r.scoresAfter[0] ?? 0, b: r.scoresAfter[1] ?? 0 })}
                </p>
                <ScoreBreakdown result={r} teamNames={teamNames} />
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPlayAgain} className="btn-gold min-h-11">
          {t('playAgain')}
        </button>
        <button type="button" onClick={onLeave} className="btn-quiet min-h-11">
          {t('newRoom')}
        </button>
      </div>
    </section>
  );
}
