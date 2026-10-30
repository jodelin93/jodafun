'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ArrowLeft, Check } from 'lucide-react';
import type { End, HandResult, PrivateDominoView, PublicDominoView, TileId, TutorialAction, TutorialCheckAck, TutorialStepAck } from '../../lib/dominoes/types';
import { useT } from '../../i18n/I18nProvider';
import { dominoesMessages } from '../../i18n/messages/dominoes';
import Loading from '../ui/Loading';
import DominoBoard from './DominoBoard';
import DominoesTable, { type Answer, type SeatInfo } from './DominoesTable';
import HandResultView from './HandResultView';

type Step = { index: number; total: number; id: string; view: PublicDominoView; me: PrivateDominoView };
type Done = { result: HandResult | null; view: PublicDominoView };

const ask = <T,>(socket: Socket, event: string, payload: unknown) =>
  new Promise<T | null>(resolve => socket.timeout(8000).emit(event, payload, (err: Error | null, res: T) => resolve(err ? null : res)));

// Five lessons on fixed positions; the learner sits in seat 0 and every attempt goes through the
// server's rules engine
export default function DominoesTutorial({ socket, onBack }: { socket: Socket; onBack: () => void }) {
  const t = useT(dominoesMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    setStep(null);
    setDone(null);
    setFailed(false);
    void ask<TutorialStepAck>(socket, 'dominoes:tutorial', { step: index }).then(res => {
      if (!live) return;
      if (res?.ok) setStep({ index: res.step ?? index, total: res.total, id: res.id, view: res.view, me: res.me });
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [socket, index]);

  const check = useCallback(
    async (action: TutorialAction): Promise<Answer> => {
      setSending(true);
      const res = await ask<TutorialCheckAck>(socket, 'dominoes:tutorialCheck', { step: index, action });
      setSending(false);
      if (!res) return { ok: false, error: { code: 'NO_ANSWER' } };
      if (!res.ok) return { ok: false, error: res.error ?? { code: res.code ?? 'BAD_MOVE' } };
      if (!res.done) return { ok: false, error: { code: 'TUTORIAL_GOAL' } };
      setDone({ result: res.result, view: res.view });
      return { ok: true };
    },
    [socket, index],
  );

  const onPlay = useCallback((tile: TileId, end: End | null) => check({ type: 'play', move: { tile, end } }), [check]);
  const onPass = useCallback(() => check({ type: 'pass' }), [check]);

  const players = step?.view.players ?? 2;
  const nameOf = (seat: number) =>
    seat === 0 ? t('you') : players === 4 ? (seat === 2 ? t('partner') : seat === 1 ? t('opponentRight') : t('opponentLeft')) : t('opponent');
  const sideName = (team: number) => (players === 4 ? (team === 0 ? t('yourSide') : t('theirSide')) : nameOf(team));
  const seats: SeatInfo[] = Array.from({ length: players }, (_, seat) => ({ seat, name: nameOf(seat), connected: true, graceEndsAt: null }));

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn-quiet btn-sm min-h-11">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('back')}
      </button>
      <h1 className="title-lg">{t('tutTitle')}</h1>
      <p className="text-chalk">{t('tutIntro')}</p>
      {failed ? (
        <p role="alert" className="rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-signal/60">
          {t('err_NO_ANSWER')}
        </p>
      ) : !step ? (
        <Loading />
      ) : (
        <>
          <section className="panel p-4" aria-live="polite">
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
          {done ? (
            done.result ? (
              <section className="panel p-4" aria-labelledby="tut-result-title">
                <h2 id="tut-result-title" className="title-md mb-3">
                  {t('handOver', { n: done.result.hand })}
                </h2>
                <HandResultView tx={tx} result={done.result} players={players} mySeat={0} nameOf={nameOf} sideName={sideName} />
              </section>
            ) : (
              <DominoBoard
                tx={tx}
                board={done.view.board}
                ends={done.view.ends}
                lastTile={done.view.lastAction?.type === 'play' ? done.view.lastAction.tile : null}
              />
            )
          ) : (
            <DominoesTable
              key={step.id}
              match={step.view}
              me={step.me}
              seats={seats}
              onPlay={onPlay}
              onPass={onPass}
              sending={sending}
              submitLabel={t('tutCheck')}
              showHandResults={false}
            />
          )}
        </>
      )}
    </div>
  );
}
