import { ImageResponse } from 'next/og';

// iPhone home-screen / Safari icon: the same mark as app/icon.svg, rendered to PNG at build time
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const card = { position: 'absolute' as const, width: 74, height: 102, borderRadius: 12, background: '#FFFDF9' };
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0E3B34' }}>
        <div style={{ ...card, left: 26, top: 44, transform: 'rotate(-14deg)', display: 'flex', padding: 8 }}>
          {/* The PNG renderer can't draw the lattice pattern, so the card back is plain green with a gold edge */}
          <div style={{ flex: 1, borderRadius: 7, background: '#155247', border: '3px solid rgba(255,194,61,0.7)' }} />
        </div>
        <div
          style={{
            ...card,
            left: 78,
            top: 34,
            transform: 'rotate(8deg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 60,
            fontWeight: 900,
            color: '#FF5C4D',
          }}
        >
          J
        </div>
      </div>
    ),
    size,
  );
}
