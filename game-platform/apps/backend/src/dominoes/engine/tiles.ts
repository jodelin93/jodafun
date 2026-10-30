import type { TileId } from './types';

export const MAX_PIPS = 6;

export const tileId = (x: number, y: number): TileId => `${Math.min(x, y)}-${Math.max(x, y)}`;

// The 28 tiles of a double-six set, 0-0 to 6-6
export const ALL_TILES: readonly TileId[] = Array.from({ length: MAX_PIPS + 1 }, (_, a) =>
  Array.from({ length: MAX_PIPS + 1 - a }, (_, i) => tileId(a, a + i)),
).flat();

const TILE_SET = new Set(ALL_TILES);
export const isTileId = (value: unknown): value is TileId => typeof value === 'string' && TILE_SET.has(value);

// The two numbers of a tile, smaller first
export function tileValues(id: TileId): [number, number] {
  const [a, b] = id.split('-').map(Number);
  return [a, b];
}

export const isDouble = (id: TileId) => {
  const [a, b] = tileValues(id);
  return a === b;
};

export const pipsOf = (id: TileId) => {
  const [a, b] = tileValues(id);
  return a + b;
};

export const sumPips = (tiles: readonly TileId[]) => tiles.reduce((n, id) => n + pipsOf(id), 0);

export const hasValue = (id: TileId, value: number) => tileValues(id).includes(value);

// The tile's number that is left exposed when its `value` side touches the chain
export function otherValue(id: TileId, value: number): number {
  const [a, b] = tileValues(id);
  return a === value ? b : a;
}
