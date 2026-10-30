'use client';

import type { Build } from '../../lib/casino/types';
import { cardText, valueLabel } from '../../lib/casino/cards';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';
import CasinoCard from './CasinoCard';

type Props = {
  build: Build;
  ownerName: string;
  ours: boolean;
  selected?: boolean;
  pending?: boolean; // made by a step of the turn being composed
  onSelect?: () => void;
};

// One build: its value, owner, and each set of cards that adds up to the value
export default function BuildView({ build, ownerName, ours, selected, pending, onSelect }: Props) {
  const t = useT(casinoMessages);
  const cards = build.groups.flat().map(c => cardText(c.id));
  const kind = build.groups.length > 1 ? t('augmentedBuild') : t('singleBuild');
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-lg font-extrabold">{valueLabel(build.value)}</span>
        <span className={`chip px-2 py-0.5 text-xs ${ours ? 'ring-gold/60' : ''}`}>{ownerName}</span>
      </span>
      <span className="mt-0.5 block text-xs text-chalk">
        {pending ? t('newThisTurn') : kind}
      </span>
      <span className="mt-2 flex flex-wrap gap-2">
        {build.groups.map((group, i) => (
          <span key={i} className="flex -space-x-5 rounded-lg bg-felt-deep/60 p-1">
            {group.map(c => (
              <CasinoCard key={c.id} id={c.id} size="sm" />
            ))}
          </span>
        ))}
      </span>
    </>
  );
  const className = `block w-full rounded-2xl p-3 text-left ring-1 ring-inset transition ${
    selected ? 'bg-gold/10 ring-[3px] ring-gold' : ours ? 'bg-table ring-gold/40' : 'bg-table ring-table-rim'
  } ${pending ? 'border-2 border-dashed border-gold/60' : ''}`;
  const aria = t('buildAria', { value: valueLabel(build.value), name: ownerName, cards: cards.join(', ') });
  return onSelect ? (
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={aria} className={className}>
      {body}
    </button>
  ) : (
    <div aria-label={aria} role="group" className={className}>
      {body}
    </div>
  );
}
