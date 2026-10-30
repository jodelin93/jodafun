'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, LogOut, Pause, Play } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import { tableMenuMessages } from '../../i18n/messages/tableMenu';

type Ack = { ok: true } | { ok: false; code: string };

type Props = {
  paused: { byId: string; byName: string } | null;
  myPlayerId: string;
  pauserAway: boolean; // whoever paused has left or lost connection: anyone may resume
  onPause: () => Promise<Ack>;
  onResume: () => Promise<Ack>;
  onLeave: () => void;
  rules: (close: () => void) => ReactNode;
  errorText: (code: string) => string;
};

// The options a player needs during a team game: pause or resume it, read the rules without
// leaving the table, and leave (after confirming, since leaving a started match forfeits it)
export default function TableMenu({ paused, myPlayerId, pauserAway, onPause, onResume, onLeave, rules, errorText }: Props) {
  const t = useT(tableMenuMessages);
  const [open, setOpen] = useState<'rules' | 'leave' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = paused?.byId === myPlayerId;
  const canResume = !!paused && (mine || pauserAway);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const run = async (action: () => Promise<Ack>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ack = await action();
    setBusy(false);
    if (!ack.ok) setError(errorText(ack.code));
  };

  const leaveButton = (
    <button type="button" onClick={() => setOpen('leave')} className="btn-quiet btn-sm min-h-11">
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {t('leaveGame')}
    </button>
  );

  return (
    <>
      <nav aria-label={t('menuLabel')} className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => void run(paused ? onResume : onPause)} disabled={busy || (!!paused && !canResume)} className="btn-quiet btn-sm min-h-11">
          {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          {paused ? t('resume') : t('pause')}
        </button>
        <button type="button" onClick={() => setOpen('rules')} className="btn-quiet btn-sm min-h-11">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {t('rules')}
        </button>
        {leaveButton}
        {/* The room chat docks its button here during play (see GameChat) */}
        <span id="table-menu-chat" className="contents" />
      </nav>
      {error && !paused && (
        <p role="alert" className="mb-3 text-sm text-chalk">
          {error}
        </p>
      )}

      {/* While paused the table is covered: nobody can play until it is resumed */}
      {paused && !open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="paused-title" className="panel w-full max-w-sm space-y-3 p-5 text-center shadow-lift">
            <Pause className="mx-auto h-8 w-8 text-gold" aria-hidden="true" />
            <h2 id="paused-title" className="title-md">
              {t('pausedTitle')}
            </h2>
            <p className="text-chalk" role="status">
              {mine ? t('pausedByYou') : pauserAway ? t('pausedAway', { name: paused.byName }) : t('pausedBy', { name: paused.byName })}
            </p>
            {error && (
              <p role="alert" className="text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {canResume && (
                <button type="button" autoFocus onClick={() => void run(onResume)} disabled={busy} className="btn-gold min-h-11">
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {t('resume')}
                </button>
              )}
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => setOpen('rules')} className="btn-quiet btn-sm min-h-11">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {t('rules')}
                </button>
                {leaveButton}
              </div>
            </div>
          </div>
        </div>
      )}

      {open === 'rules' && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4" onClick={e => e.target === e.currentTarget && setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={t('rules')} className="panel mx-auto my-6 max-w-2xl p-5 shadow-lift">
            {rules(() => setOpen(null))}
          </div>
        </div>
      )}

      {open === 'leave' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-body" className="panel w-full max-w-sm space-y-3 p-5 shadow-lift">
            <h2 id="leave-title" className="title-md">
              {t('leaveTitle')}
            </h2>
            <p id="leave-body" className="text-chalk">
              {t('leaveBody')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => setOpen(null)} className="btn-quiet min-h-11">
                {t('stay')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(null);
                  onLeave();
                }}
                className="btn-gold min-h-11"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t('leaveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
