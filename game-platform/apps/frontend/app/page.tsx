'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './contexts/AuthContext';
import Link from 'next/link';
import { continueAsGuest } from './lib/auth-client';

export default function Home() {
  const router = useRouter();
  const { user, isPending, refreshSession } = useAuth();
  const [guestLoading, setGuestLoading] = useState(false);

  const handleGuestLogin = async () => {
    try {
      setGuestLoading(true);
      await continueAsGuest();
      await refreshSession();
      router.push('/games/joda-memory');
    } catch (error) {
      console.error('Failed to create guest user:', error);
    } finally {
      setGuestLoading(false);
    }
  };

  // Show loading state while checking auth
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute top-2 left-2 w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1s'}}></div>
          </div>
          <p className="text-gray-300 text-lg">Loading your experience...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show welcome page
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        {/* Navigation */}
        <nav className="fixed top-0 w-full bg-black/40 backdrop-blur-md border-b border-white/10 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-xl">
                  J
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  Jodafun
                </span>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="/login"
                  className="px-6 py-2 text-gray-300 hover:text-white transition font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg font-semibold hover:from-purple-500 hover:to-blue-500 transition shadow-lg hover:shadow-purple-500/50"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="pt-32 pb-20 px-6">
          <div className="container mx-auto">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h1 className="text-7xl font-black mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent leading-tight">
                Play Without Limits
              </h1>
              <p className="text-2xl text-gray-300 mb-8 leading-relaxed">
                Jump into multiplayer games instantly. No downloads, no barriers, just pure fun.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleGuestLogin}
                  disabled={guestLoading}
                  className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold text-lg hover:from-purple-500 hover:to-blue-500 transition shadow-2xl hover:shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {guestLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Play as Guest
                      </>
                    )}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
                <Link
                  href="/signup"
                  className="px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl font-bold text-lg hover:bg-white/20 transition"
                >
                  Create Account
                </Link>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="grid md:grid-cols-3 gap-6 mt-20">
              <div className="group relative bg-gradient-to-br from-purple-900/50 to-blue-900/50 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-8 hover:border-purple-500/50 transition-all duration-300 hover:transform hover:scale-105">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-3 text-white">Instant Play</h3>
                <p className="text-gray-300 leading-relaxed">
                  No downloads or installations. Click and play in seconds, right in your browser.
                </p>
              </div>

              <div className="group relative bg-gradient-to-br from-blue-900/50 to-cyan-900/50 backdrop-blur-sm border border-blue-500/20 rounded-2xl p-8 hover:border-blue-500/50 transition-all duration-300 hover:transform hover:scale-105">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-3 text-white">Multiplayer</h3>
                <p className="text-gray-300 leading-relaxed">
                  Connect with friends and players worldwide in real-time multiplayer action.
                </p>
              </div>

              <div className="group relative bg-gradient-to-br from-pink-900/50 to-purple-900/50 backdrop-blur-sm border border-pink-500/20 rounded-2xl p-8 hover:border-pink-500/50 transition-all duration-300 hover:transform hover:scale-105">
                <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-purple-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-3 text-white">100% Free</h3>
                <p className="text-gray-300 leading-relaxed">
                  All games are completely free to play. No hidden costs, no surprises.
                </p>
              </div>
            </div>

            {/* Featured Game */}
            <div className="mt-32">
              <h2 className="text-4xl font-bold mb-8 text-center">
                <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  Featured Game
                </span>
              </h2>

              {/* Joda Memory - Main Featured Game */}
              <div className="max-w-4xl mx-auto">
                <div className="group relative bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-sm border-2 border-purple-500/30 rounded-3xl overflow-hidden hover:border-purple-500/60 transition-all duration-500 hover:transform hover:scale-[1.02] shadow-2xl hover:shadow-purple-500/30">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-colors"></div>
                  <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-colors"></div>

                  <div className="relative z-10 p-12">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                      {/* Game Preview */}
                      <div className="relative">
                        <div className="aspect-square bg-gradient-to-br from-purple-600/20 to-blue-600/20 rounded-2xl flex items-center justify-center border border-purple-500/30 group-hover:border-purple-500/50 transition-colors overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10"></div>
                          <div className="relative text-9xl">🧠</div>
                          <div className="absolute top-4 right-4 px-4 py-2 bg-green-500/90 backdrop-blur-sm rounded-full text-sm font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                            AVAILABLE NOW
                          </div>
                        </div>
                      </div>

                      {/* Game Info */}
                      <div>
                        <h3 className="text-5xl font-black mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                          Joda Memory
                        </h3>
                        <p className="text-xl text-gray-300 mb-6 leading-relaxed">
                          Test your memory skills in this engaging card-matching game! Flip cards, find matching pairs, and challenge yourself to complete the game in the fewest moves possible.
                        </p>

                        <div className="flex gap-3 mb-8">
                          <span className="px-4 py-2 bg-purple-500/20 border border-purple-500/40 rounded-full text-sm font-semibold text-purple-300">
                            🎯 Memory Game
                          </span>
                          <span className="px-4 py-2 bg-blue-500/20 border border-blue-500/40 rounded-full text-sm font-semibold text-blue-300">
                            👤 Single Player
                          </span>
                          <span className="px-4 py-2 bg-green-500/20 border border-green-500/40 rounded-full text-sm font-semibold text-green-300">
                            ⚡ Quick Game
                          </span>
                        </div>

                        <div className="space-y-3 mb-8">
                          <div className="flex items-center gap-3 text-gray-300">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Multiple difficulty levels</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-300">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Beautiful card animations</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-300">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Track your best scores</span>
                          </div>
                        </div>

                        <button
                          onClick={handleGuestLogin}
                          disabled={guestLoading}
                          className="w-full group/btn relative px-8 py-5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold text-xl hover:from-purple-500 hover:to-blue-500 transition shadow-2xl hover:shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                        >
                          <span className="relative z-10 flex items-center justify-center gap-3">
                            {guestLoading ? (
                              <>
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Starting Game...
                              </>
                            ) : (
                              <>
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Play Now
                              </>
                            )}
                          </span>
                          <div className="absolute inset-0 bg-gradient-to-r from-pink-600 to-purple-600 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* More Games Coming Soon */}
              <div className="mt-16 text-center">
                <p className="text-gray-400 text-lg mb-6">More exciting games coming soon!</p>
                <div className="flex gap-4 justify-center flex-wrap">
                  {['Classic Chess', 'Speed Checkers', 'Word Warriors', 'Trivia Master'].map((game, index) => (
                    <div
                      key={index}
                      className="px-6 py-3 bg-slate-800/30 backdrop-blur-sm border border-white/10 rounded-full text-gray-400 text-sm"
                    >
                      {game}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black/40 backdrop-blur-md">
          <div className="container mx-auto px-6 py-12">
            <div className="grid md:grid-cols-4 gap-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold">
                    J
                  </div>
                  <span className="text-xl font-bold">Jodafun</span>
                </div>
                <p className="text-gray-400 text-sm">
                  The ultimate platform for instant multiplayer gaming.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-white">Platform</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><Link href="/games" className="hover:text-white transition">Games</Link></li>
                  <li><Link href="/leaderboard" className="hover:text-white transition">Leaderboard</Link></li>
                  <li><Link href="/about" className="hover:text-white transition">About</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-white">Support</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><Link href="/help" className="hover:text-white transition">Help Center</Link></li>
                  <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
                  <li><Link href="/faq" className="hover:text-white transition">FAQ</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-white">Legal</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><Link href="/privacy" className="hover:text-white transition">Privacy</Link></li>
                  <li><Link href="/terms" className="hover:text-white transition">Terms</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 mt-8 pt-8 text-center text-gray-400 text-sm">
              <p>&copy; 2026 Jodafun. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // User is authenticated - show dashboard
  const isGuest = user.email.includes('@guest.local');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-black/40 backdrop-blur-md border-b border-white/10 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-xl">
                  J
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  Jodafun
                </span>
              </Link>
              <div className="hidden md:flex gap-6">
                <Link href="/" className="text-white font-semibold hover:text-purple-400 transition">
                  Home
                </Link>
                <Link href="/games" className="text-gray-400 hover:text-white transition">
                  Games
                </Link>
                <Link href="/leaderboard" className="text-gray-400 hover:text-white transition">
                  Leaderboard
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium">{user.name}</span>
              </div>
              <button
                onClick={async () => {
                  await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/sign-out`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  router.push('/login');
                }}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-white/20 rounded-lg hover:bg-white/10 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard */}
      <div className="container mx-auto px-6 pt-32 pb-20">
        {/* Welcome Section */}
        <div className="relative bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-sm border border-purple-500/20 rounded-3xl p-10 mb-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-5xl font-black mb-3 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  Welcome back, {user.name}! 👋
                </h1>
                <p className="text-xl text-gray-300">
                  {isGuest
                    ? "You're playing as a guest. Create a permanent account to save your progress!"
                    : "Ready to dominate the leaderboards?"}
                </p>
              </div>
              {isGuest && (
                <button
                  onClick={() => router.push('/convert-account')}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold hover:from-purple-500 hover:to-blue-500 transition shadow-xl hover:shadow-purple-500/50"
                >
                  Create Account
                </button>
              )}
            </div>

            {/* User Stats */}
            <div className="grid md:grid-cols-4 gap-6">
              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-sm border border-blue-500/20 p-6 rounded-2xl hover:border-blue-500/40 transition">
                <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-2">Games Played</p>
                <p className="text-5xl font-black text-white">0</p>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm border border-green-500/20 p-6 rounded-2xl hover:border-green-500/40 transition">
                <p className="text-green-400 text-sm font-semibold uppercase tracking-wider mb-2">Wins</p>
                <p className="text-5xl font-black text-white">0</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-sm border border-purple-500/20 p-6 rounded-2xl hover:border-purple-500/40 transition">
                <p className="text-purple-400 text-sm font-semibold uppercase tracking-wider mb-2">Win Rate</p>
                <p className="text-5xl font-black text-white">0%</p>
              </div>
              <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 backdrop-blur-sm border border-orange-500/20 p-6 rounded-2xl hover:border-orange-500/40 transition">
                <p className="text-orange-400 text-sm font-semibold uppercase tracking-wider mb-2">Global Rank</p>
                <p className="text-5xl font-black text-white">-</p>
              </div>
            </div>
          </div>
        </div>

        {/* Featured Game - Joda Memory */}
        <div className="mb-8">
          <Link
            href="/games/joda-memory"
            className="group relative bg-gradient-to-br from-pink-600/20 via-purple-600/20 to-red-600/20 backdrop-blur-sm border-2 border-pink-500/40 rounded-3xl p-10 hover:border-pink-500/60 transition-all duration-300 hover:transform hover:scale-[1.02] overflow-hidden block"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl group-hover:bg-pink-500/30 transition-colors"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-colors"></div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="text-6xl">🎮</div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-4xl font-black text-white">Joda Memory</h3>
                      <span className="px-4 py-1.5 bg-green-500/20 border border-green-500/40 rounded-full text-sm font-bold text-green-300">
                        ⚡ Featured
                      </span>
                    </div>
                    <p className="text-xl text-gray-300">
                      Test your memory with this classic card matching game! 🎯
                    </p>
                  </div>
                </div>
                <button className="px-10 py-5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-2xl hover:from-pink-500 hover:to-purple-500 transition shadow-2xl hover:shadow-pink-500/50 group-hover:scale-110 transform">
                  Play Now →
                </button>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 text-gray-300">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-semibold">Beautiful card animations</span>
                </div>
                <div className="flex items-center gap-3 text-gray-300">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-semibold">Immersive sound effects</span>
                </div>
                <div className="flex items-center gap-3 text-gray-300">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-semibold">2-player gameplay</span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Link
            href="/games"
            className="group relative bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-8 hover:border-purple-500/50 transition-all duration-300 hover:transform hover:scale-105 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-colors"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold mb-3 text-white">Browse All Games</h3>
              <p className="text-gray-300 mb-6 leading-relaxed">
                Explore our growing collection of multiplayer games.
              </p>
              <span className="text-purple-400 font-semibold group-hover:text-purple-300 transition">
                See All Games →
              </span>
            </div>
          </Link>

          <button
            onClick={() => {
              // Copy platform URL to clipboard
              const platformUrl = window.location.origin;
              navigator.clipboard.writeText(platformUrl).then(() => {
                alert('Platform link copied to clipboard! Share it with your friends.');
              }).catch(() => {
                alert(`Share this link with your friends:\n${platformUrl}`);
              });
            }}
            className="group relative bg-gradient-to-br from-blue-900/30 to-cyan-900/30 backdrop-blur-sm border border-blue-500/20 rounded-2xl p-8 hover:border-blue-500/50 transition-all duration-300 hover:transform hover:scale-105 overflow-hidden text-left w-full"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-colors"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold mb-3 text-white">Invite Friends</h3>
              <p className="text-gray-300 mb-6 leading-relaxed">
                Challenge your friends to multiplayer matches.
              </p>
              <span className="text-blue-400 font-semibold group-hover:text-blue-300 transition">
                Send Invite →
              </span>
            </div>
          </button>
        </div>

        {/* Account Info */}
        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <h3 className="text-2xl font-bold mb-6 text-white">Account Information</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex justify-between items-center py-4 border-b border-white/10">
              <span className="text-gray-400 font-medium">Email</span>
              <span className="text-white font-semibold">
                {isGuest ? 'Guest Account' : user.email}
              </span>
            </div>
            <div className="flex justify-between items-center py-4 border-b border-white/10">
              <span className="text-gray-400 font-medium">Account Type</span>
              <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${
                isGuest
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-green-500/20 text-green-400 border border-green-500/30'
              }`}>
                {isGuest ? 'Guest' : 'Permanent'}
              </span>
            </div>
            <div className="flex justify-between items-center py-4 border-b border-white/10">
              <span className="text-gray-400 font-medium">Member Since</span>
              <span className="text-white font-semibold">
                {new Date(user.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>
            <div className="flex justify-between items-center py-4 border-b border-white/10">
              <span className="text-gray-400 font-medium">Email Verified</span>
              <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${
                user.emailVerified
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {user.emailVerified ? 'Verified' : 'Not Verified'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
