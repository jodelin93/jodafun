import type { Color, Square } from './types';

// Board geometry for the 50 dark squares (FMJD Annex 1 art. 2.6). Rows run 0 (top, squares 1–5)
// to 9 (bottom, squares 46–50); columns 0–9 from the left. Even rows start with a light square.

export const SQUARES = 50;
export const isSquare = (s: unknown): s is Square => Number.isInteger(s) && (s as number) >= 1 && (s as number) <= SQUARES;

export function coords(square: Square): { row: number; col: number } {
  const row = Math.floor((square - 1) / 5);
  const index = (square - 1) % 5;
  return { row, col: row % 2 === 0 ? index * 2 + 1 : index * 2 };
}

export function squareAt(row: number, col: number): Square | null {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  if ((row + col) % 2 === 0) return null; // light square
  return row * 5 + Math.floor(col / 2) + 1;
}

// The four diagonal directions as row/column steps
export const DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
export type Direction = (typeof DIRECTIONS)[number];

// The squares along a diagonal from `square` (not included), nearest first
const RAYS: Square[][][] = Array.from({ length: SQUARES + 1 }, (_, square) =>
  square === 0
    ? []
    : DIRECTIONS.map(([dr, dc]) => {
        const { row, col } = coords(square);
        const ray: Square[] = [];
        for (let r = row + dr, c = col + dc; ; r += dr, c += dc) {
          const next = squareAt(r, c);
          if (next === null) break;
          ray.push(next);
        }
        return ray;
      }),
);
export const ray = (square: Square, direction: number): Square[] => RAYS[square]![direction]!;

// White moves up the board (towards row 0), black down
export const forwardDirections = (color: Color): number[] => (color === 'white' ? [0, 1] : [2, 3]);
export const promotionRow = (color: Color) => (color === 'white' ? 0 : 9);
export const isPromotionSquare = (color: Color, square: Square) => coords(square).row === promotionRow(color);

// The long diagonal joins the corners 5 and 46 (art. 2.3, 2.6.3)
export const LONG_DIAGONAL: readonly Square[] = [5, 10, 14, 19, 23, 28, 32, 37, 41, 46];
