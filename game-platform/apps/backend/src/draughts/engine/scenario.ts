import { createGame } from './game';
import type { Color, DraughtsGame, Piece, Square } from './types';

export interface Setup {
  white?: { men?: Square[]; kings?: Square[] };
  black?: { men?: Square[]; kings?: Square[] };
  turn?: Color;
}

// A hand-made position for tests and the tutorial, with stable ids per colour
export function position(setup: Setup, gameId = 'scenario'): DraughtsGame {
  const pieces: Piece[] = [];
  for (const color of ['white', 'black'] as const) {
    const side = setup[color] ?? {};
    let n = 0;
    const id = () => `${color === 'white' ? 'w' : 'b'}${++n}`;
    for (const square of side.men ?? []) pieces.push({ id: id(), color, kind: 'man', square });
    for (const square of side.kings ?? []) pieces.push({ id: id(), color, kind: 'king', square });
  }
  return createGame(gameId, pieces, setup.turn ?? 'white');
}
