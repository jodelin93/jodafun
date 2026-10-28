import type { Difficulty } from './leaderboard';

export interface SoloBest {
  bestTimeSeconds: number;
  bestMoves: number;
  runs: number;
}

export interface UserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  roundsWon: number;
  roundsLost: number;
  currentStreak: number;
  bestStreak: number;
  solo: Record<Difficulty, SoloBest | null>;
}

export interface PublicProfile {
  id: string;
  name: string;
  isGuest: boolean;
  memberSince: string;
  stats: UserStats;
}

export interface HistoryItem {
  id: string;
  playedAt: string;
  result: 'win' | 'loss';
  opponentName: string | null;
  roundsWon: number;
  roundsLost: number;
  totalScore: number;
  forfeit: boolean;
  difficulty: string | null;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in');
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('Not found');
  }
}

const base = () => process.env.NEXT_PUBLIC_API_URL;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${base()}${path}`, { credentials: 'include', signal });
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export const fetchMyStats = (signal?: AbortSignal) => getJson<UserStats>('/api/users/me/stats', signal);

export function fetchMyHistory(cursor: string | null, signal?: AbortSignal) {
  const q = new URLSearchParams({ limit: '20' });
  if (cursor) q.set('cursor', cursor);
  return getJson<HistoryPage>(`/api/users/me/history?${q.toString()}`, signal);
}

export const fetchProfile = (id: string, signal?: AbortSignal) =>
  getJson<PublicProfile>(`/api/users/${encodeURIComponent(id)}/profile`, signal);

// Resolves with the saved name; throws Error with the server's message on validation failure
export async function renameMe(name: string): Promise<string> {
  const res = await fetch(`${base()}/api/users/me`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data && typeof data.error === 'string' ? data.error : null;
    throw new Error(msg ?? "Couldn't save your name. Check your connection and try again.");
  }
  return data.name as string;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ${day === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
