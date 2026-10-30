// Mirrors the server's international draughts contracts (apps/backend/src/draughts/draughts.types.ts,
// engine/types.ts, engine/board.ts and the view in engine/game.ts). The client never decides what is
// legal: it shows the server's `legalMoves` and sends the player's chosen route back.

export type Color = 'white' | 'black';
export type Kind = 'man' | 'king';
export type Square = number; // 1–50

export interface Piece {
  id: string; // stable for the whole game: "w1"–"w20", "b1"–"b20"
  color: Color;
  kind: Kind;
  square: Square;
}

// A complete move: the starting square and every square the piece stops on, in order
export interface Move {
  from: Square;
  path: Square[];
  captures: Square[]; // squares of the captured pieces, in the order they are jumped
  promotes: boolean;
}

export interface MoveRecord extends Move {
  ply: number; // 1-based
  color: Color;
  pieceId: string;
  kind: Kind; // before the move
  capturedIds: string[];
  notation: string;
}

export type EndReason =
  | 'no-pieces'
  | 'blocked'
  | 'resignation'
  | 'forfeit'
  | 'agreement'
  | 'repetition'
  | 'kings-25'
  | 'endgame-16'
  | 'long-diagonal-5'
  | 'endgame-5';

export const END_REASONS: readonly EndReason[] = [
  'no-pieces',
  'blocked',
  'resignation',
  'forfeit',
  'agreement',
  'repetition',
  'kings-25',
  'endgame-16',
  'long-diagonal-5',
  'endgame-5',
];

export interface Result {
  winner: Color | null; // null for a draw
  reason: EndReason;
}

// Art. 6.3 / 6.4 counts, in single moves (plies) from startPly
export interface EndgameCount {
  rule: '6.3' | '6.4';
  startPly: number;
  limitPlies: number;
}

export interface DrawOffer {
  by: Color;
  version: number; // answers must name it; any later move withdraws the offer
}

export interface PublicDraughtsView {
  gameId: string;
  rulesVersion: string;
  version: number;
  pieces: Piece[];
  turn: Color;
  moves: MoveRecord[];
  legalMoves: Move[]; // for the side to move
  counters: { kingMoves: number; endgame: EndgameCount | null; longDiagonal: { startPly: number } | null; repetitions: number };
  drawOffer: DrawOffer | null;
  status: 'playing' | 'finished';
  result: Result | null;
}

export type RuleErrorCode =
  | 'NOT_PLAYING'
  | 'NOT_YOUR_TURN'
  | 'BAD_MOVE'
  | 'NO_PIECE'
  | 'NOT_YOUR_PIECE'
  | 'CAPTURE_REQUIRED'
  | 'MAX_CAPTURE_REQUIRED'
  | 'INCOMPLETE_CAPTURE'
  | 'ILLEGAL_MOVE'
  | 'NO_DRAW_OFFER'
  | 'OWN_DRAW_OFFER'
  | 'DRAW_OFFER_PENDING'
  | 'STALE_DRAW_OFFER';

export type DraughtsErrorCode =
  | RuleErrorCode
  | 'AUTH_REQUIRED'
  | 'BAD_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'WRONG_GAME'
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_SEATED'
  | 'ALREADY_SEATED'
  | 'INVALID_NAME'
  | 'STALE_STATE'
  | 'BAD_REQUEST_ID'
  | 'RATE_LIMITED'
  | 'NOT_FINISHED'
  | 'PAUSED'
  | 'NOT_PAUSER'
  // Client-side only: no answer before the timeout, a request still being sent, a tutorial move
  // that is legal but not the lesson's goal
  | 'NO_ANSWER'
  | 'BUSY'
  | 'TUTORIAL_GOAL';

export type ErrorParams = { count?: number; square?: Square; gameType?: string };

export interface DraughtsError {
  code: string;
  params?: ErrorParams;
}

export type DraughtsAck<T = object> = ({ ok: true } & T) | { ok: false; code: DraughtsErrorCode; params?: ErrorParams; version?: number };

export interface PublicDraughtsSeat {
  seat: 0 | 1;
  color: Color | null; // null in the lobby before the first game
  player: {
    id: string;
    name: string;
    connected: boolean;
    graceEndsAt: number | null;
    isReady: boolean;
    isHost: boolean;
  } | null;
}

export interface DraughtsOutcome {
  gameId: string;
  winner: Color | null;
  reason: EndReason;
  moves: number;
  finishedAt: number;
}

// The match: first to `target` wins in a row (a draw doesn't break a run)
export interface DraughtsSeries {
  id: string;
  games: number;
  wins: [number, number]; // by seat
  draws: number;
  streak: [number, number]; // consecutive wins by seat
  winnerSeat: 0 | 1 | null;
  forfeit: boolean;
  target: number;
}

export interface DraughtsRoomView {
  id: string;
  gameType: 'international-draughts';
  status: 'lobby' | 'playing' | 'finished';
  seats: PublicDraughtsSeat[];
  game: PublicDraughtsView | null;
  outcome: DraughtsOutcome | null;
  series: DraughtsSeries | null;
  paused: { byId: string; byName: string; since: number } | null;
}

export type Route = { from: Square; path: Square[] };

// Tutorial (draughts:tutorial / draughts:tutorialCheck)
export type TutorialStep = { id: string; index: number; total: number; view: PublicDraughtsView };
export type TutorialStepAck = { ok: true; step: TutorialStep } | { ok: false; code?: string };
export type TutorialCheckAck =
  | { ok: false; error?: DraughtsError; code?: string }
  | { ok: true; done: boolean; move: MoveRecord; view: PublicDraughtsView };

// --- Board geometry (FMJD Annex 1 art. 2.6), display only ---
// Rows run 0 (top, squares 1–5) to 9 (bottom, squares 46–50); columns 0–9 from the left. Even rows
// have their dark squares in columns 1, 3, 5, 7, 9; odd rows in 0, 2, 4, 6, 8.

export const SQUARES = 50;

export function coords(square: Square): { row: number; col: number } {
  const row = Math.floor((square - 1) / 5);
  const index = (square - 1) % 5;
  return { row, col: row % 2 === 0 ? index * 2 + 1 : index * 2 };
}

export function squareAt(row: number, col: number): Square | null {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  if ((row + col) % 2 === 0) return null; // light square
  return row * 5 + Math.floor(col / 2) + 1;
}

// Where a square is drawn. White's side is at the bottom; for a player with black the board turns
// half a turn so their pieces are at the bottom. Only the drawing turns: square numbers never change.
export function displayCell(square: Square, flipped: boolean): { row: number; col: number } {
  const { row, col } = coords(square);
  return flipped ? { row: 9 - row, col: 9 - col } : { row, col };
}

export function squareAtDisplay(row: number, col: number, flipped: boolean): Square | null {
  return flipped ? squareAt(9 - row, 9 - col) : squareAt(row, col);
}

export const opponentOf = (color: Color): Color => (color === 'white' ? 'black' : 'white');

// The long diagonal joins the corners 5 and 46 (art. 2.3)
export const LONG_DIAGONAL: readonly Square[] = [5, 10, 14, 19, 23, 28, 32, 37, 41, 46];
