import { DECK, canCapture, captureValues, cardPoints, isAce, isCardId, isPicture, rankForValue, rankOf, shuffle, type RandomInt } from './cards';
import { findAddableSet, findSetWithValue } from './sets';
import { HAND_SIZE, applyTurn, buildCards, dealRound, pileTop, positionAfter, teamOf } from './turn';
import type { AceValue, Build, CasinoConfig, HandResult, LastTurn, MatchState, RuleError, Seat, TurnAction, TurnProposal } from './types';

export const DEFAULT_TARGET_POINTS = 7;
export const MIN_TARGET_POINTS = 3;
export const MAX_TARGET_POINTS = 31;
const MAX_RECUTS = 50;

export function normalizeConfig(input: Partial<CasinoConfig>): CasinoConfig {
  const target = Number(input.targetPoints);
  return {
    players: input.players === 4 ? 4 : 2,
    targetPoints: Number.isInteger(target) && target >= MIN_TARGET_POINTS && target <= MAX_TARGET_POINTS ? target : DEFAULT_TARGET_POINTS,
    // Off: it balanced the old point cards, which no longer score
    redealStrongLayout: input.redealStrongLayout === true,
  };
}

// The source suggests recutting a layout worth 3+ points or holding 3+ picture cards
export function isStrongLayout(cards: readonly string[]): boolean {
  return cards.reduce((p, id) => p + cardPoints(id), 0) >= 3 || cards.filter(isPicture).length >= 3;
}

export function createMatch(input: Partial<CasinoConfig>, random: RandomInt, dealer?: Seat): MatchState {
  const config = normalizeConfig(input);
  const players = config.players;
  const state: MatchState = {
    version: 0,
    config,
    dealer: dealer ?? random(players),
    turn: 0,
    handNumber: 0,
    deal: 0,
    hands: [],
    stock: [],
    loose: [],
    builds: [],
    piles: [[], []],
    leftover: [],
    lastCapturer: null,
    nextBuildId: 1,
    proven: [],
    holds: [],
    scores: [0, 0],
    results: [],
    status: 'playing',
    winnerTeam: null,
    turnsPlayed: 0,
    lastTurn: null,
    staged: [],
  };
  dealHand(state, random);
  return state;
}

// Shuffles all 52 cards, cuts four from the middle as the layout and deals the rest
export function dealHand(state: MatchState, random: RandomInt) {
  const players = state.config.players;
  let deck = shuffle(DECK.map(c => c.id), random);
  let layout: string[] = [];
  for (let attempt = 0; ; attempt++) {
    const middle = Math.floor(deck.length / 2) - 2;
    layout = deck.splice(middle, 4);
    if (!state.config.redealStrongLayout || !isStrongLayout(layout) || attempt >= MAX_RECUTS) break;
    deck = shuffle([...deck, ...layout], random);
  }
  state.handNumber += 1;
  state.deal = 0;
  state.hands = Array.from({ length: players }, () => []);
  state.loose = layout;
  state.builds = [];
  state.piles = [[], []];
  state.leftover = [];
  state.lastCapturer = null;
  state.proven = Array.from({ length: players }, () => []);
  state.holds = Array.from({ length: players }, () => []);
  dealRound(state, deck.splice(0, players * HAND_SIZE));
  state.stock = deck; // dealt four each at a time whenever every hand is empty
  state.turn = (state.dealer + 1) % players;
  state.status = 'playing';
  state.lastTurn = null;
  state.staged = [];
  state.version += 1;
}

// After a hand that didn't decide the match, the deal passes to the right
export function startNextHand(state: MatchState, random: RandomInt): MatchState {
  if (state.status !== 'handOver') return state;
  const next = structuredClone(state);
  next.dealer = (next.dealer + 1) % next.config.players;
  dealHand(next, random);
  // Everyone still sees how the last hand ended
  next.lastTurn = state.lastTurn;
  return next;
}

// Validates and applies a turn; a hand that ends is followed straight away by the next deal
export function playTurn(state: MatchState, seat: Seat, proposal: TurnProposal, random: RandomInt) {
  const result = applyTurn(state, seat, proposal);
  if (!result.ok) return result;
  return { ok: true as const, state: startNextHand(result.state, random), handResult: result.state.status !== 'playing' ? result.state.results.at(-1)! : null };
}

// "Please don't capture": the player shows they hold a card for one of their side's builds, so
// their partner may add to it instead and hand it over (see the partnership rules)
export function requestHold(state: MatchState, seat: Seat, value: number): { ok: true; state: MatchState } | { ok: false; error: RuleError } {
  if (state.status !== 'playing') return { ok: false, error: { code: 'GAME_NOT_ACTIVE' } };
  if (state.config.players !== 4) return { ok: false, error: { code: 'NO_PARTNER' } };
  const team = teamOf(state, seat);
  const build = state.builds.find(b => b.value === value && teamOf(state, b.owner) === team);
  if (!build || !state.hands[seat].some(id => canCapture(id, value))) {
    return { ok: false, error: { code: 'HOLD_NOT_ALLOWED', params: { value } } };
  }
  const rank = rankForValue(value);
  if (state.holds[seat].includes(rank)) return { ok: true, state };
  const next = structuredClone(state);
  next.holds[seat].push(rank);
  next.version += 1;
  return { ok: true, state: next };
}

// --- Views: what each player may see ---

export interface PublicMatchView {
  version: number;
  players: number;
  targetPoints: number;
  dealer: Seat;
  turn: Seat;
  handNumber: number;
  deal: 0 | 1;
  stockCount: number;
  handCounts: number[];
  loose: string[];
  builds: Build[];
  piles: { count: number; top: string | null }[];
  lastCapturer: Seat | null;
  proven: number[][];
  holds: number[][];
  scores: number[];
  results: HandResult[];
  status: MatchState['status'];
  winnerTeam: number | null;
  turnsPlayed: number;
  lastTurn: LastTurn | null;
  staged: LastTurn['actions'];
  nextBuildId: number; // the id the next new build will get, so a turn can refer to builds it makes
}

export interface PrivateMatchView {
  version: number;
  seat: Seat;
  hand: string[];
  teamPile: string[]; // bottom to top; partners share it
}

// Cards everyone at the table can see; never the stock, other hands or the order inside piles
export function publicView(state: MatchState): PublicMatchView {
  return {
    version: state.version,
    players: state.config.players,
    targetPoints: state.config.targetPoints,
    dealer: state.dealer,
    turn: state.turn,
    handNumber: state.handNumber,
    deal: state.deal,
    stockCount: state.stock.length,
    handCounts: state.hands.map(h => h.length),
    loose: [...state.loose],
    builds: structuredClone(state.builds),
    piles: state.piles.map(pile => ({ count: pile.length, top: pile.at(-1) ?? null })),
    lastCapturer: state.lastCapturer,
    proven: structuredClone(state.proven),
    holds: structuredClone(state.holds),
    scores: [...state.scores],
    results: structuredClone(state.results),
    status: state.status,
    winnerTeam: state.winnerTeam,
    turnsPlayed: state.turnsPlayed,
    lastTurn: structuredClone(state.lastTurn),
    staged: structuredClone(state.staged),
    nextBuildId: state.nextBuildId,
  };
}

export function privateView(state: MatchState, seat: Seat): PrivateMatchView {
  return {
    version: state.version,
    seat,
    hand: [...(state.hands[seat] ?? [])],
    teamPile: [...(state.piles[teamOf(state, seat)] ?? [])],
  };
}

// --- Persistence ---

// Every one of the 52 cards in exactly one place
export function cardLocations(state: MatchState): Map<string, number> {
  const counts = new Map<string, number>();
  const all = [
    ...state.hands.flat(),
    ...state.stock,
    ...state.loose,
    ...state.builds.flatMap(buildCards),
    ...state.piles.flat(),
    ...state.leftover,
  ];
  for (const id of all) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export function assertValidState(state: MatchState) {
  const counts = cardLocations(state);
  if (counts.size !== 52 || [...counts.keys()].some(id => !isCardId(id)) || [...counts.values()].some(n => n !== 1)) {
    throw new Error('Casino state does not hold each card exactly once');
  }
  const values = state.builds.map(b => b.value);
  if (new Set(values).size !== values.length) throw new Error('Casino state has two builds of one value');
  const players = state.config.players;
  if (state.hands.length !== players || state.turn < 0 || state.turn >= players) throw new Error('Casino state has bad seats');
}

export const serializeMatch = (state: MatchState) => JSON.stringify(state);

export function restoreMatch(raw: string | MatchState): MatchState {
  const state = (typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)) as MatchState;
  state.staged ??= [];
  assertValidState(state);
  return state;
}

// --- Finding legal turns (hints, the tutorial, simulations, and a guarantee nobody is stuck) ---

// Takes every loose set worth `value`, one set at a time, so the capture leaves nothing it could take
function maximalSets(loose: readonly string[], value: number): string[][] {
  const left = [...loose];
  const sets: string[][] = [];
  for (let set = findSetWithValue(left, value); set; set = findSetWithValue(left, value)) {
    sets.push(set);
    set.forEach(id => left.splice(left.indexOf(id), 1));
  }
  return sets;
}

// Appends free augments until nothing more can join the side's builds, as the house policy demands
function completeAugments(state: MatchState, seat: Seat, actions: TurnAction[]): TurnAction[] | null {
  const result = [...actions];
  const team = teamOf(state, seat);
  for (let guard = 0; guard < 52; guard++) {
    const probe = positionAfter(state, seat, result);
    if (!probe) return null;
    const pileUsed = result.some(a => a.type === 'augment' && a.pile);
    const top = pileUsed ? null : pileTop(probe, 1 - team);
    let next: TurnAction | null = null;
    for (const b of probe.builds) {
      if (teamOf(probe, b.owner) !== team) continue;
      const set = findAddableSet(probe.loose, top, b.value);
      if (set) {
        next = { type: 'augment', build: b.id, loose: set.loose, pile: set.pile };
        break;
      }
    }
    if (!next) return result;
    result.push(next);
  }
  return result;
}

// Hand actions worth trying from a position: capture everything a card can take, discard it, add it
// to one of the side's builds (alone or with loose and pile cards), change an opponent's single
// build, or build with one loose card
function handActions(state: MatchState, seat: Seat): TurnAction[] {
  const team = teamOf(state, seat);
  const top = pileTop(state, 1 - team);
  const actions: TurnAction[] = [];
  for (const id of new Set(state.hands[seat])) {
    for (const value of captureValues(id)) {
      const sets = maximalSets(state.loose, value);
      const builds = state.builds.filter(b => b.value === value).map(b => b.id);
      if (sets.length || builds.length) {
        actions.push({ type: 'capture', card: id, aceValue: isAce(id) ? (value as AceValue) : undefined, sets, builds });
      }
    }
    actions.push({ type: 'discard', card: id });
    for (const b of state.builds) {
      if (teamOf(state, b.owner) === team) {
        if (canCapture(id, b.value)) actions.push({ type: 'augment', build: b.id, hand: id, loose: [] });
        const rest = findAddableSet(state.loose, top, b.value - rankOf(id));
        if (rest) actions.push({ type: 'augment', build: b.id, hand: id, loose: rest.loose, pile: rest.pile });
      } else if (b.groups.length === 1) {
        actions.push({ type: 'change', build: b.id, card: id });
      }
    }
    for (const loose of state.loose) {
      actions.push({ type: 'build', hand: id, loose: [loose] });
      if (!isAce(loose) && canCapture(id, rankOf(loose))) actions.push({ type: 'augment', base: loose, hand: id, loose: [] });
    }
  }
  return actions;
}

// Turns that pass the real validator: each hand action as it stands, and after first adding
// everything addable to the side's builds (which can expose new pile cards), then completed.
// From any position at least one of these is legal, so a player can't get stuck.
export function legalTurns(state: MatchState, seat: Seat): TurnProposal[] {
  if (state.status !== 'playing' || state.turn !== seat) return [];
  const prefixes: TurnAction[][] = [[]];
  const completed = completeAugments(state, seat, []);
  if (completed && completed.length > 0) prefixes.push(completed);

  const legal: TurnProposal[] = [];
  const seen = new Set<string>();
  for (const prefix of prefixes) {
    const position = prefix.length ? positionAfter(state, seat, prefix) : state;
    if (!position) continue;
    for (const action of handActions(position, seat)) {
      const actions = completeAugments(state, seat, [...prefix, action]);
      if (!actions) continue;
      const proposal = { actions };
      const key = JSON.stringify(proposal);
      if (seen.has(key)) continue;
      seen.add(key);
      if (applyTurn(state, seat, proposal).ok) legal.push(proposal);
    }
  }
  return legal;
}

// One legal turn, preferring the capture that takes the most cards
export function findLegalTurn(state: MatchState, seat: Seat): TurnProposal | null {
  const turns = legalTurns(state, seat);
  if (turns.length === 0) return null;
  const taken = (p: TurnProposal) =>
    p.actions.reduce((n, a) => n + (a.type === 'capture' ? a.sets.flat().length + a.builds.length * 3 : 0), 0);
  return turns.reduce((best, p) => (taken(p) > taken(best) ? p : best));
}
