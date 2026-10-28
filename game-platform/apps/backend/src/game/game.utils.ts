import { randomInt } from 'crypto';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const ROOM_CODE_LENGTH = 6;
const ICON_COUNT = 70; // img1..img70, matching the frontend IMAGE_POOL

export function generateRoomCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
}

export function normalizeRoomCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

// Fisher-Yates with crypto randomness, in place
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// `pairs` distinct icons, each twice, in random order
export function dealDeck(pairs: number): { iconName: string }[] {
  const names = shuffle(Array.from({ length: ICON_COUNT }, (_, i) => `img${i + 1}`)).slice(0, pairs);
  return shuffle([...names, ...names]).map(iconName => ({ iconName }));
}

// Sliding-window limit per key (socket id)
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    return allowed;
  }

  forget(key: string) {
    this.hits.delete(key);
  }
}
