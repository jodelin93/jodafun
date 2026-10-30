'use client';

import Link from 'next/link';
import Logo from './Logo';
import { useT } from '../../i18n/I18nProvider';
import { siteMessages } from '../../i18n/messages/site';

export default function SiteFooter() {
  const t = useT(siteMessages);
  return (
    <footer className="mt-24 border-t border-white/10 bg-felt-deep">
      <div className="page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Logo size="sm" />
          <p className="text-sm text-chalk">{t('footerTagline')}</p>
        </div>
        <nav aria-label={t('footerNav')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/games" className="text-chalk hover:text-white">{t('navGames')}</Link>
          <Link href="/leaderboard" className="text-chalk hover:text-white">{t('navLeaderboard')}</Link>
          <Link href="/credits" className="text-chalk hover:text-white">{t('footerCredits')}</Link>
        </nav>
      </div>
      <div className="page border-t border-white/5 py-5 text-xs text-chalk/70">
        © {new Date().getFullYear()} Joda Fun
      </div>
    </footer>
  );
}
