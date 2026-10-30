import { normalizeConfig } from './match';
import { RULES_VERSION } from './rules';
import { ALL_TILES } from './tiles';
import type { DominoMatch, Mode, Placement, Seat, TileId } from './types';

export interface ScenarioOptions {
  mode?: Mode;
  hands: TileId[][];
  // The chain left to right: [tile, left number, right number], played by seat 0 unless given
  board?: [TileId, number, number, Seat?][];
  turn?: Seat;
  startSeat?: Seat;
  passes?: number;
  scores?: number[];
  target?: number;
  handNumber?: number; // 2 by default, so no opening tile is demanded
  openingTile?: TileId | null;
}

// A hand-made position for tests and the tutorial; every tile not placed goes to the unused set
export function scenario(opts: ScenarioOptions): DominoMatch {
  const config = normalizeConfig({ mode: opts.mode ?? 'head-to-head', targetScore: opts.target ?? 100 });
  const board: Placement[] = (opts.board ?? []).map(([tile, left, right, seat]) => ({ tile, left, right, seat: seat ?? 0 }));
  const placed = new Set([...opts.hands.flat(), ...board.map(p => p.tile)]);
  return {
    matchId: 'scenario',
    rulesVersion: RULES_VERSION,
    config,
    version: 1,
    handNumber: opts.handNumber ?? 2,
    startSeat: opts.startSeat ?? 0,
    turn: opts.turn ?? 0,
    hands: opts.hands.map(hand => [...hand]),
    unused: ALL_TILES.filter(id => !placed.has(id)),
    board,
    openingTile: opts.openingTile ?? null,
    passes: opts.passes ?? 0,
    scores: opts.scores ?? [0, 0],
    results: [],
    status: 'playing',
    winnerTeam: null,
    forfeitTeam: null,
    lastAction: null,
    turnsPlayed: 0,
  };
}
