'use client';

import { useEffect, useRef, useState } from 'react';
import { Flag, WifiOff } from 'lucide-react';
import type { BoardCache } from '../../lib/five/cache';
import { fromWire, type Cell, type Rect } from '../../lib/five/coords';
import { cellText, countdown, errorMessage, type Tx } from '../../lib/five/describe';
import { otherSymbol, type FiveMove, type FiveSummary, type FiveSymbol, type HistoryAck, type PlaceAck } from '../../lib/five/types';
import FivePlayArea, { type PlayAreaHandle } from './FivePlayArea';
import FiveMoveList, { SymbolMark } from './FiveMoveList';

export type PlayerInfo = { name: string; connected: boolean; graceEndsAt: number | null };

type Props = {
  tx: Tx;
  roomId: string;
  game: FiveSummary;
  mySymbol: FiveSymbol;
  opponent: PlayerInfo | null;
  cache: BoardCache;
  cacheRev: number;
  canPlay: boolean; // false while paused
  sending: boolean;
  connectionNote: string | null;
  onPlace: (cell: Cell) => Promise<PlaceAck>;
  onResign: () => Promise<PlaceAck>;
  loadArea: (rect: Rect) => void;
  loadHistory: (beforePly?: number) => Promise<HistoryAck>;
};

const CAMERA_PREFIX = 'five-camera:';
// Loading reaches a little past the edges, so a small pan doesn't show hatching
const MARGIN = 16n;

export const cameraKey = (roomId: string, gameId: string) => `${CAMERA_PREFIX}${roomId}:${gameId}`;

export const lastBy = (moves: FiveMove[], symbol: FiveSymbol | null) => {
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i]!.symbol === symbol) return moves[i]!;
  return null;
};

// The table during a game: the board with its controls, who plays X and O, whose turn it is, the
// moves, and resigning
export default function FiveTable({ tx, roomId, game, mySymbol, opponent, cache, cacheRev, canPlay, sending, connectionNote, onPlace, onResign, loadArea, loadHistory }: Props) {
  const area = useRef<PlayAreaHandle>(null);
  const theirName = opponent?.name ?? tx('opponent');
  const myTurn = game.status === 'playing' && game.turn === mySymbol;
  const [confirmResign, setConfirmResign] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = game.lastMoves[game.lastMoves.length - 1] ?? null;
  const theirLast = lastBy(game.lastMoves, otherSymbol(mySymbol));
  const myLast = lastBy(game.lastMoves, mySymbol);
  const storageKey = cameraKey(roomId, game.gameId);

  // Only this game's view is remembered
  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(CAMERA_PREFIX) && key !== storageKey) localStorage.removeItem(key);
      }
    } catch {
      // Storage unavailable
    }
  }, [storageKey]);

  const away = !!opponent && !opponent.connected && !!opponent.graceEndsAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!away) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [away]);

  // Spoken when a move is played or the turn changes
  const turnText = game.status !== 'playing' ? '' : myTurn ? tx('yourTurnPlace', { symbol: mySymbol }) : tx('turnOf', { name: theirName, symbol: game.turn });
  const lastText = last ? tx('lastMoveBy', { name: last.symbol === mySymbol ? tx('you') : theirName, symbol: last.symbol, cell: cellText(tx, fromWire(last)) }) : null;
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    setAnnounce([lastText, turnText].filter(Boolean).join('. '));
  }, [lastText, turnText]);

  const place = async (cell: Cell) => {
    setNotice(null);
    const ack = await onPlace(cell);
    return ack.ok ? null : errorMessage(tx, ack.code);
  };

  const resign = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const ack = await onResign();
    setBusy(false);
    if (!ack.ok) setNotice(errorMessage(tx, ack.code));
  };

  const playerBar = (symbol: FiveSymbol, name: string, info: PlayerInfo | null) => {
    const toMove = game.status === 'playing' && game.turn === symbol;
    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ring-1 ring-inset ${toMove ? 'bg-gold/10 ring-2 ring-gold' : 'bg-table ring-table-rim'}`}>
        <p className="flex min-w-0 items-center gap-2">
          <SymbolMark symbol={symbol} className="h-5 w-5" />
          <span className="truncate font-semibold">{name}</span>
          <span className="shrink-0 text-xs text-chalk">{tx('playsSymbol', { symbol })}</span>
        </p>
        <p className="shrink-0 text-right text-xs">
          {info && !info.connected ? (
            <span className="font-semibold text-signal">{info.graceEndsAt ? tx('awayCountdown', { time: countdown(info.graceEndsAt - now) }) : tx('away')}</span>
          ) : toMove ? (
            <span className="font-semibold text-gold">{tx('toMove')}</span>
          ) : null}
        </p>
      </div>
    );
  };

  const waitingText = !canPlay ? tx('pausedNoMoves') : game.status !== 'playing' ? tx('gameOver') : !myTurn ? tx('waitTurn', { name: theirName }) : sending ? tx('sending') : undefined;

  return (
    <div className="space-y-3 pb-4">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      {connectionNote && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">
          <WifiOff className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          {connectionNote}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <FivePlayArea
          ref={area}
          tx={tx}
          cache={cache}
          cacheRev={cacheRev}
          label={tx('boardLabel', { symbol: mySymbol })}
          storageKey={storageKey}
          initialCenter={last ? fromWire(last) : { x: 0n, y: 0n }}
          lastMove={last}
          myLastMove={myLast}
          winLine={game.winLine}
          mySymbol={mySymbol}
          canPlace={canPlay && myTurn && !sending}
          waitingText={waitingText}
          watchMove={theirLast}
          onPlace={place}
          onView={v => loadArea({ minX: v.visible.minX - MARGIN, minY: v.visible.minY - MARGIN, maxX: v.visible.maxX + MARGIN, maxY: v.visible.maxY + MARGIN })}
        />

        <div className="space-y-3">
          <p className={`rounded-full px-3 py-1.5 text-center text-sm font-semibold ${myTurn ? 'bg-gold text-ink' : 'bg-white/5'}`}>{turnText}</p>
          {playerBar(otherSymbol(mySymbol), theirName, opponent)}
          {playerBar(mySymbol, tx('you'), null)}
          <p className="text-sm text-chalk">{tx('moveCount', { n: game.moveCount })}</p>

          <button type="button" disabled={busy || sending || game.status !== 'playing'} onClick={() => setConfirmResign(true)} className="btn-quiet btn-sm min-h-11">
            <Flag className="h-4 w-4" aria-hidden="true" />
            {tx('resign')}
          </button>
          {notice && (
            <p role="alert" className="rounded-xl bg-signal/15 px-3 py-2 text-sm text-white ring-1 ring-inset ring-signal/60">
              {notice}
            </p>
          )}

          <FiveMoveList tx={tx} gameId={game.gameId} recent={game.lastMoves} onShow={c => area.current?.go(c)} loadHistory={loadHistory} />
          <p className="text-xs text-chalk">{tx('rulesVersionShort', { version: game.rulesVersion })}</p>
        </div>
      </div>

      {confirmResign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onKeyDown={e => e.key === 'Escape' && setConfirmResign(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="resign-title" aria-describedby="resign-body" className="panel w-full max-w-sm space-y-3 p-5 shadow-lift">
            <h2 id="resign-title" className="title-md">
              {tx('resignTitle')}
            </h2>
            <p id="resign-body" className="text-chalk">
              {tx('resignBody')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirmResign(false)} className="btn-quiet min-h-11">
                {tx('keepPlaying')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirmResign(false);
                  void resign();
                }}
                className="btn-gold min-h-11"
              >
                <Flag className="h-4 w-4" aria-hidden="true" />
                {tx('resignConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
