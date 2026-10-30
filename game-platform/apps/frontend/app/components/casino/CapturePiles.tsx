'use client';

import { useState } from 'react';
import { cardText } from '../../lib/casino/cards';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';
import CasinoCard from './CasinoCard';

type Props = {
  piles: { count: number; top: string | null }[];
  myTeam: number;
  teamPile: string[]; // our own pile, bottom to top (private)
  pileSelected: boolean;
  pileUsable: boolean;
  onTogglePile: () => void;
};

// Both sides' capture piles: everyone sees the top card and the size; our own order only to us
export default function CapturePiles({ piles, myTeam, teamPile, pileSelected, pileUsable, onTogglePile }: Props) {
  const t = useT(casinoMessages);
  const [showOrder, setShowOrder] = useState(false);
  return (
    <section aria-labelledby="piles-title" className="grid grid-cols-2 gap-2">
      <h2 id="piles-title" className="sr-only">
        {t('pilesLabel')}
      </h2>
      {[1 - myTeam, myTeam].map(team => {
        const pile = piles[team] ?? { count: 0, top: null };
        const ours = team === myTeam;
        return (
          <div key={team} className={`rounded-2xl p-2.5 ring-1 ring-inset ${ours ? 'bg-felt-deep ring-gold/30' : 'bg-felt-deep ring-table-rim'}`}>
            <p className="truncate text-xs text-chalk">{ours ? t('ourPile') : t('theirPile')}</p>
            <div className="mt-1.5 flex items-center gap-2">
              {pile.top ? (
                !ours && pileUsable ? (
                  <CasinoCard id={pile.top} size="sm" selected={pileSelected} onClick={onTogglePile} label={t('pileTopAria', { card: cardText(pile.top) })} />
                ) : (
                  <CasinoCard id={pile.top} size="sm" />
                )
              ) : (
                <span className="text-xs text-chalk">{t('pileEmpty')}</span>
              )}
              <span className="text-sm font-semibold tabular-nums">{t('cardsCount', { n: pile.count })}</span>
            </div>
            {ours && pile.count > 0 && (
              <>
                <button type="button" onClick={() => setShowOrder(v => !v)} className="mt-1.5 text-xs text-chalk underline underline-offset-2 hover:text-white" aria-expanded={showOrder}>
                  {showOrder ? t('hidePileOrder') : t('showPileOrder')}
                </button>
                {showOrder && (
                  <p className="mt-1 break-words text-xs text-white" aria-label={t('pileOrderTitle')}>
                    {teamPile.map(cardText).join(' ')}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
