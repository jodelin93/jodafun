export type Seat = number;
export type PlayerCount = 2 | 4;
export type AceValue = 1 | 14;

export interface CasinoConfig {
  players: PlayerCount;
  targetPoints: number;
  redealStrongLayout: boolean;
}

// A card inside a build, with the value it was given (an ace keeps 1 or 14 until captured)
export interface BuildCard {
  id: string;
  value: number;
}

// One set adds up to the build's value; a single build has one set of two or more cards,
// an augmented build two or more sets
export interface Build {
  id: string;
  value: number;
  owner: Seat;
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
  dealer: Seat;
  lastCapturer: Seat | null;
  teams: TeamHandScore[];
  scoresAfter: number[];
}

// What everyone saw happen in a turn. Captured cards are listed in a fixed order because the
// order on the pile is private to the capturing side.
export type ActionSummary =
  | { type: 'capture'; card: string; value: number; captured: string[]; builds: number[] }
  | { type: 'discard'; card: string }
  | { type: 'build'; cards: string[]; value: number; owner: Seat }
  | { type: 'augment'; value: number; cards: string[]; fromPile: string | null; owner: Seat; newBuild: boolean }
  | { type: 'change'; card: string; from: number; to: number; merged: boolean };

export interface LastTurn {
  seat: Seat;
  hand: number; // the hand it was played in (it stays shown after the next deal)
  actions: ActionSummary[];
}

export type MatchStatus = 'playing' | 'handOver' | 'finished';

export interface MatchState {
  version: number;
  config: CasinoConfig;
  dealer: Seat;
  turn: Seat;
  handNumber: number;
  deal: 0 | 1; // two players: 0 until each has been dealt more than twelve cards, then 1
  hands: string[][]; // by seat
  stock: string[]; // undealt cards, four each at a time
  loose: string[];
  builds: Build[];
  piles: string[][]; // by team, bottom to top
  leftover: string[]; // table cards nobody took (a hand without any capture)
  lastCapturer: Seat | null;
  nextBuildId: number;
  // Ranks (1-13) a seat is publicly known to hold (see the partnership rules)
  proven: number[][];
  // Ranks a seat asked its partner not to capture, having shown it holds one
  holds: number[][];
  scores: number[]; // match points by team
  results: HandResult[];
  status: MatchStatus;
  winnerTeam: number | null;
  turnsPlayed: number;
  lastTurn: LastTurn | null;
  // Pile cards the player whose turn it is has already taken into their side's builds this turn
  // (each one exposes the next card to everyone before the rest of the turn is chosen)
  staged: ActionSummary[];
}

// --- Turn proposals, as sent by a client ---

// Captures the given loose sets and builds with one card from hand; `order` arranges the captured
// cards on the pile, bottom first (the capturing card always goes on top)
export interface CaptureAction {
  type: 'capture';
  card: string;
  aceValue?: AceValue;
  sets: string[][];
  builds: string[];
  order?: string[];
}

export interface DiscardAction {
  type: 'discard';
  card: string;
}

// A new single build from loose cards and, optionally, one card from hand
export interface BuildAction {
  type: 'build';
  hand?: string;
  loose: string[];
  forPartner?: boolean;
}

// Adds one set (loose cards, at most one hand card, at most the exposed card of the opponents'
// pile) to a build, or to a loose `base` card that becomes a new augmented build
export interface AugmentAction {
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

// Adds one card from hand to an opponent's single build, changing its value
export interface ChangeAction {
  type: 'change';
  build: string;
  card: string;
}

export type TurnAction = CaptureAction | DiscardAction | BuildAction | AugmentAction | ChangeAction;

export interface TurnProposal {
  actions: TurnAction[];
}

export type RuleErrorCode =
  | 'BAD_REQUEST'
  | 'TOO_MANY_ACTIONS'
  | 'GAME_NOT_ACTIVE'
  | 'NOT_YOUR_TURN'
  | 'CARD_REUSED'
  | 'CARD_NOT_IN_HAND'
  | 'CARD_NOT_ON_TABLE'
  | 'BUILD_NOT_FOUND'
  | 'NO_HAND_CARD'
  | 'MULTIPLE_HAND_CARDS'
  | 'ACE_VALUE_REQUIRED'
  | 'SET_SUM_MISMATCH'
  | 'BUILD_VALUE_MISMATCH'
  | 'CAPTURE_EMPTY'
  | 'CAPTURE_INCOMPLETE'
  | 'DISCARD_COULD_CAPTURE'
  | 'BUILD_TOO_SMALL'
  | 'VALUE_TOO_HIGH'
  | 'BUILD_VALUE_TAKEN'
  | 'MUST_AUGMENT_EXISTING'
  | 'EMPTY_SET'
  | 'PILE_EMPTY'
  | 'HAND_CARD_ON_OPPONENT_BUILD'
  | 'OPPONENT_BUILD_NOT_CAPTURED'
  | 'CANNOT_CHANGE_OWN_BUILD'
  | 'CANNOT_CHANGE_AUGMENTED'
  | 'NO_CARD_FOR_NEW_VALUE'
  | 'NO_CAPTURE_CARD_KEPT'
  | 'NO_PARTNER'
  | 'PARTNER_NOT_PROVEN'
  | 'GIVE_NOT_ALLOWED'
  | 'DISCARD_WHILE_OWNING'
  | 'TOO_MANY_BUILDS'
  | 'MUST_AUGMENT'
  | 'INVALID_ORDER'
  | 'HOLD_NOT_ALLOWED'
  | 'PILE_ALREADY_USED'
  | 'TAKE_NOT_ALLOWED';

export interface RuleError {
  code: RuleErrorCode;
  action?: number; // index of the action that failed, if one did
  params?: { value?: number; cards?: string[]; build?: string };
}
