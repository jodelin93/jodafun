// Mirrors the server's Casino contracts (apps/backend/src/casino/casino.types.ts and engine/types.ts)

export type AceValue = 1 | 14;

export interface BuildCard {
  id: string;
  value: number;
}

export interface Build {
  id: string;
  value: number;
  owner: number;
  groups: BuildCard[][];
}

export interface TeamHandScore {
  cards: number;
  spades: number;
  mostCards: number;
  mostSpades: number;
  twoOfSpades: number;
  tenOfDiamonds: number;
  aces: number;
  total: number;
}

export interface HandResult {
  hand: number;
  dealer: number;
  lastCapturer: number | null;
  teams: TeamHandScore[];
  scoresAfter: number[];
}

export type ActionSummary =
  | { type: 'capture'; card: string; value: number; captured: string[]; builds: number[] }
  | { type: 'discard'; card: string }
  | { type: 'build'; cards: string[]; value: number; owner: number }
  | { type: 'augment'; value: number; cards: string[]; fromPile: string | null; owner: number; newBuild: boolean }
  | { type: 'change'; card: string; from: number; to: number; merged: boolean };

export interface PublicMatch {
  version: number;
  players: number;
  targetPoints: number;
  dealer: number;
  turn: number;
  handNumber: number;
  deal: 0 | 1;
  stockCount: number;
  handCounts: number[];
  loose: string[];
  builds: Build[];
  piles: { count: number; top: string | null }[];
  lastCapturer: number | null;
  proven: number[][];
  holds: number[][];
  scores: number[];
  results: HandResult[];
  status: 'playing' | 'handOver' | 'finished';
  winnerTeam: number | null;
  turnsPlayed: number;
  lastTurn: { seat: number; hand: number; actions: ActionSummary[] } | null;
  staged: ActionSummary[];
  nextBuildId: number;
}

export interface PrivateMatch {
  version: number;
  seat: number;
  hand: string[];
  teamPile: string[];
}

export interface PublicSeat {
  seat: number;
  team: number;
  player: { id: string; name: string; connected: boolean; isReady: boolean; isHost: boolean } | null;
}

export interface CasinoOutcome {
  matchId: string;
  winnerTeam: number | null;
  scores: number[];
  forfeit: boolean;
  forfeitTeam: number | null;
  results: HandResult[];
  finishedAt: number;
}

export interface CasinoRoomView {
  id: string;
  gameType: 'african-casino';
  capacity: 2 | 4;
  targetPoints: number;
  status: 'lobby' | 'playing' | 'finished';
  seats: PublicSeat[];
  match: PublicMatch | null;
  outcome: CasinoOutcome | null;
}

export interface CasinoPrivateView {
  roomId: string;
  playerId: string;
  seat: number;
  match: PrivateMatch | null;
}

// --- Turn proposals ---

export type TurnAction =
  | { type: 'capture'; card: string; aceValue?: AceValue; sets: string[][]; builds: string[]; order?: string[] }
  | { type: 'discard'; card: string }
  | { type: 'build'; hand?: string; loose: string[]; forPartner?: boolean }
  | {
      type: 'augment';
      build?: string;
      base?: string;
      baseValue?: AceValue;
      hand?: string;
      loose: string[];
      pile?: boolean;
      forPartner?: boolean;
      giveToPartner?: boolean;
    }
  | { type: 'change'; build: string; card: string };

export interface TurnProposal {
  actions: TurnAction[];
}

export interface RuleError {
  code: string;
  action?: number;
  params?: { value?: number; cards?: string[]; build?: string };
}

export type CasinoAck<T = object> = ({ ok: true } & T) | ({ ok: false; code: string; version?: number } & Omit<RuleError, 'code'>);

export const teamOfSeat = (capacity: number, seat: number) => (capacity === 4 ? seat % 2 : seat);
export const partnerOfSeat = (capacity: number, seat: number) => (capacity === 4 ? (seat + 2) % 4 : null);
