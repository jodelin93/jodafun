import { DECK } from './cards';
import { buildCards } from './turn';
import type { Build, MatchState, PlayerCount, Seat } from './types';

export const single = (id: string, cards: string[], value: number, owner: Seat): Build => ({
  id,
  value,
  owner,
  groups: [cards.map(c => ({ id: c, value: c.startsWith('A') ? 1 : rankFromId(c) }))],
});

const rankFromId = (id: string) => DECK.find(c => c.id === id)!.rank;

// A hand-made position (tests and the tutorial). Cards not placed anywhere sit in `leftover`, so all 52 stay accounted for.
export function scenario(opts: {
  players?: PlayerCount;
  turn?: Seat;
  dealer?: Seat;
  deal?: 0 | 1;
  hands: string[][];
  loose?: string[];
  builds?: Build[];
  piles?: string[][];
  stock?: string[];
  proven?: number[][];
  holds?: number[][];
  scores?: number[];
  target?: number;
}): MatchState {
  const players = opts.players ?? 2;
  const builds = opts.builds ?? [];
  const piles = opts.piles ?? [[], []];
  const stock = opts.stock ?? [];
  const placed = new Set([...opts.hands.flat(), ...(opts.loose ?? []), ...builds.flatMap(buildCards), ...piles.flat(), ...stock]);
  return {
    version: 1,
    config: { players, targetPoints: opts.target ?? 21, redealStrongLayout: true },
    dealer: opts.dealer ?? players - 1,
    turn: opts.turn ?? 0,
    handNumber: 1,
    deal: opts.deal ?? 0,
    hands: opts.hands.map(h => [...h]),
    stock: [...stock],
    loose: [...(opts.loose ?? [])],
    builds: structuredClone(builds),
    piles: piles.map(p => [...p]),
    leftover: DECK.map(c => c.id).filter(id => !placed.has(id)),
    lastCapturer: null,
    nextBuildId: 100,
    proven: opts.proven ?? Array.from({ length: players }, () => []),
    holds: opts.holds ?? Array.from({ length: players }, () => []),
    scores: opts.scores ?? [0, 0],
    results: [],
    status: 'playing',
    winnerTeam: null,
    turnsPlayed: 0,
    lastTurn: null,
    staged: [],
  };
}
