'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfile, formatDate, NotFoundError, type PublicProfile } from '../../lib/users';
import SiteHeader from '../../components/ui/SiteHeader';
import SiteFooter from '../../components/ui/SiteFooter';
import StatsSection from '../../components/profile/StatsSection';
import ProfileSkeleton from '../../components/profile/ProfileSkeleton';

function PublicProfileContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, isPending } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const isMe = !isPending && !!user && user.id === id;

  useEffect(() => {
    if (isMe) router.replace('/profile');
  }, [isMe, router]);

  useEffect(() => {
    if (isPending || isMe) return;
    const controller = new AbortController();
    setProfile(null);
    setFailed(false);
    setNotFound(false);
    fetchProfile(id, controller.signal)
      .then(setProfile)
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof NotFoundError) return setNotFound(true);
        console.error('Failed to load profile:', err);
        setFailed(true);
      });
    return () => controller.abort();
  }, [id, isPending, isMe, attempt]);

  const back = (
    <Link href="/leaderboard" className="btn-quiet btn-sm mt-8">
      Back to leaderboard
    </Link>
  );

  if (notFound) {
    return (
      <div className="panel max-w-xl p-5 sm:p-6" role="alert">
        <h1 className="title-md">Player not found</h1>
        <p className="mt-2 text-chalk">We couldn&apos;t find this player. Check the link or head back to the leaderboard.</p>
        {back}
      </div>
    );
  }
  if (failed) {
    return (
      <div className="panel max-w-xl p-5 sm:p-6" role="alert">
        <p className="text-chalk">Couldn&apos;t load this profile. Check your connection and try again.</p>
        <button type="button" className="btn-quiet mt-4" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (!profile) return <ProfileSkeleton />;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="title-lg break-words">{profile.name}</h1>
        {profile.isGuest && <span className="chip">Guest</span>}
      </div>
      <p className="mt-2 text-chalk">Member since {formatDate(profile.memberSince)}</p>
      <StatsSection stats={profile.stats} canPlay={false} />
      <div>{back}</div>
    </>
  );
}

export default function PublicProfilePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-8 sm:py-12">
        <PublicProfileContent />
      </main>
      <SiteFooter />
    </div>
  );
}
