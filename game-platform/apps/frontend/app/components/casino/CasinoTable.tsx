'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, WifiOff } from 'lucide-react';
import { captureValuesOf, cardText, isAce, rankOf, setMatches, sumOf, valueLabel } from '../../lib/casino/cards';
import { draftBuilds, emptySelection, makeStep, usedByDraft, type Selection } from '../../lib/casino/draft';
import { describeError, describeSummary } from '../../lib/casino/describe';
import { partnerOfSeat, teamOfSeat, type PrivateMatch, type PublicMatch, type RuleError, type TurnAction, type TurnProposal } from '../../lib/casino/types';
import { useT } from '../../i18n/I18nProvider';
import { casinoMessages } from '../../i18n/messages/casino';
import BuildView from './BuildView';
import CapturePiles from './CapturePiles';
import CasinoCard from './CasinoCard';
import PlayerHand from './PlayerHand';
import TurnComposer, { type Check, type StepKind } from './TurnComposer';

export type SeatInfo = { seat: number; name: string; connected: boolean };
type Answer = { ok: boolean; error?: Pick<RuleError, 'code' | 'params'> };

type Props = {
  match: PublicMatch;
  mine: PrivateMatch;
  seats: SeatInfo[];
  capacity: 2 | 4;
  // Checks a turn without playing it (null: no answer)
  onPreview: (actions: TurnAction[]) => Promise<{ valid: boolean; error?: RuleError } | null>;
  onPlay: (actions: TurnAction[]) => Promise<Answer>;
  onTake?: (action: TurnAction) => Promise<Answer>;
  onHint?: () => Promise<TurnProposal | null>;
  onHold?: (value: number) => Promise<Answer>;
  submitLabel?: string;
  connectionNote?: string | null;
};

const PREVIEW_DELAY_MS = 250;

// The table during a hand: other players around the top, layout, builds and piles in the middle,
// the player's hand and turn composer at the bottom
export default function CasinoTable({ match, mine, seats, capacity, onPreview, onPlay, onTake, onHint, onHold, submitLabel, connectionNote }: Props) {
  const t = useT(casinoMessages);
  const tx = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const seat = mine.seat;
  const team = teamOfSeat(capacity, seat);
  const partner = partnerOfSeat(capacity, seat);
  const myTurn = match.status === 'playing' && match.turn === seat;
  const nameOf = (s: number) => (s === seat ? t('you') : (seats.find(x => x.seat === s)?.name ?? t('seatN', { n: s + 1 })));
  const teamNames = [0, 1].map(tm => {
    if (capacity === 2) return tm === team ? t('you') : nameOf(1 - seat);
    const members = seats.filter(s => teamOfSeat(4, s.seat) === tm).map(s => nameOf(s.seat));
    return members.join(' & ');
  });

  const [sel, setSel] = useState<Selection>(emptySelection);
  const [actions, setActions] = useState<TurnAction[]>([]);
  const [askingBase, setAskingBase] = useState(false);
  const [check, setCheck] = useState<Check>({ status: 'idle' });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A new turn or hand (not a pile take of ours) starts a fresh draft
  const turnKey = `${match.handNumber}-${match.turnsPlayed}-${match.turn}`;
  useEffect(() => {
    setSel(emptySelection());
    setActions([]);
    setAskingBase(false);
    setNotice(null);
  }, [turnKey]);

  const used = useMemo(() => usedByDraft(actions), [actions]);
  const pending = useMemo(() => draftBuilds(match, actions, seat, partner), [match, actions, seat, partner]);
  const allBuilds = useMemo(() => [...match.builds, ...pending], [match.builds, pending]);

  // Check the whole turn against the server's rules whenever it changes
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!myTurn || actions.length === 0) {
      setCheck({ status: 'idle' });
      return;
    }
    const seq = ++previewSeq.current;
    setCheck({ status: 'checking' });
    const timer = setTimeout(async () => {
      const result = await onPreview(actions);
      if (seq !== previewSeq.current) return;
      if (!result) setCheck({ status: 'invalid', message: tx('err_NO_ANSWER') });
      else setCheck(result.valid ? { status: 'valid' } : { status: 'invalid', message: result.error ? describeError(tx, result.error, allBuilds) : '' });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
    // allBuilds only names builds in the message; the version is part of onPreview
  }, [actions, myTurn, onPreview, match.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const selectHand = (id: string) => {
    setNotice(null);
    setSel(s => ({ ...s, hand: s.hand === id ? null : id, aceValue: isAce(id) ? 14 : s.aceValue }));
  };

  const addingRef = useRef(false);
  const addStep = async (kind: StepKind, base?: string) => {
    setNotice(null);
    // "Add" with just a hand card on the opponents' single build raises its value, as "Change value" does
    const target = allBuilds.find(b => b.id === sel.build);
    const raises =
      kind === 'add' && !!sel.hand && !!target && opponentSingleIds.has(target.id) && sel.loose.length === 0 && !sel.pile && target.value + rankOf(sel.hand) <= 14;
    const result = makeStep(raises ? 'change' : kind, sel, base ?? null);
    if ('problem' in result) {
      if (result.problem === 'needBase') setAskingBase(true);
      else if (result.problem === 'noSets' && sel.hand) {
        const value = isAce(sel.hand) ? sel.aceValue : rankOf(sel.hand);
        setNotice(describeError(tx, { code: 'SET_SUM_MISMATCH', params: { value, cards: sel.loose } }));
      }
      return;
    }
    // "Add" makes a group worth the build's value: refuse it now rather than leave a turn that can
    // never be played, and point to "Build" when the cards were meant to be summed
    const a = result.action;
    if (a.type === 'augment' && !a.pile) {
      const value = a.base ? (isAce(a.base) ? (a.baseValue ?? 14) : rankOf(a.base)) : target?.value;
      const set = [...a.loose, ...(a.hand ? [a.hand] : [])];
      if (value !== undefined && set.length > 0 && !setMatches(set, value)) {
        const all = a.base ? [a.base, ...set] : [];
        const total = sumOf(all);
        const canBuild = all.length >= 2 && total <= 14 && (!a.hand || all.length === 2);
        setNotice(
          canBuild
            ? t('addUseBuild', { value: valueLabel(value), total: valueLabel(total), all: all.map(cardText).join(' + ') })
            : describeError(tx, { code: 'SET_SUM_MISMATCH', params: { value, cards: set } }),
        );
        return;
      }
    }
    // The server checks a turn step by step: an error on this new step (a total over 14, a value
    // already taken, a capture that leaves cards behind...) can't be fixed by any later step, so the
    // step is refused now. Errors on the turn as a whole ("no card played yet") wait for the next steps.
    if (addingRef.current) return;
    addingRef.current = true;
    const next = [...actions, result.action];
    const checked = await onPreview(next);
    addingRef.current = false;
    if (checked && !checked.valid && checked.error?.action === actions.length) {
      setNotice(describeError(tx, checked.error, [...match.builds, ...draftBuilds(match, next, seat, partner)]));
      return;
    }
    setActions(next);
    setSel(s => ({ ...emptySelection(), aceValue: s.aceValue }));
    setAskingBase(false);
  };

  const play = async () => {
    if (sending || check.status !== 'valid') return;
    setSending(true);
    const answer = await onPlay(actions);
    setSending(false);
    if (!answer.ok && answer.error) setNotice(describeError(tx, answer.error, allBuilds));
  };

  const take = async () => {
    if (!onTake || sending) return;
    const result = makeStep('add', sel, sel.build ? null : (sel.loose[0] ?? null));
    if ('problem' in result) return;
    setSending(true);
    const answer = await onTake(result.action);
    setSending(false);
    if (!answer.ok && answer.error) setNotice(describeError(tx, answer.error, allBuilds));
    else setSel(emptySelection());
  };

  const hint = async () => {
    if (!onHint) return;
    const proposal = await onHint();
    if (proposal) setActions(proposal.actions);
    else setNotice(t('noHint'));
  };

  // Partnership options: building for a partner known to hold the rank, handing over a build they asked for
  const partnerKnown = (partner !== null ? match.proven[partner] : undefined) ?? [];
  const partnerHolds = (partner !== null ? match.holds[partner] : undefined) ?? [];
  const selectedBuild = allBuilds.find(b => b.id === sel.build);
  const ourBuildIds = new Set(allBuilds.filter(b => teamOfSeat(capacity, b.owner) === team).map(b => b.id));
  const opponentSingleIds = new Set(match.builds.filter(b => teamOfSeat(capacity, b.owner) !== team && b.groups.length === 1).map(b => b.id));
  const canTake =
    !!onTake &&
    sel.pile &&
    !sel.hand &&
    !used.pileUsed &&
    actions.length === 0 &&
    ((selectedBuild !== undefined && ourBuildIds.has(selectedBuild.id) && !pending.includes(selectedBuild)) || (!sel.build && sel.loose.length >= 1));
  const holdValues =
    capacity === 4 && onHold
      ? match.builds
          .filter(b => teamOfSeat(4, b.owner) === team && b.owner !== seat)
          .map(b => b.value)
          .filter(v => mine.hand.some(id => captureValuesOf(id).includes(v)) && !(match.holds[seat] ?? []).includes(v === 14 ? 1 : v))
      : [];

  const turnName = nameOf(match.turn);
  const otherSeats = seats.filter(s => s.seat !== seat).sort((a, b) => ((a.seat - seat + capacity) % capacity) - ((b.seat - seat + capacity) % capacity));

  return (
    <div className="space-y-4 pb-4">
      {connectionNote && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-felt-deep p-3 text-sm ring-1 ring-inset ring-gold/40">
          <WifiOff className="h-4 w-4 text-gold" aria-hidden="true" />
          {connectionNote}
        </p>
      )}

      {/* Scores and whose turn it is */}
      <section aria-label={t('scoreLabel')} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          {[team, 1 - team].map(tm => (
            <div key={tm} className={`rounded-xl px-3 py-1.5 ${tm === team ? 'bg-gold/10 ring-1 ring-gold/50' : 'bg-felt-deep'}`}>
              <p className="max-w-[9rem] truncate text-xs text-chalk">{tm === team ? t('yourSide') : t('theirSide')}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums">{match.scores[tm]}</p>
            </div>
          ))}
          <p className="text-xs text-chalk">
            {t('firstTo', { n: match.targetPoints })}
            <br />
            {t('handN', { n: match.handNumber })}
            {capacity === 2 && <> · {match.deal === 0 ? t('firstTwelve') : t('secondTwelve')}</>}
            {match.stockCount > 0 && (
              <>
                <br />
                {t('toDeal', { n: match.stockCount })}
              </>
            )}
          </p>
        </div>
        <p role="status" className={`rounded-full px-3 py-1 text-sm font-semibold ${myTurn ? 'bg-gold text-ink' : 'bg-white/5'}`}>
          {myTurn ? t('yourTurn') : t('turnOf', { name: turnName })}
        </p>
      </section>

      {/* The other players */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {otherSeats.map(s => {
          const partnerSeat = s.seat === partner;
          return (
            <li
              key={s.seat}
              className={`flex items-center justify-between gap-2 rounded-2xl p-2.5 ring-1 ring-inset ${match.turn === s.seat ? 'bg-gold/10 ring-gold' : 'bg-table ring-table-rim'}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="text-xs text-chalk">
                  {capacity === 4 ? (partnerSeat ? t('yourSide') : t('theirSide')) : t('theirSide')}
                  {!s.connected && <> · {t('away')}</>}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm">
                {match.dealer === s.seat && (
                  <span className="chip px-2 py-0.5 text-xs">
                    <Crown className="h-3 w-3" aria-hidden="true" />
                    {t('dealer')}
                  </span>
                )}
                <span className="tabular-nums">{t('cardsCount', { n: match.handCounts[s.seat] ?? 0 })}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {match.lastTurn && match.lastTurn.seat !== seat && (
        <p className="text-sm text-chalk">
          <span className="font-semibold text-white">{t('lastTurnBy', { name: nameOf(match.lastTurn.seat) })}:</span>{' '}
          {match.lastTurn.actions.map(a => describeSummary(tx, a)).join('; ')}
        </p>
      )}
      {capacity === 4 && (
        <ul className="space-y-1 text-xs text-chalk">
          {match.proven.flatMap((ranks, s) => ranks.map(r => <li key={`p${s}${r}`}>{t('knowsRank', { name: nameOf(s), value: r === 1 ? 'A' : r })}</li>))}
          {match.holds.flatMap((ranks, s) => ranks.map(r => <li key={`h${s}${r}`}>{t('asksHold', { name: nameOf(s), value: r === 1 ? 'A' : r })}</li>))}
        </ul>
      )}

      {/* The table */}
      <section aria-labelledby="table-title" className="rounded-3xl bg-table/60 p-3 ring-1 ring-inset ring-table-rim sm:p-4">
        <h2 id="table-title" className="sr-only">
          {t('tableLabel')}
        </h2>
        <CapturePiles
          piles={match.piles}
          myTeam={team}
          teamPile={mine.teamPile}
          pileSelected={sel.pile}
          pileUsable={myTurn && !used.pileUsed && (match.piles[1 - team]?.top ?? null) !== null}
          onTogglePile={() => setSel(s => ({ ...s, pile: !s.pile }))}
        />
        <ul className="mt-4 flex min-h-24 flex-wrap gap-2" aria-label={t('tableLabel')}>
          {match.loose.length === 0 && <li className="self-center text-sm text-chalk">{t('noLooseCards')}</li>}
          {match.loose.map(id => (
            <li key={id}>
              <CasinoCard
                id={id}
                selected={sel.loose.includes(id)}
                used={used.cards.has(id)}
                disabled={!myTurn}
                onClick={() => setSel(s => ({ ...s, loose: toggle(s.loose, id) }))}
              />
            </li>
          ))}
        </ul>
        {allBuilds.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-chalk">{t('buildsLabel')}</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {allBuilds
                .filter(b => !used.builds.has(b.id))
                .map(b => (
                  <li key={b.id}>
                    <BuildView
                      build={b}
                      ownerName={nameOf(b.owner)}
                      ours={teamOfSeat(capacity, b.owner) === team}
                      selected={sel.build === b.id}
                      pending={pending.includes(b)}
                      onSelect={myTurn ? () => setSel(s => ({ ...s, build: s.build === b.id ? null : b.id })) : undefined}
                    />
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <TurnComposer
        myTurn={myTurn}
        waitingFor={turnName}
        sel={sel}
        onSel={setSel}
        actions={actions}
        onActions={next => {
          setActions(next);
          setNotice(null);
        }}
        builds={allBuilds}
        ourBuildIds={ourBuildIds}
        opponentSingleIds={opponentSingleIds}
        canBuildForPartner={capacity === 4 && partnerKnown.length > 0}
        canGiveToPartner={capacity === 4 && !!selectedBuild && partnerHolds.includes(selectedBuild.value === 14 ? 1 : selectedBuild.value)}
        canTake={canTake}
        askingBase={askingBase}
        onAddStep={addStep}
        onTake={take}
        check={check}
        sending={sending}
        onPlay={play}
        onHint={onHint ? hint : undefined}
        holdValues={holdValues}
        onHold={onHold ? value => void onHold(value).then(a => setNotice(a.ok ? t('holdSent') : a.error ? describeError(tx, a.error) : null)) : undefined}
        notice={notice}
        submitLabel={submitLabel}
      />

      {/* The hand stays within reach at the bottom of the screen */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-white/10 bg-felt-deep/95 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-3">
        <PlayerHand cards={mine.hand} selected={sel.hand} used={used.cards} canPlay={myTurn && !sending} onSelect={selectHand} />
      </div>
    </div>
  );
}
