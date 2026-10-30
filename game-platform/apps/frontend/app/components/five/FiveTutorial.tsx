'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ArrowLeft, Check, Move, RotateCcw } from 'lucide-react';
import { BoardCache } from '../../lib/five/cache';
import { fromWire, toWire, type Cell } from '../../lib/five/coords';
import { errorMessage, type Tx } from '../../lib/five/describe';
import type { FiveSummary, TutorialCheckAck, TutorialStep, TutorialStepAck } from '../../lib/five/types';
import { useT } from '../../i18n/I18nProvider';
import { fiveMessages } from '../../i18n/messages/five';
import Loading from '../ui/Loading';
import FivePlayArea from './FivePlayArea';
import { lastBy } from './FiveTable';

const ask = <T,>(socket: Socket, event: string, payload: unknown) =>
  new Promise<T | null>(resolve => socket.timeout(8000).emit(event, payload, (err: Error | null, res: T) => resolve(err ? null : res)));

// Four lessons on fixed positions (place, a row, a diagonal, a move off screen); the learner plays X
// and every attempt is checked by the server's rules engine
export default function FiveTutorial({ socket, onBack }: { socket: Socket; onBack: () => void }) {
  const t = useT(fiveMessages);
  const tx = t as unknown as Tx;
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<TutorialStep | null>(null);
  const [cache, setCache] = useState(() => new BoardCache(64, true));
  const [cacheRev, setCacheRev] = useState(0);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<FiveSummary | null>(null);

  useEffect(() => {
    let live = true;
    setStep(null);
    setDone(null);
    setFailed(false);
    void ask<TutorialStepAck>(socket, 'five:tutorial', { step: index }).then(res => {
      if (!live) return;
      if (!res?.ok) {
        setFailed(true);
        return;
      }
      // Lessons are small: every stone is known, so the whole board counts as loaded
      const next = new BoardCache(64, true);
      res.step.stones.forEach(m => next.put(fromWire(m), m.symbol));
      setCache(next);
      setCacheRev(next.rev);
      setStep(res.step);
    });
    return () => {
      live = false;
    };
  }, [socket, index, attempt]);

  const check = useCallback(
    async (cell: Cell): Promise<string | null> => {
      const res = await ask<TutorialCheckAck>(socket, 'five:tutorialCheck', { step: index, cell: toWire(cell) });
      if (!res) return errorMessage(tx, 'NO_ANSWER');
      if (!res.ok) return errorMessage(tx, res.error?.code ?? res.code ?? 'BAD_CELL');
      if (!res.done) return errorMessage(tx, 'TUTORIAL_GOAL');
      cache.put(fromWire(res.move), res.move.symbol);
      setCacheRev(cache.rev);
      setDone(res.game);
      return null;
    },
    [socket, index, tx, cache],
  );

  const stones = step?.stones ?? [];
  const lastMove = done?.lastMoves[done.lastMoves.length - 1] ?? stones[stones.length - 1] ?? null;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn-quiet btn-sm min-h-11">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('back')}
      </button>
      <h1 className="title-lg">{t('tutTitle')}</h1>
      <p className="text-chalk">{t('tutIntro')}</p>
      <p className="flex items-start gap-2 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-white/10">
        <Move className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        {t('tutControls')}
      </p>
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
          <FivePlayArea
            key={`${step.id}-${attempt}`}
            tx={tx}
            cache={cache}
            cacheRev={cacheRev}
            label={t('tutBoardLabel')}
            storageKey={null}
            initialCenter={{ x: 0n, y: 0n }}
            lastMove={lastMove}
            myLastMove={lastBy(done?.lastMoves ?? stones, 'X')}
            winLine={done?.winLine ?? null}
            mySymbol="X"
            canPlace={!done}
            waitingText={done ? t('tutWellDone') : undefined}
            watchMove={null}
            onPlace={check}
          />
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
