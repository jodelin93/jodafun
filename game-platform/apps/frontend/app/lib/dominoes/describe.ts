import { isDouble, tileValues, type DominoError, type End, type LastAction, type TileId } from './types';

// A loosely typed translator, so codes and ids coming from the server can pick their message
export type Tx = (key: string, vars?: Record<string, string | number>) => string;

// "3–5 domino", "double 6"
export function tileName(tx: Tx, a: number, b: number) {
  return a === b ? tx('tileDouble', { n: a }) : tx('tileName', { a, b });
}

export function tileIdName(tx: Tx, id: TileId) {
  const [a, b] = tileValues(id);
  return isDouble(id) ? tx('tileDouble', { n: a }) : tx('tileName', { a, b });
}

export const endName = (tx: Tx, end: End) => (end === 'left' ? tx('endLeft') : tx('endRight'));

// A server or client error code as a sentence, with the tile, end and number filled in
export function errorMessage(tx: Tx, error: DominoError) {
  const key = `err_${error.code}`;
  const p = error.params ?? {};
  const text = tx(key, {
    tile: p.tile ? tileIdName(tx, p.tile) : '',
    end: p.end ? endName(tx, p.end) : '',
    value: p.value ?? '',
  });
  return text === key ? tx('errUnknown', { code: error.code }) : text;
}

// "Ana played 3–5 on the right end", "Ana passed"
export function describeAction(tx: Tx, action: LastAction, name: string) {
  if (action.type === 'pass') return tx('actionPassed', { name });
  if (!action.end) return tx('actionOpened', { name, tile: tileIdName(tx, action.tile) });
  return tx('actionPlayed', { name, tile: tileIdName(tx, action.tile), end: endName(tx, action.end) });
}

// m:ss for a grace period countdown
export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
