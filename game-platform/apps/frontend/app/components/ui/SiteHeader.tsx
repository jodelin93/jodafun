'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGuestPlay } from '../../lib/useGuestPlay';
import Logo from './Logo';

const NAV = [
  { href: '/games', label: 'Games' },
  { href: '/leaderboard', label: 'Leaderboard' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isPending, refreshSession } = useAuth();
  const { play, loading } = useGuestPlay();

  const signOut = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
    });
    await refreshSession();
    router.push('/');
  };

  const isGuest = user?.email.includes('@guest.local');

  const navLinks = NAV.map(({ href, label }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
          active ? 'bg-white/10 text-white' : 'text-chalk hover:bg-white/5 hover:text-white'
        }`}
      >
        {label}
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-felt-deep/85 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {navLinks}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {isPending ? null : user ? (
            <>
              <span className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-1 ring-1 ring-inset ring-white/10 sm:pr-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold font-display text-sm font-bold text-ink">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{user.name}</span>
                {isGuest && <span className="hidden text-xs text-chalk sm:inline">(guest)</span>}
              </span>
              <button onClick={signOut} className="btn-quiet btn-sm" aria-label="Sign out">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-sm btn text-chalk hover:text-white">
                Sign in
              </Link>
              <button onClick={() => play()} disabled={loading} className="btn-gold btn-sm">
                {loading ? 'Starting…' : 'Play now'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Phones: page links sit in their own row so nothing gets squeezed */}
      <nav aria-label="Main" className="page flex gap-1 pb-2 md:hidden">
        {navLinks}
      </nav>
    </header>
  );
}
