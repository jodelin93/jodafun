'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ArrowLeft, Check } from 'lucide-react';
import type { PrivateMatch, PublicMatch, RuleError, TurnAction } from '../../lib/casino/types';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';
import Loading from '../ui/Loading';
import CasinoTable from './CasinoTable';

type Step = { index: number; total: number; id: string; match: PublicMatch; mine: PrivateMatch };
type CheckResult = { ok: boolean; valid?: boolean; goalMet?: boolean; error?: RuleError };

const ask = <T,>(socket: Socket, event: string, payload: unknown) =>
  new Promise<T | null>(resolve => socket.timeout(8000).emit(event, payload, (err: Error | null, res: T) => resolve(err ? null : res)));

// Five lessons on fixed positions; every attempt is checked by the server's rules engine
export default function CasinoTutorial({ socket, onBack }: { socket: Socket; onBack: () => void }) {
  const t = useT(casinoMessages);
  const tx = t as unknown as (key: string) => string;
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    setStep(null);
    setDone(false);
    void ask<{ ok: boolean; step?: Step }>(socket, 'casino:tutorial', { step: index }).then(res => {
      if (live && res?.ok && res.step) setStep(res.step);
    });
    return () => {
      live = false;
    };
  }, [socket, index]);

  const preview = useCallback(
    async (actions: TurnAction[]) => {
      const res = await ask<CheckResult>(socket, 'casino:tutorialCheck', { step: index, turn: { actions } });
      return res ? { valid: !!res.valid, error: res.error } : null;
    },
    [socket, index],
  );

  const play = useCallback(
    async (actions: TurnAction[]) => {
      const res = await ask<CheckResult>(socket, 'casino:tutorialCheck', { step: index, turn: { actions } });
      if (!res?.valid) return { ok: false, error: res?.error ?? { code: 'NO_ANSWER' } };
      if (!res.goalMet) return { ok: false, error: { code: 'TUTORIAL_GOAL' } };
      setDone(true);
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
      {!step ? (
        <Loading />
      ) : (
        <>
          <section className="panel p-4" aria-live="polite">
            <p className="text-xs text-chalk">{t('tutStepOf', { n: step.index + 1, total: step.total })}</p>
            <h2 className="title-md mt-1">{tx(`tut_${step.id}_title`)}</h2>
            <p className="mt-1 text-chalk">{tx(`tut_${step.id}_body`)}</p>
            {done && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="flex items-center gap-2 font-semibold text-gold">
                  <Check className="h-5 w-5" aria-hidden="true" />
                  {t('tutWellDone')}
                </p>
                {step.index + 1 < step.total ? (
                  <button type="button" className="btn-gold btn-sm min-h-11" onClick={() => setIndex(i => i + 1)} autoFocus>
                    {t('tutNext')}
                  </button>
                ) : (
                  <button type="button" className="btn-gold btn-sm min-h-11" onClick={onBack} autoFocus>
                    {t('tutFinish')}
                  </button>
                )}
              </div>
            )}
          </section>
          {!done && (
            <CasinoTable
              key={step.id}
              match={step.match}
              mine={step.mine}
              capacity={step.match.players === 4 ? 4 : 2}
              seats={[
                { seat: 0, name: t('you'), connected: true },
                { seat: 1, name: t('theirSide'), connected: true },
              ]}
              onPreview={preview}
              onPlay={play}
              submitLabel={t('tutCheck')}
            />
          )}
        </>
      )}
    </div>
  );
}
