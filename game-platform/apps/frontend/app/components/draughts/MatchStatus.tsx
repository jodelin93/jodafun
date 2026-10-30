'use client';

import { Trophy } from 'lucide-react';
import type { Tx } from '../../lib/draughts/describe';
import type { DraughtsSeries, PublicDraughtsSeat } from '../../lib/draughts/types';

type Props = {
  tx: Tx;
  series: DraughtsSeries;
  seats: PublicDraughtsSeat[];
  mySeat: number;
};

// The match: each player's run of wins in a row towards the target, and the games so far
export default function MatchStatus({ tx, series, seats, mySeat }: Props) {
  const nameOf = (seat: number) => (seat === mySeat ? tx('you') : (seats[seat]?.player?.name ?? tx('opponent')));
  const order = mySeat === 0 ? [0, 1] : [1, 0];
  return (
    <section aria-label={tx('matchTitle')} className="panel mb-3 space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Trophy className="h-4 w-4 text-gold" aria-hidden="true" />
          {tx('matchTitle')}
        </h2>
        <p className="text-xs text-chalk">{tx('matchRule', { n: series.target })}</p>
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {order.map(seat => {
          const run = series.streak[seat] ?? 0;
          return (
            <li key={seat} className="flex items-center gap-2" aria-label={tx('streakAria', { name: nameOf(seat), n: run, target: series.target })}>
              <span className="font-semibold">{nameOf(seat)}</span>
              <span className="flex gap-1" aria-hidden="true">
                {Array.from({ length: series.target }, (_, i) => (
                  <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < run ? 'bg-gold' : 'bg-white/15'}`} />
                ))}
              </span>
              <span className="tabular-nums text-chalk" aria-hidden="true">
                {tx('streakShort', { n: run, target: series.target })}
              </span>
            </li>
          );
        })}
      </ul>
      {series.games > 0 && (
        <p className="text-xs text-chalk">
          {tx('matchScore', { games: series.games, a: series.wins[order[0]!] ?? 0, b: series.wins[order[1]!] ?? 0, d: series.draws })}
        </p>
      )}
    </section>
  );
}
