'use client';

import { ArrowLeft } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import { dominoesMessages } from '../../i18n/messages/dominoes';

const SECTIONS = [
  ['rulesSetTitle', 'rulesSet'],
  ['rulesDealTitle', 'rulesDeal'],
  ['rulesPlayTitle', 'rulesPlay'],
  ['rulesPassTitle', 'rulesPass'],
  ['rulesOpeningTitle', 'rulesOpening'],
  ['rulesHandEndTitle', 'rulesHandEnd'],
  ['rulesScoreTwoTitle', 'rulesScoreTwo'],
  ['rulesScorePartnersTitle', 'rulesScorePartners'],
  ['rulesMatchTitle', 'rulesMatch'],
] as const;

// The ruleset played online, with the scoring explained
export default function DominoesRules({ onBack }: { onBack: () => void }) {
  const t = useT(dominoesMessages);
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
        <h2 className="title-md">{t('rulesExampleTitle')}</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-chalk">
          {(['rulesExample1', 'rulesExample2', 'rulesExample3'] as const).map(k => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </section>
      <section className="panel p-4">
        <h2 className="title-md">{t('rulesHouseTitle')}</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-chalk">
          {(['rulesHouse1', 'rulesHouse2', 'rulesHouse3'] as const).map(k => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
