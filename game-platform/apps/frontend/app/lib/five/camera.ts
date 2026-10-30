import { parseCoordinate, type Cell, type Rect } from './coords';

/**
 * The view onto the unbounded grid. The cell (ox, oy) has its top-left corner at screen pixel
 * (-fx, -fy), with 0 <= fx, fy < size: the origin is a BigInt cell and only the fraction of a cell
 * is a Number, so the view works the same at (0, 0) and at a coordinate with hundreds of digits.
 * Screen y grows downwards and so does the grid's y.
 */
export interface Camera {
  ox: bigint;
  oy: bigint;
  fx: number;
  fy: number;
  size: number; // pixels per cell
}

export const MIN_CELL = 12;
export const MAX_CELL = 64;
export const DEFAULT_CELL = 36;

export const clampSize = (size: number) => Math.min(MAX_CELL, Math.max(MIN_CELL, size));

// Moves whole cells of the pixel offset into the BigInt origin
export function normalize(cam: Camera): Camera {
  const wx = Math.floor(cam.fx / cam.size);
  const wy = Math.floor(cam.fy / cam.size);
  if (wx === 0 && wy === 0) return cam;
  return { ...cam, ox: cam.ox + BigInt(wx), oy: cam.oy + BigInt(wy), fx: cam.fx - wx * cam.size, fy: cam.fy - wy * cam.size };
}

// Dragging the board by (dx, dy) pixels: the grid follows the finger
export const pan = (cam: Camera, dx: number, dy: number): Camera => normalize({ ...cam, fx: cam.fx - dx, fy: cam.fy - dy });

// The cell under a screen point (pixels from the board's top-left corner)
export function cellAt(cam: Camera, px: number, py: number): Cell {
  return { x: cam.ox + BigInt(Math.floor((px + cam.fx) / cam.size)), y: cam.oy + BigInt(Math.floor((py + cam.fy) / cam.size)) };
}

// The top-left pixel of a cell, or null when it is too far away to draw
export function cellToScreen(cam: Camera, c: Cell, limit = 100_000): { x: number; y: number } | null {
  const dx = c.x - cam.ox;
  const dy = c.y - cam.oy;
  const l = BigInt(limit);
  if (dx > l || dx < -l || dy > l || dy < -l) return null;
  return { x: Number(dx) * cam.size - cam.fx, y: Number(dy) * cam.size - cam.fy };
}

// Changes the cell size keeping the grid point under (px, py) where it is
export function zoomAt(cam: Camera, size: number, px: number, py: number): Camera {
  const next = clampSize(size);
  if (next === cam.size) return cam;
  const relX = (px + cam.fx) / cam.size - px / next; // new left edge, in cells from ox
  const relY = (py + cam.fy) / cam.size - py / next;
  const wx = Math.floor(relX);
  const wy = Math.floor(relY);
  return { ox: cam.ox + BigInt(wx), oy: cam.oy + BigInt(wy), fx: (relX - wx) * next, fy: (relY - wy) * next, size: next };
}

// Puts a cell's centre in the middle of a width × height view
export function centerOn(cam: Camera, c: Cell, width: number, height: number): Camera {
  const relX = 0.5 - width / 2 / cam.size;
  const relY = 0.5 - height / 2 / cam.size;
  const wx = Math.floor(relX);
  const wy = Math.floor(relY);
  return { ...cam, ox: c.x + BigInt(wx), oy: c.y + BigInt(wy), fx: (relX - wx) * cam.size, fy: (relY - wy) * cam.size };
}

// The cells at least partly visible in a width × height view (inclusive)
export function visibleRect(cam: Camera, width: number, height: number): Rect {
  const cols = Math.max(1, Math.ceil((width + cam.fx) / cam.size));
  const rows = Math.max(1, Math.ceil((height + cam.fy) / cam.size));
  return { minX: cam.ox, minY: cam.oy, maxX: cam.ox + BigInt(cols - 1), maxY: cam.oy + BigInt(rows - 1) };
}

// The cells fully inside the view (for deciding whether a move "is on screen")
export function fullyVisibleRect(cam: Camera, width: number, height: number): Rect {
  const firstX = cam.fx > 0 ? 1 : 0;
  const firstY = cam.fy > 0 ? 1 : 0;
  const cols = Math.floor((width + cam.fx) / cam.size);
  const rows = Math.floor((height + cam.fy) / cam.size);
  return { minX: cam.ox + BigInt(firstX), minY: cam.oy + BigInt(firstY), maxX: cam.ox + BigInt(cols - 1), maxY: cam.oy + BigInt(rows - 1) };
}

// Saved per room in localStorage, as a display preference
export function serializeCamera(cam: Camera): string {
  return JSON.stringify({ ox: cam.ox.toString(), oy: cam.oy.toString(), fx: cam.fx, fy: cam.fy, size: cam.size });
}

export function deserializeCamera(raw: string | null): Camera | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { ox?: unknown; oy?: unknown; fx?: unknown; fy?: unknown; size?: unknown };
    const ox = parseCoordinate(v.ox);
    const oy = parseCoordinate(v.oy);
    if (ox === null || oy === null || typeof v.fx !== 'number' || typeof v.fy !== 'number' || typeof v.size !== 'number') return null;
    if (!Number.isFinite(v.fx) || !Number.isFinite(v.fy) || !Number.isFinite(v.size)) return null;
    const size = clampSize(v.size);
    return normalize({ ox, oy, fx: Math.max(0, v.fx), fy: Math.max(0, v.fy), size });
  } catch {
    return null;
  }
}
