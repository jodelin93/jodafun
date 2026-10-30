'use client';

import { ArrowLeft } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import { fiveMessages } from '../../i18n/messages/five';

const SECTIONS = [
  ['rulesGoalTitle', ['rulesGoal1', 'rulesGoal2', 'rulesGoal3']],
  ['rulesTurnTitle', ['rulesTurn1', 'rulesTurn2', 'rulesTurn3']],
  ['rulesGridTitle', ['rulesGrid1', 'rulesGrid2', 'rulesGrid3']],
  ['rulesEndTitle', ['rulesEnd1', 'rulesEnd2', 'rulesEnd3']],
  ['rulesControlsTitle', ['rulesControls1', 'rulesControls2', 'rulesControls3', 'rulesControls4', 'rulesControls5']],
  ['rulesOnlineTitle', ['rulesOnline1', 'rulesOnline2']],
] as const;

// The rules in plain words, and how to move around the board
export default function FiveRules({ onBack }: { onBack: () => void }) {
  const t = useT(fiveMessages);
  return (
    <article aria-labelledby="rules-title" className="max-w-2xl space-y-5">
      <button type="button" onClick={onBack} className="btn-quiet btn-sm min-h-11">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('back')}
      </button>
      <h1 id="rules-title" className="title-lg">
        {t('rulesTitle')}
      </h1>
      <p className="text-chalk">{t('rulesIntro')}</p>
      {SECTIONS.map(([title, items]) => (
        <section key={title}>
          <h2 className="title-md">{t(title)}</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-chalk">
            {items.map(k => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
