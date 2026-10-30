'use client';

import { ArrowLeft } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';

const SECTIONS = [
  ['rulesValuesTitle', 'rulesValues'],
  ['rulesDealTitle', 'rulesDeal'],
  ['rulesTurnTitle', 'rulesTurn'],
  ['rulesCaptureTitle', 'rulesCapture'],
  ['rulesBuildTitle', 'rulesBuild'],
  ['rulesChangeTitle', 'rulesChange'],
  ['rulesPileTitle', 'rulesPile'],
  ['rulesTwoTitle', 'rulesTwo'],
  ['rulesPartnersTitle', 'rulesPartners'],
  ['rulesEndTitle', 'rulesEnd'],
  ['rulesScoringTitle', 'rulesScoring'],
] as const;

// The rules, scoring and the house rules used online
export default function CasinoRules({ onBack }: { onBack: () => void }) {
  const t = useT(casinoMessages);
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
      {SECTIONS.map(([title, body]) => (
        <section key={title}>
          <h2 className="title-md">{t(title)}</h2>
          <p className="mt-1 text-chalk">{t(body)}</p>
        </section>
      ))}
      <section className="panel p-4">
        <h2 className="title-md">{t('rulesHouseTitle')}</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-chalk">
          {(['rulesHouse1', 'rulesHouse2', 'rulesHouse3', 'rulesHouse4', 'rulesHouse5'] as const).map(k => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
