// One domino drawn in SVG: a cream tile with a centre divider and pips laid out like a die.
// `a` is the top (vertical) or left (horizontal) number, `b` the other one.

const P = { tl: [13, 13], tr: [37, 13], ml: [13, 25], mr: [37, 25], bl: [13, 37], br: [37, 37], c: [25, 25] } as const;
const PIPS: (keyof typeof P)[][] = [
  [],
  ['c'],
  ['tr', 'bl'],
  ['tr', 'c', 'bl'],
  ['tl', 'tr', 'bl', 'br'],
  ['tl', 'tr', 'c', 'bl', 'br'],
  ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
];

type Props = {
  a?: number;
  b?: number;
  orientation?: 'vertical' | 'horizontal';
  faceDown?: boolean;
  ghost?: boolean;
  // Accessible name; without one the drawing is decorative (the surrounding control names it)
  label?: string;
  className?: string;
};

function Half({ value, dy }: { value: number; dy: number }) {
  return (
    <>
      {(PIPS[value] ?? []).map(k => (
        <circle key={k} cx={P[k][0]} cy={P[k][1] + dy} r={4.6} />
      ))}
    </>
  );
}

export default function DominoTile({ a = 0, b = 0, orientation = 'vertical', faceDown = false, ghost = false, label, className = '' }: Props) {
  const horizontal = orientation === 'horizontal';
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg
      viewBox={horizontal ? '0 0 100 50' : '0 0 50 100'}
      className={`block shrink-0 ${ghost ? 'opacity-70' : ''} ${className}`}
      {...a11y}
    >
      {/* Drawn upright, then turned a quarter so the top number sits on the left */}
      <g transform={horizontal ? 'translate(0 50) rotate(-90)' : undefined}>
        {faceDown ? (
          <>
            <rect x={1} y={1} width={48} height={98} rx={7} fill="#155247" stroke="#FFFDF9" strokeWidth={3} />
            <rect x={8} y={8} width={34} height={84} rx={4} fill="none" stroke="#FFC23D" strokeOpacity={0.55} strokeWidth={2} />
          </>
        ) : (
          <>
            <rect
              x={1.5}
              y={1.5}
              width={47}
              height={97}
              rx={7}
              fill={ghost ? 'rgba(255,253,249,0.82)' : '#FFFDF9'}
              stroke={ghost ? '#FFC23D' : '#56635F'}
              strokeWidth={ghost ? 3 : 1.5}
              strokeDasharray={ghost ? '6 4' : undefined}
            />
            <line x1={8} y1={50} x2={42} y2={50} stroke="#56635F" strokeWidth={2} strokeLinecap="round" />
            <g fill="#1A2421">
              <Half value={a} dy={0} />
              <Half value={b} dy={50} />
            </g>
          </>
        )}
      </g>
    </svg>
  );
}
