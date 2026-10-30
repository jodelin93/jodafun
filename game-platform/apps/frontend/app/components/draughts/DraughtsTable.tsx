'use client';

import { useEffect, useRef, useState } from 'react';
import { Crown, Flag, Handshake, WifiOff } from 'lucide-react';
import { countdown, drawCountdowns, errorMessage, type Tx } from '../../lib/draughts/describe';
import { opponentOf, type Color, type PublicDraughtsView, type Route } from '../../lib/draughts/types';
import MovePicker, { type Answer } from './MovePicker';
import MoveList from './MoveList';

export type PlayerInfo = { name: string; connected: boolean; graceEndsAt: number | null };

type Props = {
  tx: Tx;
  view: PublicDraughtsView;
  myColor: Color;
  opponent: PlayerInfo | null;
  canPlay: boolean; // false while the game is paused (moves and draw offers wait; resigning is still allowed)
  sending: boolean;
  connectionNote: string | null;
  onMove: (route: Route) => Promise<Answer>;
  onResign: () => Promise<Answer>;
  onOfferDraw: () => Promise<Answer>;
  onRespondDraw: (accept: boolean) => Promise<Answer>;
};

// The table during a game: the opponent above the board, the player below it (the board turns so
// their pieces are nearest them), the draw offer, resign, the running draw counts and the moves so far
export default function DraughtsTable({ tx, view, myColor, opponent, canPlay, sending, connectionNote, onMove, onResign, onOfferDraw, onRespondDraw }: Props) {
  const theirColor = opponentOf(myColor);
  const theirName = opponent?.name ?? tx('opponent');
  const myTurn = view.status === 'playing' && view.turn === myColor;
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = busy || sending;

  // An offer that disappears because a move was played has lapsed; one of ours that disappears
  // without a move was declined
  const [drawNote, setDrawNote] = useState<{ key: 'drawLapsed' | 'drawDeclined'; ply: number } | null>(null);
  const prev = useRef({ gameId: view.gameId, offer: view.drawOffer, ply: view.moves.length });
  useEffect(() => {
    const before = prev.current;
    prev.current = { gameId: view.gameId, offer: view.drawOffer, ply: view.moves.length };
    if (before.gameId !== view.gameId || view.drawOffer) {
      setDrawNote(null);
      return;
    }
    if (before.offer && view.status === 'playing') {
      if (view.moves.length > before.ply) setDrawNote({ key: 'drawLapsed', ply: view.moves.length });
      else if (before.offer.by === myColor) setDrawNote({ key: 'drawDeclined', ply: view.moves.length });
    }
  }, [view, myColor]);
  const showDrawNote = drawNote && view.moves.length <= drawNote.ply + 1 ? drawNote : null;

  // Grace countdown while the opponent is away
  const away = !!opponent && !opponent.connected && !!opponent.graceEndsAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!away) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [away]);

  // Spoken summary whenever a move is played or the turn changes
  const last = view.moves[view.moves.length - 1];
  const turnText = myTurn ? tx('yourTurn') : tx('turnOf', { name: theirName });
  const lastText = last ? tx('lastMoveBy', { name: last.color === myColor ? tx('you') : theirName, move: last.notation }) : null;
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    setAnnounce([lastText, turnText].filter(Boolean).join('. '));
  }, [lastText, turnText]);

  const run = async (action: () => Promise<Answer>) => {
    if (locked) return;
    setBusy(true);
    setNotice(null);
    const answer = await action();
    setBusy(false);
    if (!answer.ok) setNotice(errorMessage(tx, answer.error));
  };

  const material = (color: Color) => {
    const mine = view.pieces.filter(p => p.color === color);
    const kings = mine.filter(p => p.kind === 'king').length;
    return kings > 0 ? tx('piecesWithKings', { n: mine.length, kings }) : tx('piecesCount', { n: mine.length });
  };

  const playerBar = (color: Color, name: string, info: PlayerInfo | null) => {
    const toMove = view.status === 'playing' && view.turn === color;
    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ring-1 ring-inset ${toMove ? 'bg-gold/10 ring-2 ring-gold' : 'bg-table ring-table-rim'}`}>
        <p className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full ring-2 ${color === 'white' ? 'bg-card ring-ink/30' : 'bg-ink ring-chalk/60'}`} />
          <span className="truncate font-semibold">{name}</span>
          <span className="shrink-0 text-xs text-chalk">{tx(color)}</span>
        </p>
        <p className="shrink-0 text-right text-xs text-chalk">
          {info && !info.connected ? (
            <span className="font-semibold text-signal">{info.graceEndsAt ? tx('awayCountdown', { time: countdown(info.graceEndsAt - now) }) : tx('away')}</span>
          ) : toMove ? (
            <span className="font-semibold text-gold">{tx('toMove')}</span>
          ) : null}
          <span className="block">{material(color)}</span>
        </p>
      </div>
    );
  };

  const offer = view.drawOffer;
  const counters = drawCountdowns(view);
  const repetitions = view.counters.repetitions;

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div className="mx-auto w-full max-w-[36rem] space-y-2">
          {playerBar(theirColor, theirName, opponent)}
          <MovePicker tx={tx} view={view} myColor={myColor} canMove={canPlay} sending={sending} onSubmit={onMove} />
          {playerBar(myColor, tx('you'), null)}
        </div>

        <div className="space-y-3">
          <p className={`rounded-full px-3 py-1.5 text-center text-sm font-semibold ${myTurn ? 'bg-gold text-ink' : 'bg-white/5'}`}>{turnText}</p>

          {(counters.length > 0 || repetitions >= 2) && (
            <ul aria-label={tx('drawCountsLabel')} className="space-y-1 rounded-xl bg-felt-deep p-3 text-xs text-chalk ring-1 ring-inset ring-white/10">
              {counters.map(c => (
                <li key={c.key}>{tx(c.key, { n: c.left })}</li>
              ))}
              {repetitions >= 2 && <li>{tx('counterRepetition', { n: repetitions })}</li>}
            </ul>
          )}

          {offer && view.status === 'playing' && (
            <div role="status" className="space-y-2 rounded-xl bg-gold/10 p-3 text-sm ring-1 ring-inset ring-gold/60">
              <p className="flex items-center gap-2 font-semibold">
                <Handshake className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                {offer.by === myColor ? tx('drawOfferedByYou') : tx('drawOfferedBy', { name: theirName })}
              </p>
              {offer.by !== myColor && (
                <>
                  <p className="text-xs text-chalk">{tx('drawOfferHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={locked} onClick={() => void run(() => onRespondDraw(true))} className="btn-gold btn-sm min-h-11">
                      {tx('acceptDraw')}
                    </button>
                    <button type="button" disabled={locked} onClick={() => void run(() => onRespondDraw(false))} className="btn-quiet btn-sm min-h-11">
                      {tx('declineDraw')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {showDrawNote && (
            <p role="status" className="rounded-xl bg-felt-deep p-3 text-sm text-chalk ring-1 ring-inset ring-white/10">
              {tx(showDrawNote.key, { name: theirName })}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={locked || !canPlay || !!offer} onClick={() => void run(onOfferDraw)} className="btn-quiet btn-sm min-h-11">
              <Handshake className="h-4 w-4" aria-hidden="true" />
              {tx('offerDraw')}
            </button>
            <button type="button" disabled={locked} onClick={() => setConfirmResign(true)} className="btn-quiet btn-sm min-h-11">
              <Flag className="h-4 w-4" aria-hidden="true" />
              {tx('resign')}
            </button>
          </div>
          {notice && (
            <p role="alert" className="rounded-xl bg-signal/15 px-3 py-2 text-sm text-white ring-1 ring-inset ring-signal/60">
              {notice}
            </p>
          )}

          <MoveList tx={tx} moves={view.moves} />
          <p className="flex items-center gap-1.5 text-xs text-chalk">
            <Crown className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
            {tx('rulesVersionShort', { version: view.rulesVersion })}
          </p>
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
                disabled={locked}
                onClick={() => {
                  setConfirmResign(false);
                  void run(onResign);
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
