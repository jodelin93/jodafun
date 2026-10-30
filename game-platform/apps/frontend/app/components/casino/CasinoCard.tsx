'use client';

import { cardInfo } from '../../lib/casino/cards';
import CardFace from './CardFace';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';

const SIZES = {
  sm: 'h-14 w-10 text-xs',
  md: 'h-20 w-14 text-sm sm:h-24 sm:w-[4.25rem]',
  lg: 'h-24 w-[4.25rem] text-base sm:h-28 sm:w-20',
} as const;

// Spoken name, e.g. "Queen of hearts"
export function useCardName() {
  const t = useT(casinoMessages);
  return (id: string) => {
    const c = cardInfo(id);
    const rank = c.label === 'A' || c.label === 'J' || c.label === 'Q' || c.label === 'K' ? t(`rank_${c.label}`) : c.label;
    return t('cardName', { rank, suit: t(`suit_${c.suit}`) });
  };
}

type Props = {
  id: string;
  size?: keyof typeof SIZES;
  selected?: boolean;
  used?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label?: string; // overrides the spoken name
};

// A classic playing card (see CardFace) on cream stock
export default function CasinoCard({ id, size = 'md', selected, used, onClick, disabled, label }: Props) {
  const t = useT(casinoMessages);
  const name = useCardName();
  const spoken = [label ?? name(id), selected ? t('selected') : '', used ? t('usedThisTurn') : ''].filter(Boolean).join(', ');
  const face = (
    <span
      className={`relative block h-full w-full overflow-hidden rounded-lg bg-card font-display shadow-rest ring-1 ring-black/10 transition ${
        selected ? '-translate-y-1.5 ring-[3px] ring-gold' : ''
      } ${used ? 'opacity-40' : ''}`}
    >
      <CardFace id={id} />
    </span>
  );
  if (!onClick) {
    return (
      <span role="img" aria-label={spoken} className={`inline-block shrink-0 ${SIZES[size]}`}>
        {face}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || used}
      aria-pressed={selected}
      aria-label={spoken}
      className={`inline-block shrink-0 rounded-lg disabled:cursor-not-allowed ${SIZES[size]}`}
    >
      {face}
    </button>
  );
}
