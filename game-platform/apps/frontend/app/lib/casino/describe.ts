import { cardText, sumOf, valueLabel } from './cards';
import type { ActionSummary, Build, RuleError, TurnAction } from './types';

type T = (key: string, vars?: Record<string, string | number>) => string;

const list = (ids: string[]) => ids.map(cardText).join(' ');

// A server error in the player's language, naming the cards involved
export function describeError(t: T, error: Pick<RuleError, 'code' | 'params'>, builds: Build[] = []): string {
  const p = error.params ?? {};
  const buildValue = p.build ? builds.find(b => b.id === p.build)?.value : undefined;
  const value = p.value ?? buildValue;
  const vars = { value: value !== undefined ? valueLabel(value) : '', cards: list(p.cards ?? []) };
  const withBuild = (error.code === 'CAPTURE_INCOMPLETE' || error.code === 'DISCARD_COULD_CAPTURE') && !p.cards?.length;
  const one = error.code === 'SET_SUM_MISMATCH' && p.cards?.length === 1;
  const key = `err_${error.code}${withBuild ? '_BUILD' : ''}${one ? '_one' : ''}`;
  const text = t(key, vars);
  return text === key ? t('errUnknown', { code: error.code }) : text;
}

// One step of the turn being composed, in words
export function describeStep(t: T, a: TurnAction, builds: Build[]): string {
  const value = (id: string | undefined) => {
    const b = builds.find(x => x.id === id);
    return b ? valueLabel(b.value) : '?';
  };
  switch (a.type) {
    case 'capture': {
      const taken = [...a.sets.flat().map(cardText), ...a.builds.map(id => `[${value(id)}]`)];
      return t('stepCapture', { cards: taken.join(' '), card: cardText(a.card) });
    }
    case 'discard':
      return t('stepDiscard', { card: cardText(a.card) });
    case 'build': {
      const cards = a.hand ? [...a.loose, a.hand] : a.loose;
      return t('stepBuild', { value: valueLabel(sumOf(cards)), cards: list(cards) });
    }
    case 'augment': {
      const cards = list([...a.loose, ...(a.hand ? [a.hand] : [])]);
      if (a.base) return t('stepBase', { value: valueLabel(a.baseValue ?? sumOf([a.base])), base: cardText(a.base), cards: cards || '—' });
      return t(a.pile ? 'stepAddPile' : 'stepAdd', { cards: cards || '—', value: value(a.build) });
    }
    case 'change': {
      const b = builds.find(x => x.id === a.build);
      return t('stepChange', { from: b ? b.value : '?', to: b ? b.value + sumOf([a.card]) : '?', card: cardText(a.card) });
    }
  }
}

// What a player did on their last turn, in words
export function describeSummary(t: T, s: ActionSummary): string {
  switch (s.type) {
    case 'capture':
      return t('sumCapture', { cards: [...s.captured.map(cardText), ...s.builds.map(v => `[${valueLabel(v)}]`)].join(' '), card: cardText(s.card) });
    case 'discard':
      return t('sumDiscard', { card: cardText(s.card) });
    case 'build':
      return t('sumBuild', { value: valueLabel(s.value), cards: list(s.cards) });
    case 'augment':
      if (s.newBuild) return t('sumNewAugmented', { value: valueLabel(s.value), cards: list([...s.cards, ...(s.fromPile ? [s.fromPile] : [])]) });
      return s.fromPile
        ? t('sumAugmentPile', { cards: list(s.cards) || '—', pile: cardText(s.fromPile), value: valueLabel(s.value) })
        : t('sumAugment', { cards: list(s.cards), value: valueLabel(s.value) });
    case 'change':
      return t('sumChange', { from: s.from, to: s.to, card: cardText(s.card) });
  }
}
