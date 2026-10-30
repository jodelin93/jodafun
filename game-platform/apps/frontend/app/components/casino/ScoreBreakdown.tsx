'use client';

import type { HandResult, TeamHandScore } from '../../lib/casino/types';

const NONE: TeamHandScore = { cards: 0, spades: 0, mostCards: 0, mostSpades: 0, twoOfSpades: 0, tenOfDiamonds: 0, aces: 0, total: 0 };
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';

// One hand's points for both sides, item by item (11 in all)
export default function ScoreBreakdown({ result, teamNames }: { result: HandResult; teamNames: string[] }) {
  const t = useT(casinoMessages);
  const side = (team: number) => result.teams[team] ?? NONE;
  const rows: { label: string; values: (team: number) => string | number }[] = [
    { label: t('bdMostCards'), values: team => `${side(team).mostCards} (${t('bdCards', { n: side(team).cards })})` },
    { label: t('bdMostSpades'), values: team => `${side(team).mostSpades} (${t('bdSpades', { n: side(team).spades })})` },
    { label: t('bdTwoOfSpades'), values: team => side(team).twoOfSpades },
    { label: t('bdTenOfDiamonds'), values: team => side(team).tenOfDiamonds },
    { label: t('bdAces'), values: team => side(team).aces },
  ];
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t('handN', { n: result.hand })}</caption>
      <thead>
        <tr className="text-left text-chalk">
          <th scope="col" className="py-1 font-medium">
            <span className="sr-only">{t('scoreLabel')}</span>
          </th>
          {teamNames.map(name => (
            <th key={name} scope="col" className="py-1 text-right font-medium">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map(row => (
          <tr key={row.label} className="border-t border-white/10">
            <th scope="row" className="py-1 text-left font-normal text-chalk">
              {row.label}
            </th>
            {[0, 1].map(team => (
              <td key={team} className="py-1 text-right">
                {row.values(team)}
              </td>
            ))}
          </tr>
        ))}
        <tr className="border-t border-white/20 font-semibold">
          <th scope="row" className="py-1 text-left">
            {t('bdTotal')}
          </th>
          {[0, 1].map(team => (
            <td key={team} className="py-1 text-right text-gold">
              {side(team).total}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
