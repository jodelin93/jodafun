'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { continueAsGuest } from './auth-client';

// Sends a player into a game, creating a guest account first if they aren't signed in
export function useGuestPlay() {
  const router = useRouter();
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
      setError("Couldn't start a guest session. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return { play, loading, error };
}
