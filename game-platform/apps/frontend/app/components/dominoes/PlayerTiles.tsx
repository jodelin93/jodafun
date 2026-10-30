'use client';

import { tileValues, type TileId } from '../../lib/dominoes/types';
import { tileIdName, type Tx } from '../../lib/dominoes/describe';
import DominoTile from './DominoTile';

type Props = {
  tx: Tx;
  tiles: TileId[];
  playable: Set<TileId>;
  selected: TileId | null;
  myTurn: boolean;
  disabled: boolean;
  onSelect: (id: TileId) => void;
};

// The player's own tiles. On their turn the tiles that fit are lifted and outlined in gold; the rest
// are dimmed and can't be chosen.
export default function PlayerTiles({ tx, tiles, playable, selected, myTurn, disabled, onSelect }: Props) {
  return (
    <section aria-label={tx('handAria', { n: tiles.length })}>
      <h2 className="sr-only">{tx('yourHand')}</h2>
      <ul className="flex justify-center gap-1.5 overflow-x-auto px-1 pb-1 pt-3 sm:gap-2">
        {tiles.map(id => {
          const [a, b] = tileValues(id);
          const can = myTurn && playable.has(id);
          const isSelected = selected === id;
          const state = isSelected ? tx('selected') : can ? tx('playable') : myTurn ? tx('doesNotFit') : '';
          return (
            <li key={id}>
              <button
                type="button"
                disabled={disabled || !can}
                onClick={() => onSelect(id)}
                aria-pressed={isSelected}
                aria-label={state ? `${tileIdName(tx, id)}, ${state}` : tileIdName(tx, id)}
                className={`block rounded-lg transition motion-reduce:transition-none disabled:cursor-default ${
                  isSelected
                    ? '-translate-y-2 ring-4 ring-gold motion-reduce:translate-y-0'
                    : can
                      ? '-translate-y-1 ring-2 ring-gold/80 hover:-translate-y-1.5 motion-reduce:translate-y-0'
                      : myTurn
                        ? 'opacity-45'
                        : ''
                }`}
              >
                <DominoTile a={a} b={b} className="h-[4.5rem] w-9 sm:h-24 sm:w-12" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
