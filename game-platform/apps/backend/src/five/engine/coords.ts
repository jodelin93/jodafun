// Logical cells of an unbounded grid. Coordinates are integers of any size, kept as BigInt and sent
// as canonical decimal strings ("0", "-12", "123456789012345678901234567890"), so a cell has exactly
// one key and no coordinate is ever rounded by JavaScript numbers.

export interface Cell {
  x: bigint;
  y: bigint;
}

// Wire format: canonical decimal strings
export interface WireCell {
  x: string;
  y: string;
}

// A safety bound on one coordinate's length in a message (not a rule of the game): 400 decimal
// digits, far beyond any cell a player can reach by moving the view
export const MAX_COORDINATE_DIGITS = 400;
const DECIMAL = new RegExp(`^-?\\d{1,${MAX_COORDINATE_DIGITS}}$`);

// Parses a client coordinate; leading zeros and "-0" are accepted and normalised
export function parseCoordinate(raw: unknown): bigint | null {
  if (typeof raw === 'string' && DECIMAL.test(raw)) return BigInt(raw);
  if (typeof raw === 'number' && Number.isSafeInteger(raw)) return BigInt(raw);
  return null;
}

export function parseCell(raw: unknown): Cell | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  const px = parseCoordinate(x);
  const py = parseCoordinate(y);
  return px === null || py === null ? null : { x: px, y: py };
}

// One key per cell: canonical decimal x and y
export const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;
export const toWire = (c: Cell): WireCell => ({ x: c.x.toString(), y: c.y.toString() });
export const fromWire = (w: WireCell): Cell => ({ x: BigInt(w.x), y: BigInt(w.y) });

// Blocks of 32×32 cells index the board for loading a visible area; floor division so negative
// coordinates fall into the right block
export const CHUNK = 32n;
const floorDiv = (a: bigint, b: bigint) => (a >= 0n ? a / b : -((-a + b - 1n) / b));
export const chunkOf = (c: Cell): string => `${floorDiv(c.x, CHUNK).toString()},${floorDiv(c.y, CHUNK).toString()}`;
