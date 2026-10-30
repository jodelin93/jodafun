'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Gamepad2, Users } from 'lucide-react';
import { getPlayerKey } from '../../lib/playerKey';
import { useGameTitle } from '../../lib/useGameTitle';
import { useT } from '../../i18n/I18nProvider';
import { onlineMessages } from '../../i18n/messages/online';

export type TeamGame = 'african-casino' | 'dominoes' | 'international-draughts' | 'five-in-a-row';

type Online = { id: string; name: string; isGuest: boolean; status?: 'available' | 'playing'; game?: string };
type Sent = { inviteId: string; status: 'waiting' | 'declined' | 'expired' | 'failed' };

// Requests already sent, by room and person, so the list in the lobby still knows about a request
// sent from the menu a moment before the room existed
const sentStore = new Map<string, Sent>();
const sentKey = (roomId: string, playerId: string) => `${roomId}:${playerId}`;

type Props = {
  socket: Socket;
  game: TeamGame;
  // The room to invite into; null on the game's menu, where a request first creates the room
  roomId: string | null;
  onNeedRoom?: () => Promise<string | null>;
};

// Everyone online: people free to play get an "Invite" button; people already in a room are shown
// with the game they are playing (the server never tells which room) and can't be asked yet
export default function OnlineInvites({ socket, game, roomId, onNeedRoom }: Props) {
  const t = useT(onlineMessages);
  const { title } = useGameTitle();
  const [players, setPlayers] = useState<Online[] | null>(null);
  const [, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const refresh = () => setVersion(v => v + 1);

  useEffect(() => {
    const load = () => socket.emit('presence:list', {}, (res: { players?: Online[] }) => setPlayers(res?.players ?? []));
    load();
    const timer = setInterval(load, 15000);
    socket.on('presence:changed', load);
    socket.on('connect', load);
    const update = (status: 'declined' | 'expired') => (d: { inviteId: string }) => {
      for (const [k, v] of sentStore) if (v.inviteId === d.inviteId) sentStore.set(k, { ...v, status });
      refresh();
    };
    const declined = update('declined');
    const expired = update('expired');
    socket.on('invite:declined', declined);
    socket.on('invite:expired', expired);
    return () => {
      clearInterval(timer);
      socket.off('presence:changed', load);
      socket.off('connect', load);
      socket.off('invite:declined', declined);
      socket.off('invite:expired', expired);
    };
  }, [socket]);

  const invite = async (player: Online) => {
    let room = roomId;
    if (!room) {
      if (!onNeedRoom || creating) return;
      setCreating(true);
      room = await onNeedRoom();
      setCreating(false);
      if (!room) return;
    }
    const target = room;
    socket.emit('invite:send', { toId: player.id, playerKey: getPlayerKey(), game, roomId: target }, (res: { success: boolean; inviteId?: string }) => {
      sentStore.set(sentKey(target, player.id), { inviteId: res?.inviteId ?? '', status: res?.success ? 'waiting' : 'failed' });
      refresh();
    });
  };

  const available = (players ?? []).filter(p => (p.status ?? 'available') === 'available');
  const playing = (players ?? []).filter(p => p.status === 'playing');

  return (
    <section aria-labelledby={`online-${game}`} className="panel p-4">
      <h2 id={`online-${game}`} className="title-md flex items-center gap-2">
        <Users className="h-5 w-5 text-gold" aria-hidden="true" />
        {t('title')}
      </h2>
      <p className="mt-1 text-sm text-chalk">{roomId ? t('lobbyHint') : t('menuHint')}</p>
      {creating && (
        <p role="status" className="mt-2 text-sm">
          {t('creating')}
        </p>
      )}
      {players && players.length === 0 && <p className="mt-3 text-sm text-chalk">{t('nobody')}</p>}
      {players && players.length > 0 && (
        <ul className="mt-3 divide-y divide-table-rim">
          {available.map(p => {
            const sent = roomId ? sentStore.get(sentKey(roomId, p.id)) : undefined;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="text-xs text-chalk">
                    {t('available')}
                    {p.isGuest ? ` · ${t('guest')}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-sm text-chalk">
                  {sent?.status === 'declined' && t('declined', { name: p.name })}
                  {sent?.status === 'expired' && t('expired', { name: p.name })}
                  {sent?.status === 'failed' && t('failed')}
                  {sent?.status === 'waiting' ? (
                    <span>{t('invited')}</span>
                  ) : (
                    <button type="button" onClick={() => void invite(p)} disabled={creating} aria-label={t('inviteAria', { name: p.name })} className="btn-gold btn-sm min-h-11">
                      {t('invite')}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {playing.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2" title={t('playingHint')}>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="flex items-center gap-1 text-xs text-chalk">
                  <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('playing', { game: p.game ? title(p.game) : '' })}
                </span>
              </span>
              <span className="sr-only">{t('playingHint')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
