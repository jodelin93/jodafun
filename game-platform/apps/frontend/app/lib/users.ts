import type { Difficulty } from './leaderboard';

export interface SoloBest {
  bestTimeSeconds: number;
  bestMoves: number;
  runs: number;
}

// Joda Casino results; points are match points and never mix with Joda Memory numbers
export interface CasinoStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  draws?: number; // always 0 for Casino and Dominoes; not shown
  twoPlayer: number;
  fourPlayer: number;
  pointsFor: number;
  pointsAgainst: number;
}

// Top-level fields are Joda Memory games with friends
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
  casino?: CasinoStats;
  // Dominoes results, same shape as Casino: twoPlayer is head-to-head, fourPlayer is partners
  dominoes?: CasinoStats;
  draughts?: DraughtsStats;
  five?: FiveStats;
}

// International draughts: games can be drawn; asWhite / asBlack split the results by colour played
export interface DraughtsColorStats {
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface DraughtsStats {
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  asWhite: DraughtsColorStats;
  asBlack: DraughtsColorStats;
}

// Infinite five-in-a-row: no draws; asX / asO split the results by symbol played
export interface FiveSymbolStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
}

export interface FiveStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  asX: FiveSymbolStats;
  asO: FiveSymbolStats;
}

// Draws exist only in draughts so far; the other games only ever send 'win' or 'loss'
export type GameResult = 'win' | 'loss' | 'draw';

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
  result: GameResult;
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

export interface CasinoPlayer {
  name: string;
}

export interface CasinoHistoryItem {
  id: string;
  playedAt: string;
  result: GameResult;
  players: 2 | 4;
  targetPoints: number | null;
  hands: number | null;
  forfeit: boolean;
  teamPoints: number;
  opponentPoints: number;
  teammates: CasinoPlayer[];
  opponents: CasinoPlayer[];
  mode?: 'head-to-head' | 'partners'; // Dominoes rows only
}

export interface CasinoHistoryPage {
  items: CasinoHistoryItem[];
  nextCursor: string | null;
}

// One finished draughts game, from this player's side. reason is an EndReason ('no-pieces',
// 'resignation', 'agreement', ...); moves counts single moves (plies)
export interface DraughtsHistoryItem {
  id: string;
  result: GameResult;
  color: 'white' | 'black';
  opponent: { name: string } | null;
  reason: string | null;
  moves: number;
  rulesVersion: string | null;
  finishedAt: string;
  forfeit: boolean;
}

export interface DraughtsHistoryPage {
  items: DraughtsHistoryItem[];
  nextCursor: string | null;
}

// One finished five-in-a-row game, from this player's side. reason is 'five', 'resignation' or
// 'forfeit'; moves counts the symbols placed
export interface FiveHistoryItem {
  id: string;
  result: 'win' | 'loss';
  symbol: 'X' | 'O';
  opponent: { name: string } | null;
  reason: string | null;
  moves: number;
  finishedAt: string;
  forfeit: boolean;
}

export interface FiveHistoryPage {
  items: FiveHistoryItem[];
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

// A validation message from the server (English text), shown translated when known
export class ServerMessageError extends Error {}

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

export function fetchMyCasinoHistory(cursor: string | null, signal?: AbortSignal) {
  const q = new URLSearchParams({ game: 'african-casino', limit: '20' });
  if (cursor) q.set('cursor', cursor);
  return getJson<CasinoHistoryPage>(`/api/users/me/history?${q.toString()}`, signal);
}

// Dominoes history rows have the same shape as Casino's
export function fetchMyDominoesHistory(cursor: string | null, signal?: AbortSignal) {
  const q = new URLSearchParams({ game: 'dominoes', limit: '20' });
  if (cursor) q.set('cursor', cursor);
  return getJson<CasinoHistoryPage>(`/api/users/me/history?${q.toString()}`, signal);
}

export function fetchMyDraughtsHistory(cursor: string | null, signal?: AbortSignal) {
  const q = new URLSearchParams({ game: 'international-draughts', limit: '20' });
  if (cursor) q.set('cursor', cursor);
  return getJson<DraughtsHistoryPage>(`/api/users/me/history?${q.toString()}`, signal);
}

export function fetchMyFiveHistory(cursor: string | null, signal?: AbortSignal) {
  const q = new URLSearchParams({ game: 'five-in-a-row', limit: '20' });
  if (cursor) q.set('cursor', cursor);
  return getJson<FiveHistoryPage>(`/api/users/me/history?${q.toString()}`, signal);
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
    if (data && typeof data.error === 'string') throw new ServerMessageError(data.error);
    throw new Error(`Request failed: ${res.status}`);
  }
  return data.name as string;
}

export function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function relativeDate(iso: string, locale: string, justNow: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const day = Math.floor(hr / 24);
  if (day < 7) return rtf.format(-day, 'day');
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}
