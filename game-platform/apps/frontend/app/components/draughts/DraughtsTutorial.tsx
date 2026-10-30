'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ArrowLeft, Check, RotateCcw } from 'lucide-react';
import type { PublicDraughtsView, Route, TutorialCheckAck, TutorialStep, TutorialStepAck } from '../../lib/draughts/types';
import { useT } from '../../i18n/I18nProvider';
import { draughtsMessages } from '../../i18n/messages/draughts';
import Loading from '../ui/Loading';
import DraughtsBoard from './DraughtsBoard';
import MovePicker, { type Answer } from './MovePicker';

const ask = <T,>(socket: Socket, event: string, payload: unknown) =>
  new Promise<T | null>(resolve => socket.timeout(8000).emit(event, payload, (err: Error | null, res: T) => resolve(err ? null : res)));

// Five lessons on fixed positions; the learner plays white and every attempt goes through the
// server's rules engine
export default function DraughtsTutorial({ socket, onBack }: { socket: Socket; onBack: () => void }) {
  const t = useT(draughtsMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<TutorialStep | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<PublicDraughtsView | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    setStep(null);
    setDone(null);
    setFailed(false);
    void ask<TutorialStepAck>(socket, 'draughts:tutorial', { step: index }).then(res => {
      if (!live) return;
      if (res?.ok) setStep(res.step);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [socket, index, attempt]);

  const check = useCallback(
    async (route: Route): Promise<Answer> => {
      setSending(true);
      const res = await ask<TutorialCheckAck>(socket, 'draughts:tutorialCheck', { step: index, route });
      setSending(false);
      if (!res) return { ok: false, error: { code: 'NO_ANSWER' } };
      if (!res.ok) return { ok: false, error: res.error ?? { code: res.code ?? 'BAD_MOVE' } };
      if (!res.done) return { ok: false, error: { code: 'TUTORIAL_GOAL' } };
      setDone(res.view);
      return { ok: true };
    },
    [socket, index],
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn-quiet btn-sm min-h-11">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('back')}
      </button>
      <h1 className="title-lg">{t('tutTitle')}</h1>
      <p className="text-chalk">{t('tutIntro')}</p>
      {failed ? (
        <div role="alert" className="space-y-3 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-signal/60">
          <p>{t('err_NO_ANSWER')}</p>
          <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => setAttempt(n => n + 1)}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('tryAgain')}
          </button>
        </div>
      ) : !step ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="mx-auto w-full max-w-[36rem]">
            {done ? (
              <DraughtsBoard tx={tx} view={done} flipped={false} label={t('boardLabel')} />
            ) : (
              <MovePicker key={`${step.id}-${attempt}`} tx={tx} view={step.view} myColor="white" canMove sending={sending} onSubmit={check} submitLabel={t('tutCheck')} />
            )}
          </div>
          <section className="panel p-4 lg:order-first" aria-live="polite">
            <p className="text-xs text-chalk">{t('tutStepOf', { n: step.index + 1, total: step.total })}</p>
            <h2 className="title-md mt-1">{tx(`tut_${step.id}_title`)}</h2>
            <p className="mt-1 text-chalk">{tx(`tut_${step.id}_body`)}</p>
            {done && (
              <div className="mt-3 space-y-3">
                <p className="flex items-center gap-2 font-semibold text-gold">
                  <Check className="h-5 w-5" aria-hidden="true" />
                  {t('tutWellDone')}
                </p>
                <p className="text-sm text-chalk">{tx(`tut_${step.id}_done`)}</p>
                <div className="flex flex-wrap gap-2">
                  {step.index + 1 < step.total ? (
                    <button type="button" className="btn-gold btn-sm min-h-11" onClick={() => setIndex(i => i + 1)} autoFocus>
                      {t('tutNext')}
                    </button>
                  ) : (
                    <button type="button" className="btn-gold btn-sm min-h-11" onClick={onBack} autoFocus>
                      {t('tutFinish')}
                    </button>
                  )}
                  <button type="button" className="btn-quiet btn-sm min-h-11" onClick={() => setAttempt(n => n + 1)}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t('tutAgain')}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
