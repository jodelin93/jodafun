import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
});

// Export Better Auth hooks for convenience
export const { useSession, signIn, signOut, signUp } = authClient;

// Guest authentication function
export async function continueAsGuest() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/guest`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to create guest user');
  }

  return await response.json();
}
