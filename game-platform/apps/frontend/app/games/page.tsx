'use client';

import { useState } from 'react';
import { Search, Timer, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GAMES, gamePath } from '../lib/games';
import { useGuestPlay } from '../lib/useGuestPlay';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import Loading from '../components/ui/Loading';

export default function GamesPage() {
  const { isPending } = useAuth();
  const { play, loading, error } = useGuestPlay();
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.toLowerCase();
  const filteredGames = GAMES.filter(
    (game) =>
      game.title.toLowerCase().includes(query) ||
      game.description.toLowerCase().includes(query) ||
      game.tags.some((tag) => tag.toLowerCase().includes(query))
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-8 sm:py-12">
        {isPending ? (
          <Loading />
        ) : (
          <>
            <h1 className="title-lg">Games</h1>
            <p className="mt-2 max-w-xl text-chalk">Pick a game and play on your own or send a friend a link.</p>

            <div className="mt-6 max-w-md">
              <label htmlFor="game-search" className="field-label">
                Search games
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-chalk" aria-hidden="true" />
                <input
                  id="game-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name or type of game"
                  className="field pl-12"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-chalk">
                {error}
              </p>
            )}

            <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGames.map((game) => (
                <li key={game.id}>
                  {game.available ? (
                    <article className="flex h-full flex-col rounded-card bg-card p-5 text-ink shadow-rest ring-1 ring-black/5">
                      <game.Icon className="h-8 w-8" aria-hidden="true" />
                      <h2 className="title-md mt-3">{game.title}</h2>
                      <p className="mt-1 text-ink-soft">{game.description}</p>
                      <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        {game.players}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                        <Timer className="h-4 w-4" aria-hidden="true" />
                        {game.duration}
                      </p>
                      <button
                        type="button"
                        onClick={() => play(gamePath(game))}
                        disabled={loading}
                        className="btn-gold mt-5 w-full"
                      >
                        {loading ? 'Starting…' : 'Play'}
                      </button>
                    </article>
                  ) : (
                    <article className="card-back flex h-full min-h-[10rem] flex-col items-start justify-center rounded-card p-8">
                      <div className="rounded-lg bg-card p-3 text-ink">
                        <game.Icon className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <h2 className="title-md mt-3 text-white">{game.title}</h2>
                      <span className="chip mt-2 bg-felt-deep">Coming soon</span>
                    </article>
                  )}
                </li>
              ))}
            </ul>

            {filteredGames.length === 0 && (
              <div className="panel mt-8 max-w-xl p-6">
                <p>No games match &ldquo;{searchQuery}&rdquo;. Try a different name or clear the search.</p>
                <button type="button" onClick={() => setSearchQuery('')} className="btn-quiet btn-sm mt-4">
                  Clear search
                </button>
              </div>
            )}

            {filteredGames.length > 0 && <p className="mt-8 text-sm text-chalk">More games are on the way.</p>}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
