'use client';

import { teamOfSeat, tileValues, type HandResult } from '../../lib/dominoes/types';
import { tileIdName, type Tx } from '../../lib/dominoes/describe';
import DominoTile from './DominoTile';

type Props = {
  tx: Tx;
  result: HandResult;
  players: number;
  mySeat: number;
  nameOf: (seat: number) => string;
  sideName: (team: number) => string;
};

// How one hand ended: who went out (or that it was blocked), every hand left revealed with its pips,
// team totals with partners, the points awarded and the running score
export default function HandResultView({ tx, result, players, mySeat, nameOf, sideName }: Props) {
  const partners = players === 4;
  const myTeam = teamOfSeat(players, mySeat);
  const winner = result.winnerTeam;
  const points = winner === null ? 0 : (result.points[winner] ?? 0);
  const loserPips = winner === null ? 0 : (result.teamPips[1 - winner] ?? 0);
  const winnerPips = winner === null ? 0 : (result.teamPips[winner] ?? 0);

  const headline =
    result.ending === 'domino'
      ? result.outSeat === mySeat
        ? tx('youWentOut')
        : tx('wentOut', { name: nameOf(result.outSeat ?? 0) })
      : tx('handBlocked');

  let explain: string;
  if (winner === null) explain = tx('explainTie');
  else if (result.ending === 'domino') explain = tx('explainDomino', { side: sideName(winner), n: points });
  else if (partners) explain = tx('explainBlockedPartners', { side: sideName(winner), n: points });
  else explain = tx('explainBlockedTwo', { side: sideName(winner), high: loserPips, low: winnerPips, n: points });

  const seats = result.remaining.map((_, seat) => seat);
  return (
    <div className="space-y-3">
      <p className="font-semibold">{headline}</p>
      <p className="text-sm text-chalk">{explain}</p>
      <ul className="space-y-2">
        {seats.map(seat => {
          const tiles = result.remaining[seat] ?? [];
          return (
            <li key={seat} className="rounded-xl bg-felt-deep/80 p-2.5">
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {seat === mySeat ? tx('you') : nameOf(seat)}
                  {partners && <span className="font-normal text-chalk"> · {teamOfSeat(4, seat) === myTeam ? tx('yourSide') : tx('theirSide')}</span>}
                </span>
                <span className="tabular-nums text-chalk">{tx('pipsN', { n: result.pips[seat] ?? 0 })}</span>
              </p>
              {tiles.length === 0 ? (
                <p className="mt-1 text-xs text-chalk">{tx('noTilesLeft')}</p>
              ) : (
                <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={tx('tilesLeftAria', { name: seat === mySeat ? tx('you') : nameOf(seat) })}>
                  {tiles.map(id => {
                    const [a, b] = tileValues(id);
                    return (
                      <li key={id}>
                        <DominoTile a={a} b={b} label={tileIdName(tx, id)} className="h-10 w-5 sm:h-12 sm:w-6" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <table className="w-full text-sm">
        <caption className="sr-only">{tx('handN', { n: result.hand })}</caption>
        <thead>
          <tr className="text-left text-chalk">
            <th scope="col" className="py-1 font-medium">
              <span className="sr-only">{tx('scoreLabel')}</span>
            </th>
            {[0, 1].map(team => (
              <th key={team} scope="col" className="py-1 text-right font-medium">
                {sideName(team)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {partners && (
            <tr className="border-t border-white/10">
              <th scope="row" className="py-1 text-left font-normal text-chalk">
                {tx('teamPips')}
              </th>
              {[0, 1].map(team => (
                <td key={team} className="py-1 text-right">
                  {result.teamPips[team] ?? 0}
                </td>
              ))}
            </tr>
          )}
          <tr className="border-t border-white/10">
            <th scope="row" className="py-1 text-left font-normal text-chalk">
              {tx('pointsThisHand')}
            </th>
            {[0, 1].map(team => (
              <td key={team} className="py-1 text-right text-gold">
                {result.points[team] ?? 0}
              </td>
            ))}
          </tr>
          <tr className="border-t border-white/20 font-semibold">
            <th scope="row" className="py-1 text-left">
              {tx('matchScore')}
            </th>
            {[0, 1].map(team => (
              <td key={team} className="py-1 text-right">
                {result.scoresAfter[team] ?? 0}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
