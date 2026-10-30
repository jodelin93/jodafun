'use client';

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Check, Crosshair, House, LocateFixed, MapPin, X as XIcon, ZoomIn, ZoomOut } from 'lucide-react';
import type { BoardCache } from '../../lib/five/cache';
import { fromWire, inRect, parseCoordinate, sameCell, type Cell } from '../../lib/five/coords';
import { cellText, directionText, type Tx } from '../../lib/five/describe';
import type { FiveMove, FiveSymbol, WireCell } from '../../lib/five/types';
import FiveBoard, { type BoardHandle, type BoardView } from './FiveBoard';

type Props = {
  tx: Tx;
  cache: BoardCache;
  cacheRev: number;
  label: string;
  storageKey: string | null;
  initialCenter: Cell;
  lastMove: FiveMove | null;
  myLastMove: FiveMove | null;
  winLine: WireCell[] | null;
  mySymbol: FiveSymbol | null; // null: watching only (results), nothing can be placed
  canPlace: boolean; // our turn, the game running and not paused, nothing being sent
  waitingText?: string; // why placing is not possible right now
  // The latest move by the other side: shown as a notice (never by moving the view) when off screen
  watchMove: FiveMove | null;
  onPlace?: (cell: Cell) => Promise<string | null>; // resolves with an error message, or null when placed
  onView?: (view: BoardView) => void;
  confirmLabel?: string;
  ref?: Ref<PlayAreaHandle>;
};

export type PlayAreaHandle = { go: (cell: Cell) => void };

export default function FivePlayArea({ tx, cache, cacheRev, label, storageKey, initialCenter, lastMove, myLastMove, winLine, mySymbol, canPlace, waitingText, watchMove, onPlace, onView, confirmLabel, ref }: Props) {
  const board = useRef<BoardHandle>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [view, setView] = useState<BoardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offscreen, setOffscreen] = useState<FiveMove | null>(null);
  const [goX, setGoX] = useState('');
  const [goY, setGoY] = useState('');
  const [goError, setGoError] = useState<string | null>(null);
  const formId = useId();

  const content = selected ? cache.get(selected) : undefined;
  const placeable = !!mySymbol && !!onPlace && canPlace && !busy && !!selected && content === null;

  // A new move by the other side that lands off screen: say where it is, leave the view alone
  const seenPly = useRef<number | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    if (!watchMove) {
      seenPly.current = null;
      setOffscreen(null);
      return;
    }
    if (seenPly.current === watchMove.ply) return;
    seenPly.current = watchMove.ply;
    const v = viewRef.current;
    setOffscreen(v && !inRect(fromWire(watchMove), v.full) ? watchMove : null);
  }, [watchMove]);
  // It came into view (the player moved there themselves): the notice has done its job
  useEffect(() => {
    if (offscreen && view && inRect(fromWire(offscreen), view.full)) setOffscreen(null);
  }, [offscreen, view]);

  const go = (cell: Cell) => board.current?.centerOn(cell);
  useImperativeHandle(ref, () => ({ go: (cell: Cell) => board.current?.centerOn(cell) }), []);

  const select = (cell: Cell | null) => {
    setError(null);
    setSelected(cell);
  };

  const confirm = async () => {
    if (!selected || !onPlace) return;
    if (!placeable) {
      setError(content === undefined ? tx('cantPlaceUnknown') : content ? tx('cantPlaceTaken') : (waitingText ?? tx('cantPlaceWait')));
      return;
    }
    setBusy(true);
    setError(null);
    const placing = selected;
    const err = await onPlace(placing);
    setBusy(false);
    if (err) setError(err);
    else setSelected(s => (sameCell(s, placing) ? null : s));
  };

  const goToCell = (e: React.FormEvent) => {
    e.preventDefault();
    const x = parseCoordinate(goX);
    const y = parseCoordinate(goY);
    if (x === null || y === null) {
      setGoError(tx('goToCellInvalid'));
      return;
    }
    setGoError(null);
    const cell = { x, y };
    go(cell);
    select(cell);
  };

  const selectedLine = selected
    ? content === undefined
      ? tx('selLoading', { cell: cellText(tx, selected) })
      : content
        ? tx('selTaken', { cell: cellText(tx, selected), symbol: content })
        : tx('selEmpty', { cell: cellText(tx, selected) })
    : null;
  const navBtn = 'btn-quiet btn-sm min-h-11';

  return (
    <div className="space-y-3">
      {offscreen && view && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-gold/10 p-3 text-sm ring-1 ring-inset ring-gold/60">
          <span aria-hidden="true" className="font-display text-2xl leading-none text-gold">
            {directionText(tx, view.visible, fromWire(offscreen)).arrow}
          </span>
          <span className="min-w-0 flex-1">
            {tx('offscreenMove', { symbol: offscreen.symbol, cell: cellText(tx, fromWire(offscreen)), where: directionText(tx, view.visible, fromWire(offscreen)).text })}
          </span>
          <button type="button" className="btn-gold btn-sm min-h-11" onClick={() => go(fromWire(offscreen))}>
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {tx('showIt')}
          </button>
          <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => setOffscreen(null)} aria-label={tx('dismiss')}>
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <FiveBoard
        ref={board}
        tx={tx}
        cache={cache}
        cacheRev={cacheRev}
        label={label}
        storageKey={storageKey}
        initialCenter={initialCenter}
        lastMove={lastMove}
        winLine={winLine}
        selected={selected}
        ghost={placeable && mySymbol ? mySymbol : null}
        onSelect={select}
        onConfirm={() => void confirm()}
        onView={v => {
          setView(v);
          onView?.(v);
        }}
      />

      {/* Placing: select a cell, check the preview, then confirm */}
      {mySymbol && onPlace && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-felt-deep p-3 ring-1 ring-inset ring-white/10">
          <p className="min-w-0 flex-1 text-sm">{selectedLine ?? (canPlace ? tx('pickCell') : (waitingText ?? tx('cantPlaceWait')))}</p>
          {selected && (
            <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => select(null)}>
              {tx('clearSelection')}
            </button>
          )}
          <button type="button" className="btn-gold btn-sm min-h-11" disabled={!placeable} onClick={() => void confirm()}>
            <Check className="h-4 w-4" aria-hidden="true" />
            {busy ? tx('sending') : (confirmLabel ?? tx('placeSymbol', { symbol: mySymbol }))}
          </button>
          {error && (
            <p role="alert" className="w-full rounded-xl bg-signal/15 px-3 py-2 text-sm text-white ring-1 ring-inset ring-signal/60">
              {error}
            </p>
          )}
        </div>
      )}
      {!onPlace && selectedLine && <p className="text-sm text-chalk">{selectedLine}</p>}

      <nav aria-label={tx('navLabel')} className="flex flex-wrap items-center gap-2">
        <button type="button" className={navBtn} onClick={() => board.current?.zoom(1)} aria-label={tx('zoomIn')}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={navBtn} onClick={() => board.current?.zoom(-1)} aria-label={tx('zoomOut')}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={navBtn} disabled={!lastMove} onClick={() => lastMove && go(fromWire(lastMove))}>
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
          {tx('goLastMove')}
        </button>
        {(mySymbol || myLastMove) && (
          <button type="button" className={navBtn} disabled={!myLastMove} onClick={() => myLastMove && go(fromWire(myLastMove))}>
            <Crosshair className="h-4 w-4" aria-hidden="true" />
            {tx('goMyLastMove')}
          </button>
        )}
        <button type="button" className={navBtn} onClick={() => go({ x: 0n, y: 0n })}>
          <House className="h-4 w-4" aria-hidden="true" />
          {tx('goOrigin')}
        </button>
        {view && (
          <span className="text-xs text-chalk" aria-live="off">
            {tx('viewCenter', { cell: cellText(tx, view.center) })}
          </span>
        )}
      </nav>

      <details className="rounded-2xl bg-felt-deep p-3 ring-1 ring-inset ring-white/10">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{tx('goToCell')}</summary>
        <form onSubmit={goToCell} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${formId}-x`} className="field-label">
              x
            </label>
            <input id={`${formId}-x`} className="field py-2 text-base" inputMode="numeric" autoComplete="off" value={goX} onChange={e => setGoX(e.target.value)} />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${formId}-y`} className="field-label">
              y
            </label>
            <input id={`${formId}-y`} className="field py-2 text-base" inputMode="numeric" autoComplete="off" value={goY} onChange={e => setGoY(e.target.value)} />
          </div>
          <button type="submit" className="btn-quiet btn-sm min-h-11">
            {tx('goToCellButton')}
          </button>
          <p className="w-full text-xs text-chalk">{tx('goToCellHint')}</p>
          {goError && (
            <p role="alert" className="w-full text-sm">
              {goError}
            </p>
          )}
        </form>
      </details>
    </div>
  );
}
