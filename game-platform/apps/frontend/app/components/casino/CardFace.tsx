import type { ReactNode } from 'react';
import { cardInfo, type Suit } from '../../lib/casino/cards';

// Classic playing-card faces drawn in a 50×70 box: corner indexes, pip layouts for 2-10, a large
// pip for aces and a mirrored two-headed portrait for jacks, queens and kings

const RED = '#C8302A';
const BLACK = '#1A2421';
const BLUE = '#2F5DA8';
const GOLD = '#E8A817';
const SKIN = '#F7DDBB';

// Suit shapes in a 10×10 box
function SuitShape({ suit }: { suit: Suit }) {
  switch (suit) {
    case 'H':
      return <path d="M5 9.6C3.2 8 0 5.5 0 3C0 1.3 1.3 0 2.8 0C3.8 0 4.6.6 5 1.4C5.4.6 6.2 0 7.2 0C8.7 0 10 1.3 10 3C10 5.5 6.8 8 5 9.6Z" />;
    case 'D':
      return <path d="M5 0L9 5L5 10L1 5Z" />;
    case 'S':
      return (
        <path d="M5 0C3.3 1.8 0 4 0 6.4C0 7.9 1.1 9 2.5 9C3.4 9 4.1 8.5 4.5 7.9C4.4 8.8 4 9.4 3.3 10H6.7C6 9.4 5.6 8.8 5.5 7.9C5.9 8.5 6.6 9 7.5 9C8.9 9 10 7.9 10 6.4C10 4 6.7 1.8 5 0Z" />
      );
    case 'C':
      return (
        <>
          <circle cx="5" cy="2.6" r="2.4" />
          <circle cx="2.5" cy="6.2" r="2.4" />
          <circle cx="7.5" cy="6.2" r="2.4" />
          <path d="M4.5 5.5C4.5 7.8 4.1 9.1 3.3 10H6.7C5.9 9.1 5.5 7.8 5.5 5.5Z" />
        </>
      );
  }
}

// One suit symbol centred on (x, y), `size` wide, upside down when `flip`
function Pip({ suit, x, y, size, flip }: { suit: Suit; x: number; y: number; size: number; flip?: boolean }) {
  const s = size / 10;
  return (
    <g transform={`translate(${x} ${y})${flip ? ' rotate(180)' : ''} scale(${s}) translate(-5 -5)`}>
      <SuitShape suit={suit} />
    </g>
  );
}

// Pip positions for 2-10: columns at x 17 / 25 / 33, rows between y 15 and 55
const L = 17;
const M = 25;
const R = 33;
const ROW4 = [15, 28.33, 41.67, 55];
const PIPS: Record<number, [number, number][]> = {
  2: [[M, 15], [M, 55]],
  3: [[M, 15], [M, 35], [M, 55]],
  4: [[L, 15], [R, 15], [L, 55], [R, 55]],
  5: [[L, 15], [R, 15], [M, 35], [L, 55], [R, 55]],
  6: [[L, 15], [R, 15], [L, 35], [R, 35], [L, 55], [R, 55]],
  7: [[L, 15], [R, 15], [M, 25], [L, 35], [R, 35], [L, 55], [R, 55]],
  8: [[L, 15], [R, 15], [M, 25], [L, 35], [R, 35], [M, 45], [L, 55], [R, 55]],
  9: [...ROW4.flatMap(y => [[L, y], [R, y]] as [number, number][]), [M, 35]],
  10: [...ROW4.flatMap(y => [[L, y], [R, y]] as [number, number][]), [M, 21.67], [M, 48.33]],
};

// Rank above a small suit, in the top-left corner (and turned round in the bottom-right)
function Index({ label, suit }: { label: string; suit: Suit }) {
  return (
    <>
      <text x="6.5" y="12" textAnchor="middle" fontSize="12" fontWeight="800" {...(label === '10' ? { textLength: 10.5, lengthAdjust: 'spacingAndGlyphs' } : {})}>
        {label}
      </text>
      <Pip suit={suit} x={6.5} y={17.6} size={6} />
    </>
  );
}

// The top half of a court card; the bottom half is the same turned round
function CourtHalf({ label, suit, color }: { label: string; suit: Suit; color: string }) {
  const robe = color === RED ? RED : BLUE;
  const lining = color === RED ? BLUE : RED;
  let crown: ReactNode;
  let hair: ReactNode = null;
  let beard: ReactNode = null;
  let item: ReactNode;
  if (label === 'K') {
    crown = (
      <>
        <path d="M20.6 17.4V12L22.6 14.6L25 11L27.4 14.6L29.4 12V17.4Z" fill={GOLD} stroke={BLACK} strokeWidth=".4" />
        <circle cx="25" cy="15.6" r=".9" fill={lining} />
      </>
    );
    beard = <path d="M21.4 21C21.8 25 24 26.2 25 26.2C26 26.2 28.2 25 28.6 21C27.4 22.6 22.6 22.6 21.4 21Z" fill="#7A4A22" stroke={BLACK} strokeWidth=".3" />;
    item = (
      <>
        <path d="M33.2 12.5V32" stroke="#9AA5AE" strokeWidth="1.3" />
        <path d="M31.4 25H35" stroke={GOLD} strokeWidth="1.2" />
        <circle cx="33.2" cy="27" r=".8" fill={GOLD} />
      </>
    );
  } else if (label === 'Q') {
    crown = (
      <>
        <path d="M21 17.4L21.4 13.6C23.6 12.4 26.4 12.4 28.6 13.6L29 17.4Z" fill={GOLD} stroke={BLACK} strokeWidth=".4" />
        <circle cx="25" cy="12" r="1" fill={GOLD} stroke={BLACK} strokeWidth=".3" />
        <circle cx="25" cy="15.4" r=".8" fill={lining} />
      </>
    );
    hair = <path d="M20.6 18C20 21.5 20.2 24.4 21.2 26H28.8C29.8 24.4 30 21.5 29.4 18Z" fill="#5C3A1E" />;
    item = (
      <>
        <path d="M16.6 33V19" stroke="#2E7D4F" strokeWidth=".8" />
        <path d="M16.6 26L18.4 24.6" stroke="#2E7D4F" strokeWidth=".7" />
        <circle cx="16.6" cy="17.6" r="1.8" fill={RED} stroke={BLACK} strokeWidth=".3" />
        <circle cx="16.6" cy="17.6" r=".6" fill={GOLD} />
      </>
    );
  } else {
    crown = (
      <>
        <path d="M20.4 18.2C20.6 14.4 22.4 13.2 25 13.2C27.6 13.2 29.4 14.4 29.6 18.2Z" fill={lining} stroke={BLACK} strokeWidth=".4" />
        <path d="M20.4 17.2H29.6V18.4H20.4Z" fill={GOLD} stroke={BLACK} strokeWidth=".3" />
        <path d="M28.6 15C30.4 12.6 31.6 11.8 33 11.6C31.8 13 30.8 14.6 29.4 16Z" fill={GOLD} stroke={BLACK} strokeWidth=".3" />
      </>
    );
    hair = <path d="M21 18.4C20.8 20.6 21 22.4 21.8 23.4H28.2C29 22.4 29.2 20.6 29 18.4Z" fill="#C98B2E" />;
    item = (
      <>
        <path d="M16.4 33V13.4" stroke="#7A4A22" strokeWidth=".9" />
        <path d="M16.4 10.6L18 13.4L16.4 16.2L14.8 13.4Z" fill={GOLD} stroke={BLACK} strokeWidth=".3" />
      </>
    );
  }
  return (
    <>
      {item}
      {/* Robe with a gold band and the suit on the chest */}
      <path d="M15.4 35L17.6 27.4C20 25.6 30 25.6 32.4 27.4L34.6 35Z" fill={robe} stroke={BLACK} strokeWidth=".4" />
      <path d="M18.2 35L19.4 28.4L21 35Z M31.8 35L30.6 28.4L29 35Z" fill={lining} />
      <path d="M23.2 26V35H26.8V26Z" fill={GOLD} stroke={BLACK} strokeWidth=".3" />
      <g fill={color}>
        <Pip suit={suit} x={25} y={31} size={3} />
      </g>
      <path d="M19.6 26.4C22 28.6 28 28.6 30.4 26.4L29.6 25.2C27.4 26.6 22.6 26.6 20.4 25.2Z" fill="#FFFDF9" stroke={BLACK} strokeWidth=".3" />
      {hair}
      <circle cx="25" cy="20.6" r="3.6" fill={SKIN} stroke={BLACK} strokeWidth=".4" />
      <circle cx="23.7" cy="20.2" r=".38" fill={BLACK} />
      <circle cx="26.3" cy="20.2" r=".38" fill={BLACK} />
      <path d="M24.2 22.5C24.7 22.9 25.3 22.9 25.8 22.5" stroke={RED} strokeWidth=".35" fill="none" />
      {beard}
      {crown}
    </>
  );
}

export default function CardFace({ id }: { id: string }) {
  const c = cardInfo(id);
  const color = c.red ? RED : BLACK;
  let middle: ReactNode;
  if (c.rank === 1) {
    middle = <Pip suit={c.suit} x={25} y={35} size={c.suit === 'S' ? 22 : 18} />;
  } else if (c.rank <= 10) {
    middle = (PIPS[c.rank] ?? []).map(([x, y], i) => <Pip key={i} suit={c.suit} x={x} y={y} size={8} flip={y > 35} />);
  } else {
    const clip = `court-${id}`;
    middle = (
      <>
        <clipPath id={clip}>
          <rect x="11" y="9" width="28" height="26" />
        </clipPath>
        <rect x="11" y="9" width="28" height="52" fill="#FFF8EC" stroke={BLACK} strokeWidth=".6" />
        <g clipPath={`url(#${clip})`}>
          <CourtHalf label={c.label} suit={c.suit} color={color} />
        </g>
        <g transform="rotate(180 25 35)" clipPath={`url(#${clip})`}>
          <CourtHalf label={c.label} suit={c.suit} color={color} />
        </g>
        <path d="M11 35H39" stroke={BLACK} strokeWidth=".4" />
        <Pip suit={c.suit} x={14.6} y={12.6} size={4.4} />
      </>
    );
  }
  return (
    <svg viewBox="0 0 50 70" className="h-full w-full" fill={color} aria-hidden="true">
      <Index label={c.label} suit={c.suit} />
      <g transform="rotate(180 25 35)">
        <Index label={c.label} suit={c.suit} />
      </g>
      {middle}
    </svg>
  );
}
