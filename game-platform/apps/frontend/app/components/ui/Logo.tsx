import Link from 'next/link';

// Wordmark with two overlapping cards: one face-down, one face-up
export default function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const card = size === 'sm' ? 'h-6 w-[18px]' : 'h-8 w-6';
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="Joda Fun home">
      <span className="relative inline-flex" aria-hidden="true">
        <span className={`${card} card-back -rotate-12 rounded-[4px]`} />
        <span
          className={`${card} -ml-3 rotate-6 rounded-[4px] bg-card shadow-rest ring-1 ring-black/5 transition-transform duration-200 group-hover:rotate-12`}
        >
          <span className="flex h-full items-center justify-center font-display text-xs font-extrabold text-signal">J</span>
        </span>
      </span>
      <span
        className={`font-display font-extrabold tracking-tight text-white ${size === 'sm' ? 'text-lg' : 'text-xl'}`}
        style={{ fontVariationSettings: "'wdth' 85" }}
      >
        Joda Fun
      </span>
    </Link>
  );
}
