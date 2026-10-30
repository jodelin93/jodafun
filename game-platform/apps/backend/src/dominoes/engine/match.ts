import { shuffle, type RandomInt } from '../../lib/random';
import { DEFAULT_TARGET_SCORE, DOMINO_RULES, MAX_TARGET_SCORE, MIN_TARGET_SCORE, RULES_VERSION, type Payout } from './rules';
import { ALL_TILES, hasValue, isDouble, isTileId, otherValue, pipsOf, sumPips, tileValues } from './tiles';
import type {
  DominoConfig,
  DominoMatch,
  End,
  HandResult,
  LastAction,
  Mode,
  Move,
  Placement,
  RuleError,
  RuleResult,
  Seat,
  TileId,
} from './types';

export const playersFor = (mode: Mode) => (mode === 'partners' ? 4 : 2);
export const teamOf = (state: { config: DominoConfig }, seat: Seat) => (state.config.players === 4 ? seat % 2 : seat);
export const partnerOf = (state: { config: DominoConfig }, seat: Seat): Seat | null =>
  state.config.players === 4 ? (seat + 2) % 4 : null;
const nextSeat = (state: DominoMatch, seat: Seat) => (seat + 1) % state.config.players;

export function normalizeConfig(input: { mode?: unknown; targetScore?: unknown }): DominoConfig {
  const mode: Mode = input.mode === 'partners' ? 'partners' : 'head-to-head';
  const target = Number(input.targetScore);
  return {
    mode,
    players: playersFor(mode),
    targetScore: Number.isInteger(target) && target >= MIN_TARGET_SCORE && target <= MAX_TARGET_SCORE ? target : DEFAULT_TARGET_SCORE,
  };
}

// The exposed numbers at each end of the chain, or null before the first tile
export function endsOf(board: readonly Placement[]): { left: number; right: number } | null {
  const first = board[0];
  const last = board.at(-1);
  return first && last ? { left: first.left, right: last.right } : null;
}

// --- Dealing and opening ---

export function createMatch(input: { mode?: unknown; targetScore?: unknown }, random: RandomInt, matchId = 'match'): DominoMatch {
  const config = normalizeConfig(input);
  const state: DominoMatch = {
    matchId,
    rulesVersion: RULES_VERSION,
    config,
    version: 0,
    handNumber: 0,
    startSeat: 0,
    turn: 0,
    hands: [],
    unused: [],
    board: [],
    openingTile: null,
    passes: 0,
    scores: [0, 0],
    results: [],
    status: 'playing',
    winnerTeam: null,
    forfeitTeam: null,
    lastAction: null,
    turnsPlayed: 0,
  };
  dealHand(state, random);
  return state;
}

// The tile that must open the first hand: the highest dealt double, otherwise (two players only)
// the heaviest dealt tile, ties broken by its higher end
export function firstOpeningTile(hands: readonly TileId[][]): TileId {
  const dealt = hands.flat();
  const doubles = dealt.filter(isDouble).sort((x, y) => pipsOf(y) - pipsOf(x));
  if (doubles[0]) return doubles[0];
  const heaviest = [...dealt].sort((x, y) => pipsOf(y) - pipsOf(x) || tileValues(y)[1] - tileValues(x)[1]);
  return heaviest[0]!;
}

// Shuffles the 28 tiles and deals seven each; the next hand's starter is chosen by the opening rules
export function dealHand(state: DominoMatch, random: RandomInt) {
  const players = state.config.players;
  const tiles = shuffle(ALL_TILES, random);
  state.hands = Array.from({ length: players }, (_, seat) => tiles.slice(seat * DOMINO_RULES.handSize, (seat + 1) * DOMINO_RULES.handSize));
  state.unused = tiles.slice(players * DOMINO_RULES.handSize);
  state.board = [];
  state.passes = 0;
  state.lastAction = null; // the previous hand's last move is in its result
  state.handNumber += 1;
  if (state.handNumber === 1) {
    const opening = firstOpeningTile(state.hands);
    state.openingTile = opening;
    state.startSeat = state.hands.findIndex(hand => hand.includes(opening));
  } else {
    state.openingTile = null;
    state.startSeat = (state.startSeat + 1) % players;
  }
  state.turn = state.startSeat;
  state.version += 1;
}

// --- Moves ---

// Every placement the player could make now (empty when it isn't their turn or they must pass)
export function legalMoves(state: DominoMatch, seat: Seat): Move[] {
  if (state.status !== 'playing' || state.turn !== seat) return [];
  const hand = state.hands[seat] ?? [];
  const ends = endsOf(state.board);
  if (!ends) {
    if (state.openingTile) return hand.includes(state.openingTile) ? [{ tile: state.openingTile, end: null }] : [];
    return hand.map(tile => ({ tile, end: null }));
  }
  const moves: Move[] = [];
  for (const tile of hand) {
    if (hasValue(tile, ends.left)) moves.push({ tile, end: 'left' });
    if (hasValue(tile, ends.right)) moves.push({ tile, end: 'right' });
  }
  return moves;
}

export const canPlay = (state: DominoMatch, seat: Seat) => legalMoves(state, seat).length > 0;

// A placement as sent by a client: a tile id and, once the chain has started, the end to play on
export function parseMove(raw: unknown): { ok: true; move: Move } | { ok: false } {
  if (typeof raw !== 'object' || raw === null) return { ok: false };
  const { tile, end } = raw as { tile?: unknown; end?: unknown };
  if (typeof tile !== 'string' || tile.length > 5) return { ok: false };
  if (end !== undefined && end !== null && end !== 'left' && end !== 'right') return { ok: false };
  return { ok: true, move: { tile, end: (end as End | null | undefined) ?? null } };
}

const fail = (code: RuleError['code'], params?: RuleError['params']): RuleResult => ({ ok: false, error: { code, params } });

function checkTurn(state: DominoMatch, seat: Seat): RuleResult | null {
  if (state.status !== 'playing') return fail('NOT_PLAYING');
  if (state.turn !== seat) return fail('NOT_YOUR_TURN');
  return null;
}

// Places a tile. Values, ownership and orientation all come from the state; the state passed in is
// never modified, and a rejected move changes nothing.
export function playTile(state: DominoMatch, seat: Seat, move: Move, random: RandomInt): RuleResult {
  const blocked = checkTurn(state, seat);
  if (blocked) return blocked;
  if (!isTileId(move.tile)) return fail('UNKNOWN_TILE');
  if (!state.hands[seat]?.includes(move.tile)) return fail('NOT_YOUR_TILE', { tile: move.tile });

  const ends = endsOf(state.board);
  let placement: Placement;
  if (!ends) {
    if (state.openingTile && move.tile !== state.openingTile) return fail('MUST_OPEN_WITH', { tile: state.openingTile });
    const [a, b] = tileValues(move.tile);
    placement = { tile: move.tile, seat, left: a, right: b };
  } else {
    if (!move.end) return fail('CHOOSE_END', { tile: move.tile });
    const value = ends[move.end];
    if (!hasValue(move.tile, value)) return fail('TILE_DOES_NOT_FIT', { tile: move.tile, end: move.end, value });
    const outer = otherValue(move.tile, value);
    placement = move.end === 'left' ? { tile: move.tile, seat, left: outer, right: value } : { tile: move.tile, seat, left: value, right: outer };
  }

  const next = structuredClone(state);
  next.hands[seat] = next.hands[seat]!.filter(id => id !== move.tile);
  if (move.end === 'left' && ends) next.board.unshift(placement);
  else next.board.push(placement);
  next.openingTile = null;
  next.passes = 0;
  next.lastAction = { seat, type: 'play', tile: move.tile, end: ends ? move.end : null };
  next.turnsPlayed += 1;
  next.version += 1;

  if (next.hands[seat]!.length === 0) return finish(next, 'domino', seat, random);
  next.turn = nextSeat(next, seat);
  return { ok: true, state: next, handResult: null };
}

// Passing is allowed only when no tile in the hand fits either end
export function pass(state: DominoMatch, seat: Seat, random: RandomInt): RuleResult {
  const blocked = checkTurn(state, seat);
  if (blocked) return blocked;
  if (canPlay(state, seat)) return fail('CAN_PLAY');

  const next = structuredClone(state);
  next.passes += 1;
  next.lastAction = { seat, type: 'pass' };
  next.turnsPlayed += 1;
  next.version += 1;
  if (next.passes >= DOMINO_RULES.passesToBlock[next.config.mode]) return finish(next, 'blocked', null, random);
  next.turn = nextSeat(next, seat);
  return { ok: true, state: next, handResult: null };
}

// --- Scoring ---

const payout = (kind: Payout, winner: number, loser: number) => (kind === 'pip-difference' ? loser - winner : loser);

// Scores a finished hand from the tiles left in every hand (two-player unused tiles never count)
export function scoreHand(
  state: Pick<DominoMatch, 'config' | 'hands' | 'handNumber' | 'startSeat' | 'scores'>,
  ending: 'domino' | 'blocked',
  outSeat: Seat | null,
): HandResult {
  const pips = state.hands.map(sumPips);
  const teamPips = [0, 0];
  pips.forEach((n, seat) => (teamPips[teamOf(state, seat)] += n));
  let winnerTeam: number | null;
  if (ending === 'domino') winnerTeam = teamOf(state, outSeat!);
  else winnerTeam = teamPips[0] === teamPips[1] ? null : teamPips[0] < teamPips[1] ? 0 : 1;

  const points = [0, 0];
  if (winnerTeam !== null) {
    const rule = DOMINO_RULES.payout[state.config.mode][ending];
    points[winnerTeam] = payout(rule, teamPips[winnerTeam], teamPips[1 - winnerTeam]);
  }
  return {
    hand: state.handNumber,
    startSeat: state.startSeat,
    ending,
    outSeat,
    remaining: state.hands.map(hand => [...hand]),
    pips,
    teamPips,
    winnerTeam,
    points,
    scoresAfter: state.scores.map((score, team) => score + points[team]),
  };
}

// Ends the hand: scores it, then either ends the match or deals the next hand straight away
function finish(next: DominoMatch, ending: 'domino' | 'blocked', outSeat: Seat | null, random: RandomInt): RuleResult {
  const result = scoreHand(next, ending, outSeat);
  next.scores = [...result.scoresAfter];
  next.results.push(result);
  const best = Math.max(...next.scores);
  const leaders = next.scores.flatMap((score, team) => (score === best ? [team] : []));
  if (best >= next.config.targetScore && leaders.length === 1) {
    next.status = 'finished';
    next.winnerTeam = leaders[0]!;
    next.version += 1;
  } else {
    dealHand(next, random);
  }
  return { ok: true, state: next, handResult: result };
}

// A side left or stayed away too long: the other side wins the match
export function forfeitMatch(state: DominoMatch, losingTeam: number): DominoMatch {
  if (state.status !== 'playing') return state;
  const next = structuredClone(state);
  next.status = 'finished';
  next.winnerTeam = 1 - losingTeam;
  next.forfeitTeam = losingTeam;
  next.version += 1;
  return next;
}

// --- Views ---

export interface PublicDominoView {
  matchId: string;
  rulesVersion: number;
  mode: Mode;
  players: number;
  targetScore: number;
  version: number;
  handNumber: number;
  startSeat: Seat;
  turn: Seat;
  status: DominoMatch['status'];
  winnerTeam: number | null;
  forfeitTeam: number | null;
  board: Placement[];
  ends: { left: number; right: number } | null;
  handCounts: number[];
  unusedCount: number;
  passes: number;
  scores: number[];
  results: HandResult[];
  lastAction: LastAction | null;
}

export interface PrivateDominoView {
  seat: Seat;
  hand: TileId[];
  moves: Move[];
  canPass: boolean;
}

// What everyone at the table may see: never a hand, the unused tiles or the tile that must open
// (only its holder is told, through their moves). Finished hands are revealed in their results.
export function publicView(state: DominoMatch): PublicDominoView {
  return {
    matchId: state.matchId,
    rulesVersion: state.rulesVersion,
    mode: state.config.mode,
    players: state.config.players,
    targetScore: state.config.targetScore,
    version: state.version,
    handNumber: state.handNumber,
    startSeat: state.startSeat,
    turn: state.turn,
    status: state.status,
    winnerTeam: state.winnerTeam,
    forfeitTeam: state.forfeitTeam,
    board: state.board.map(p => ({ ...p })),
    ends: endsOf(state.board),
    handCounts: state.hands.map(hand => hand.length),
    unusedCount: state.unused.length,
    passes: state.passes,
    scores: [...state.scores],
    results: structuredClone(state.results),
    lastAction: state.lastAction ? { ...state.lastAction } : null,
  };
}

// One player's own tiles and what they can do with them
export function privateView(state: DominoMatch, seat: Seat): PrivateDominoView {
  const moves = legalMoves(state, seat);
  return {
    seat,
    hand: [...(state.hands[seat] ?? [])],
    moves,
    canPass: state.status === 'playing' && state.turn === seat && moves.length === 0,
  };
}

// --- Persistence ---

// Every tile is in exactly one place, and the chain's touching numbers match
export function assertValidState(state: DominoMatch) {
  const seen = [...state.hands.flat(), ...state.unused, ...state.board.map(p => p.tile)];
  if (seen.length !== ALL_TILES.length || new Set(seen).size !== ALL_TILES.length || !seen.every(isTileId)) {
    throw new Error('Dominoes state does not account for the 28 tiles exactly once');
  }
  if (state.hands.length !== state.config.players || state.turn < 0 || state.turn >= state.config.players) {
    throw new Error('Dominoes state has bad seats');
  }
  state.board.forEach((p, i) => {
    const [a, b] = tileValues(p.tile);
    if (Math.min(p.left, p.right) !== a || Math.max(p.left, p.right) !== b) throw new Error(`Placement ${p.tile} has wrong numbers`);
    const before = state.board[i - 1];
    if (before && before.right !== p.left) throw new Error(`Placement ${p.tile} does not match its neighbour`);
  });
}

export const serializeMatch = (state: DominoMatch) => JSON.stringify(state);

export function restoreMatch(raw: string | DominoMatch): DominoMatch {
  const state = (typeof raw === 'string' ? JSON.parse(raw) : raw) as DominoMatch;
  state.forfeitTeam ??= null;
  state.lastAction ??= null;
  assertValidState(state);
  return state;
}
