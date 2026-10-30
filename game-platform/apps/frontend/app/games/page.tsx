'use client';

import { useState } from 'react';
import { Search, Timer, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n/I18nProvider';
import { homeMessages } from '../i18n/messages/home';
import { GAMES, gamePath } from '../lib/games';
import { useGameTitle } from '../lib/useGameTitle';
import { useGuestPlay } from '../lib/useGuestPlay';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';
import Loading from '../components/ui/Loading';

export default function GamesPage() {
  const t = useT(homeMessages);
  const { title, subtitle } = useGameTitle();
  const { isPending } = useAuth();
  const { play, loading, error } = useGuestPlay();
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.toLowerCase();
  const filteredGames = GAMES.filter(
    (game) =>
      title(game.id).toLowerCase().includes(query) ||
      (subtitle(game.id) ?? '').toLowerCase().includes(query) ||
      t(game.description).toLowerCase().includes(query) ||
      game.tags.some((tag) => t(tag).toLowerCase().includes(query))
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-8 sm:py-12">
        {isPending ? (
          <Loading />
        ) : (
          <>
            <h1 className="title-lg">{t('gamesHeading')}</h1>
            <p className="mt-2 max-w-xl text-chalk">{t('gamesIntro')}</p>

            <div className="mt-6 max-w-md">
              <label htmlFor="game-search" className="field-label">
                {t('searchLabel')}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-chalk" aria-hidden="true" />
                <input
                  id="game-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
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
                      <h2 className="title-md mt-3">{title(game.id)}</h2>
                      {subtitle(game.id) && <p className="text-sm font-semibold text-ink-soft">{subtitle(game.id)}</p>}
                      <p className="mt-1 text-ink-soft">{t(game.description)}</p>
                      <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        {game.playersLabel ? t(game.playersLabel) : t('playersRange', { range: game.players })}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                        <Timer className="h-4 w-4" aria-hidden="true" />
                        {t('durationRange', { range: game.duration })}
                      </p>
                      <button
                        type="button"
                        onClick={() => play(gamePath(game))}
                        disabled={loading}
                        className="btn-gold mt-5 w-full"
                      >
                        {loading ? t('starting') : t('play')}
                      </button>
                    </article>
                  ) : (
                    <article className="card-back flex h-full min-h-[10rem] flex-col items-start justify-center rounded-card p-8">
                      <div className="rounded-lg bg-card p-3 text-ink">
                        <game.Icon className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <h2 className="title-md mt-3 text-white">{title(game.id)}</h2>
                      <span className="chip mt-2 bg-felt-deep">{t('comingSoon')}</span>
                    </article>
                  )}
                </li>
              ))}
            </ul>

            {filteredGames.length === 0 && (
              <div className="panel mt-8 max-w-xl p-6">
                <p>{t('noMatch', { query: searchQuery })}</p>
                <button type="button" onClick={() => setSearchQuery('')} className="btn-quiet btn-sm mt-4">
                  {t('clearSearch')}
                </button>
              </div>
            )}

            {filteredGames.length > 0 && <p className="mt-8 text-sm text-chalk">{t('moreOnWay')}</p>}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
