'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient, continueAsGuest } from '../lib/auth-client';
import SiteHeader from '../components/ui/SiteHeader';
import PlayingCard from '../components/ui/PlayingCard';
import { AlertCircle, Brain } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Couldn't sign in. Check your email and password.");
      } else {
        // Redirect to home or dashboard
        router.push('/');
      }
    } catch (err) {
      setError('Something went wrong. Try again in a moment.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestContinue = async () => {
    setError('');
    setGuestLoading(true);

    try {
      await continueAsGuest();
      router.push('/');
    } catch (err) {
      setError("Couldn't start a guest session. Check your connection and try again.");
      console.error('Guest login error:', err);
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <>
      <SiteHeader />
      <main className="page py-8 sm:py-12">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="panel mx-auto w-full max-w-md p-6 sm:p-8 lg:mx-0">
            <h1 className="title-lg">Sign in</h1>
            <p className="mt-2 text-chalk">Pick up where you left off.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {error && (
                <div role="alert" className="flex items-start gap-3 rounded-xl bg-signal/10 px-4 py-3 text-white ring-1 ring-inset ring-signal">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-signal" aria-hidden="true" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="field-label">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="field-label">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                  placeholder="Your password"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-gold w-full">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-chalk">
              New here?{' '}
              <Link href="/signup" className="font-semibold text-white underline underline-offset-4 hover:text-gold">
                Create an account
              </Link>
            </p>
          <div className="mt-6 border-t border-table-rim pt-6">
            <button
              type="button"
              onClick={handleGuestContinue}
              disabled={guestLoading || loading}
              className="btn-quiet w-full"
            >
              {guestLoading ? 'Setting up your guest account…' : 'Play as a guest'}
            </button>
          </div>
          </div>

          <aside className="hidden lg:block" aria-hidden="true">
            <div className="relative mx-auto h-72 w-80">
              <PlayingCard faceUp={false} className="absolute left-2 top-8 h-56 w-40 -rotate-12" />
              <PlayingCard faceUp={false} className="absolute right-2 top-8 h-56 w-40 rotate-12" />
              <PlayingCard faceUp className="absolute left-1/2 top-2 h-56 w-40 -translate-x-1/2">
                <div className="flex h-full items-center justify-center">
                  <Brain className="h-16 w-16 text-ink" strokeWidth={1.5} />
                </div>
              </PlayingCard>
            </div>
            <p className="mx-auto mt-6 max-w-xs text-center text-chalk">Your scores and recent games are waiting at the table.</p>
          </aside>
        </div>
      </main>
    </>
  );
}
