'use client';

import { ArrowLeft } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import { draughtsMessages } from '../../i18n/messages/draughts';

const SECTIONS = [
  ['rulesBoardTitle', ['rulesBoard1', 'rulesBoard2']],
  ['rulesMenTitle', ['rulesMen1', 'rulesMen2']],
  ['rulesKingsTitle', ['rulesKings1', 'rulesKings2']],
  ['rulesCaptureTitle', ['rulesCapture1', 'rulesCapture2', 'rulesCapture3', 'rulesCapture4', 'rulesCapture5']],
  ['rulesWinTitle', ['rulesWin1', 'rulesWin2', 'rulesWin3']],
  ['rulesDrawTitle', ['rulesDrawAgreement', 'rulesDraw61', 'rulesDraw62', 'rulesDraw63', 'rulesDrawDiagonal', 'rulesDraw64', 'rulesDrawWinFirst']],
  ['rulesMatchTitle', ['rulesMatch']],
  ['rulesOnlineTitle', ['rulesOnline1', 'rulesOnline2', 'rulesOnline3']],
] as const;

// The FMJD rules played online, in plain words, with the version they follow
export default function DraughtsRules({ onBack }: { onBack: () => void }) {
  const t = useT(draughtsMessages);
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
      <p className="rounded-xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">{t('rulesVersion')}</p>
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
