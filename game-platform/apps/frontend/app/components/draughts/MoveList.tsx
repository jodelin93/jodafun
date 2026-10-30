'use client';

import { useEffect, useRef } from 'react';
import type { Tx } from '../../lib/draughts/describe';
import type { MoveRecord } from '../../lib/draughts/types';

// The moves so far in standard notation, one numbered line per white/black pair
export default function MoveList({ tx, moves }: { tx: Tx; moves: MoveRecord[] }) {
  const rows: { white?: MoveRecord; black?: MoveRecord }[] = [];
  for (const m of moves) {
    const row = rows[rows.length - 1];
    if (m.color === 'white' || !row || row.black) rows.push(m.color === 'white' ? { white: m } : { black: m });
    else row.black = m;
  }
  // Keeps the latest move in view inside the list (never scrolls the page)
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [moves.length]);

  return (
    <section aria-labelledby="moves-title" className="panel p-3">
      <h2 id="moves-title" className="title-md text-base">
        {tx('movesTitle')}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-chalk">{tx('noMovesYet')}</p>
      ) : (
        <ol ref={list} className="mt-2 max-h-56 overflow-y-auto pr-1 font-mono text-sm tabular-nums lg:max-h-[26rem]">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 py-0.5">
              <span className="text-chalk">{i + 1}.</span>
              <span>
                <span className="sr-only">{tx('white')}: </span>
                {r.white?.notation ?? '…'}
              </span>
              <span>
                {r.black && <span className="sr-only">{tx('black')}: </span>}
                {r.black?.notation ?? ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
