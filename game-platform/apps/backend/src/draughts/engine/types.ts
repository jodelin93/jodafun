// International draughts on the 10×10 board. Squares are the 50 dark squares numbered 1–50 as in
// FMJD Annex 1 art. 2.6: row by row from the top left, square 1 on the upper row (black's side).

export type Color = 'white' | 'black';
export type Kind = 'man' | 'king';
export type Square = number; // 1–50

export interface Piece {
  id: string; // stable for the whole game: "w1"–"w20", "b1"–"b20"
  color: Color;
  kind: Kind;
  square: Square;
}

// A complete move: the starting square and every square the piece stops on, in order. A capture
// lists each landing square, which is what tells apart routes that end on the same square.
export interface Move {
  from: Square;
  path: Square[]; // landing squares; a simple move has one
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
  | 'no-pieces' // art. 7.2.3
  | 'blocked' // art. 7.2.2
  | 'resignation' // art. 7.2.1
  | 'forfeit' // left the game or stayed away past the grace period
  | 'agreement' // art. 7.3.1
  | 'repetition' // art. 6.1
  | 'kings-25' // art. 6.2
  | 'endgame-16' // art. 6.3
  | 'long-diagonal-5' // art. 6.3, lone king alone on the long diagonal
  | 'endgame-5'; // art. 6.4

export interface Result {
  winner: Color | null; // null for a draw
  reason: EndReason;
}

// The endgame limits of art. 6.3 and 6.4, counted in single moves (plies) from the move that
// created the position: 16 moves each = 32, 5 moves each = 10
export interface EndgameCount {
  rule: '6.3' | '6.4';
  startPly: number;
  limitPlies: number;
}

export interface DrawOffer {
  by: Color;
  version: number; // the state version it was made at; any later move withdraws it
}

export interface DraughtsGame {
  gameId: string;
  rulesVersion: string;
  version: number; // bumps on every change; moves and draw answers must name it
  pieces: Piece[]; // pieces still on the board
  turn: Color;
  moves: MoveRecord[];
  // Position signatures since the last man move or capture (earlier positions can never recur),
  // including the current one; art. 6.1
  positions: string[];
  kingMoves: number; // consecutive plies of king moves without capture; art. 6.2 (50 = 25 each)
  endgame: EndgameCount | null; // art. 6.3 / 6.4
  longDiagonal: { startPly: number } | null; // art. 6.3 exception: 5 moves each
  drawOffer: DrawOffer | null;
  status: 'playing' | 'finished';
  result: Result | null;
}

export type RuleErrorCode =
  | 'NOT_PLAYING'
  | 'NOT_YOUR_TURN'
  | 'BAD_MOVE' // malformed input
  | 'NO_PIECE'
  | 'NOT_YOUR_PIECE'
  | 'CAPTURE_REQUIRED' // art. 4.2/4.3: a capture is available
  | 'MAX_CAPTURE_REQUIRED' // art. 4.13: another route takes more pieces
  | 'INCOMPLETE_CAPTURE' // art. 4.5/4.6: the route stops while more pieces must be taken
  | 'ILLEGAL_MOVE'
  | 'NO_DRAW_OFFER'
  | 'OWN_DRAW_OFFER'
  | 'DRAW_OFFER_PENDING'
  | 'STALE_DRAW_OFFER';

export interface RuleError {
  code: RuleErrorCode;
  params?: { count?: number; square?: Square };
}

export type RuleResult = { ok: true; state: DraughtsGame; move?: MoveRecord } | { ok: false; error: RuleError };
