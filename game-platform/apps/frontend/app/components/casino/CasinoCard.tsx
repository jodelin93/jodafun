'use client';

import { cardInfo } from '../../lib/casino/cards';
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

// A playing card face: cream stock, rank and suit in the corner and the suit large in the middle
export default function CasinoCard({ id, size = 'md', selected, used, onClick, disabled, label }: Props) {
  const t = useT(casinoMessages);
  const name = useCardName();
  const c = cardInfo(id);
  const color = c.red ? 'text-signal' : 'text-ink';
  const spoken = [label ?? name(id), selected ? t('selected') : '', used ? t('usedThisTurn') : ''].filter(Boolean).join(', ');
  const face = (
    <span
      className={`relative flex h-full w-full flex-col rounded-lg bg-card p-1 font-display font-bold shadow-rest ring-1 ring-black/10 transition ${color} ${
        selected ? '-translate-y-1.5 ring-[3px] ring-gold' : ''
      } ${used ? 'opacity-40' : ''}`}
    >
      <span className="leading-none">
        {c.label}
        <span className="ml-px">{c.symbol}</span>
      </span>
      <span className="m-auto text-[1.6em] leading-none" aria-hidden="true">
        {c.symbol}
      </span>
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
