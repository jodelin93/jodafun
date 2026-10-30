'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { clearCurrentRoom, readCurrentRoom, roomPath, subscribeCurrentRoom, type CurrentRoom } from '../../lib/currentRoom';
import { useAuth } from '../../contexts/AuthContext';
import { useGuestPlay } from '../../lib/useGuestPlay';
import Logo from './Logo';
import LanguageSwitcher from '../../i18n/LanguageSwitcher';
import { useT } from '../../i18n/I18nProvider';
import { siteMessages } from '../../i18n/messages/site';
import { useGameTitle } from '../../lib/useGameTitle';

const NAV = [
  { href: '/games', label: 'navGames' },
  { href: '/leaderboard', label: 'navLeaderboard' },
] as const;

export default function SiteHeader() {
  const t = useT(siteMessages);
  const { title: gameTitle } = useGameTitle();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isPending, refreshSession } = useAuth();
  const { play, loading } = useGuestPlay();

  const signOut = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
    });
    clearCurrentRoom();
    await refreshSession();
    router.push('/');
  };

  const isGuest = user?.email.includes('@guest.local');

  // A room this browser stepped out of (back, refresh, menu, another page) while the server still holds the seat
  const [openRoom, setOpenRoom] = useState<CurrentRoom | null>(null);
  useEffect(() => {
    const update = () => {
      const room = readCurrentRoom();
      const params = new URLSearchParams(window.location.search);
      const insideIt =
        room !== null &&
        window.location.pathname === `/games/${room.game ?? 'joda-memory'}` &&
        params.get('roomId')?.toUpperCase() === room.roomId;
      setOpenRoom(room && !insideIt ? room : null);
    };
    update();
    const unsubscribe = subscribeCurrentRoom(update);
    const timer = setInterval(update, 15000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [pathname]);

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
        {t(label)}
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-felt-deep/85 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav aria-label={t('mainNav')} className="hidden items-center gap-1 md:flex">
            {navLinks}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {isPending ? null : user ? (
            <>
              <Link
                href="/profile"
                aria-label={t('yourProfile')}
                className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-1 ring-1 ring-inset ring-white/10 hover:bg-white/10 sm:pr-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold font-display text-sm font-bold text-ink">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{user.name}</span>
                {isGuest && <span className="hidden text-xs text-chalk sm:inline">{t('guestTag')}</span>}
              </Link>
              <button onClick={signOut} className="btn-quiet btn-sm" aria-label={t('signOut')}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('signOut')}</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-sm btn text-chalk hover:text-white">
                {t('signIn')}
              </Link>
              <button onClick={() => play()} disabled={loading} className="btn-gold btn-sm">
                {loading ? t('starting') : t('playNow')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Phones: page links sit in their own row so nothing gets squeezed */}
      <nav aria-label={t('mainNav')} className="page flex gap-1 pb-2 md:hidden">
        {navLinks}
      </nav>

      {openRoom && (
        <div className="border-t border-gold/30 bg-felt" role="status">
          <div className="page flex items-center justify-between gap-3 py-2">
            <p className="min-w-0 text-sm text-chalk">
              <span className="font-semibold text-white">{gameTitle(openRoom.game ?? 'joda-memory')}</span> · {t('roomPre')}{' '}
              <span className="font-display font-bold tracking-[0.15em] text-white">{openRoom.roomId}</span> {t('roomPost')}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Link href={roomPath(openRoom.roomId, openRoom.game)} className="btn-gold btn-sm">
                {t('returnToRoom')}
              </Link>
              <button
                type="button"
                onClick={clearCurrentRoom}
                className="btn btn-sm text-chalk hover:text-white"
                aria-label={t('hideReminder')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
