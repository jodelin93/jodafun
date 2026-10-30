import { floorDiv, type Cell, type Rect } from './coords';
import { MAX_AREA_SPAN, type FiveSymbol } from './types';

// The client's knowledge of the board: 32×32 blocks, each either LOADED (every symbol in it is
// known) or not (only the symbols we saw played are known; the other cells are unknown, never
// "empty"). Least recently used blocks are dropped beyond `capacity`, except the ones on screen,
// so memory stays bounded however far the players roam.

export const BLOCK = 32n;
const GROUP = BigInt(MAX_AREA_SPAN) / BLOCK; // blocks per area request side (8 → 256 cells)

type Block = { bx: bigint; by: bigint; loaded: boolean; cells: Map<string, { x: bigint; y: bigint; symbol: FiveSymbol }> };

export type AreaRequest = { rect: Rect; keys: string[]; epoch: number };

const blockKey = (bx: bigint, by: bigint) => `${bx.toString()},${by.toString()}`;
const cellKeyOf = (x: bigint, y: bigint) => `${x.toString()},${y.toString()}`;

export class BoardCache {
  private blocks = new Map<string, Block>(); // insertion order = least recently used first
  private inflight = new Set<string>();
  // Bumps on every change, so a component can redraw when it moves
  rev = 0;
  // Bumps when the cache is emptied or forgets what it loaded: answers to older requests are ignored
  epoch = 0;

  // `complete`: the whole board is known (tutorial lessons), so every cell counts as loaded
  constructor(
    readonly capacity = 400,
    readonly complete = false,
  ) {}

  get size() {
    return this.blocks.size;
  }

  private block(bx: bigint, by: bigint, create: true): Block;
  private block(bx: bigint, by: bigint, create?: false): Block | undefined;
  private block(bx: bigint, by: bigint, create = false) {
    const key = blockKey(bx, by);
    let b = this.blocks.get(key);
    if (!b && create) {
      b = { bx, by, loaded: false, cells: new Map() };
      this.blocks.set(key, b);
    }
    return b;
  }

  // X, O, null for a known free cell, or undefined when the cell's block isn't loaded
  get(c: Cell): FiveSymbol | null | undefined {
    const b = this.block(floorDiv(c.x, BLOCK), floorDiv(c.y, BLOCK));
    const s = b?.cells.get(cellKeyOf(c.x, c.y))?.symbol;
    if (s) return s;
    return this.complete || b?.loaded ? null : undefined;
  }

  isLoaded(c: Cell): boolean {
    return this.complete || !!this.block(floorDiv(c.x, BLOCK), floorDiv(c.y, BLOCK))?.loaded;
  }

  // A symbol we know is there (a move we saw, or a cell from an area answer)
  put(c: Cell, symbol: FiveSymbol) {
    const b = this.block(floorDiv(c.x, BLOCK), floorDiv(c.y, BLOCK), true);
    const key = cellKeyOf(c.x, c.y);
    if (b.cells.get(key)?.symbol === symbol) return;
    b.cells.set(key, { x: c.x, y: c.y, symbol });
    this.rev++;
  }

  private *blockCoords(r: Rect): Generator<[bigint, bigint]> {
    const bx0 = floorDiv(r.minX, BLOCK);
    const bx1 = floorDiv(r.maxX, BLOCK);
    const by0 = floorDiv(r.minY, BLOCK);
    const by1 = floorDiv(r.maxY, BLOCK);
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) yield [bx, by];
  }

  // Every known symbol inside a rectangle
  *stonesIn(r: Rect): Generator<{ x: bigint; y: bigint; symbol: FiveSymbol }> {
    for (const [bx, by] of this.blockCoords(r)) {
      const b = this.block(bx, by);
      if (!b) continue;
      for (const s of b.cells.values()) if (s.x >= r.minX && s.x <= r.maxX && s.y >= r.minY && s.y <= r.maxY) yield s;
    }
  }

  // The blocks of a rectangle that are not loaded, as cell rectangles (for drawing them as loading)
  unloadedIn(r: Rect): Rect[] {
    if (this.complete) return [];
    const out: Rect[] = [];
    for (const [bx, by] of this.blockCoords(r)) {
      if (this.block(bx, by)?.loaded) continue;
      out.push({ minX: bx * BLOCK, minY: by * BLOCK, maxX: bx * BLOCK + BLOCK - 1n, maxY: by * BLOCK + BLOCK - 1n });
    }
    return out;
  }

  /**
   * The area requests needed to load a rectangle: its blocks that are neither loaded nor being
   * loaded, grouped by 8×8 blocks so no request is wider than 256 cells. They are marked as in
   * flight; answer each with `loaded` or `failed`.
   */
  requestsFor(r: Rect): AreaRequest[] {
    if (this.complete) return [];
    const groups = new Map<string, { keys: string[]; bx0: bigint; bx1: bigint; by0: bigint; by1: bigint }>();
    for (const [bx, by] of this.blockCoords(r)) {
      const key = blockKey(bx, by);
      if (this.block(bx, by)?.loaded || this.inflight.has(key)) continue;
      const gk = blockKey(floorDiv(bx, GROUP), floorDiv(by, GROUP));
      const g = groups.get(gk);
      if (!g) groups.set(gk, { keys: [key], bx0: bx, bx1: bx, by0: by, by1: by });
      else {
        g.keys.push(key);
        if (bx < g.bx0) g.bx0 = bx;
        if (bx > g.bx1) g.bx1 = bx;
        if (by < g.by0) g.by0 = by;
        if (by > g.by1) g.by1 = by;
      }
    }
    const out: AreaRequest[] = [];
    for (const g of groups.values()) {
      // The bounding box of the missing blocks: blocks already loaded inside it are simply loaded again
      const keys: string[] = [];
      for (let by = g.by0; by <= g.by1; by++) for (let bx = g.bx0; bx <= g.bx1; bx++) keys.push(blockKey(bx, by));
      keys.forEach(k => this.inflight.add(k));
      out.push({
        rect: { minX: g.bx0 * BLOCK, minY: g.by0 * BLOCK, maxX: g.bx1 * BLOCK + BLOCK - 1n, maxY: g.by1 * BLOCK + BLOCK - 1n },
        keys,
        epoch: this.epoch,
      });
    }
    return out;
  }

  // The answer to an area request: its blocks become loaded. Symbols only ever get added in this
  // game (nothing is captured), so an answer older or newer than our moves merges safely.
  loaded(req: AreaRequest, cells: { x: string; y: string; symbol: FiveSymbol }[]) {
    if (req.epoch !== this.epoch) return;
    req.keys.forEach(k => this.inflight.delete(k));
    for (const k of req.keys) {
      const [bx, by] = k.split(',').map(BigInt) as [bigint, bigint];
      this.block(bx, by, true).loaded = true;
    }
    for (const c of cells) this.put({ x: BigInt(c.x), y: BigInt(c.y) }, c.symbol);
    this.rev++;
  }

  failed(req: AreaRequest) {
    if (req.epoch !== this.epoch) return;
    req.keys.forEach(k => this.inflight.delete(k));
  }

  // Marks a rectangle's blocks as recently used and drops the oldest others beyond the capacity
  touch(r: Rect) {
    const keep = new Set<string>();
    for (const [bx, by] of this.blockCoords(r)) {
      const key = blockKey(bx, by);
      keep.add(key);
      const b = this.blocks.get(key);
      if (b) {
        this.blocks.delete(key);
        this.blocks.set(key, b);
      }
    }
    if (this.blocks.size <= this.capacity) return;
    for (const key of this.blocks.keys()) {
      if (this.blocks.size <= this.capacity) break;
      if (keep.has(key)) continue;
      this.blocks.delete(key);
      this.rev++;
    }
  }

  // Too many moves were missed: keep the symbols we know but load every block again
  forgetLoaded() {
    this.epoch++;
    this.inflight.clear();
    for (const b of this.blocks.values()) b.loaded = false;
    this.rev++;
  }

  clear() {
    this.epoch++;
    this.inflight.clear();
    this.blocks.clear();
    this.rev++;
  }
}
