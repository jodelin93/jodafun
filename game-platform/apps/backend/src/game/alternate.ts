import { dealDeck } from './game.utils';
import type { AltBoard, AltGame, AltRoundResult, AltSeat } from './room-store';

// "Play alternate": both players clear the same decks on their own board, round by round.
// Fewest total moves wins; less total time breaks a tie.
export const ALT_ROUNDS = 4;

export function newAltGame(pairs: number): AltGame {
  return {
    decks: Array.from({ length: ALT_ROUNDS }, () => dealDeck(pairs)),
    seats: [0, 1].map(() => ({ results: [], board: null })),
    finished: false,
    winnerIndex: null,
  };
}

// Round by round: a player may start their next round unless that would put them two rounds ahead
export function canPlayNextRound(game: AltGame, seat: number): boolean {
  const mine = game.seats[seat];
  const theirs = game.seats[seat === 0 ? 1 : 0];
  if (!mine || !theirs || game.finished || mine.board) return false;
  return mine.results.length < ALT_ROUNDS && mine.results.length <= theirs.results.length;
}

export function boardElapsedMs(board: AltBoard, now: number): number {
  return board.elapsedMs + (board.runningSince === null ? 0 : Math.max(0, now - board.runningSince));
}

// Banks the running time; safe to call on a paused board
export function pauseBoard(board: AltBoard, now: number) {
  board.elapsedMs = boardElapsedMs(board, now);
  board.runningSince = null;
}

// Starts the seat's next round, or resumes the one in progress. Returns false when it may not play.
export function playRound(game: AltGame, seat: number, now: number): boolean {
  const current = game.seats[seat]?.board;
  if (current) {
    if (current.runningSince === null) current.runningSince = now;
    return true;
  }
  if (!canPlayNextRound(game, seat)) return false;
  game.seats[seat].board = {
    round: game.seats[seat].results.length,
    matched: [],
    flipped: [],
    moves: 0,
    elapsedMs: 0,
    runningSince: now,
  };
  return true;
}

export type AltFlip = {
  iconName: string;
  pair?: 'match' | 'miss';
  roundDone?: AltRoundResult & { round: number };
};

// Applies one flip on the seat's running board; null when the flip is not allowed
export function flipCard(game: AltGame, seat: number, cardId: unknown, now: number): AltFlip | null {
  const board = game.seats[seat]?.board;
  if (!board || board.runningSince === null) return null;
  const deck = game.decks[board.round];
  if (
    !Number.isInteger(cardId) ||
    (cardId as number) < 0 ||
    (cardId as number) >= deck.length ||
    board.matched.includes(cardId as number) ||
    board.flipped.includes(cardId as number) ||
    board.flipped.length >= 2
  ) {
    return null;
  }
  const id = cardId as number;
  board.flipped.push(id);
  const flip: AltFlip = { iconName: deck[id].iconName };
  if (board.flipped.length < 2) return flip;

  const [first, second] = board.flipped;
  board.moves += 1;
  board.flipped = [];
  if (deck[first].iconName !== deck[second].iconName) {
    flip.pair = 'miss';
    return flip;
  }
  flip.pair = 'match';
  board.matched.push(first, second);
  if (board.matched.length < deck.length) return flip;

  // Round cleared: stop the clock and record it
  pauseBoard(board, now);
  const result = { moves: board.moves, timeMs: board.elapsedMs };
  const mine = game.seats[seat];
  mine.results.push(result);
  mine.board = null;
  flip.roundDone = { ...result, round: board.round + 1 };
  if (game.seats.every(s => s.results.length >= ALT_ROUNDS)) {
    game.finished = true;
    game.winnerIndex = altWinner(game);
  }
  return flip;
}

export function seatTotals(seat: AltSeat): AltRoundResult {
  return seat.results.reduce((sum, r) => ({ moves: sum.moves + r.moves, timeMs: sum.timeMs + r.timeMs }), {
    moves: 0,
    timeMs: 0,
  });
}

// Fewer total moves wins, then less total time; null is a draw
export function altWinner(game: AltGame): number | null {
  const [a, b] = game.seats.map(seatTotals);
  if (a.moves !== b.moves) return a.moves < b.moves ? 0 : 1;
  if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs ? 0 : 1;
  return null;
}

// Head-to-head per round (same rule as the game), for match history
export function altRoundWins(game: AltGame): number[] {
  const wins = [0, 0];
  const [a, b] = game.seats.map(s => s.results);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i].moves !== b[i].moves) wins[a[i].moves < b[i].moves ? 0 : 1] += 1;
    else if (a[i].timeMs !== b[i].timeMs) wins[a[i].timeMs < b[i].timeMs ? 0 : 1] += 1;
  }
  return wins;
}

// What both players see: results and live progress, never the cards
export function publicAltState(game: AltGame, now: number) {
  return {
    rounds: ALT_ROUNDS,
    finished: game.finished,
    winnerIndex: game.winnerIndex,
    seats: game.seats.map((seat, index) => ({
      results: seat.results,
      playing: seat.board
        ? {
            round: seat.board.round + 1,
            moves: seat.board.moves,
            pairs: seat.board.matched.length / 2,
            totalPairs: game.decks[seat.board.round].length / 2,
            elapsedMs: boardElapsedMs(seat.board, now),
            running: seat.board.runningSince !== null,
          }
        : null,
      canPlay: canPlayNextRound(game, index),
    })),
  };
}

// The seat's own board. Card positions stay hidden: only cards already turned up are named.
export function privateAltBoard(game: AltGame, seat: number, now: number) {
  const board = game.seats[seat]?.board;
  if (!board) return null;
  const deck = game.decks[board.round];
  return {
    round: board.round + 1,
    cardCount: deck.length,
    // Sorted, so the client can preload the pictures without learning where they are
    pictures: [...new Set(deck.map(c => c.iconName))].sort(),
    revealed: [...board.matched, ...board.flipped].map(id => ({ id, iconName: deck[id].iconName })),
    matched: [...board.matched],
    flipped: [...board.flipped],
    moves: board.moves,
    elapsedMs: boardElapsedMs(board, now),
    running: board.runningSince !== null,
  };
}
