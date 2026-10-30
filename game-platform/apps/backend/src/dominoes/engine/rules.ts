import type { Mode } from './types';

/**
 * The house rules this release plays. Opening and scoring are chosen here rather than inside the
 * engine, so a later release can switch them by editing this table (and bumping RULES_VERSION,
 * which every match records).
 */
export const RULES_VERSION = 1;

// Tiles dealt to each player. Two players leave the other 14 face down and unused for the hand.
export const HAND_SIZE = 7;

export const DEFAULT_TARGET_SCORE = 100;
export const MIN_TARGET_SCORE = 25;
export const MAX_TARGET_SCORE = 500;

// First hand: the highest dealt double opens (and its holder starts). With two players and no
// dealt double, the heaviest dealt tile opens, ties broken by its higher end.
export type FirstHandOpening = 'highest-double-then-heaviest';
// Later hands: the starting seat moves one place anticlockwise and may open with any tile.
export type LaterHandOpening = 'rotate-any-tile';

// How the winning side of a hand is paid
// - opponent-pips: the pips left in the other side's hands
// - pip-difference: the other side's pips minus the winner's
export type Payout = 'opponent-pips' | 'pip-difference';

export interface DominoRules {
  version: number;
  handSize: number;
  firstHandOpening: FirstHandOpening;
  laterHandOpening: LaterHandOpening;
  // A hand is blocked after this many passes in a row (one per player: nobody can play)
  passesToBlock: Record<Mode, number>;
  // Going out ("domino") always wins for the side that went out. When blocked, the side with
  // fewer pips wins and equal totals score nothing.
  payout: Record<Mode, { domino: Payout; blocked: Payout }>;
}

export const DOMINO_RULES: DominoRules = {
  version: RULES_VERSION,
  handSize: HAND_SIZE,
  firstHandOpening: 'highest-double-then-heaviest',
  laterHandOpening: 'rotate-any-tile',
  passesToBlock: { 'head-to-head': 2, partners: 4 },
  payout: {
    'head-to-head': { domino: 'opponent-pips', blocked: 'pip-difference' },
    partners: { domino: 'opponent-pips', blocked: 'opponent-pips' },
  },
};
