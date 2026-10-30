'use client';

import { ArrowDown, ArrowUp, Lightbulb, RotateCcw, X } from 'lucide-react';
import { cardText, isAce } from '../../lib/casino/cards';
import { capturedBy, type Selection } from '../../lib/casino/draft';
import { describeStep } from '../../lib/casino/describe';
import type { Build, TurnAction } from '../../lib/casino/types';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';

export type Check = { status: 'idle' | 'checking' | 'valid' | 'invalid'; message?: string };
export type StepKind = 'capture' | 'discard' | 'build' | 'add' | 'change';

type Props = {
  myTurn: boolean;
  waitingFor: string;
  sel: Selection;
  onSel: (next: Selection) => void;
  actions: TurnAction[];
  onActions: (next: TurnAction[]) => void;
  builds: Build[]; // existing and new this turn
  ourBuildIds: Set<string>;
  opponentSingleIds: Set<string>;
  canBuildForPartner: boolean;
  canGiveToPartner: boolean;
  canTake: boolean;
  askingBase: boolean;
  onAddStep: (kind: StepKind, base?: string) => void;
  onTake: () => void;
  check: Check;
  sending: boolean;
  onPlay: () => void;
  onHint?: () => void;
  holdValues: number[];
  onHold?: (value: number) => void;
  notice: string | null;
  submitLabel?: string;
};

// Builds a turn step by step from what is selected, shows each step in words, and checks the whole
// turn against the rules before it is played
export default function TurnComposer(p: Props) {
  const t = useT(casinoMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const { sel } = p;
  const handPlayed = p.actions.some(a => a.type === 'capture' || a.type === 'discard' || a.type === 'change' || ('hand' in a && a.hand));
  const hasTable = sel.loose.length > 0 || sel.build !== null || sel.pile;
  const buildIsOurs = sel.build !== null && p.ourBuildIds.has(sel.build);

  const buttons: { kind: StepKind; label: string; enabled: boolean }[] = [
    { kind: 'capture', label: t('actCapture'), enabled: !!sel.hand && (sel.loose.length > 0 || sel.build !== null) && !sel.pile },
    { kind: 'discard', label: t('actDiscard'), enabled: !!sel.hand && !hasTable },
    { kind: 'build', label: t('actBuild'), enabled: sel.loose.length + (sel.hand ? 1 : 0) >= 2 && !sel.build && !sel.pile },
    { kind: 'add', label: t('actAdd'), enabled: (sel.loose.length > 0 || sel.pile || !!sel.hand) && (sel.build !== null || sel.loose.length > 0) },
    { kind: 'change', label: t('actChange'), enabled: !!sel.hand && sel.build !== null && p.opponentSingleIds.has(sel.build) && sel.loose.length === 0 },
  ];

  const moveInOrder = (index: number, from: number, delta: number) => {
    const action = p.actions[index];
    if (!action || action.type !== 'capture') return;
    const order = [...(action.order ?? capturedBy(action, p.builds))];
    const to = from + delta;
    const a = order[from];
    const b = order[to];
    if (a === undefined || b === undefined) return;
    order[from] = b;
    order[to] = a;
    const updated: TurnAction = { ...action, order };
    p.onActions(p.actions.map((x, i) => (i === index ? updated : x)));
  };

  if (!p.myTurn) {
    return (
      <section aria-labelledby="composer-title" className="panel p-4">
        <h2 id="composer-title" className="title-md">
          {t('composerTitle')}
        </h2>
        <p className="mt-1 text-chalk" role="status">
          {t('waitingFor', { name: p.waitingFor })}
        </p>
        <HoldButtons values={p.holdValues} onHold={p.onHold} />
      </section>
    );
  }

  return (
    <section aria-labelledby="composer-title" className="panel space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="composer-title" className="title-md">
          {t('composerTitle')}
        </h2>
        {p.onHint && (
          <button type="button" onClick={p.onHint} className="btn-quiet btn-sm min-h-11" disabled={p.sending}>
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            {t('hint')}
          </button>
        )}
      </div>

      <p className="text-sm text-chalk">
        {sel.hand || hasTable
          ? [
              sel.hand ? t('selectedPlay', { card: cardText(sel.hand) }) : '',
              sel.loose.length ? t('selectedTable', { cards: sel.loose.map(cardText).join(' ') }) : '',
              sel.build ? t('selectedBuild', { value: p.builds.find(b => b.id === sel.build)?.value ?? '' }) : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : t('pickHint')}
      </p>

      {(sel.hand && isAce(sel.hand)) || sel.loose.some(isAce) ? (
        <fieldset className="flex items-center gap-2 text-sm">
          <legend className="sr-only">{t('aceCounts')}</legend>
          <span className="text-chalk" aria-hidden="true">
            {t('aceCounts')}
          </span>
          {([1, 14] as const).map(v => (
            <button
              key={v}
              type="button"
              aria-pressed={sel.aceValue === v}
              onClick={() => p.onSel({ ...sel, aceValue: v })}
              className={`min-h-11 min-w-11 rounded-xl px-3 font-semibold ${sel.aceValue === v ? 'bg-card text-ink' : 'bg-white/5 text-white ring-1 ring-inset ring-white/20'}`}
            >
              {v}
            </button>
          ))}
        </fieldset>
      ) : null}

      {(p.canBuildForPartner || (p.canGiveToPartner && buildIsOurs)) && (
        <div className="flex flex-col gap-1 text-sm">
          {p.canBuildForPartner && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={sel.forPartner} onChange={e => p.onSel({ ...sel, forPartner: e.target.checked })} className="h-5 w-5 accent-[#FFC23D]" />
              {t('forPartner')}
            </label>
          )}
          {p.canGiveToPartner && buildIsOurs && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={sel.giveToPartner} onChange={e => p.onSel({ ...sel, giveToPartner: e.target.checked })} className="h-5 w-5 accent-[#FFC23D]" />
              {t('giveToPartner')}
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {buttons.map(b => (
          <button key={b.kind} type="button" disabled={!b.enabled || p.sending || (handPlayed && !!sel.hand)} onClick={() => p.onAddStep(b.kind)} className="btn-quiet btn-sm min-h-11">
            {b.label}
          </button>
        ))}
        {p.canTake && (
          <button type="button" onClick={p.onTake} disabled={p.sending} className="btn-quiet btn-sm min-h-11 ring-gold/60">
            {t('actTake')}
          </button>
        )}
      </div>
      {p.canTake && <p className="text-xs text-chalk">{t('takeExplain')}</p>}

      {p.askingBase && (
        <div role="group" aria-label={t('baseQuestion')} className="rounded-xl bg-felt-deep p-3">
          <p className="text-sm">{t('baseQuestion')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sel.loose.map(id => (
              <button key={id} type="button" onClick={() => p.onAddStep('add', id)} className="btn-quiet btn-sm min-h-11">
                {cardText(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold">{t('stepsTitle')}</h3>
        {p.actions.length === 0 ? (
          <p className="text-sm text-chalk">{t('noSteps')}</p>
        ) : (
          <ol className="mt-1 space-y-2">
            {p.actions.map((a, i) => (
              <li key={i} className="rounded-xl bg-felt-deep px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    {i + 1}. {describeStep(tx, a, p.builds)}
                  </span>
                  <button
                    type="button"
                    onClick={() => p.onActions(p.actions.slice(0, i))}
                    aria-label={t('removeStep', { n: i + 1 })}
                    className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-chalk hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {a.type === 'capture' && capturedBy(a, p.builds).length > 1 && (
                  <div className="mt-2">
                    <p className="text-xs text-chalk">{t('orderTitle')}</p>
                    <ol className="mt-1 flex flex-wrap gap-1.5">
                      {(a.order ?? capturedBy(a, p.builds)).map((id, j, all) => (
                        <li key={id} className="flex items-center gap-0.5 rounded-lg bg-table px-1.5 py-0.5">
                          <button type="button" aria-label={t('moveUp', { card: cardText(id) })} onClick={() => moveInOrder(i, j, -1)} disabled={j === 0} className="flex h-8 w-6 items-center justify-center disabled:opacity-30">
                            <ArrowDown className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
                          </button>
                          <span className="font-semibold">{cardText(id)}</span>
                          <button type="button" aria-label={t('moveDown', { card: cardText(id) })} onClick={() => moveInOrder(i, j, 1)} disabled={j === all.length - 1} className="flex h-8 w-6 items-center justify-center disabled:opacity-30">
                            <ArrowUp className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1 text-xs text-chalk">{t('orderTop', { card: cardText(a.card) })}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <p role="status" aria-live="polite" className={`text-sm ${p.check.status === 'invalid' ? 'text-white' : 'text-chalk'}`}>
        {p.notice ?? (p.check.status === 'checking' ? t('checking') : p.check.status === 'valid' ? t('looksGood') : p.check.message ?? '')}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={p.onPlay} disabled={p.check.status !== 'valid' || p.sending} className="btn-gold min-h-11 flex-1">
          {p.sending ? t('sending') : (p.submitLabel ?? t('playTurn'))}
        </button>
        <button type="button" onClick={() => p.onActions([])} disabled={p.actions.length === 0 || p.sending} className="btn-quiet min-h-11">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('startOver')}
        </button>
      </div>
      <HoldButtons values={p.holdValues} onHold={p.onHold} />
    </section>
  );
}

// "Please don't capture": one button per side build this player holds a card for
function HoldButtons({ values, onHold }: { values: number[]; onHold?: (value: number) => void }) {
  const t = useT(casinoMessages);
  if (!onHold || values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
      {values.map(v => (
        <button key={v} type="button" onClick={() => onHold(v)} className="btn-quiet btn-sm min-h-11">
          {t('askHold', { value: v })}
        </button>
      ))}
    </div>
  );
}
