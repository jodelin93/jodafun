'use client';

import { RotateCcw, Trophy } from 'lucide-react';
import { teamOfSeat, type DominoOutcome } from '../../lib/dominoes/types';
import { useT } from '../../i18n/I18nProvider';
import { dominoesMessages } from '../../i18n/messages/dominoes';
import HandResultView from './HandResultView';

type Props = {
  outcome: DominoOutcome;
  players: 2 | 4;
  mySeat: number;
  nameOf: (seat: number) => string;
  onRematch: () => void;
  onLeave: () => void;
};

// The end of a match: who won (or who forfeited), the final score and every hand's breakdown
export default function DominoesResults({ outcome, players, mySeat, nameOf, onRematch, onLeave }: Props) {
  const t = useT(dominoesMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const myTeam = teamOfSeat(players, mySeat);
  const sideName = (team: number) => (players === 4 ? (team === myTeam ? t('yourSide') : t('theirSide')) : nameOf(team));
  const won = outcome.winnerTeam === myTeam;
  const headline =
    outcome.winnerTeam === null
      ? t('matchAbandoned')
      : outcome.forfeit
        ? won
          ? t('forfeitWin')
          : t('forfeitLoss')
        : won
          ? players === 4
            ? t('yourTeamWins')
            : t('youWin')
          : players === 4
            ? t('theirTeamWins')
            : t('winsMatch', { name: sideName(outcome.winnerTeam) });

  return (
    <section aria-labelledby="result-title" className="panel space-y-4 p-5">
      <Trophy className={`h-9 w-9 ${won ? 'text-gold' : 'text-chalk'}`} aria-hidden="true" />
      <h1 id="result-title" className="title-lg">
        {headline}
      </h1>
      <p className="font-display text-2xl font-bold tabular-nums">
        {t('finalScore')}: {sideName(0)} {outcome.scores[0] ?? 0} – {outcome.scores[1] ?? 0} {sideName(1)}
      </p>
      {outcome.results.length > 0 && (
        <div>
          <h2 className="title-md">{t('handsTitle')}</h2>
          <ol className="mt-2 space-y-2">
            {outcome.results.map((r, i) => (
              <li key={r.hand}>
                <details className="rounded-xl bg-felt-deep p-3" open={i === outcome.results.length - 1}>
                  <summary className="cursor-pointer text-sm font-semibold">
                    {t('handN', { n: r.hand })} · {t('matchTotal', { a: r.scoresAfter[0] ?? 0, b: r.scoresAfter[1] ?? 0 })}
                  </summary>
                  <div className="mt-3">
                    <HandResultView tx={tx} result={r} players={players} mySeat={mySeat} nameOf={nameOf} sideName={sideName} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRematch} className="btn-gold min-h-11">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('playAgain')}
        </button>
        <button type="button" onClick={onLeave} className="btn-quiet min-h-11">
          {t('backToMenu')}
        </button>
      </div>
    </section>
  );
}
