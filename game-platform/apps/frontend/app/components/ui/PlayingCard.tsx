import type { CSSProperties, ReactNode } from 'react';

type Props = {
  faceUp?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Content shown on the card back, on top of the lattice pattern */
  back?: ReactNode;
  /** Face-down cards turn face-up while an ancestor with the `group` class is hovered */
  revealOnHover?: boolean;
};

// A card with a white face and a patterned back that flips in 3D between them
export default function PlayingCard({ faceUp = true, className = '', style, children, back, revealOnHover }: Props) {
  return (
    <div className={`flip-scene ${className}`} style={style}>
      <div
        className={`flip-inner ${faceUp ? '' : 'is-flipped'} ${revealOnHover ? 'group-hover:[transform:rotateY(0deg)]' : ''}`}
      >
        <div className="flip-face rounded-card bg-card text-ink shadow-rest ring-1 ring-black/5">{children}</div>
        <div className="flip-face flip-face-back card-back rounded-card">{back}</div>
      </div>
    </div>
  );
}
