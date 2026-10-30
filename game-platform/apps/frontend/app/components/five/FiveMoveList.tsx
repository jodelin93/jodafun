'use client';

import { useEffect, useState } from 'react';
import { fromWire, type Cell } from '../../lib/five/coords';
import { cellText, errorMessage, type Tx } from '../../lib/five/describe';
import type { FiveMove, FiveSymbol, HistoryAck } from '../../lib/five/types';

// X and O in the board's colours, for text around the board
export function SymbolMark({ symbol, className = 'h-4 w-4' }: { symbol: FiveSymbol; className?: string }) {
  return symbol === 'X' ? (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0`} aria-hidden="true">
      <path d="M4 4 L16 16 M16 4 L4 16" stroke="#FF7A6E" strokeWidth="3.2" strokeLinecap="round" fill="none" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0`} aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="#CFE3DB" strokeWidth="3.2" fill="none" />
    </svg>
  );
}

type Props = {
  tx: Tx;
  gameId: string;
  recent: FiveMove[]; // oldest first
  onShow: (cell: Cell) => void;
  loadHistory?: (beforePly?: number) => Promise<HistoryAck>;
};

// The moves, newest first: the recent ones come with the game, older ones page in on demand.
// Each one is a button that moves the view to it.
export default function FiveMoveList({ tx, gameId, recent, onShow, loadHistory }: Props) {
  const [older, setOlder] = useState<FiveMove[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOlder([]);
    setHasMore(true);
    setError(null);
  }, [gameId]);

  const newest = [...recent].reverse();
  const oldestShown = older[older.length - 1]?.ply ?? recent[0]?.ply ?? null;
  const all = [...newest, ...older.filter(m => !recent.some(r => r.ply === m.ply))];
  const more = !!loadHistory && hasMore && oldestShown !== null && oldestShown > 1;

  const loadMore = async () => {
    if (!loadHistory || oldestShown === null) return;
    setLoading(true);
    setError(null);
    const ack = await loadHistory(oldestShown);
    setLoading(false);
    if (!ack.ok) {
      setError(errorMessage(tx, ack.code));
      return;
    }
    setOlder(o => [...o, ...ack.moves.filter(m => m.ply < oldestShown)]);
    setHasMore(ack.hasMore);
  };

  return (
    <section aria-labelledby="five-moves-title" className="rounded-xl bg-felt-deep p-3 ring-1 ring-inset ring-white/10">
      <h2 id="five-moves-title" className="text-sm font-semibold">
        {tx('movesTitle')}
      </h2>
      {all.length === 0 ? (
        <p className="mt-1 text-sm text-chalk">{tx('noMovesYet')}</p>
      ) : (
        <ol className="mt-2 max-h-64 space-y-0.5 overflow-y-auto pr-1 text-sm">
          {all.map(m => (
            <li key={m.ply}>
              <button
                type="button"
                onClick={() => onShow(fromWire(m))}
                className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-white/10"
                aria-label={tx('moveAria', { n: m.ply, symbol: m.symbol, cell: cellText(tx, fromWire(m)) })}
              >
                <span className="w-9 shrink-0 text-xs text-chalk">{m.ply}.</span>
                <SymbolMark symbol={m.symbol} />
                <span className="min-w-0 truncate font-mono text-xs">{cellText(tx, fromWire(m))}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {more && (
        <button type="button" className="btn-quiet btn-sm mt-2 min-h-11 w-full" disabled={loading} onClick={() => void loadMore()}>
          {loading ? tx('loading') : tx('olderMoves')}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
