'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Crown, X } from 'lucide-react';
import { displayCell, squareAtDisplay, type Color, type Kind, type Piece, type PublicDraughtsView, type Route, type Square } from '../../lib/draughts/types';
import type { Tx } from '../../lib/draughts/describe';

const STEP_MS = 260;

type Props = {
  tx: Tx;
  view: PublicDraughtsView;
  flipped: boolean; // black at the bottom: only the drawing turns, square numbers stay the same
  label: string;
  movable?: Set<Square>;
  route?: Route | null;
  landings?: Square[];
  captured?: Square[];
  ghost?: { square: Square; color: Color; kind: Kind } | null;
  onSquare?: (square: Square) => void;
  describedBy?: string;
};

type Anim = { pieceId: string; squares: Square[]; step: number; captured: Piece[] };

const cellStyle = (square: Square, flipped: boolean) => {
  const { row, col } = displayCell(square, flipped);
  return { left: `${col * 10}%`, top: `${row * 10}%` };
};

function PieceDisc({ color, kind, className = '' }: { color: Color; kind: Kind; className?: string }) {
  const white = color === 'white';
  return (
    <span
      className={`flex h-[78%] w-[78%] items-center justify-center rounded-full shadow-[0_3px_0_rgba(0,0,0,0.35)] ring-2 ${
        white ? 'bg-card ring-ink/25' : 'bg-ink ring-chalk/60'
      } ${className}`}
    >
      {kind === 'king' ? (
        <Crown className="h-[58%] w-[58%] text-gold-deep" strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
      ) : (
        <span className={`h-[52%] w-[52%] rounded-full ring-2 ${white ? 'ring-ink/15' : 'ring-chalk/25'}`} />
      )}
    </span>
  );
}

// The 10×10 board: 50 dark squares as buttons (one tab stop, arrow keys move between them), the
// pieces drawn above them, and the route being built marked on top. Accepted moves slide along their
// route, one landing at a time, unless the player prefers reduced motion.
export default function DraughtsBoard({ tx, view, flipped, label, movable, route, landings = [], captured = [], ghost, onSquare, describedBy }: Props) {
  // Animation of the latest accepted move, worked out while rendering the new view so the piece never
  // flashes at its destination first
  const [reduced, setReduced] = useState(false);
  const [shown, setShown] = useState(view);
  const [anim, setAnim] = useState<Anim | null>(null);
  if (shown !== view) {
    const before = shown;
    setShown(view);
    const record = view.moves[view.moves.length - 1];
    if (!reduced && record && before.gameId === view.gameId && view.moves.length === before.moves.length + 1) {
      setAnim({ pieceId: record.pieceId, squares: [record.from, ...record.path], step: 0, captured: before.pieces.filter(p => record.capturedIds.includes(p.id)) });
    } else setAnim(null);
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!anim) return;
    const last = anim.step >= anim.squares.length - 1;
    const timer = setTimeout(
      () => setAnim(a => (a && !last ? { ...a, step: a.step + 1 } : null)),
      anim.step === 0 ? 30 : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [anim]);

  // Roving focus: one square is in the tab order
  const pieceAt = new Map(view.pieces.map(p => [p.square, p]));
  const [focus, setFocus] = useState<Square>(() => [...(movable ?? [])][0] ?? view.pieces[0]?.square ?? 1);
  const buttons = useRef(new Map<Square, HTMLButtonElement>());

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, square: Square) => {
    // Arrow keys follow the screen, so work in display coordinates
    const d = displayCell(square, flipped);
    let next: Square | null = null;
    if (e.key === 'ArrowLeft') next = squareAtDisplay(d.row, d.col - 2, flipped);
    else if (e.key === 'ArrowRight') next = squareAtDisplay(d.row, d.col + 2, flipped);
    else if (e.key === 'ArrowUp') next = squareAtDisplay(d.row - 1, d.col - 1, flipped) ?? squareAtDisplay(d.row - 1, d.col + 1, flipped);
    else if (e.key === 'ArrowDown') next = squareAtDisplay(d.row + 1, d.col + 1, flipped) ?? squareAtDisplay(d.row + 1, d.col - 1, flipped);
    else if (e.key === 'Home') next = squareAtDisplay(d.row, 0, flipped) ?? squareAtDisplay(d.row, 1, flipped);
    else if (e.key === 'End') next = squareAtDisplay(d.row, 9, flipped) ?? squareAtDisplay(d.row, 8, flipped);
    else return;
    e.preventDefault();
    if (next === null) return;
    setFocus(next);
    buttons.current.get(next)?.focus();
  };

  const last = view.moves[view.moves.length - 1];
  const lastSquares = last ? new Set([last.from, last.path[last.path.length - 1]]) : new Set<Square>();
  const stops = route ? route.path : [];
  const capturedSet = new Set(captured);

  const squareLabel = (square: Square) => {
    const piece = pieceAt.get(square);
    const parts = [tx('sqLabel', { n: square })];
    parts.push(piece ? tx(`piece_${piece.color}_${piece.kind}`) : tx('sqEmpty'));
    if (route?.from === square) parts.push(tx('stateSelected'));
    else if (movable?.has(square) && !route) parts.push(tx('stateCanMove'));
    const stop = stops.indexOf(square);
    if (stop >= 0) parts.push(tx('stateStop', { n: stop + 1 }));
    if (landings.includes(square)) parts.push(tx('stateLanding'));
    if (capturedSet.has(square)) parts.push(tx('stateCaptured'));
    if (last?.from === square) parts.push(tx('stateLastFrom'));
    else if (lastSquares.has(square)) parts.push(tx('stateLastTo'));
    return parts.join(', ');
  };

  // Where each piece is drawn right now (mid-animation the moving piece is somewhere on its route)
  const drawnAt = (p: Piece) => (anim && anim.pieceId === p.id ? (anim.squares[anim.step] ?? p.square) : p.square);

  const cells = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const square = squareAtDisplay(row, col, flipped);
      if (square === null) {
        cells.push(<div key={`${row}-${col}`} aria-hidden="true" className="bg-card" />);
        continue;
      }
      const isLanding = landings.includes(square);
      const stop = stops.indexOf(square);
      const actionable = !!onSquare && (isLanding || (!!movable?.has(square) && !route?.path.length) || route?.from === square);
      cells.push(
        <button
          key={square}
          ref={el => {
            if (el) buttons.current.set(square, el);
            else buttons.current.delete(square);
          }}
          type="button"
          tabIndex={square === focus ? 0 : -1}
          aria-label={squareLabel(square)}
          aria-disabled={!actionable}
          onFocus={() => setFocus(square)}
          onClick={() => onSquare?.(square)}
          onKeyDown={e => onKey(e, square)}
          className={`relative flex items-center justify-center ${lastSquares.has(square) ? 'bg-[#2c6e55]' : 'bg-table'} ${
            actionable ? 'cursor-pointer' : 'cursor-default'
          } focus-visible:z-20 focus-visible:[outline-offset:-3px]`}
        >
          <span aria-hidden="true" className="absolute left-0.5 top-0 text-[7px] leading-none text-chalk/60 sm:left-1 sm:top-0.5 sm:text-[10px]">
            {square}
          </span>
          {isLanding && <span aria-hidden="true" className="h-[30%] w-[30%] rounded-full bg-gold/80 ring-2 ring-gold-edge" />}
          {stop >= 0 && !isLanding && (
            <span aria-hidden="true" className="flex h-[38%] w-[38%] items-center justify-center rounded-full bg-gold text-[9px] font-bold text-ink sm:text-xs">
              {stop + 1}
            </span>
          )}
        </button>,
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-[min(100%,36rem)] rounded-2xl bg-gold-edge/80 p-1.5 shadow-lift ring-1 ring-gold/50 sm:p-2.5">
      <div role="group" aria-label={label} aria-describedby={describedBy} className="relative aspect-square w-full overflow-hidden rounded-lg">
        <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">{cells}</div>
        {/* Pieces: drawn above the squares, never in the way of a click */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
          {view.pieces.map(p => {
            const fromSelected = route?.from === p.square && !!ghost;
            const isMovable = !route && movable?.has(p.square);
            return (
              <span
                key={p.id}
                className="absolute flex h-[10%] w-[10%] items-center justify-center transition-[left,top] duration-200 ease-out motion-reduce:transition-none"
                style={cellStyle(drawnAt(p), flipped)}
              >
                <PieceDisc
                  color={p.color}
                  kind={p.kind}
                  className={`${fromSelected ? 'opacity-35' : ''} ${
                    route?.from === p.square ? 'outline outline-[3px] outline-offset-2 outline-gold' : ''
                  } ${isMovable ? 'outline outline-2 outline-offset-2 outline-gold/90 motion-safe:animate-pulse' : ''} ${
                    capturedSet.has(p.square) ? 'opacity-60 outline outline-[3px] outline-offset-1 outline-signal' : ''
                  }`}
                />
                {capturedSet.has(p.square) && <X className="absolute h-[70%] w-[70%] text-signal" strokeWidth={3} />}
              </span>
            );
          })}
          {/* Pieces taken by the move being animated stay until it ends (art. 4.11) */}
          {anim?.captured.map(p => (
            <span key={`gone-${p.id}`} className="absolute flex h-[10%] w-[10%] items-center justify-center opacity-50" style={cellStyle(p.square, flipped)}>
              <PieceDisc color={p.color} kind={p.kind} />
            </span>
          ))}
          {ghost && (
            <span className="absolute flex h-[10%] w-[10%] items-center justify-center" style={cellStyle(ghost.square, flipped)}>
              <PieceDisc color={ghost.color} kind={ghost.kind} className="opacity-80 outline-dashed outline-[3px] outline-offset-2 outline-gold" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
