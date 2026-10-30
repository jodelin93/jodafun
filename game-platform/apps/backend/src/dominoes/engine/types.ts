// Seats are numbered in anticlockwise order: play passes from seat n to seat n + 1
export type Seat = number;
export type Mode = 'head-to-head' | 'partners';
export type PlayerCount = 2 | 4;

// "a-b" with 0 <= a <= b <= 6, e.g. "0-0", "3-5", "6-6". A tile's id never changes; which way
// round it lies on the table is stored on its placement.
export type TileId = string;

export type End = 'left' | 'right';

// One tile on the table. The chain is kept left to right: `left` and `right` are the tile's
// numbers in that order, so neighbouring placements touch where a.right === b.left.
export interface Placement {
  tile: TileId;
  seat: Seat;
  left: number;
  right: number;
}

// What a player may do: put `tile` on `end` (null for the first tile of a hand)
export interface Move {
  tile: TileId;
  end: End | null;
}

export type LastAction = { seat: Seat; type: 'play'; tile: TileId; end: End | null } | { seat: Seat; type: 'pass' };

export interface DominoConfig {
  mode: Mode;
  players: PlayerCount;
  targetScore: number;
}

export interface HandResult {
  hand: number;
  startSeat: Seat;
  ending: 'domino' | 'blocked';
  outSeat: Seat | null; // who went out (domino only)
  remaining: TileId[][]; // every player's tiles left at the end, revealed for the breakdown
  pips: number[]; // per seat
  teamPips: number[]; // per side (two players: the same as pips)
  winnerTeam: number | null; // null when a blocked hand ties
  points: number[]; // per side; only the winner scores
  scoresAfter: number[];
}

export type MatchStatus = 'playing' | 'finished';

export interface DominoMatch {
  matchId: string;
  rulesVersion: number;
  config: DominoConfig;
  version: number; // bumps on every change; turns must name it
  handNumber: number; // 1-based
  startSeat: Seat; // who started this hand
  turn: Seat;
  hands: TileId[][]; // private, by seat
  unused: TileId[]; // two players: the 14 tiles nobody holds this hand; never shown, never scored
  board: Placement[];
  openingTile: TileId | null; // the tile that must open this hand (first hand only), null otherwise
  passes: number; // consecutive passes; any placement resets it
  scores: number[]; // per side
  results: HandResult[];
  status: MatchStatus;
  winnerTeam: number | null;
  forfeitTeam: number | null; // set when a side abandoned the match
  lastAction: LastAction | null;
  turnsPlayed: number;
}

export type RuleErrorCode =
  | 'BAD_MOVE'
  | 'NOT_PLAYING'
  | 'NOT_YOUR_TURN'
  | 'UNKNOWN_TILE'
  | 'NOT_YOUR_TILE'
  | 'MUST_OPEN_WITH'
  | 'CHOOSE_END'
  | 'TILE_DOES_NOT_FIT'
  | 'CAN_PLAY';

export interface RuleError {
  code: RuleErrorCode;
  params?: { tile?: TileId; end?: End; value?: number };
}

export type RuleResult = { ok: true; state: DominoMatch; handResult: HandResult | null } | { ok: false; error: RuleError };
