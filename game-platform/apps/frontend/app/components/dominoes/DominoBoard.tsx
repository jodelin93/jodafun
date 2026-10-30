'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { otherValue, tileValues, type End, type Placement, type TileId } from '../../lib/dominoes/types';
import { tileName, type Tx } from '../../lib/dominoes/describe';
import DominoTile from './DominoTile';

const H = 'h-7 w-14 sm:h-9 sm:w-[4.5rem]';
const V = 'h-14 w-7 sm:h-[4.5rem] sm:w-9';

type Props = {
  tx: Tx;
  board: Placement[];
  ends: { left: number; right: number } | null;
  // The tile placed by the last move, outlined so it's easy to spot
  lastTile?: TileId | null;
  // The selected tile, drawn faintly where it would go
  preview?: { tile: TileId; end: End | null } | null;
  // Ends the selected tile fits; they become buttons
  choices?: End[];
  chosen?: End | null;
  onChoose?: (end: End) => void;
};

// Where the preview tile would sit and which way round
function ghostOf(preview: { tile: TileId; end: End | null }, ends: Props['ends']) {
  const [a, b] = tileValues(preview.tile);
  if (!ends || !preview.end) return { left: a, right: b };
  const touching = preview.end === 'left' ? ends.left : ends.right;
  const outer = otherValue(preview.tile, touching);
  return preview.end === 'left' ? { left: outer, right: touching } : { left: touching, right: outer };
}

/**
 * The chain, left to right. It wraps onto as many rows as it needs, so both open ends are always on
 * screen (the left end starts the first row, the right end finishes the last one) without scrolling
 * sideways. Doubles sit crosswise. Each end has its own labelled marker, which turns into a button
 * when the selected tile can go there.
 */
export default function DominoBoard({ tx, board, ends, lastTile, preview, choices = [], chosen = null, onChoose }: Props) {
  const ghost = preview ? ghostOf(preview, ends) : null;
  const ghostEl = ghost ? (
    <li aria-hidden="true" className="motion-safe:animate-pulse">
      <DominoTile a={ghost.left} b={ghost.right} orientation={ghost.left === ghost.right ? 'vertical' : 'horizontal'} ghost className={ghost.left === ghost.right ? V : H} />
    </li>
  ) : null;

  // Keep the chosen end in view on small screens when the board is taller than the viewport
  const leftRef = useRef<HTMLLIElement>(null);
  const rightRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = chosen === 'left' ? leftRef.current : chosen === 'right' ? rightRef.current : null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [chosen]);

  const endMarker = (end: End) => {
    if (!ends) return null;
    const value = end === 'left' ? ends.left : ends.right;
    const fits = choices.includes(end);
    const Icon = end === 'left' ? ChevronLeft : ChevronRight;
    const text = end === 'left' ? tx('leftEndN', { n: value }) : tx('rightEndN', { n: value });
    const inner = (
      <>
        {end === 'left' && <Icon className="h-4 w-4" aria-hidden="true" />}
        <span>{text}</span>
        {end === 'right' && <Icon className="h-4 w-4" aria-hidden="true" />}
      </>
    );
    return (
      <li ref={end === 'left' ? leftRef : rightRef} className="flex items-center">
        {fits && onChoose ? (
          <button
            type="button"
            onClick={() => onChoose(end)}
            aria-pressed={chosen === end}
            aria-label={tx(end === 'left' ? 'playOnLeftAria' : 'playOnRightAria', { n: value })}
            className={`inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-sm font-bold ring-2 ring-inset transition ${
              chosen === end ? 'bg-gold text-ink ring-gold' : 'bg-gold/15 text-white ring-gold motion-safe:animate-pulse hover:bg-gold/25'
            }`}
          >
            {inner}
          </button>
        ) : (
          <span className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-felt-deep/70 px-2.5 text-sm font-semibold text-chalk ring-1 ring-inset ring-table-rim">
            {inner}
          </span>
        )}
      </li>
    );
  };

  return (
    <section aria-labelledby="board-title" className="rounded-3xl bg-table/60 p-3 ring-1 ring-inset ring-table-rim sm:p-4">
      <h2 id="board-title" className="sr-only">
        {tx('boardTitle')}
      </h2>
      <p className="mb-2 text-center text-xs text-chalk">
        {ends ? tx('boardSummary', { left: ends.left, right: ends.right, n: board.length }) : tx('boardEmpty')}
      </p>
      <ol dir="ltr" aria-label={tx('chainAria', { n: board.length })} className="flex min-h-24 flex-wrap items-center justify-center gap-x-1 gap-y-2">
        {endMarker('left')}
        {preview?.end === 'left' && ghostEl}
        {board.map((p, i) => {
          const double = p.left === p.right;
          return (
            <li key={p.tile} className={`rounded-md ${p.tile === lastTile ? 'ring-2 ring-gold ring-offset-1 ring-offset-table' : ''}`}>
              <DominoTile
                a={p.left}
                b={p.right}
                orientation={double ? 'vertical' : 'horizontal'}
                label={`${tileName(tx, p.left, p.right)}${i === 0 ? `, ${tx('endLeft')}` : ''}${i === board.length - 1 ? `, ${tx('endRight')}` : ''}`}
                className={double ? V : H}
              />
            </li>
          );
        })}
        {preview && preview.end !== 'left' && ghostEl}
        {endMarker('right')}
      </ol>
    </section>
  );
}
