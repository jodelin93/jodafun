'use client';

import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';
import CasinoCard from './CasinoCard';

type Props = {
  cards: string[];
  selected: string | null;
  used: Set<string>;
  canPlay: boolean;
  onSelect: (id: string) => void;
};

// The player's own cards, in reach at the bottom of the screen; tap one to play it
export default function PlayerHand({ cards, selected, used, canPlay, onSelect }: Props) {
  const t = useT(casinoMessages);
  return (
    <section aria-label={t('handAria', { n: cards.length })}>
      <h2 className="sr-only">{t('yourHand')}</h2>
      <ul className="flex gap-1.5 overflow-x-auto px-1 pb-1 pt-2.5 sm:flex-wrap sm:gap-2">
        {cards.map(id => (
          <li key={id}>
            <CasinoCard
              id={id}
              size="lg"
              selected={selected === id}
              used={used.has(id) && selected !== id}
              disabled={!canPlay}
              onClick={() => onSelect(id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
