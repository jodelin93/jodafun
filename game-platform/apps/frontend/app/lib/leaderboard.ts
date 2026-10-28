export type Period = 'day' | 'week' | 'month' | 'all';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface FriendsEntry {
  rank: number;
  userId: string;
  name: string;
  isGuest: boolean;
  wins: number;
  games: number;
  winRate: number;
}

export interface SoloEntry {
  rank: number;
  userId: string;
  name: string;
  isGuest: boolean;
  timeSeconds: number;
  moves: number;
  playedAt: string;
}

async function getEntries<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { credentials: 'include', signal });
  if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.entries) ? (data.entries as T[]) : [];
}

export function fetchFriendsLeaderboard(period: Period, signal?: AbortSignal) {
  return getEntries<FriendsEntry>(`/api/leaderboard/friends?period=${period}`, signal);
}

export function fetchSoloLeaderboard(difficulty: Difficulty, period: Period, signal?: AbortSignal) {
  return getEntries<SoloEntry>(`/api/leaderboard/solo?difficulty=${difficulty}&period=${period}`, signal);
}

export function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
