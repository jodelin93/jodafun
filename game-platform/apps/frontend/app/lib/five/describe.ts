import { directionFrom, distanceOutside, formatCoordinate, type Cell, type Rect } from './coords';
import { END_REASONS, type FiveSymbol } from './types';

export { countdown } from '../draughts/describe';

// A loosely typed translator, so codes coming from the server can pick their message
export type Tx = (key: string, vars?: Record<string, string | number>) => string;

// A server or client error code as a sentence
export function errorMessage(tx: Tx, code: string) {
  const key = `err_${code}`;
  const text = tx(key);
  return text === key ? tx('errUnknown', { code }) : text;
}

export function reasonText(tx: Tx, reason: string | null) {
  return reason && (END_REASONS as readonly string[]).includes(reason) ? tx(`reason_${reason}`) : '';
}

// One coordinate for reading; very long ones are shortened and say how many digits they have
export function coordText(tx: Tx, v: bigint) {
  const f = formatCoordinate(v);
  return f.short ? tx('coordLong', { text: f.text, digits: f.digits }) : f.text;
}

export const cellText = (tx: Tx, c: Cell) => tx('cellCoords', { x: coordText(tx, c.x), y: coordText(tx, c.y) });

// "Cell 3, -2: empty" / "X" / "O" / "not loaded yet"
export function describeCell(tx: Tx, c: Cell, content: FiveSymbol | null | undefined) {
  const state = content === undefined ? tx('cellUnknown') : content === null ? tx('cellEmpty') : tx('cellHas', { symbol: content });
  return tx('cellState', { cell: cellText(tx, c), state });
}

// Where an off-screen cell lies: "up and to the right, 57 cells away"
export function directionText(tx: Tx, view: Rect, c: Cell) {
  const { dx, dy } = directionFrom(view, c);
  const key = `dir_${dy < 0 ? 'up' : dy > 0 ? 'down' : ''}${dy !== 0 && dx !== 0 ? '_' : ''}${dx < 0 ? 'left' : dx > 0 ? 'right' : ''}`;
  const d = distanceOutside(view, c);
  const dist = d <= 1_000_000n ? tx('cellsAway', { n: d.toString() }) : tx('farAway');
  return { arrow: ARROWS[`${dx},${dy}`] ?? '•', text: `${tx(key)}, ${dist}` };
}

const ARROWS: Record<string, string> = {
  '-1,-1': '↖',
  '0,-1': '↑',
  '1,-1': '↗',
  '-1,0': '←',
  '1,0': '→',
  '-1,1': '↙',
  '0,1': '↓',
  '1,1': '↘',
};
