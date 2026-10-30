import { isAce, rankOf } from './cards';

// A set of cards is worth its single card's value (an ace counts as 1 or 14), or the sum of
// several cards with every ace as 1 (an ace as 14 next to anything would exceed 14)
export function setMatches(ids: readonly string[], value: number): boolean {
  if (ids.length === 0) return false;
  if (ids.length === 1) return isAce(ids[0]) ? value === 1 || value === 14 : rankOf(ids[0]) === value;
  return sum(ids) === value;
}

export const sum = (ids: readonly string[]) => ids.reduce((total, id) => total + rankOf(id), 0);

// The value a card takes inside a set of `setSize` cards of the given total
export const valueInSet = (id: string, setSize: number, setValue: number) =>
  setSize === 1 && isAce(id) ? setValue : rankOf(id);

// Some set of `cards` worth `value`, or null. A subset-sum table over values up to 14 keeps this
// linear in the number of cards, however many there are.
export function findSetWithValue(cards: readonly string[], value: number): string[] | null {
  if (value < 1 || value > 14) return null;
  const single = cards.find(id => setMatches([id], value));
  if (single) return [single];
  const best: (string[] | null)[] = Array.from({ length: value + 1 }, (_, s) => (s === 0 ? [] : null));
  for (const id of cards) {
    const w = rankOf(id);
    for (let s = value; s >= w; s--) {
      if (best[s] === null && best[s - w] !== null) best[s] = [...best[s - w]!, id];
    }
  }
  const found = best[value];
  return found && found.length > 0 ? found : null;
}

// A set that could still be added to a build of `value`: loose cards, optionally with the exposed
// card of the opponents' pile
export function findAddableSet(
  loose: readonly string[],
  pileTop: string | null,
  value: number,
): { loose: string[]; pile: boolean } | null {
  const fromLoose = findSetWithValue(loose, value);
  if (fromLoose) return { loose: fromLoose, pile: false };
  if (!pileTop) return null;
  if (setMatches([pileTop], value)) return { loose: [], pile: true };
  const rest = value - rankOf(pileTop);
  if (rest < 1) return null;
  // Next to other cards the pile card counts at face value (an ace as 1)
  const withTop = findSetWithValue(loose, rest);
  return withTop ? { loose: withTop, pile: true } : null;
}
