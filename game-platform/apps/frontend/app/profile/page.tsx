'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useGuestPlay } from '../lib/useGuestPlay';
import { fetchMyStats, formatDate, UnauthorizedError, type UserStats } from '../lib/users';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import Loading from '../components/ui/Loading';
import StatsSection from '../components/profile/StatsSection';
import ProfileSkeleton from '../components/profile/ProfileSkeleton';
import RenameForm from '../components/profile/RenameForm';
import MatchHistory from '../components/profile/MatchHistory';
import { useLocale, useT } from '../i18n/I18nProvider';
import { profileMessages } from '../i18n/messages/profile';

function SignedOut() {
  const t = useT(profileMessages);
  const { play, loading, error } = useGuestPlay();
  return (
    <div className="panel max-w-xl p-5 sm:p-6">
      <h1 className="title-lg">{t('yourProfile')}</h1>
      <p className="mt-3 text-chalk">
        {t('signedOutIntro')}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/login" className="btn-quiet">
          {t('signIn')}
        </Link>
        <button type="button" className="btn-gold" disabled={loading} onClick={() => play()}>
          {loading ? t('starting') : t('playNow')}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-chalk" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ProfileContent() {
  const t = useT(profileMessages);
  const { intlLocale } = useLocale();
  const { user, isPending } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onUnauthorized = useCallback(() => setUnauthorized(true), []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setStats(null);
    setFailed(false);
    fetchMyStats(controller.signal)
      .then(setStats)
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof UnauthorizedError) return setUnauthorized(true);
        console.error('Failed to load stats:', err);
        setFailed(true);
      });
    return () => controller.abort();
  }, [userId, attempt]);

  if (isPending) return <Loading />;
  if (!user || unauthorized) return <SignedOut />;

  const isGuest = user.email.endsWith('@guest.local');

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="title-lg break-words">{user.name}</h1>
        {isGuest && <span className="chip">{t('guest')}</span>}
      </div>
      <p className="mt-2 text-chalk">{t('memberSince', { date: formatDate(user.createdAt, intlLocale) })}</p>
      <RenameForm currentName={user.name} />

      {isGuest && (
        <div className="panel mt-6 max-w-xl p-5">
          <p className="text-chalk">{t('guestNote')}</p>
          <Link href="/convert-account" className="btn-quiet mt-4">
            {t('createAccount')}
          </Link>
        </div>
      )}

      {failed ? (
        <div className="panel mt-8 max-w-xl p-5 sm:p-6" role="alert">
          <p className="text-chalk">{t('statsLoadFailed')}</p>
          <button type="button" className="btn-quiet mt-4" onClick={() => setAttempt((n) => n + 1)}>
            {t('tryAgain')}
          </button>
        </div>
      ) : stats === null ? (
        <div className="mt-8">
          <ProfileSkeleton />
        </div>
      ) : (
        <StatsSection stats={stats} canPlay />
      )}

      <MatchHistory onUnauthorized={onUnauthorized} />
    </>
  );
}

export default function ProfilePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-8 sm:py-12">
        <ProfileContent />
      </main>
      <SiteFooter />
    </div>
  );
}
