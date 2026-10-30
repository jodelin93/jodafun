import type { RandomInt } from './cards';

export { scenario, single } from './scenario';

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
