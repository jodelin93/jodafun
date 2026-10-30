'use client';

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import type { BoardCache } from '../../lib/five/cache';
import {
  DEFAULT_CELL,
  cellAt,
  cellToScreen,
  centerOn,
  deserializeCamera,
  fullyVisibleRect,
  pan,
  serializeCamera,
  visibleRect,
  zoomAt,
  type Camera,
} from '../../lib/five/camera';
import { fromWire, inRect, type Cell, type Rect } from '../../lib/five/coords';
import { describeCell, type Tx } from '../../lib/five/describe';
import type { FiveMove, FiveSymbol, WireCell } from '../../lib/five/types';

export type BoardView = { visible: Rect; full: Rect; center: Cell; size: number };
export type BoardHandle = { centerOn: (cell: Cell) => void; zoom: (direction: 1 | -1) => void };

type Props = {
  tx: Tx;
  cache: BoardCache;
  cacheRev: number;
  label: string;
  storageKey: string | null; // where the camera is kept between visits (a display preference)
  initialCenter: Cell;
  lastMove: FiveMove | null;
  winLine: WireCell[] | null;
  selected: Cell | null;
  ghost: FiveSymbol | null; // the symbol previewed on the selected cell, when it can be placed there
  onSelect: (cell: Cell | null) => void;
  onConfirm: () => void;
  onView: (view: BoardView) => void;
  ref?: Ref<BoardHandle>;
};

// Jodafun colours on a card-stock board
const PAPER = '#FFFDF9';
const GRID = 'rgba(26, 36, 33, 0.14)';
const GRID_FIVE = 'rgba(26, 36, 33, 0.3)';
const AXIS = 'rgba(185, 128, 10, 0.75)';
const X_COLOR = '#D93A2B';
const O_COLOR = '#155247';
const GOLD = '#FFC23D';
const GOLD_EDGE = '#B9800A';
const UNKNOWN_FILL = 'rgba(14, 59, 52, 0.16)';

// A tap that moves less than this is a tap; anything more is a drag and never places a symbol
const TAP_SLOP_MOUSE = 5;
const TAP_SLOP_TOUCH = 10;
const ZOOM_STEP = 1.25;

type Gesture = { startX: number; startY: number; moved: boolean; multi: boolean; slop: number };

function drawSymbol(ctx: CanvasRenderingContext2D, symbol: FiveSymbol, x: number, y: number, size: number, alpha = 1) {
  const pad = size * 0.22;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, size * 0.12);
  if (symbol === 'X') {
    ctx.strokeStyle = X_COLOR;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad);
    ctx.lineTo(x + size - pad, y + size - pad);
    ctx.moveTo(x + size - pad, y + pad);
    ctx.lineTo(x + pad, y + size - pad);
    ctx.stroke();
  } else {
    ctx.strokeStyle = O_COLOR;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - pad, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The unbounded grid, drawn on a canvas: only the visible window is drawn, whatever the
 * coordinates. Drag (mouse or finger) to move, wheel or pinch to zoom, tap or click a cell to select
 * it. A drag never selects and nothing is ever placed from the board itself: placing is a separate
 * Confirm (button or Enter). Arrow keys move the selection and the view follows it.
 */
export default function FiveBoard({ tx, cache, cacheRev, label, storageKey, initialCenter, lastMove, winLine, selected, ghost, onSelect, onConfirm, onView, ref }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera | null>(null);
  const dims = useRef({ w: 0, h: 0, dpr: 1 });
  const frame = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pattern = useRef<CanvasPattern | null>(null);
  const [announce, setAnnounce] = useState('');
  const helpId = useId();

  // The latest props, read by the drawing and event code without re-binding listeners
  const props = useRef({ cache, lastMove, winLine, selected, ghost, onSelect, onConfirm, onView, storageKey, initialCenter });
  props.current = { cache, lastMove, winLine, selected, ghost, onSelect, onConfirm, onView, storageKey, initialCenter };

  const draw = useCallback(() => {
    frame.current = null;
    const canvas = canvasRef.current;
    const c = cam.current;
    const { w, h, dpr } = dims.current;
    if (!canvas || !c || w === 0 || h === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = props.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    const view = visibleRect(c, w, h);
    const s = c.size;

    // Areas not loaded yet: hatched, never shown as empty
    if (!pattern.current) {
      const tile = document.createElement('canvas');
      tile.width = 10;
      tile.height = 10;
      const tctx = tile.getContext('2d');
      if (tctx) {
        tctx.strokeStyle = 'rgba(14, 59, 52, 0.28)';
        tctx.lineWidth = 1.5;
        tctx.beginPath();
        tctx.moveTo(-1, 11);
        tctx.lineTo(11, -1);
        tctx.stroke();
        pattern.current = ctx.createPattern(tile, 'repeat');
      }
    }
    for (const r of p.cache.unloadedIn(view)) {
      const tl = cellToScreen(c, { x: r.minX, y: r.minY });
      if (!tl) continue;
      const bw = Number(r.maxX - r.minX + 1n) * s;
      const bh = Number(r.maxY - r.minY + 1n) * s;
      ctx.fillStyle = UNKNOWN_FILL;
      ctx.fillRect(tl.x, tl.y, bw, bh);
      if (pattern.current) {
        ctx.fillStyle = pattern.current;
        ctx.fillRect(tl.x, tl.y, bw, bh);
      }
    }

    // Grid: a stronger line every five cells helps count a row; the axes through (0, 0) in gold
    const cols = Number(view.maxX - view.minX) + 1;
    const rows = Number(view.maxY - view.minY) + 1;
    const lw = s >= 24 ? 1 : 0.75;
    for (let i = 0; i <= cols; i++) {
      const gx = view.minX + BigInt(i);
      const x = Math.round(i * s - c.fx) + 0.5;
      ctx.strokeStyle = gx === 0n ? AXIS : gx % 5n === 0n ? GRID_FIVE : GRID;
      ctx.lineWidth = gx === 0n ? 2 : lw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const gy = view.minY + BigInt(j);
      const y = Math.round(j * s - c.fy) + 0.5;
      ctx.strokeStyle = gy === 0n ? AXIS : gy % 5n === 0n ? GRID_FIVE : GRID;
      ctx.lineWidth = gy === 0n ? 2 : lw;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Last move: a gold square under it
    if (p.lastMove) {
      const at = cellToScreen(c, fromWire(p.lastMove));
      if (at) {
        ctx.fillStyle = 'rgba(255, 194, 61, 0.38)';
        ctx.fillRect(at.x + 1, at.y + 1, s - 1, s - 1);
      }
    }

    // Winning run: cells tinted, then a line through their centres
    const line = p.winLine?.map(fromWire) ?? [];
    for (const cell of line) {
      const at = cellToScreen(c, cell);
      if (at) {
        ctx.fillStyle = 'rgba(255, 194, 61, 0.55)';
        ctx.fillRect(at.x + 1, at.y + 1, s - 1, s - 1);
      }
    }

    for (const stone of p.cache.stonesIn(view)) {
      const at = cellToScreen(c, stone);
      if (at) drawSymbol(ctx, stone.symbol, at.x, at.y, s);
    }

    const first = line[0];
    const last = line[line.length - 1];
    const a = first && cellToScreen(c, first);
    const b = last && cellToScreen(c, last);
    if (a && b) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = GOLD_EDGE;
      ctx.lineWidth = Math.max(4, s * 0.22);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(a.x + s / 2, a.y + s / 2);
      ctx.lineTo(b.x + s / 2, b.y + s / 2);
      ctx.stroke();
      ctx.restore();
    }

    // Selection (also the keyboard cursor): a gold ring, with the symbol about to be placed
    if (p.selected && inRect(p.selected, view)) {
      const at = cellToScreen(c, p.selected);
      if (at) {
        if (p.ghost && p.cache.get(p.selected) === null) drawSymbol(ctx, p.ghost, at.x, at.y, s, 0.42);
        ctx.strokeStyle = GOLD_EDGE;
        ctx.lineWidth = 3;
        ctx.strokeRect(at.x + 1.5, at.y + 1.5, s - 3, s - 3);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(at.x + 3.5, at.y + 3.5, s - 7, s - 7);
      }
    }
  }, []);

  const requestDraw = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // Tells the page what is on screen (debounced: area loading follows the camera) and saves it
  const cameraChanged = useCallback(() => {
    requestDraw();
    if (viewTimer.current) clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => {
      const c = cam.current;
      const { w, h } = dims.current;
      if (!c || w === 0) return;
      props.current.cache.touch(visibleRect(c, w, h));
      props.current.onView({ visible: visibleRect(c, w, h), full: fullyVisibleRect(c, w, h), center: cellAt(c, w / 2, h / 2), size: c.size });
    }, 120);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const key = props.current.storageKey;
      if (!key || !cam.current) return;
      try {
        localStorage.setItem(key, serializeCamera(cam.current));
      } catch {
        // Storage unavailable: the view just isn't remembered
      }
    }, 400);
  }, [requestDraw]);

  const setCamera = useCallback(
    (next: Camera) => {
      cam.current = next;
      cameraChanged();
    },
    [cameraChanged],
  );

  useImperativeHandle(
    ref,
    () => ({
      centerOn: (cell: Cell) => {
        const c = cam.current;
        if (!c) return;
        setCamera(centerOn(c, cell, dims.current.w, dims.current.h));
      },
      zoom: (direction: 1 | -1) => {
        const c = cam.current;
        if (!c) return;
        setCamera(zoomAt(c, direction > 0 ? c.size * ZOOM_STEP : c.size / ZOOM_STEP, dims.current.w / 2, dims.current.h / 2));
      },
    }),
    [setCamera],
  );

  // Size the canvas to its box (and the screen's pixel density); the first size places the camera
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dims.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      if (!cam.current) {
        let saved: Camera | null = null;
        try {
          saved = props.current.storageKey ? deserializeCamera(localStorage.getItem(props.current.storageKey)) : null;
        } catch {
          saved = null;
        }
        cam.current = saved ?? centerOn({ ox: 0n, oy: 0n, fx: 0, fy: 0, size: DEFAULT_CELL }, props.current.initialCenter, rect.width, rect.height);
      }
      cameraChanged();
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (viewTimer.current) clearTimeout(viewTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [cameraChanged, draw]);

  // Redraw when what is drawn changes
  useEffect(() => {
    requestDraw();
  }, [cacheRev, lastMove, winLine, selected, ghost, requestDraw]);

  // Says what the selected cell holds (and again once its area has loaded)
  const selectedContent = selected ? cache.get(selected) : null;
  useEffect(() => {
    setAnnounce(selected ? describeCell(tx, selected, selectedContent) : '');
  }, [selected, selectedContent, tx]);

  // Wheel zoom around the cursor (a non-passive listener, so the page doesn't scroll)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const c = cam.current;
      if (!c) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015));
      const box = canvas.getBoundingClientRect();
      setCamera(zoomAt(c, c.size * factor, e.clientX - box.left, e.clientY - box.top));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setCamera]);

  const local = (e: { clientX: number; clientY: number }) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const pinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    wrapRef.current?.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) {
      const at = local(e);
      gesture.current = { startX: at.x, startY: at.y, moved: false, multi: false, slop: e.pointerType === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH };
    } else if (gesture.current) {
      gesture.current.multi = true; // a second finger: pinch, never a tap
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    const g = gesture.current;
    const c = cam.current;
    if (!prev || !g || !c) return;
    const at = local(e);
    if (pointers.current.size >= 2) {
      const before = pinch();
      pointers.current.set(e.pointerId, at);
      const after = pinch();
      if (!before || !after || before.dist === 0) return;
      g.moved = true;
      const moved = pan(c, after.mid.x - before.mid.x, after.mid.y - before.mid.y);
      setCamera(zoomAt(moved, moved.size * (after.dist / before.dist), after.mid.x, after.mid.y));
      return;
    }
    pointers.current.set(e.pointerId, at);
    if (!g.moved) {
      if (Math.hypot(at.x - g.startX, at.y - g.startY) < g.slop) return;
      g.moved = true;
      setCamera(pan(c, at.x - g.startX, at.y - g.startY));
      return;
    }
    setCamera(pan(c, at.x - prev.x, at.y - prev.y));
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0 || !g) return;
    gesture.current = null;
    const c = cam.current;
    // Only a tap selects: no drag, no second finger, not cancelled
    if (cancelled || g.moved || g.multi || !c) return;
    const at = local(e);
    props.current.onSelect(cellAt(c, at.x, at.y));
  };

  // Keeps a cell on screen, moving the view by whole cells only as far as needed
  const keepVisible = (cell: Cell) => {
    const c = cam.current;
    if (!c) return;
    const full = fullyVisibleRect(c, dims.current.w, dims.current.h);
    let dx = 0n;
    let dy = 0n;
    if (cell.x < full.minX) dx = cell.x - full.minX;
    if (cell.x > full.maxX) dx = cell.x - full.maxX;
    if (cell.y < full.minY) dy = cell.y - full.minY;
    if (cell.y > full.maxY) dy = cell.y - full.maxY;
    if (dx === 0n && dy === 0n) return;
    // Far jumps recentre; small ones scroll
    const far = dx > 50n || dx < -50n || dy > 50n || dy < -50n;
    setCamera(far ? centerOn(c, cell, dims.current.w, dims.current.h) : { ...c, ox: c.ox + dx, oy: c.oy + dy });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const c = cam.current;
    if (!c) return;
    const steps: Record<string, [bigint, bigint]> = { ArrowLeft: [-1n, 0n], ArrowRight: [1n, 0n], ArrowUp: [0n, -1n], ArrowDown: [0n, 1n] };
    const step = steps[e.key];
    if (step) {
      e.preventDefault();
      const from = props.current.selected ?? cellAt(c, dims.current.w / 2, dims.current.h / 2);
      const next = props.current.selected ? { x: from.x + step[0], y: from.y + step[1] } : from;
      props.current.onSelect(next);
      keepVisible(next);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (props.current.selected) props.current.onConfirm();
      else props.current.onSelect(cellAt(c, dims.current.w / 2, dims.current.h / 2));
      return;
    }
    if (e.key === 'Escape') {
      if (props.current.selected) {
        e.preventDefault();
        props.current.onSelect(null);
      }
      return;
    }
    if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      const zoomIn = e.key === '+' || e.key === '=';
      setCamera(zoomAt(c, zoomIn ? c.size * ZOOM_STEP : c.size / ZOOM_STEP, dims.current.w / 2, dims.current.h / 2));
    }
  };

  return (
    <div className="space-y-1.5">
      <div
        ref={wrapRef}
        tabIndex={0}
        role="application"
        aria-roledescription={tx('boardRole')}
        aria-label={label}
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
        className="relative h-[min(68vh,40rem)] min-h-[18rem] w-full overflow-hidden rounded-2xl bg-card shadow-rest ring-2 ring-table-rim"
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="block h-full w-full cursor-crosshair touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={e => endPointer(e, false)}
          onPointerCancel={e => endPointer(e, true)}
          onContextMenu={e => e.preventDefault()}
        />
      </div>
      <p id={helpId} className="text-xs text-chalk">
        {tx('boardHelp')}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
    </div>
  );
}
