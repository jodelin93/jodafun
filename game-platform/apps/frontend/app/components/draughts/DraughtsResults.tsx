'use client';

import { Handshake, RotateCcw, Trophy } from 'lucide-react';
import { reasonText, type Tx } from '../../lib/draughts/describe';
import type { Color, DraughtsSeries, PublicDraughtsSeat, PublicDraughtsView, Result } from '../../lib/draughts/types';
import DraughtsBoard from './DraughtsBoard';
import MatchStatus from './MatchStatus';
import MoveList from './MoveList';

type Props = {
  tx: Tx;
  result: Result;
  moves: number;
  myColor: Color | null;
  opponentName: string;
  view: PublicDraughtsView | null;
  series: DraughtsSeries | null;
  seats: PublicDraughtsSeat[];
  mySeat: number;
  onRematch: () => void;
  onLeave: () => void;
};

// The end of a game: who won or that it is a draw, why, the final position and the moves
export default function DraughtsResults({ tx, result, moves, myColor, opponentName, view, series, seats, mySeat, onRematch, onLeave }: Props) {
  const won = !!myColor && result.winner === myColor;
  const headline =
    result.winner === null
      ? tx('resultDraw')
      : myColor === null
        ? tx('colorWins', { color: tx(result.winner) })
        : won
          ? tx('resultYouWin')
          : tx('resultTheyWin', { name: opponentName });
  const Icon = result.winner === null ? Handshake : Trophy;
  // The match this game belongs to: decided, or going on to the next game
  const decided = series && series.winnerSeat !== null;
  const matchLine = !series || series.winnerSeat === null
    ? null
    : series.forfeit
      ? series.winnerSeat === mySeat
        ? tx('matchForfeitYou')
        : tx('matchForfeitThem', { name: opponentName })
      : series.winnerSeat === mySeat
        ? tx('matchYouWin', { n: series.target })
        : tx('matchTheyWin', { name: opponentName, n: series.target });

  return (
    <div className="space-y-5">
      <section aria-labelledby="result-title" className="panel space-y-3 p-5">
        <Icon className={`h-9 w-9 ${won ? 'text-gold' : 'text-chalk'}`} aria-hidden="true" />
        <h1 id="result-title" className="title-lg">
          {headline}
        </h1>
        <p className="text-chalk">{reasonText(tx, result.reason)}</p>
        {matchLine && <p className="rounded-2xl bg-felt-deep p-3 font-semibold ring-1 ring-inset ring-gold/50">{matchLine}</p>}
        <p className="text-sm text-chalk">
          {result.winner ? `${tx('winnerColor', { color: tx(result.winner) })} · ` : ''}
          {tx('movesPlayed', { n: moves })}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={onRematch} className="btn-gold min-h-11">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {series && !decided ? tx('nextGame') : series ? tx('newMatch') : tx('rematch')}
          </button>
          <button type="button" onClick={onLeave} className="btn-quiet min-h-11">
            {tx('backToMenu')}
          </button>
        </div>
        <p className="text-xs text-chalk">{series && !decided ? tx('nextGameHint', { n: series.target }) : tx('rematchHint')}</p>
      </section>
      {series && <MatchStatus tx={tx} series={series} seats={seats} mySeat={mySeat} />}
      {view && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <DraughtsBoard tx={tx} view={view} flipped={myColor === 'black'} label={tx('finalPosition')} />
          <MoveList tx={tx} moves={view.moves} />
        </div>
      )}
    </div>
  );
}
