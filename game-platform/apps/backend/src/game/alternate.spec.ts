import { altRoundWins, canPlayNextRound, flipCard, newAltGame, pauseBoard, playRound, privateAltBoard, publicAltState } from './alternate';
import type { AltGame } from './room-store';

// Clears the seat's current board with perfect play (one move per pair), starting at `now`
function clearRound(game: AltGame, seat: number, now: number, extraMisses = 0) {
  expect(playRound(game, seat, now)).toBe(true);
  const board = game.seats[seat].board!;
  const deck = game.decks[board.round];
  for (let i = 0; i < extraMisses; i++) {
    const a = 0;
    const b = deck.findIndex((c, j) => j !== a && c.iconName !== deck[a].iconName);
    flipCard(game, seat, a, now);
    flipCard(game, seat, b, now);
  }
  const seen = new Map<string, number>();
  deck.forEach((card, id) => {
    const twin = seen.get(card.iconName);
    if (twin === undefined) {
      seen.set(card.iconName, id);
      return;
    }
    flipCard(game, seat, twin, now);
    flipCard(game, seat, id, now);
  });
}

describe('alternate game', () => {
  it('gives both players the same decks', () => {
    const game = newAltGame(4);
    expect(game.decks).toHaveLength(4);
    game.decks.forEach(deck => expect(deck).toHaveLength(8));
  });

  it('lets a player be at most one round ahead', () => {
    const game = newAltGame(4);
    expect(canPlayNextRound(game, 0)).toBe(true);
    expect(canPlayNextRound(game, 1)).toBe(true);

    clearRound(game, 0, 1000);
    expect(game.seats[0].results).toHaveLength(1);
    expect(canPlayNextRound(game, 0)).toBe(false);
    expect(playRound(game, 0, 2000)).toBe(false);

    clearRound(game, 1, 3000);
    expect(canPlayNextRound(game, 0)).toBe(true);
  });

  it('counts moves and only running time', () => {
    const game = newAltGame(4);
    playRound(game, 0, 1000);
    pauseBoard(game.seats[0].board!, 4000); // 3s played
    expect(flipCard(game, 0, 0, 5000)).toBeNull(); // paused: no flips
    playRound(game, 0, 60_000); // resume after a long break
    clearRound(game, 0, 62_000, 2);
    expect(game.seats[0].results[0]).toEqual({ moves: 6, timeMs: 5000 });
  });

  it('hides card positions from both views', () => {
    const game = newAltGame(4);
    playRound(game, 0, 0);
    const flip = flipCard(game, 0, 3, 0);
    expect(flip?.iconName).toBe(game.decks[0][3].iconName);

    const own = privateAltBoard(game, 0, 0)!;
    expect(own.revealed).toEqual([{ id: 3, iconName: game.decks[0][3].iconName }]);
    expect(own.pictures).toHaveLength(4);
    expect(JSON.stringify(publicAltState(game, 0))).not.toContain('img');
  });

  it('picks fewer total moves, then less time', () => {
    const game = newAltGame(4);
    for (let round = 0; round < 4; round++) {
      clearRound(game, 0, 0, round === 0 ? 1 : 0); // one wasted move in total
      clearRound(game, 1, 0);
    }
    expect(game.finished).toBe(true);
    expect(game.winnerIndex).toBe(1);
    expect(altRoundWins(game)).toEqual([0, 1]);
  });

  it('breaks a moves tie on time and calls an exact tie a draw', () => {
    const tie = newAltGame(4);
    for (let round = 0; round < 4; round++) {
      clearRound(tie, 0, 0);
      clearRound(tie, 1, 0);
    }
    expect(tie.winnerIndex).toBeNull();

    const timed = newAltGame(4);
    for (let round = 0; round < 4; round++) {
      clearRound(timed, 0, 0);
      playRound(timed, 1, 0);
      pauseBoard(timed.seats[1].board!, 10); // seat 1 is 10ms slower each round
      clearRound(timed, 1, 0);
    }
    expect(timed.winnerIndex).toBe(0);
  });
});
