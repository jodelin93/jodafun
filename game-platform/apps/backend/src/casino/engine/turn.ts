import { DECK, canCapture, captureValues, isAce, isCardId, rankForValue, rankOf } from './cards';
import { findAddableSet, findSetWithValue, setMatches, sum, valueInSet } from './sets';
import type {
  ActionSummary,
  AceValue,
  AugmentAction,
  Build,
  BuildAction,
  CaptureAction,
  ChangeAction,
  DiscardAction,
  MatchState,
  RuleError,
  RuleErrorCode,
  Seat,
  TurnAction,
  TurnProposal,
} from './types';

// Limits on what a client may send; a real turn needs far fewer
export const MAX_ACTIONS = 16;
export const HAND_SIZE = 4; // cards dealt to each player at a time
const FIRST_TWELVE = 12; // two players: the first-twelve limits last while each has had at most this many
const MAX_LIST = 52;
const BUILD_ID = /^b\d{1,6}$/;

export const teamOf = (state: MatchState, seat: Seat) => (state.config.players === 4 ? seat % 2 : seat);
export const partnerOf = (state: MatchState, seat: Seat): Seat | null =>
  state.config.players === 4 ? (seat + 2) % 4 : null;
export const pileTop = (state: MatchState, team: number): string | null => state.piles[team].at(-1) ?? null;

const DECK_ORDER = new Map(DECK.map((c, i) => [c.id, i]));
const byDeckOrder = (ids: string[]) => [...ids].sort((a, b) => DECK_ORDER.get(a)! - DECK_ORDER.get(b)!);
export const buildCards = (build: Build) => build.groups.flatMap(group => group.map(c => c.id));

export type TurnResult = { ok: true; state: MatchState } | { ok: false; error: RuleError };

class RuleFailure extends Error {
  constructor(readonly error: RuleError) {
    super(error.code);
  }
}

function fail(code: RuleErrorCode, params?: RuleError['params']): never {
  throw new RuleFailure(params ? { code, params } : { code });
}

// --- Parsing: untrusted input to a typed proposal, with every list bounded ---

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LIST && value.every(isCardId);
const optionalCard = (value: unknown) => value === undefined || isCardId(value);
const optionalAce = (value: unknown) => value === undefined || value === 1 || value === 14;
const optionalFlag = (value: unknown) => value === undefined || typeof value === 'boolean';

function parseAction(raw: any): TurnAction | null {
  if (!raw || typeof raw !== 'object') return null;
  switch (raw.type) {
    case 'capture':
      if (!isCardId(raw.card) || !optionalAce(raw.aceValue)) return null;
      if (!Array.isArray(raw.sets) || raw.sets.length > 13 || !raw.sets.every(isIdList)) return null;
      if (!Array.isArray(raw.builds) || raw.builds.length > 14) return null;
      if (!raw.builds.every((b: unknown) => typeof b === 'string' && BUILD_ID.test(b))) return null;
      if (raw.order !== undefined && !isIdList(raw.order)) return null;
      return {
        type: 'capture',
        card: raw.card,
        aceValue: raw.aceValue as AceValue | undefined,
        sets: raw.sets.map((s: string[]) => [...s]),
        builds: [...raw.builds],
        order: raw.order ? [...raw.order] : undefined,
      };
    case 'discard':
      return isCardId(raw.card) ? { type: 'discard', card: raw.card } : null;
    case 'build':
      if (!isIdList(raw.loose) || !optionalCard(raw.hand) || !optionalFlag(raw.forPartner)) return null;
      return { type: 'build', loose: [...raw.loose], hand: raw.hand, forPartner: raw.forPartner === true };
    case 'augment': {
      const hasBuild = typeof raw.build === 'string' && BUILD_ID.test(raw.build);
      const hasBase = isCardId(raw.base);
      if (hasBuild === hasBase || (raw.build !== undefined && !hasBuild) || (raw.base !== undefined && !hasBase)) return null;
      if (!isIdList(raw.loose) || !optionalCard(raw.hand) || !optionalAce(raw.baseValue)) return null;
      if (!optionalFlag(raw.pile) || !optionalFlag(raw.forPartner) || !optionalFlag(raw.giveToPartner)) return null;
      return {
        type: 'augment',
        build: hasBuild ? raw.build : undefined,
        base: hasBase ? raw.base : undefined,
        baseValue: raw.baseValue as AceValue | undefined,
        hand: raw.hand,
        loose: [...raw.loose],
        pile: raw.pile === true,
        forPartner: raw.forPartner === true,
        giveToPartner: raw.giveToPartner === true,
      };
    }
    case 'change':
      if (typeof raw.build !== 'string' || !BUILD_ID.test(raw.build) || !isCardId(raw.card)) return null;
      return { type: 'change', build: raw.build, card: raw.card };
    default:
      return null;
  }
}

export function parseTurn(raw: unknown): { ok: true; proposal: TurnProposal } | { ok: false; error: RuleError } {
  const actions = (raw as { actions?: unknown })?.actions;
  if (!Array.isArray(actions) || actions.length === 0) return { ok: false, error: { code: 'BAD_REQUEST' } };
  if (actions.length > MAX_ACTIONS) return { ok: false, error: { code: 'TOO_MANY_ACTIONS' } };
  const parsed: TurnAction[] = [];
  for (let i = 0; i < actions.length; i++) {
    const action = parseAction(actions[i]);
    if (!action) return { ok: false, error: { code: 'BAD_REQUEST', action: i } };
    parsed.push(action);
  }
  return { ok: true, proposal: { actions: parsed } };
}

// --- Applying a turn to a private working copy ---

interface Work {
  s: MatchState;
  seat: Seat;
  team: number;
  used: Set<string>;
  played: { card: string; kind: TurnAction['type'] } | null;
  augmentedOpponentBuilds: Set<string>;
  summary: ActionSummary[];
  pileUsed: boolean;
}

function use(w: Work, id: string) {
  if (w.used.has(id)) fail('CARD_REUSED', { cards: [id] });
  w.used.add(id);
}

function playFromHand(w: Work, id: string, kind: TurnAction['type']) {
  if (w.played) fail('MULTIPLE_HAND_CARDS');
  use(w, id);
  const hand = w.s.hands[w.seat];
  const index = hand.indexOf(id);
  if (index === -1) fail('CARD_NOT_IN_HAND', { cards: [id] });
  hand.splice(index, 1);
  w.played = { card: id, kind };
}

// Marks loose cards as used and checks they are on the table; removal happens once the action is valid
function claimLoose(w: Work, ids: string[]) {
  for (const id of ids) {
    use(w, id);
    if (!w.s.loose.includes(id)) fail('CARD_NOT_ON_TABLE', { cards: [id] });
  }
}

function removeLoose(w: Work, ids: string[]) {
  w.s.loose = w.s.loose.filter(id => !ids.includes(id));
}

function findBuild(w: Work, id: string): Build {
  const build = w.s.builds.find(b => b.id === id);
  if (!build) fail('BUILD_NOT_FOUND', { build: id });
  return build;
}

function prove(w: Work, seat: Seat, value: number) {
  if (w.s.config.players !== 4) return;
  const rank = rankForValue(value);
  if (!w.s.proven[seat].includes(rank)) w.s.proven[seat].push(rank);
}

// A new build's owner: the player, or their partner when the partner is known to hold the rank
function newOwner(w: Work, value: number, forPartner: boolean | undefined): Seat {
  if (!forPartner) return w.seat;
  const partner = partnerOf(w.s, w.seat);
  if (partner === null) fail('NO_PARTNER');
  if (!w.s.proven[partner].includes(rankForValue(value))) fail('PARTNER_NOT_PROVEN', { value });
  return partner;
}

// Only one build per value: one of your side's means adding to it instead
function checkValueFree(w: Work, value: number) {
  const existing = w.s.builds.find(b => b.value === value);
  if (!existing) return;
  if (teamOf(w.s, existing.owner) === w.team) fail('MUST_AUGMENT_EXISTING', { value, build: existing.id });
  fail('BUILD_VALUE_TAKEN', { value });
}

function capture(w: Work, a: CaptureAction) {
  playFromHand(w, a.card, 'capture');
  let value = rankOf(a.card);
  if (isAce(a.card)) {
    if (a.aceValue !== 1 && a.aceValue !== 14) fail('ACE_VALUE_REQUIRED', { cards: [a.card] });
    value = a.aceValue;
  }

  const captured: string[] = [];
  for (const set of a.sets) {
    if (set.length === 0) fail('EMPTY_SET');
    claimLoose(w, set);
    if (!setMatches(set, value)) fail('SET_SUM_MISMATCH', { value, cards: set });
    captured.push(...set);
  }
  removeLoose(w, captured);

  const buildValues: number[] = [];
  if (new Set(a.builds).size !== a.builds.length) fail('BAD_REQUEST');
  for (const id of a.builds) {
    const build = findBuild(w, id);
    if (build.value !== value) fail('BUILD_VALUE_MISMATCH', { value, build: id });
    if (build.owner !== w.seat) prove(w, build.owner, build.value);
    w.s.builds = w.s.builds.filter(b => b !== build);
    captured.push(...buildCards(build));
    buildValues.push(build.value);
  }
  if (captured.length === 0) fail('CAPTURE_EMPTY');

  // House policy: everything the card is entitled to must be taken
  const missed = findSetWithValue(w.s.loose, value);
  if (missed) fail('CAPTURE_INCOMPLETE', { value, cards: missed });
  const missedBuild = w.s.builds.find(b => b.value === value);
  if (missedBuild) fail('CAPTURE_INCOMPLETE', { value, build: missedBuild.id });

  let order = captured;
  if (a.order) {
    const distinct = new Set(a.order);
    if (a.order.length !== captured.length || distinct.size !== captured.length || !captured.every(id => distinct.has(id))) {
      fail('INVALID_ORDER');
    }
    order = a.order;
  }
  w.s.piles[w.team].push(...order, a.card);
  w.s.lastCapturer = w.seat;
  w.summary.push({ type: 'capture', card: a.card, value, captured: byDeckOrder(captured), builds: buildValues });
}

function discard(w: Work, a: DiscardAction) {
  playFromHand(w, a.card, 'discard');
  // House policy: a card that could capture must capture (or be used to build instead)
  for (const value of captureValues(a.card)) {
    const set = findSetWithValue(w.s.loose, value);
    if (set) fail('DISCARD_COULD_CAPTURE', { value, cards: set });
    const build = w.s.builds.find(b => b.value === value);
    if (build) fail('DISCARD_COULD_CAPTURE', { value, build: build.id });
  }
  w.s.loose.push(a.card);
  w.summary.push({ type: 'discard', card: a.card });
}

function build(w: Work, a: BuildAction) {
  claimLoose(w, a.loose);
  if (a.hand) playFromHand(w, a.hand, 'build');
  const cards = a.hand ? [...a.loose, a.hand] : [...a.loose];
  if (cards.length < 2) fail('BUILD_TOO_SMALL');
  // House rule: table cards only, or one hand card with exactly one table card
  if (a.hand && a.loose.length > 1) fail('BUILD_ONE_TABLE_CARD');
  const value = sum(cards);
  if (value > 14) fail('VALUE_TOO_HIGH', { value });
  checkValueFree(w, value);
  const owner = newOwner(w, value, a.forPartner);
  removeLoose(w, a.loose);
  w.s.builds.push({
    id: `b${w.s.nextBuildId++}`,
    value,
    owner,
    groups: [cards.map(id => ({ id, value: rankOf(id) }))],
  });
  w.summary.push({ type: 'build', cards: byDeckOrder(cards), value, owner });
}

function augment(w: Work, a: AugmentAction) {
  claimLoose(w, a.loose);
  if (a.hand) playFromHand(w, a.hand, 'augment');
  const opponents = 1 - w.team;
  let fromPile: string | null = null;
  if (a.pile) {
    // Only the card showing when the turn was chosen; to go deeper, take it first (applyPileTake)
    // so the next one is shown to everyone
    if (w.pileUsed) fail('PILE_ALREADY_USED');
    fromPile = pileTop(w.s, opponents);
    if (!fromPile) fail('PILE_EMPTY');
    use(w, fromPile);
    w.pileUsed = true;
  }
  const set = [...a.loose, ...(a.hand ? [a.hand] : []), ...(fromPile ? [fromPile] : [])];
  if (set.length === 0) fail('EMPTY_SET');

  let target: Build;
  let newBuild = false;
  if (a.build) {
    target = findBuild(w, a.build);
    const ours = teamOf(w.s, target.owner) === w.team;
    if (!ours) {
      // Only allowed if the build is then captured; the hand card is needed for that capture
      if (a.hand) fail('HAND_CARD_ON_OPPONENT_BUILD', { build: target.id });
      w.augmentedOpponentBuilds.add(target.id);
    }
    if (a.forPartner) fail('BAD_REQUEST');
    if (!setMatches(set, target.value)) fail('SET_SUM_MISMATCH', { value: target.value, cards: set });
    target.groups.push(set.map(id => ({ id, value: valueInSet(id, set.length, target.value) })));
    if (a.giveToPartner) {
      const partner = partnerOf(w.s, w.seat);
      const allowed = a.hand && ours && partner !== null && w.s.holds[partner].includes(rankForValue(target.value));
      if (!allowed) fail('GIVE_NOT_ALLOWED', { value: target.value });
      target.owner = partner!;
    }
  } else {
    const base = a.base!;
    claimLoose(w, [base]);
    let value = rankOf(base);
    if (isAce(base)) {
      if (a.baseValue !== 1 && a.baseValue !== 14) fail('ACE_VALUE_REQUIRED', { cards: [base] });
      value = a.baseValue;
    }
    if (a.giveToPartner) fail('BAD_REQUEST');
    checkValueFree(w, value);
    if (!setMatches(set, value)) fail('SET_SUM_MISMATCH', { value, cards: set });
    const owner = newOwner(w, value, a.forPartner);
    removeLoose(w, [base]);
    target = {
      id: `b${w.s.nextBuildId++}`,
      value,
      owner,
      groups: [[{ id: base, value }], set.map(id => ({ id, value: valueInSet(id, set.length, value) }))],
    };
    w.s.builds.push(target);
    newBuild = true;
  }
  removeLoose(w, a.loose);
  if (fromPile) w.s.piles[opponents].pop();
  w.summary.push({
    type: 'augment',
    value: target.value,
    cards: byDeckOrder([...(newBuild ? [a.base!] : []), ...a.loose, ...(a.hand ? [a.hand] : [])]),
    fromPile,
    owner: target.owner,
    newBuild,
  });
}

function change(w: Work, a: ChangeAction) {
  const target = findBuild(w, a.build);
  if (teamOf(w.s, target.owner) === w.team) fail('CANNOT_CHANGE_OWN_BUILD', { build: target.id });
  if (target.groups.length !== 1) fail('CANNOT_CHANGE_AUGMENTED', { build: target.id });
  playFromHand(w, a.card, 'change');
  const from = target.value;
  const to = from + rankOf(a.card);
  if (to > 14) fail('VALUE_TOO_HIGH', { value: to });
  if (!w.s.hands[w.seat].some(id => canCapture(id, to))) fail('NO_CARD_FOR_NEW_VALUE', { value: to });

  const previousOwner = target.owner;
  const group = [...target.groups[0], { id: a.card, value: rankOf(a.card) }];
  const other = w.s.builds.find(b => b !== target && b.value === to);
  if (other && teamOf(w.s, other.owner) !== w.team) fail('BUILD_VALUE_TAKEN', { value: to });
  if (other) {
    // Your side already builds this value: the changed build joins it as one more set
    other.groups.push(group);
    w.s.builds = w.s.builds.filter(b => b !== target);
  } else {
    target.groups = [group];
    target.value = to;
    target.owner = w.seat;
  }
  prove(w, previousOwner, from);
  w.summary.push({ type: 'change', card: a.card, from, to, merged: Boolean(other) });
}

// The player must still hold a card for every build they own (an ace serves one build of 1 or 14)
function checkKeepsCaptureCards(w: Work) {
  const hand = w.s.hands[w.seat];
  let acesLeft = hand.filter(isAce).length;
  for (const b of w.s.builds.filter(b => b.owner === w.seat)) {
    if (b.value === 1 || b.value === 14) {
      if (acesLeft === 0) fail('NO_CAPTURE_CARD_KEPT', { value: b.value, build: b.id });
      acesLeft--;
    } else if (!hand.some(id => rankOf(id) === b.value)) {
      fail('NO_CAPTURE_CARD_KEPT', { value: b.value, build: b.id });
    }
  }
}

function checkFinalPosition(w: Work) {
  if (!w.played) fail('NO_HAND_CARD');
  for (const id of w.augmentedOpponentBuilds) {
    const left = w.s.builds.find(b => b.id === id);
    if (left) fail('OPPONENT_BUILD_NOT_CAPTURED', { value: left.value, build: id });
  }
  checkKeepsCaptureCards(w);

  const owned = w.s.builds.filter(b => b.owner === w.seat);
  if (w.s.config.players === 2 && w.s.deal === 0) {
    if (w.played.kind === 'discard' && owned.length > 0) fail('DISCARD_WHILE_OWNING');
    if (owned.length > 1) fail('TOO_MANY_BUILDS');
  }

  // House policy: cards that could be added to your side's builds must be added. A pile card that
  // this turn exposed was not visible when the turn was chosen, so it is not demanded.
  const top = w.pileUsed ? null : pileTop(w.s, 1 - w.team);
  for (const b of w.s.builds.filter(b => teamOf(w.s, b.owner) === w.team)) {
    const addable = findAddableSet(w.s.loose, top, b.value);
    if (addable) {
      fail('MUST_AUGMENT', { value: b.value, build: b.id, cards: [...addable.loose, ...(addable.pile && top ? [top] : [])] });
    }
  }
}

function newWork(state: MatchState, seat: Seat): Work {
  return {
    s: structuredClone(state),
    seat,
    team: teamOf(state, seat),
    used: new Set(),
    played: null,
    augmentedOpponentBuilds: new Set(),
    summary: [],
    pileUsed: false,
  };
}

function runAction(w: Work, action: TurnAction) {
  switch (action.type) {
    case 'capture':
      return capture(w, action);
    case 'discard':
      return discard(w, action);
    case 'build':
      return build(w, action);
    case 'augment':
      return augment(w, action);
    case 'change':
      return change(w, action);
    default:
      fail('BAD_REQUEST');
  }
}

// Validates a whole turn and returns the position after it, without touching `state`.
// A hand that ends comes back with status 'handOver' (or 'finished'); the caller deals the next one.
export function applyTurn(state: MatchState, seat: Seat, proposal: TurnProposal): TurnResult {
  if (state.status !== 'playing') return { ok: false, error: { code: 'GAME_NOT_ACTIVE' } };
  if (seat !== state.turn) return { ok: false, error: { code: 'NOT_YOUR_TURN' } };
  if (proposal.actions.length === 0) return { ok: false, error: { code: 'BAD_REQUEST' } };
  if (proposal.actions.length > MAX_ACTIONS) return { ok: false, error: { code: 'TOO_MANY_ACTIONS' } };

  const w = newWork(state, seat);
  let index = 0;
  try {
    for (; index < proposal.actions.length; index++) runAction(w, proposal.actions[index]);
    index = -1;
    checkFinalPosition(w);
  } catch (error) {
    if (!(error instanceof RuleFailure)) throw error;
    return { ok: false, error: index >= 0 ? { ...error.error, action: index } : error.error };
  }

  finishTurn(w);
  return { ok: true, state: w.s };
}

// Takes the exposed card of the opponents' pile into one of the side's builds straight away, without
// ending the turn, so the card under it is shown before the rest of the turn is chosen
export function applyPileTake(state: MatchState, seat: Seat, action: AugmentAction): TurnResult {
  if (state.status !== 'playing') return { ok: false, error: { code: 'GAME_NOT_ACTIVE' } };
  if (seat !== state.turn) return { ok: false, error: { code: 'NOT_YOUR_TURN' } };
  const team = teamOf(state, seat);
  const target = action.build ? state.builds.find(b => b.id === action.build) : undefined;
  // Into one of the side's builds, or onto a loose card that becomes the player's own new build
  const intoBuild = target && teamOf(state, target.owner) === team;
  const onBase = !action.build && action.base && !action.forPartner;
  if (!action.pile || action.hand || action.giveToPartner || !(intoBuild || onBase)) {
    return { ok: false, error: { code: 'TAKE_NOT_ALLOWED' } };
  }
  const w = newWork(state, seat);
  try {
    augment(w, action);
    // Whoever owns a build must keep a card that captures it, from the moment it is made
    checkKeepsCaptureCards(w);
  } catch (error) {
    if (!(error instanceof RuleFailure)) throw error;
    return { ok: false, error: error.error };
  }
  w.s.staged.push(...w.summary);
  w.s.version += 1;
  return { ok: true, state: w.s };
}

// Safety valve for a position with no legal turn (simulations have never produced one): the player
// may discard any card, with no other checks
export function applyForcedDiscard(state: MatchState, seat: Seat, card: string): TurnResult {
  if (state.status !== 'playing') return { ok: false, error: { code: 'GAME_NOT_ACTIVE' } };
  if (seat !== state.turn) return { ok: false, error: { code: 'NOT_YOUR_TURN' } };
  const w = newWork(state, seat);
  try {
    playFromHand(w, card, 'discard');
  } catch (error) {
    if (!(error instanceof RuleFailure)) throw error;
    return { ok: false, error: error.error };
  }
  w.s.loose.push(card);
  w.summary.push({ type: 'discard', card });
  finishTurn(w);
  return { ok: true, state: w.s };
}

// The position part way through a turn (each action checked, the end-of-turn checks not yet),
// or null if one of the actions is illegal. Used to plan the rest of a turn.
export function positionAfter(state: MatchState, seat: Seat, actions: TurnAction[]): MatchState | null {
  const w = newWork(state, seat);
  try {
    actions.forEach(action => runAction(w, action));
  } catch (error) {
    if (!(error instanceof RuleFailure)) throw error;
    return null;
  }
  return w.s;
}

function finishTurn(w: Work) {
  const s = w.s;
  const players = s.config.players;
  const rank = rankOf(w.played!.card);
  // Playing a card of a rank ends what others knew about it
  s.proven[w.seat] = s.proven[w.seat].filter(r => r !== rank);
  s.holds[w.seat] = s.holds[w.seat].filter(r => r !== rank);
  for (let seat = 0; seat < players; seat++) {
    s.holds[seat] = s.holds[seat].filter(r =>
      s.builds.some(b => teamOf(s, b.owner) === teamOf(s, seat) && rankForValue(b.value) === r),
    );
  }
  s.lastTurn = { seat: w.seat, hand: s.handNumber, actions: [...s.staged, ...w.summary] };
  s.staged = [];
  s.turnsPlayed += 1;
  s.version += 1;

  if (s.hands.some(hand => hand.length > 0)) {
    s.turn = (w.seat + 1) % players;
    return;
  }
  if (s.stock.length > 0) {
    // Four more each, onto the same table
    dealRound(s, s.stock.splice(0, players * HAND_SIZE));
    if ((DECK.length - 4 - s.stock.length) / players > FIRST_TWELVE) s.deal = 1;
    s.turn = (w.seat + 1) % players;
    return;
  }
  finishHand(s);
}

// Deals one card at a time, starting on the dealer's right
export function dealRound(s: MatchState, cards: string[]) {
  const players = s.config.players;
  cards.forEach((id, i) => s.hands[(s.dealer + 1 + (i % players)) % players].push(id));
}

// Points for the side with more cards: the fewest cards that earn each number of points
const CARD_POINTS: [number, number][] = [
  [52, 8],
  [49, 7],
  [46, 6],
  [42, 5],
  [39, 4],
  [36, 3],
  [33, 2],
  [27, 1],
];

export const pointsForCards = (cards: number) => CARD_POINTS.find(([least]) => cards >= least)?.[1] ?? 0;

// Only the side with more cards scores; 26 each scores nothing
export function scoreHand(piles: string[][]) {
  return piles.map((pile, team) => {
    const cards = pile.length;
    const other = piles[1 - team]?.length ?? 0;
    return { cards, total: cards > other ? pointsForCards(cards) : 0 };
  });
}

// The last capturer takes what is left; then the hand is scored and the match checked for a winner
function finishHand(s: MatchState) {
  const rest = [...s.loose, ...s.builds.flatMap(buildCards)];
  if (s.lastCapturer !== null) s.piles[teamOf(s, s.lastCapturer)].push(...rest);
  else s.leftover.push(...rest);
  s.loose = [];
  s.builds = [];

  const teams = scoreHand(s.piles);
  teams.forEach((t, team) => (s.scores[team] += t.total));
  s.results.push({ hand: s.handNumber, dealer: s.dealer, lastCapturer: s.lastCapturer, teams, scoresAfter: [...s.scores] });

  const best = Math.max(...s.scores);
  const leaders = s.scores.flatMap((score, team) => (score === best ? [team] : []));
  if (best >= s.config.targetPoints && leaders.length === 1) {
    s.status = 'finished';
    s.winnerTeam = leaders[0];
  } else {
    s.status = 'handOver';
  }
}
