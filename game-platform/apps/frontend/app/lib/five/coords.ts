import { MAX_COORDINATE_DIGITS, type WireCell } from './types';

// Cells of the unbounded grid. A global coordinate is a BigInt (sent as a canonical decimal string)
// and is never turned into a Number: drawing only ever uses small offsets from the camera origin.

export interface Cell {
  x: bigint;
  y: bigint;
}

const DECIMAL = new RegExp(`^-?\\d{1,${MAX_COORDINATE_DIGITS}}$`);

// A typed or received coordinate; spaces are ignored, "+5", "007" and "-0" are accepted and normalised
export function parseCoordinate(raw: unknown): bigint | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, '').replace(/^\+/, '').replace(/^−/, '-');
  return DECIMAL.test(s) ? BigInt(s) : null;
}

export function parseCell(raw: WireCell | { x: unknown; y: unknown } | null | undefined): Cell | null {
  if (!raw) return null;
  const x = parseCoordinate(raw.x);
  const y = parseCoordinate(raw.y);
  return x === null || y === null ? null : { x, y };
}

export const fromWire = (w: WireCell): Cell => ({ x: BigInt(w.x), y: BigInt(w.y) });
export const toWire = (c: Cell): WireCell => ({ x: c.x.toString(), y: c.y.toString() });
// One key per cell, the same as the server's: canonical decimal x and y
export const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;
export const wireKey = (w: WireCell): string => cellKey(fromWire(w));
export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;

export const add = (c: Cell, dx: bigint, dy: bigint): Cell => ({ x: c.x + dx, y: c.y + dy });
export const cmp = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
export const minB = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxB = (a: bigint, b: bigint) => (a > b ? a : b);
export const absB = (a: bigint) => (a < 0n ? -a : a);

// Floor division, so negative coordinates fall into the right block
export const floorDiv = (a: bigint, b: bigint) => (a >= 0n ? a / b : -((-a + b - 1n) / b));

// A difference small enough to draw, as a Number; null when it is too far to matter on screen
export function smallDiff(a: bigint, b: bigint, limit = 1_000_000): number | null {
  const d = a - b;
  if (d > BigInt(limit) || d < -BigInt(limit)) return null;
  return Number(d);
}

// Inclusive rectangle of cells
export interface Rect {
  minX: bigint;
  minY: bigint;
  maxX: bigint;
  maxY: bigint;
}

export const inRect = (c: Cell, r: Rect) => c.x >= r.minX && c.x <= r.maxX && c.y >= r.minY && c.y <= r.maxY;

// Where a cell lies seen from a rectangle: -1, 0 or 1 on each axis (y grows downwards on screen)
export function directionFrom(r: Rect, c: Cell): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } {
  const dx = c.x < r.minX ? -1 : c.x > r.maxX ? 1 : 0;
  const dy = c.y < r.minY ? -1 : c.y > r.maxY ? 1 : 0;
  return { dx, dy };
}

// How many cells a cell lies outside a rectangle (the larger of the two axes)
export function distanceOutside(r: Rect, c: Cell): bigint {
  const dx = c.x < r.minX ? r.minX - c.x : c.x > r.maxX ? c.x - r.maxX : 0n;
  const dy = c.y < r.minY ? r.minY - c.y : c.y > r.maxY ? c.y - r.maxY : 0n;
  return maxB(dx, dy);
}

// A coordinate for reading: short numbers whole, very long ones shortened with their digit count
export function formatCoordinate(v: bigint): { text: string; digits: number; short: boolean } {
  const s = v.toString();
  const digits = s.replace('-', '').length;
  if (digits <= 12) return { text: s, digits, short: false };
  const sign = v < 0n ? '-' : '';
  const body = s.replace('-', '');
  return { text: `${sign}${body.slice(0, 5)}…${body.slice(-4)}`, digits, short: true };
}
