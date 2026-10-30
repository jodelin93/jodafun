'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import { errorMessage, type Tx } from '../../lib/draughts/describe';
import { movableSquares, routeState } from '../../lib/draughts/routeBuilder';
import type { Color, DraughtsError, PublicDraughtsView, Route, Square } from '../../lib/draughts/types';
import DraughtsBoard from './DraughtsBoard';

export type Answer = { ok: true } | { ok: false; error: DraughtsError };

type Props = {
  tx: Tx;
  view: PublicDraughtsView;
  myColor: Color;
  canMove: boolean; // our turn, the game running and not paused
  sending: boolean;
  onSubmit: (route: Route) => Promise<Answer>;
  submitLabel?: string;
};

// "32-28", or every stop for a capture: "36x27x18"
export const routeNotation = (route: Route, capture: boolean) =>
  capture ? [route.from, ...route.path].join('x') : `${route.from}-${route.path[route.path.length - 1] ?? ''}`;

// The board plus the route builder: pick a piece that can move, then each square it stops on, until
// the route is one of the server's legal moves; then confirm it. Undo takes back the last stop.
export default function MovePicker({ tx, view, myColor, canMove, sending, onSubmit, submitLabel }: Props) {
  const [route, setRoute] = useState<Route | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = busy || sending;

  // Any change to the game (a move, an offer, a pause) starts a fresh choice
  const [seenVersion, setSeenVersion] = useState(`${view.gameId}:${view.version}`);
  if (seenVersion !== `${view.gameId}:${view.version}`) {
    setSeenVersion(`${view.gameId}:${view.version}`);
    setRoute(null);
    setNotice(null);
  }

  const active = canMove && view.status === 'playing' && view.turn === myColor;
  const legal = useMemo(() => (active ? view.legalMoves : []), [active, view.legalMoves]);
  const movable = useMemo(() => movableSquares(legal), [legal]);
  const state = route ? routeState(legal, route) : null;
  const mustTake = legal[0]?.captures.length ?? 0;
  const piece = route ? view.pieces.find(p => p.square === route.from) : undefined;
  const lastStop = route?.path[route.path.length - 1];
  const ghost =
    piece && lastStop !== undefined
      ? { square: lastStop, color: piece.color, kind: state?.complete?.promotes ? ('king' as const) : piece.kind }
      : null;

  const onSquare = (square: Square) => {
    if (locked) return;
    if (!active) {
      if (view.status === 'playing' && canMove) setNotice(tx('err_NOT_YOUR_TURN'));
      return;
    }
    setNotice(null);
    // A next stop first: a route may come back through its own starting square
    if (route && state?.nextLandings.includes(square)) {
      setRoute({ from: route.from, path: [...route.path, square] });
      return;
    }
    if (route && route.path.length > 0) {
      setNotice(state?.nextLandings.length ? tx('hintPickLanding') : tx('hintConfirm'));
      return;
    }
    if (route?.from === square) {
      setRoute(null);
      return;
    }
    if (movable.has(square)) {
      setRoute({ from: square, path: [] });
      return;
    }
    const own = view.pieces.find(p => p.square === square && p.color === myColor);
    if (own) setNotice(mustTake > 0 ? tx('hintMustCapture', { count: mustTake }) : tx('hintCannotMove'));
  };

  const undo = () => {
    if (!route) return;
    setNotice(null);
    setRoute(route.path.length > 0 ? { from: route.from, path: route.path.slice(0, -1) } : null);
  };

  const confirm = async () => {
    if (!route || !state?.complete || locked) return;
    setBusy(true);
    const answer = await onSubmit({ from: route.from, path: [...route.path] });
    setBusy(false);
    if (!answer.ok) setNotice(errorMessage(tx, answer.error));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && route) {
      e.preventDefault();
      setRoute(null);
      setNotice(null);
    }
  };

  const status = !active
    ? null
    : !route
      ? mustTake > 0
        ? tx('pickCapture', { count: mustTake })
        : tx('pickPiece')
      : route.path.length === 0
        ? tx('pickLanding', { square: route.from })
        : state?.complete && state.nextLandings.length === 0
          ? tx('readyToConfirm', { move: routeNotation(route, state.complete.captures.length > 0) })
          : tx('pickNextLanding', { taken: state?.captured.length ?? 0, count: mustTake });

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      <DraughtsBoard
        tx={tx}
        view={view}
        flipped={myColor === 'black'}
        label={tx('boardLabel')}
        movable={movable}
        route={route}
        landings={state?.nextLandings ?? []}
        captured={state?.captured ?? []}
        ghost={ghost}
        onSquare={onSquare}
        describedBy="draughts-keys"
      />
      <p id="draughts-keys" className="sr-only">
        {tx('boardKeys')}
      </p>
      {active && (
        <div className="rounded-2xl bg-felt-deep/95 p-3 ring-1 ring-inset ring-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 basis-48 text-sm text-chalk" aria-live="polite">
              {status}
            </p>
            {route && (
              <>
                <button type="button" onClick={undo} disabled={locked} className="btn-quiet btn-sm min-h-11" aria-label={tx('undoStepAria')}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{tx('undoStep')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoute(null);
                    setNotice(null);
                  }}
                  disabled={locked}
                  className="btn-quiet btn-sm min-h-11"
                  aria-label={tx('clearRoute')}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
            <button type="button" onClick={confirm} disabled={!state?.complete || locked} className="btn-gold btn-sm min-h-11">
              <Check className="h-4 w-4" aria-hidden="true" />
              {locked ? tx('sending') : (submitLabel ?? tx('confirmMove'))}
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="alert" className="rounded-xl bg-signal/15 px-3 py-2 text-sm text-white ring-1 ring-inset ring-signal/60">
          {notice}
        </p>
      )}
    </div>
  );
}
