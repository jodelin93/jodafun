import { randomInt } from 'crypto';

// Randomness for dealing: secure in production, injected (and seeded) in tests and simulations
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

// Small deterministic generator (mulberry32) so tests and simulations can be replayed
export function seededRandom(seed: number): RandomInt {
  let a = seed >>> 0;
  return max => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * max);
  };
}
