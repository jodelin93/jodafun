import { randomInt } from 'crypto';

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// A card's id never changes: rank label then suit, e.g. "AS", "10D", "QH"
export interface Card {
  id: string;
  rank: number; // 1 (ace) to 13 (king)
  suit: Suit;
}

export const DECK: readonly Card[] = SUITS.flatMap(suit =>
  RANK_LABELS.map((label, i) => ({ id: `${label}${suit}`, rank: i + 1, suit })),
);
const BY_ID = new Map(DECK.map(card => [card.id, card]));

export const isCardId = (value: unknown): value is string => typeof value === 'string' && BY_ID.has(value);

export function card(id: string): Card {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
}

export const rankOf = (id: string) => card(id).rank;
export const isAce = (id: string) => card(id).rank === 1;
export const isPicture = (id: string) => card(id).rank >= 11;

// Builds and captures run on values 1-14; an ace is worth 1 or 14 and both mean "ace" as a rank
export const rankForValue = (value: number) => (value === 14 ? 1 : value);

// The values a card can capture with: an ace either 1 or 14
export const captureValues = (id: string): number[] => (isAce(id) ? [1, 14] : [rankOf(id)]);

export const canCapture = (id: string, value: number) => captureValues(id).includes(value);

// Hand points: 10♦ is worth 2, 2♠ and every ace 1
export function cardPoints(id: string): number {
  if (id === '10D') return 2;
  if (id === '2S' || isAce(id)) return 1;
  return 0;
}

// Uniform integer in [0, max); production draws from crypto, tests inject a seeded generator
export type RandomInt = (max: number) => number;
export const secureRandomInt: RandomInt = max => randomInt(max);

// Fisher-Yates, returning a new array
export function shuffle<T>(items: readonly T[], random: RandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
