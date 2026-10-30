import { isAce, partitionIntoSets, rankOf, sumOf } from './cards';
import type { AceValue, Build, PublicMatch, TurnAction } from './types';

// What the player has picked on the table and in hand for the next step of their turn
export interface Selection {
  hand: string | null;
  loose: string[];
  build: string | null;
  pile: boolean;
  aceValue: AceValue;
  forPartner: boolean;
  giveToPartner: boolean;
}

export const emptySelection = (): Selection => ({
  hand: null,
  loose: [],
  build: null,
  pile: false,
  aceValue: 14,
  forPartner: false,
  giveToPartner: false,
});

// Cards and builds the steps so far have used up
export function usedByDraft(actions: TurnAction[]) {
  const cards = new Set<string>();
  const builds = new Set<string>();
  let handCard: string | null = null;
  let pileUsed = false;
  for (const a of actions) {
    if (a.type === 'capture') {
      handCard = a.card;
      a.sets.flat().forEach(id => cards.add(id));
      a.builds.forEach(id => builds.add(id));
    } else if (a.type === 'discard' || a.type === 'change') {
      handCard = a.card;
    } else {
      if (a.hand) handCard = a.hand;
      a.loose.forEach(id => cards.add(id));
      if (a.type === 'augment' && a.base) cards.add(a.base);
      if (a.type === 'augment' && a.pile) pileUsed = true;
    }
  }
  if (handCard) cards.add(handCard);
  return { cards, builds, handCard, pileUsed };
}

// Builds the steps would create, with the ids the server will give them, so later steps can use them
export function draftBuilds(match: PublicMatch, actions: TurnAction[], seat: number, partner: number | null): Build[] {
  const made: Build[] = [];
  let next = match.nextBuildId;
  for (const a of actions) {
    if (a.type === 'build') {
      const cards = a.hand ? [...a.loose, a.hand] : a.loose;
      made.push({ id: `b${next++}`, value: sumOf(cards), owner: a.forPartner && partner !== null ? partner : seat, groups: [cards.map(id => ({ id, value: rankOf(id) }))] });
    } else if (a.type === 'augment' && a.base) {
      const value = isAce(a.base) ? (a.baseValue ?? 14) : rankOf(a.base);
      const set = [...a.loose, ...(a.hand ? [a.hand] : [])];
      made.push({
        id: `b${next++}`,
        value,
        owner: a.forPartner && partner !== null ? partner : seat,
        groups: [[{ id: a.base, value }], set.map(id => ({ id, value: set.length === 1 && isAce(id) ? value : rankOf(id) }))],
      });
    }
  }
  return made;
}

export type StepResult = { action: TurnAction } | { problem: 'needCard' | 'needHand' | 'needBuild' | 'needBase' | 'noSets' | 'tooFew' };

// Turns the selection into one step of the turn
export function makeStep(kind: 'capture' | 'discard' | 'build' | 'add' | 'change', sel: Selection, base: string | null = null): StepResult {
  const hand = sel.hand ?? undefined;
  switch (kind) {
    case 'capture': {
      if (!sel.hand) return { problem: 'needHand' };
      const value = isAce(sel.hand) ? sel.aceValue : rankOf(sel.hand);
      const sets = partitionIntoSets(sel.loose, value);
      if (!sets) return { problem: 'noSets' };
      return {
        action: { type: 'capture', card: sel.hand, aceValue: isAce(sel.hand) ? sel.aceValue : undefined, sets, builds: sel.build ? [sel.build] : [] },
      };
    }
    case 'discard':
      return sel.hand ? { action: { type: 'discard', card: sel.hand } } : { problem: 'needHand' };
    case 'build':
      if (sel.loose.length + (hand ? 1 : 0) < 2) return { problem: 'tooFew' };
      return { action: { type: 'build', hand, loose: sel.loose, forPartner: sel.forPartner || undefined } };
    case 'add':
      if (sel.build) {
        return {
          action: { type: 'augment', build: sel.build, hand, loose: sel.loose, pile: sel.pile || undefined, giveToPartner: sel.giveToPartner || undefined },
        };
      }
      if (!base) return { problem: 'needBase' };
      return {
        action: {
          type: 'augment',
          base,
          baseValue: isAce(base) ? sel.aceValue : undefined,
          hand,
          loose: sel.loose.filter(id => id !== base),
          pile: sel.pile || undefined,
          forPartner: sel.forPartner || undefined,
        },
      };
    case 'change':
      if (!sel.hand) return { problem: 'needHand' };
      if (!sel.build) return { problem: 'needBuild' };
      return { action: { type: 'change', build: sel.build, card: sel.hand } };
  }
}

// The cards a capture step takes, for ordering on the pile
export const capturedBy = (action: Extract<TurnAction, { type: 'capture' }>, builds: Build[]) => [
  ...action.sets.flat(),
  ...action.builds.flatMap(id => builds.find(b => b.id === id)?.groups.flat().map(c => c.id) ?? []),
];
