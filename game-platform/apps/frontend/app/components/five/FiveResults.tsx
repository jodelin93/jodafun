'use client';

import { useRef } from 'react';
import { LayoutGrid, LogOut, RotateCcw, Trophy } from 'lucide-react';
import type { BoardCache } from '../../lib/five/cache';
import { fromWire, type Rect } from '../../lib/five/coords';
import { reasonText, type Tx } from '../../lib/five/describe';
import type { FiveSummary, FiveSymbol, HistoryAck, WireCell } from '../../lib/five/types';
import FivePlayArea, { type PlayAreaHandle } from './FivePlayArea';
import FiveMoveList from './FiveMoveList';
import { lastBy } from './FiveTable';

type Props = {
  tx: Tx;
  winner: FiveSymbol | null;
  reason: string | null;
  moves: number;
  mySymbol: FiveSymbol | null;
  opponentName: string;
  game: FiveSummary | null;
  winLine: WireCell[] | null;
  cache: BoardCache;
  cacheRev: number;
  loadArea: (rect: Rect) => void;
  loadHistory: (beforePly?: number) => Promise<HistoryAck>;
  onRematch: () => void;
  onLeave: () => void;
  onCatalogue: () => void;
};

const MARGIN = 16n;

// The end of a game: who won and how, with the final board (the winning run drawn on it)
export default function FiveResults({ tx, winner, reason, moves, mySymbol, opponentName, game, winLine, cache, cacheRev, loadArea, loadHistory, onRematch, onLeave, onCatalogue }: Props) {
  const area = useRef<PlayAreaHandle>(null);
  const won = !!mySymbol && winner === mySymbol;
  const headline = winner === null ? tx('resultNoWinner') : mySymbol === null ? tx('symbolWins', { symbol: winner }) : won ? tx('resultYouWin') : tx('resultTheyWin', { name: opponentName });
  const line = winLine ?? game?.winLine ?? null;
  const last = game?.lastMoves[game.lastMoves.length - 1] ?? null;
  // The middle of the winning run, or the last move, starts in the middle of the view
  const focus = line?.[Math.floor(line.length / 2)] ?? last;

  return (
    <div className="space-y-5">
      <section aria-labelledby="result-title" className="panel space-y-3 p-5">
        <Trophy className={`h-9 w-9 ${won ? 'text-gold' : 'text-chalk'}`} aria-hidden="true" />
        <h1 id="result-title" className="title-lg">
          {headline}
        </h1>
        {reason && <p className="text-chalk">{reasonText(tx, reason)}</p>}
        <p className="text-sm text-chalk">
          {winner ? `${tx('winnerSymbol', { symbol: winner })} · ` : ''}
          {tx('movesPlayed', { n: moves })}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={onRematch} className="btn-gold min-h-11">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {tx('rematch')}
          </button>
          <button type="button" onClick={onLeave} className="btn-quiet min-h-11">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {tx('backToMenu')}
          </button>
          <button type="button" onClick={onCatalogue} className="btn-quiet min-h-11">
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            {tx('backToCatalogue')}
          </button>
        </div>
        <p className="text-xs text-chalk">{tx('rematchHint')}</p>
      </section>
      {game && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <FivePlayArea
            ref={area}
            tx={tx}
            cache={cache}
            cacheRev={cacheRev}
            label={tx('finalBoard')}
            storageKey={null}
            initialCenter={focus ? fromWire(focus) : { x: 0n, y: 0n }}
            lastMove={last}
            myLastMove={lastBy(game.lastMoves, mySymbol)}
            winLine={line}
            mySymbol={null}
            canPlace={false}
            watchMove={null}
            onView={v => loadArea({ minX: v.visible.minX - MARGIN, minY: v.visible.minY - MARGIN, maxX: v.visible.maxX + MARGIN, maxY: v.visible.maxY + MARGIN })}
          />
          <FiveMoveList tx={tx} gameId={game.gameId} recent={game.lastMoves} onShow={c => area.current?.go(c)} loadHistory={loadHistory} />
        </div>
      )}
    </div>
  );
}
