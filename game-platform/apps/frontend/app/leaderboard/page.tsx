'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { Trophy, Medal, Crown, TrendingUp, Filter, Calendar } from 'lucide-react';

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();
  const [selectedGame, setSelectedGame] = useState('all');
  const [timeFrame, setTimeFrame] = useState<'daily' | 'weekly' | 'monthly' | 'all-time'>('all-time');

  // Show loading state
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute top-2 left-2 w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1s'}}></div>
          </div>
          <p className="text-gray-300 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  // Mock leaderboard data - will be replaced with real data from backend
  const mockLeaderboard = [
    {
      rank: 1,
      name: 'ProGamer2024',
      score: 15420,
      gamesPlayed: 234,
      winRate: 87.5,
      streak: 12,
      avatar: '🏆',
    },
    {
      rank: 2,
      name: 'MemoryMaster',
      score: 14890,
      gamesPlayed: 198,
      winRate: 84.2,
      streak: 8,
      avatar: '🧠',
    },
    {
      rank: 3,
      name: 'QuickThinker',
      score: 13560,
      gamesPlayed: 176,
      winRate: 81.8,
      streak: 15,
      avatar: '⚡',
    },
    {
      rank: 4,
      name: 'CardShark',
      score: 12340,
      gamesPlayed: 165,
      winRate: 78.9,
      streak: 5,
      avatar: '🃏',
    },
    {
      rank: 5,
      name: 'BrainBox',
      score: 11890,
      gamesPlayed: 153,
      winRate: 76.5,
      streak: 7,
      avatar: '📚',
    },
    {
      rank: 6,
      name: 'FlipMaster',
      score: 10920,
      gamesPlayed: 142,
      winRate: 74.1,
      streak: 3,
      avatar: '🎯',
    },
    {
      rank: 7,
      name: 'ThinkFast',
      score: 10450,
      gamesPlayed: 138,
      winRate: 72.3,
      streak: 6,
      avatar: '💡',
    },
    {
      rank: 8,
      name: 'MemoryKing',
      score: 9870,
      gamesPlayed: 129,
      winRate: 70.5,
      streak: 4,
      avatar: '👑',
    },
    {
      rank: 9,
      name: 'CardNinja',
      score: 9340,
      gamesPlayed: 121,
      winRate: 68.2,
      streak: 2,
      avatar: '🥷',
    },
    {
      rank: 10,
      name: 'PuzzlePro',
      score: 8920,
      gamesPlayed: 115,
      winRate: 66.7,
      streak: 5,
      avatar: '🧩',
    },
  ];

  const games = [
    { id: 'all', name: 'All Games' },
    { id: 'joda-memory', name: 'Joda Memory' },
  ];

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/50">
          <Crown className="w-7 h-7 text-white" />
        </div>
      );
    } else if (rank === 2) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-gray-300 to-gray-500 rounded-full flex items-center justify-center shadow-lg shadow-gray-400/50">
          <Medal className="w-7 h-7 text-white" />
        </div>
      );
    } else if (rank === 3) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/50">
          <Medal className="w-7 h-7 text-white" />
        </div>
      );
    }
    return (
      <div className="w-12 h-12 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center text-xl font-bold text-white">
        {rank}
      </div>
    );
  };

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
                <Link href="/" className="text-gray-400 hover:text-white transition">
                  Home
                </Link>
                <Link href="/games" className="text-gray-400 hover:text-white transition">
                  Games
                </Link>
                <Link href="/leaderboard" className="text-white font-semibold hover:text-purple-400 transition">
                  Leaderboard
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <>
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
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-6 pt-32 pb-20">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Trophy className="w-12 h-12 text-yellow-400" />
            <h1 className="text-6xl font-black bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
              Leaderboard
            </h1>
            <Trophy className="w-12 h-12 text-yellow-400" />
          </div>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Compete with players worldwide and climb to the top!
          </p>
        </div>

        {/* Filters */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Game Filter */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
                  <Filter className="w-4 h-4" />
                  Game
                </label>
                <select
                  value={selectedGame}
                  onChange={(e) => setSelectedGame(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500 transition"
                >
                  {games.map((game) => (
                    <option key={game.id} value={game.id} className="bg-slate-800">
                      {game.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Frame Filter */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
                  <Calendar className="w-4 h-4" />
                  Time Frame
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['daily', 'weekly', 'monthly', 'all-time'] as const).map((frame) => (
                    <button
                      key={frame}
                      onClick={() => setTimeFrame(frame)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                        timeFrame === frame
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}
                    >
                      {frame === 'all-time' ? 'All Time' : frame.charAt(0).toUpperCase() + frame.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top 3 Podium */}
        <div className="max-w-5xl mx-auto mb-16">
          <div className="grid grid-cols-3 gap-6 items-end">
            {/* 2nd Place */}
            <div className="transform translate-y-8">
              <div className="bg-gradient-to-br from-gray-300/20 to-gray-500/20 backdrop-blur-sm border-2 border-gray-400/40 rounded-2xl p-6 text-center">
                <div className="flex justify-center mb-4">
                  {getRankBadge(2)}
                </div>
                <div className="text-4xl mb-3">{mockLeaderboard[1]!.avatar}</div>
                <h3 className="text-xl font-bold text-white mb-2">{mockLeaderboard[1]!.name}</h3>
                <div className="text-3xl font-black text-gray-300 mb-1">{mockLeaderboard[1]!.score.toLocaleString()}</div>
                <p className="text-sm text-gray-400">points</p>
              </div>
            </div>

            {/* 1st Place */}
            <div className="transform -translate-y-4">
              <div className="bg-gradient-to-br from-yellow-400/20 to-yellow-600/20 backdrop-blur-sm border-2 border-yellow-400/60 rounded-2xl p-8 text-center relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                  <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 px-4 py-2 rounded-full text-sm font-bold text-white shadow-lg shadow-yellow-500/50">
                    👑 CHAMPION
                  </div>
                </div>
                <div className="flex justify-center mb-4 mt-4">
                  {getRankBadge(1)}
                </div>
                <div className="text-5xl mb-4">{mockLeaderboard[0]!.avatar}</div>
                <h3 className="text-2xl font-bold text-white mb-3">{mockLeaderboard[0]!.name}</h3>
                <div className="text-4xl font-black text-yellow-300 mb-1">{mockLeaderboard[0]!.score.toLocaleString()}</div>
                <p className="text-sm text-gray-300">points</p>
                <div className="mt-4 pt-4 border-t border-yellow-400/30">
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-semibold">{mockLeaderboard[0]!.streak} win streak</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="transform translate-y-8">
              <div className="bg-gradient-to-br from-orange-400/20 to-orange-600/20 backdrop-blur-sm border-2 border-orange-400/40 rounded-2xl p-6 text-center">
                <div className="flex justify-center mb-4">
                  {getRankBadge(3)}
                </div>
                <div className="text-4xl mb-3">{mockLeaderboard[2]!.avatar}</div>
                <h3 className="text-xl font-bold text-white mb-2">{mockLeaderboard[2]!.name}</h3>
                <div className="text-3xl font-black text-orange-300 mb-1">{mockLeaderboard[2]!.score.toLocaleString()}</div>
                <p className="text-sm text-gray-400">points</p>
              </div>
            </div>
          </div>
        </div>

        {/* Full Leaderboard */}
        <div className="max-w-5xl mx-auto">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl overflow-hidden">
            {/* Table Header */}
            <div className="bg-white/5 border-b border-white/20 px-6 py-4">
              <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-300">
                <div className="col-span-1">Rank</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-2 text-center">Score</div>
                <div className="col-span-2 text-center">Games</div>
                <div className="col-span-2 text-center">Win Rate</div>
                <div className="col-span-1 text-center">Streak</div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-white/10">
              {mockLeaderboard.map((player, index) => (
                <div
                  key={player.rank}
                  className={`px-6 py-4 hover:bg-white/5 transition ${
                    user && player.name === user.name ? 'bg-purple-500/10' : ''
                  }`}
                >
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Rank */}
                    <div className="col-span-1">
                      {getRankBadge(player.rank)}
                    </div>

                    {/* Player */}
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="text-3xl">{player.avatar}</div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          {player.name}
                          {user && player.name === user.name && (
                            <span className="px-2 py-0.5 bg-purple-500/30 border border-purple-400/40 rounded text-xs text-purple-300">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="col-span-2 text-center">
                      <div className="text-xl font-bold text-white">{player.score.toLocaleString()}</div>
                      <div className="text-xs text-gray-400">points</div>
                    </div>

                    {/* Games Played */}
                    <div className="col-span-2 text-center">
                      <div className="text-lg font-semibold text-white">{player.gamesPlayed}</div>
                      <div className="text-xs text-gray-400">played</div>
                    </div>

                    {/* Win Rate */}
                    <div className="col-span-2 text-center">
                      <div className="text-lg font-semibold text-green-400">{player.winRate}%</div>
                      <div className="text-xs text-gray-400">win rate</div>
                    </div>

                    {/* Streak */}
                    <div className="col-span-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-lg font-bold text-orange-400">{player.streak}</span>
                        <span className="text-xs text-gray-400">🔥</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              Rankings update in real-time. Play more games to climb the leaderboard!
            </p>
          </div>
        </div>

        {/* CTA for non-logged-in users */}
        {!user && (
          <div className="mt-16 max-w-4xl mx-auto bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-10 text-center">
            <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Join the Competition!
            </h2>
            <p className="text-gray-300 mb-6 leading-relaxed">
              Sign up now to track your progress, compete on the leaderboard, and become a champion!
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/signup"
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold hover:from-purple-500 hover:to-blue-500 transition shadow-xl hover:shadow-purple-500/50"
              >
                Create Account
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl font-bold hover:bg-white/20 transition"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
