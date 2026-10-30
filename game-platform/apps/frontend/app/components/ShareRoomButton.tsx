'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Mail, MessageCircle, MessageSquareText, Share2 } from 'lucide-react';
import { useT } from '../i18n/I18nProvider';
import { shareMessages } from '../i18n/messages/share';
import type { PlayableGameId } from '../lib/games';
import { useGameTitle } from '../lib/useGameTitle';

type Props = { url: string; code: string; onCopy: () => void; game?: PlayableGameId };

// Phones get the system share sheet (WhatsApp, Messages, Messenger, ...); browsers without one get a small menu
export default function ShareRoomButton({ url, code, onCopy, game = 'joda-memory' }: Props) {
  const t = useT(shareMessages);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const title = useGameTitle().title(game);
  const text = t('inviteText', { code, game: title });
  const message = encodeURIComponent(`${text} ${url}`);

  // Close the menu on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // The player closed the share sheet; nothing to do
      }
      return;
    }
    setOpen((value) => !value);
  };

  const itemClass = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-white hover:bg-white/10';

  return (
    <div ref={wrapperRef} className="relative">
      <button type="button" onClick={share} className="btn-gold btn-sm min-h-11" aria-haspopup="menu" aria-expanded={open}>
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {t('share')}
      </button>
      {open && (
        <div role="menu" aria-label={t('shareOptions')} className="panel absolute right-0 z-30 mt-2 w-56 p-1.5 shadow-lift">
          <a role="menuitem" href={`https://wa.me/?text=${message}`} target="_blank" rel="noopener noreferrer" className={itemClass} onClick={() => setOpen(false)}>
            <MessageCircle className="h-4 w-4 text-gold" aria-hidden="true" />
            {t('whatsapp')}
          </a>
          <a role="menuitem" href={`sms:?&body=${message}`} className={itemClass} onClick={() => setOpen(false)}>
            <MessageSquareText className="h-4 w-4 text-gold" aria-hidden="true" />
            {t('sms')}
          </a>
          <a
            role="menuitem"
            href={`mailto:?subject=${encodeURIComponent(t('emailSubject', { game: title }))}&body=${message}`}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <Mail className="h-4 w-4 text-gold" aria-hidden="true" />
            {t('email')}
          </a>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              onCopy();
              setOpen(false);
            }}
          >
            <Copy className="h-4 w-4 text-gold" aria-hidden="true" />
            {t('copyLink')}
          </button>
        </div>
      )}
    </div>
  );
}
