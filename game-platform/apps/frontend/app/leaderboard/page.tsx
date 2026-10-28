'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Medal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import Loading from '../components/ui/Loading';

const MEDAL_RING = {
  1: 'ring-[#FFC23D]',
  2: 'ring-[#C9D1D3]',
  3: 'ring-[#D08A52]',
} as const;

const MEDAL_ICON = {
  1: 'text-[#B9800A]',
  2: 'text-[#6B7678]',
  3: 'text-[#A8602B]',
} as const;

const MEDAL_NAME = { 1: '1st place', 2: '2nd place', 3: '3rd place' } as const;

export default function LeaderboardPage() {
  const { user, isPending } = useAuth();
  const [selectedGame, setSelectedGame] = useState('all');
  const [timeFrame, setTimeFrame] = useState<'daily' | 'weekly' | 'monthly' | 'all-time'>('all-time');

  // Mock leaderboard data - will be replaced with real data from backend
  const mockLeaderboard = [
    {
      rank: 1,
      name: 'ProGamer2024',
      score: 15420,
      gamesPlayed: 234,
      winRate: 87.5,
      streak: 12,
    },
    {
      rank: 2,
      name: 'MemoryMaster',
      score: 14890,
      gamesPlayed: 198,
      winRate: 84.2,
      streak: 8,
    },
    {
      rank: 3,
      name: 'QuickThinker',
      score: 13560,
      gamesPlayed: 176,
      winRate: 81.8,
      streak: 15,
    },
    {
      rank: 4,
      name: 'CardShark',
      score: 12340,
      gamesPlayed: 165,
      winRate: 78.9,
      streak: 5,
    },
    {
      rank: 5,
      name: 'BrainBox',
      score: 11890,
      gamesPlayed: 153,
      winRate: 76.5,
      streak: 7,
    },
    {
      rank: 6,
      name: 'FlipMaster',
      score: 10920,
      gamesPlayed: 142,
      winRate: 74.1,
      streak: 3,
    },
    {
      rank: 7,
      name: 'ThinkFast',
      score: 10450,
      gamesPlayed: 138,
      winRate: 72.3,
      streak: 6,
    },
    {
      rank: 8,
      name: 'MemoryKing',
      score: 9870,
      gamesPlayed: 129,
      winRate: 70.5,
      streak: 4,
    },
    {
      rank: 9,
      name: 'CardNinja',
      score: 9340,
      gamesPlayed: 121,
      winRate: 68.2,
      streak: 2,
    },
    {
      rank: 10,
      name: 'PuzzlePro',
      score: 8920,
      gamesPlayed: 115,
      winRate: 66.7,
      streak: 5,
    },
  ];

  const games = [
    { id: 'all', name: 'All games' },
    { id: 'joda-memory', name: 'Joda Memory' },
  ];

  const podium = (rank: 1 | 2 | 3) => {
    const player = mockLeaderboard[rank - 1]!;
    return (
      <li
        key={rank}
        className={`flex flex-col items-center rounded-card bg-card p-5 text-center text-ink shadow-rest ring-4 ${MEDAL_RING[rank]} ${
          rank === 1 ? 'sm:order-2 sm:py-10' : rank === 2 ? 'sm:order-1' : 'sm:order-3'
        }`}
      >
        <Medal className={`h-8 w-8 ${MEDAL_ICON[rank]}`} aria-hidden="true" />
        <p className="mt-1 text-sm font-semibold text-ink-soft">{MEDAL_NAME[rank]}</p>
        <h3 className="title-md mt-2 break-words">{player.name}</h3>
        <p className="mt-2 font-display text-3xl font-extrabold">{player.score.toLocaleString()}</p>
        <p className="text-sm text-ink-soft">points</p>
        {rank === 1 && <p className="mt-3 text-sm text-ink-soft">{player.streak} win streak</p>}
      </li>
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-8 sm:py-12">
        {isPending ? (
          <Loading />
        ) : (
          <>
            <h1 className="title-lg">Leaderboard</h1>
            <p className="mt-2 max-w-xl text-chalk">
              Sample rankings for now. Real scores will show here once games save results.
            </p>

            <div className="panel mt-6 grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <label htmlFor="lb-game" className="field-label">
                  Game
                </label>
                <select
                  id="lb-game"
                  value={selectedGame}
                  onChange={(e) => setSelectedGame(e.target.value)}
                  className="field"
                >
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </div>
              <div role="group" aria-labelledby="lb-time">
                <span id="lb-time" className="field-label">
                  Time frame
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['daily', 'weekly', 'monthly', 'all-time'] as const).map((frame) => (
                    <button
                      key={frame}
                      type="button"
                      onClick={() => setTimeFrame(frame)}
                      aria-pressed={timeFrame === frame}
                      className={`btn btn-sm min-h-[44px] ring-1 ring-inset ${
                        timeFrame === frame
                          ? 'bg-white text-ink ring-white'
                          : 'bg-white/5 text-white ring-white/20 hover:bg-white/10'
                      }`}
                    >
                      {frame === 'all-time' ? 'All time' : frame.charAt(0).toUpperCase() + frame.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end" aria-label="Top three players">
              {podium(1)}
              {podium(2)}
              {podium(3)}
            </ol>

            <div className="panel mt-8 overflow-hidden">
              <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-table-rim px-4 py-3 text-sm text-chalk sm:grid-cols-[3rem_1fr_6rem_5rem_5rem_4rem] sm:px-5">
                <div>Rank</div>
                <div>Player</div>
                <div className="text-right">Score</div>
                <div className="hidden text-right sm:block">Games</div>
                <div className="hidden text-right sm:block">Win rate</div>
                <div className="hidden text-right sm:block">Streak</div>
              </div>
              <ul className="divide-y divide-table-rim">
                {mockLeaderboard.map((player) => {
                  const isYou = !!user && player.name === user.name;
                  return (
                    <li
                      key={player.rank}
                      className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[3rem_1fr_6rem_5rem_5rem_4rem] sm:px-5 ${
                        isYou ? 'bg-white/10' : ''
                      }`}
                    >
                      <div className="font-display text-lg font-bold">{player.rank}</div>
                      <div className="min-w-0">
                        <span className="break-words font-semibold">{player.name}</span>
                        {isYou && <span className="chip ml-2 px-2 py-0.5 text-xs">You</span>}
                        <p className="text-xs text-chalk sm:hidden">
                          {player.gamesPlayed} games, {player.winRate}% wins
                        </p>
                      </div>
                      <div className="text-right font-semibold">{player.score.toLocaleString()}</div>
                      <div className="hidden text-right sm:block">{player.gamesPlayed}</div>
                      <div className="hidden text-right sm:block">{player.winRate}%</div>
                      <div className="hidden text-right sm:block">{player.streak}</div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {!user && (
              <div className="panel mt-8 max-w-xl p-5 sm:p-6">
                <h2 className="title-md">Save your scores</h2>
                <p className="mt-2 text-chalk">Create an account to keep your results and show up here later.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/signup" className="btn-quiet">
                    Create account
                  </Link>
                  <Link href="/login" className="btn-quiet">
                    Sign in
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
