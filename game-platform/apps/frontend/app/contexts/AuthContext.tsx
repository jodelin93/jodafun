'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Session {
  user: User;
  session: {
    token: string;
    expiresAt: Date;
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isPending: boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isPending, setIsPending] = useState(true);

  const fetchSession = async () => {
    try {
      setIsPending(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/get-session`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setSession(data);
      } else {
        setSession(null);
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setSession(null);
    } finally {
      setIsPending(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const value: AuthContextType = {
    user: session?.user || null,
    session,
    isPending,
    refreshSession: fetchSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
