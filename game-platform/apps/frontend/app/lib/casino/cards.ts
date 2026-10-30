// Card ids are rank then suit: "AS", "10D", "QH"

export type Suit = 'S' | 'H' | 'D' | 'C';

export interface CardInfo {
  id: string;
  rank: number; // 1 (ace) to 13
  label: string; // A, 2-10, J, Q, K
  suit: Suit;
  symbol: string;
  red: boolean;
}

const SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };

export function cardInfo(id: string): CardInfo {
  const suit = id.slice(-1) as Suit;
  const label = id.slice(0, -1);
  return { id, rank: RANKS[label] ?? Number(label), label, suit, symbol: SYMBOLS[suit], red: suit === 'H' || suit === 'D' };
}

export const isAce = (id: string) => cardInfo(id).rank === 1;
export const rankOf = (id: string) => cardInfo(id).rank;
export const cardText = (id: string) => {
  const c = cardInfo(id);
  return `${c.label}${c.symbol}`;
};

// A set of cards is worth one card's value (an ace 1 or 14), or the sum with every ace as 1
export function setMatches(ids: string[], value: number) {
  const [only] = ids;
  if (only === undefined) return false;
  if (ids.length === 1) return isAce(only) ? value === 1 || value === 14 : rankOf(only) === value;
  return ids.reduce((n, id) => n + rankOf(id), 0) === value;
}

export const sumOf = (ids: string[]) => ids.reduce((n, id) => n + rankOf(id), 0);

// Splits the chosen loose cards into sets each worth `value` (small search; at most ~20 cards are ever
// on the table). Returns null when they can't all be used.
export function partitionIntoSets(ids: string[], value: number): string[][] | null {
  const [first, ...rest] = ids;
  if (first === undefined) return [];
  // Try every set containing the first card, then partition the rest
  const options = subsetsWith(first, rest, value);
  for (const set of options) {
    const remaining = rest.filter(id => !set.includes(id));
    const tail = partitionIntoSets(remaining, value);
    if (tail) return [set, ...tail];
  }
  return null;
}

function subsetsWith(first: string, rest: string[], value: number): string[][] {
  const found: string[][] = [];
  if (setMatches([first], value)) found.push([first]);
  const target = value - rankOf(first);
  const walk = (start: number, chosen: string[], total: number) => {
    if (found.length > 50) return;
    if (total === target && chosen.length > 0) found.push([first, ...chosen]);
    if (total >= target) return;
    rest.slice(start).forEach((id, k) => walk(start + k + 1, [...chosen, id], total + rankOf(id)));
  };
  if (target > 0) walk(0, [], 0);
  return found;
}

// The ranks a hand card can capture with
export const captureValuesOf = (id: string) => (isAce(id) ? [1, 14] : [rankOf(id)]);

// Value names as players say them: 1 and 14 are both aces
export const valueLabel = (value: number) => (value === 1 || value === 14 ? `A (${value})` : value === 11 ? 'J (11)' : value === 12 ? 'Q (12)' : value === 13 ? 'K (13)' : String(value));
