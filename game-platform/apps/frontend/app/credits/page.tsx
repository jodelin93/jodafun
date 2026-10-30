'use client';

import { useT } from '../i18n/I18nProvider';
import { siteMessages } from '../i18n/messages/site';
import { CARD_PHOTOS } from '../lib/cardPhotos';
import SiteHeader from '../components/ui/SiteHeader';
import SiteFooter from '../components/ui/SiteFooter';

// Credit for every card photo, as their Creative Commons licenses ask
export default function CreditsPage() {
  const t = useT(siteMessages);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page flex-1 py-8 sm:py-12">
        <h1 className="title-lg">{t('creditsTitle')}</h1>
        <p className="mt-2 max-w-xl text-chalk">{t('creditsIntro')}</p>
        <ul className="panel mt-8 divide-y divide-table-rim overflow-hidden">
          {CARD_PHOTOS.map(photo => (
            <li key={photo.name} className="flex items-center gap-4 px-4 py-3 sm:px-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/cards/forest/${photo.name}.webp`}
                alt=""
                loading="lazy"
                className="h-14 w-[42px] shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0">
                <p className="font-semibold">{photo.animal}</p>
                <p className="break-words text-sm text-chalk">
                  <a href={photo.source} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    {t('creditsBy', { author: photo.author })}
                  </a>
                  {`, ${photo.license}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
