'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play, Users, Timer, Link2, Check } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { useLocale, useT } from './i18n/I18nProvider';
import { homeMessages } from './i18n/messages/home';
import { useGuestPlay } from './lib/useGuestPlay';
import { GAMES, gamePath, type Game } from './lib/games';
import { useGameTitle } from './lib/useGameTitle';
import SiteHeader from './components/ui/SiteHeader';
import SiteFooter from './components/ui/SiteFooter';
import PlayingCard from './components/ui/PlayingCard';
import Loading from './components/ui/Loading';

const featured = GAMES.find((g) => g.available) ?? GAMES[0]!;
const comingSoon = GAMES.filter((g) => !g.available);

// Left two, featured in the middle, right two
const HAND: Game[] = [comingSoon[0], comingSoon[1], featured, comingSoon[2], comingSoon[3]].filter(
  (g): g is Game => Boolean(g),
);
const FAN_ANGLES = [-22, -11, 0, 11, 22];

export default function Home() {
  const { user, isPending } = useAuth();
  const { play, loading, error } = useGuestPlay();

  if (isPending) {
    return (
      <>
        <SiteHeader />
        <Loading />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main>
        {user ? (
          <Dashboard onPlay={() => play(gamePath(featured))} loading={loading} />
        ) : (
          <Hero onPlay={() => play(gamePath(featured))} loading={loading} error={error} />
        )}
        <GamesRow onPlay={(game) => play(gamePath(game))} />
        <PlayWithFriend onPlay={() => play(gamePath(featured))} loading={loading} />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero({ onPlay, loading, error }: { onPlay: () => void; loading: boolean; error: string | null }) {
  const t = useT(homeMessages);
  const { title } = useGameTitle();
  return (
    <section className="page grid items-center gap-10 pb-8 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pb-16">
      <div className="max-w-xl">
        <h1 className="title-xl">{t('heroTitle')}</h1>
        <p className="mt-5 text-lg leading-relaxed text-chalk">
          {t('heroBody')}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button onClick={onPlay} disabled={loading} className="btn-gold px-6 py-3.5 text-lg">
            <Play className="h-5 w-5 fill-current" aria-hidden="true" />
            {loading ? t('starting') : t('playGame', { title: title(featured.id) })}
          </button>
          <Link href="/signup" className="btn-quiet px-6 py-3.5 text-lg">
            {t('createAccount')}
          </Link>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-signal">
            {error}
          </p>
        )}
      </div>

      <FanHand onPlay={onPlay} />
    </section>
  );
}

function FanHand({ onPlay }: { onPlay: () => void }) {
  const t = useT(homeMessages);
  const { title } = useGameTitle();
  return (
    <div className="relative mx-auto h-[240px] w-full max-w-[460px] sm:h-[330px]">
      {HAND.map((game, i) => {
        const angle = FAN_ANGLES[i] ?? 0;
        const isFeatured = game.id === featured.id;
        return (
          <div
            key={game.id}
            className="deal-in group absolute bottom-0 left-1/2 -ml-[58px] h-[164px] w-[116px] origin-[50%_140%] sm:-ml-[78px] sm:h-[220px] sm:w-[156px]"
            style={
              {
                transform: `rotate(${angle}deg)`,
                zIndex: isFeatured ? 10 : i,
                '--i': i,
                '--deal-x': `${-angle * 4}px`,
              } as React.CSSProperties
            }
          >
            <div className="h-full w-full transition-transform duration-200 group-hover:-translate-y-4">
              {isFeatured ? (
                <button
                  onClick={onPlay}
                  aria-label={t('playGame', { title: title(game.id) })}
                  className="h-full w-full rounded-card text-left shadow-lift"
                >
                  <PlayingCard className="h-full w-full">
                    <CardFace game={game} cta />
                  </PlayingCard>
                </button>
              ) : (
                <PlayingCard faceUp={false} revealOnHover className="h-full w-full">
                  <CardFace game={game} />
                </PlayingCard>
              )}
            </div>
            {!isFeatured && <span className="sr-only">{t('comingSoonSr', { title: title(game.id) })}</span>}
          </div>
        );
      })}
    </div>
  );
}

function CardFace({ game, cta }: { game: Game; cta?: boolean }) {
  const t = useT(homeMessages);
  const { title } = useGameTitle();
  const Icon = game.Icon;
  // Corner icons mirror the index marks on a real playing card
  return (
    <div className="relative flex h-full flex-col p-3 sm:p-4">
      <Icon className="h-4 w-4 text-signal sm:h-5 sm:w-5" aria-hidden="true" />
      <div className="flex flex-1 items-center justify-center">
        <Icon className="h-10 w-10 text-signal sm:h-14 sm:w-14" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="font-display text-sm font-extrabold leading-tight sm:text-lg">{title(game.id)}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{cta ? t('tapToPlay') : t('comingSoon')}</p>
      <Icon className="absolute bottom-3 right-3 h-4 w-4 rotate-180 text-signal sm:bottom-4 sm:right-4 sm:h-5 sm:w-5" aria-hidden="true" />
    </div>
  );
}

function Dashboard({ onPlay, loading }: { onPlay: () => void; loading: boolean }) {
  const t = useT(homeMessages);
  const { title } = useGameTitle();
  const { intlLocale } = useLocale();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!user) return null;

  const isGuest = user.email.includes('@guest.local');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('copyLinkPrompt'), window.location.origin);
    }
  };

  return (
    <section className="page pt-10 sm:pt-14">
      <h1 className="title-lg">{t('welcomeBack', { name: user.name })}</h1>

      {isGuest && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-felt-deep p-4 ring-1 ring-inset ring-gold/40 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-chalk">
            {t('guestNotice')}
          </p>
          <Link href="/convert-account" className="btn-quiet btn-sm shrink-0">
            {t('createAccountShort')}
          </Link>
        </div>
      )}

      <div className="panel mt-6 grid gap-6 p-5 sm:p-8 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
        <div className="relative mx-auto h-[150px] w-[190px] sm:h-[180px] sm:w-[230px]" aria-hidden="true">
          <PlayingCard faceUp={false} className="absolute left-0 top-4 h-[130px] w-[94px] -rotate-12 sm:h-[160px] sm:w-[114px]" />
          <PlayingCard className="absolute right-0 top-0 h-[130px] w-[94px] rotate-6 sm:h-[160px] sm:w-[114px]">
            <CardFace game={featured} />
          </PlayingCard>
        </div>
        <div>
          <h2 className="title-lg">{title(featured.id)}</h2>
          <p className="mt-2 max-w-prose text-chalk">{t(featured.description)}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            <li className="chip"><Users className="h-4 w-4" aria-hidden="true" />{featured.playersLabel ? t(featured.playersLabel) : t('playersRange', { range: featured.players })}</li>
            <li className="chip"><Timer className="h-4 w-4" aria-hidden="true" />{t('durationRange', { range: featured.duration })}</li>
          </ul>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button onClick={onPlay} disabled={loading} className="btn-gold px-6">
              <Play className="h-5 w-5 fill-current" aria-hidden="true" />
              {loading ? t('starting') : t('playGame', { title: title(featured.id) })}
            </button>
            <button onClick={copyLink} className="btn-quiet">
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
              {copied ? t('linkCopied') : t('copyLink')}
            </button>
            <span className="sr-only" aria-live="polite">{copied ? t('linkCopied') : ''}</span>
          </div>
        </div>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 rounded-2xl p-5 ring-1 ring-inset ring-white/10 sm:grid-cols-2">
        <AccountRow label={t('accEmail')} value={isGuest ? t('accGuestAccount') : user.email} />
        <AccountRow label={t('accType')} value={isGuest ? t('accGuest') : t('accMember')} />
        <AccountRow
          label={t('accSince')}
          value={new Date(user.createdAt).toLocaleDateString(intlLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
        />
        <AccountRow label={t('accVerified')} value={user.emailVerified ? t('yes') : t('notYet')} />
      </dl>
    </section>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-3">
      <dt className="text-sm text-chalk">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function GamesRow({ onPlay }: { onPlay: (game: Game) => void }) {
  const t = useT(homeMessages);
  const { title } = useGameTitle();
  return (
    <section className="page mt-16" aria-labelledby="games-heading">
      <div className="flex items-end justify-between gap-4">
        <h2 id="games-heading" className="title-lg">{t('gamesHeading')}</h2>
        <Link href="/games" className="text-sm font-semibold text-gold hover:underline">
          {t('seeAll')}
        </Link>
      </div>
      {/* Phones: a swipeable row where the next card peeks in; larger screens: a grid */}
      <ul className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {GAMES.map((game) => (
          <li key={game.id} className="w-[42%] shrink-0 snap-start sm:w-auto">
            {game.available ? (
              <button
                onClick={() => onPlay(game)}
                className="group block aspect-[3/4] w-full rounded-card text-left"
                aria-label={t('playGame', { title: title(game.id) })}
              >
                <PlayingCard className="h-full w-full transition-transform duration-200 group-hover:-translate-y-1">
                  <div className="flex h-full flex-col p-4">
                    <game.Icon className="h-9 w-9 text-signal" strokeWidth={1.75} aria-hidden="true" />
                    <p className="mt-auto font-display text-lg font-extrabold leading-tight">{title(game.id)}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {game.playersLabel ? t(game.playersLabel) : t('playersRange', { range: game.players })}
                    </p>
                    <span className="btn-gold btn-sm mt-3 w-full">{t('play')}</span>
                  </div>
                </PlayingCard>
              </button>
            ) : (
              <div className="aspect-[3/4] w-full">
                <PlayingCard
                  faceUp={false}
                  className="h-full w-full"
                  back={
                    <div className="flex h-full flex-col justify-end p-3">
                      <div className="rounded-lg bg-felt-deep/90 px-3 py-2">
                        <p className="font-display font-bold leading-tight text-white">{title(game.id)}</p>
                        <p className="text-xs text-chalk">{t('comingSoon')}</p>
                      </div>
                    </div>
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlayWithFriend({ onPlay, loading }: { onPlay: () => void; loading: boolean }) {
  const t = useT(homeMessages);
  const { title } = useGameTitle();
  const steps = [
    { title: t('step1Title'), body: t('step1Body', { title: title(featured.id) }) },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
  ];
  return (
    <section className="page mt-16" aria-labelledby="friend-heading">
      <div className="panel grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_2fr] lg:items-start">
        <div>
          <h2 id="friend-heading" className="title-lg">{t('friendTitle')}</h2>
          <p className="mt-3 text-chalk">{t('friendBody')}</p>
          <button onClick={onPlay} disabled={loading} className="btn-gold mt-6">
            {loading ? t('starting') : t('startGame')}
          </button>
        </div>
        <ol className="grid gap-5 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-4 sm:block">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold font-display text-lg font-extrabold text-ink"
                style={{ boxShadow: '0 3px 0 #B9800A' }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="title-md sm:mt-4">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-chalk">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
