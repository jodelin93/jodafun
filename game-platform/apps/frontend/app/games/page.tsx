'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { Search, Clock, Users, Brain, Zap, Star } from 'lucide-react';

export default function GamesPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

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

  const games = [
    {
      id: 'joda-memory',
      title: 'Joda Memory',
      description: 'Test your memory skills in this engaging card-matching game! Flip cards, find matching pairs, and challenge yourself.',
      emoji: '🧠',
      difficulty: 'Easy to Hard',
      players: '1-2 Players',
      duration: '5-15 min',
      tags: ['Memory', 'Cards', 'Multiplayer'],
      available: true,
      featured: true,
    },
    {
      id: 'classic-chess',
      title: 'Classic Chess',
      description: 'Play the timeless game of strategy against friends or AI opponents.',
      emoji: '♟️',
      difficulty: 'Medium',
      players: '2 Players',
      duration: '15-60 min',
      tags: ['Strategy', 'Classic', 'Turn-based'],
      available: false,
      featured: false,
    },
    {
      id: 'speed-checkers',
      title: 'Speed Checkers',
      description: 'Fast-paced checkers with timed turns. Think quick and move faster!',
      emoji: '🎯',
      difficulty: 'Easy',
      players: '2 Players',
      duration: '10-20 min',
      tags: ['Strategy', 'Fast-paced', 'Classic'],
      available: false,
      featured: false,
    },
    {
      id: 'word-warriors',
      title: 'Word Warriors',
      description: 'Battle with words! Create the best words to defeat your opponents.',
      emoji: '📝',
      difficulty: 'Medium',
      players: '2-4 Players',
      duration: '10-20 min',
      tags: ['Word Game', 'Multiplayer', 'Puzzle'],
      available: false,
      featured: false,
    },
    {
      id: 'trivia-master',
      title: 'Trivia Master',
      description: 'Test your knowledge across various categories. How much do you really know?',
      emoji: '🎓',
      difficulty: 'Easy to Hard',
      players: '1-8 Players',
      duration: '10-30 min',
      tags: ['Trivia', 'Knowledge', 'Multiplayer'],
      available: false,
      featured: false,
    },
    {
      id: 'color-match',
      title: 'Color Match',
      description: 'Match colors in this fast-paced reflex game. Speed and accuracy are key!',
      emoji: '🎨',
      difficulty: 'Easy',
      players: '1-4 Players',
      duration: '3-10 min',
      tags: ['Reflex', 'Quick Game', 'Casual'],
      available: false,
      featured: false,
    },
  ];

  const filteredGames = games.filter(game =>
    game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    game.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    game.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleGameClick = (game: typeof games[0]) => {
    if (game.available) {
      router.push(`/games/${game.id}`);
    }
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
                <Link href="/games" className="text-white font-semibold hover:text-purple-400 transition">
                  Games
                </Link>
                {user && (
                  <Link href="/leaderboard" className="text-gray-400 hover:text-white transition">
                    Leaderboard
                  </Link>
                )}
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
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
            All Games
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Choose from our growing collection of multiplayer games. More games added regularly!
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-12">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search games by name, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 transition"
            />
          </div>
        </div>

        {/* Games Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => (
            <div
              key={game.id}
              onClick={() => handleGameClick(game)}
              className={`group relative bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-sm border-2 ${
                game.available
                  ? 'border-purple-500/40 hover:border-purple-500/60 cursor-pointer'
                  : 'border-white/10 cursor-not-allowed opacity-75'
              } rounded-2xl p-8 transition-all duration-300 ${
                game.available ? 'hover:transform hover:scale-105' : ''
              } overflow-hidden`}
            >
              {/* Featured Badge */}
              {game.featured && (
                <div className="absolute top-4 right-4 px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full text-xs font-bold text-yellow-300 flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Featured
                </div>
              )}

              {/* Coming Soon Badge */}
              {!game.available && (
                <div className="absolute top-4 right-4 px-3 py-1.5 bg-gray-500/20 border border-gray-500/40 rounded-full text-xs font-bold text-gray-300">
                  Coming Soon
                </div>
              )}

              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-colors"></div>

              <div className="relative z-10">
                {/* Game Icon */}
                <div className="text-7xl mb-6">{game.emoji}</div>

                {/* Game Title */}
                <h3 className="text-3xl font-bold mb-3 text-white">{game.title}</h3>

                {/* Game Description */}
                <p className="text-gray-300 mb-6 leading-relaxed min-h-[4rem]">
                  {game.description}
                </p>

                {/* Game Info */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-gray-300 text-sm">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span>{game.difficulty}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300 text-sm">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>{game.players}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300 text-sm">
                    <Clock className="w-4 h-4 text-green-400" />
                    <span>{game.duration}</span>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {game.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-xs font-semibold text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Play Button */}
                {game.available ? (
                  <button className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold hover:from-purple-500 hover:to-blue-500 transition shadow-xl hover:shadow-purple-500/50 flex items-center justify-center gap-2">
                    <Zap className="w-5 h-5" />
                    Play Now
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full px-6 py-3 bg-white/10 border border-white/20 rounded-xl font-bold text-gray-400 cursor-not-allowed"
                  >
                    Coming Soon
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {filteredGames.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold mb-2 text-white">No games found</h3>
            <p className="text-gray-400">Try adjusting your search query</p>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-20 max-w-4xl mx-auto bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-10">
          <h2 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            More Games Coming Soon!
          </h2>
          <p className="text-gray-300 text-center leading-relaxed mb-6">
            We're constantly working on bringing you more exciting multiplayer games.
            Check back regularly to discover new games, or sign up to get notified when we launch new content!
          </p>
          {!user && (
            <div className="flex gap-4 justify-center">
              <Link
                href="/signup"
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold hover:from-purple-500 hover:to-blue-500 transition shadow-xl hover:shadow-purple-500/50"
              >
                Create Account
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
