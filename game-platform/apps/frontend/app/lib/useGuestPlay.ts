'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { continueAsGuest } from './auth-client';
import { useT } from '../i18n/I18nProvider';
import { siteMessages } from '../i18n/messages/site';

// Sends a player into a game, creating a guest account first if they aren't signed in
export function useGuestPlay() {
  const router = useRouter();
  const t = useT(siteMessages);
  const { user, refreshSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const play = async (destination = '/games/joda-memory') => {
    if (user) {
      router.push(destination);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await continueAsGuest();
      await refreshSession();
      router.push(destination);
    } catch (err) {
      console.error('Failed to create guest user:', err);
      setError(t('guestError'));
    } finally {
      setLoading(false);
    }
  };

  return { play, loading, error };
}
