'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Socket } from 'socket.io-client';
import { MessageSquare, Send, X } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import { chatMessages } from '../../i18n/messages/chat';

const MAX_LENGTH = 300; // the server's limit
const ANSWER_MS = 8000;

type ChatMessage = { id: string; playerId: string; name: string; text: string; at: number };
type Ack = { ok: true; message?: ChatMessage; messages?: ChatMessage[] } | { ok: false; code: string };

type Props = {
  socket: Socket;
  game: 'african-casino' | 'dominoes' | 'international-draughts' | 'five-in-a-row';
  roomId: string;
  myPlayerId: string | null;
  // During play the button sits in the game options bar (TableMenu) instead of floating over the
  // hand of cards or the play bar fixed to the bottom of the screen
  docked?: boolean;
};

const ask = (socket: Socket, event: string, payload: object) =>
  new Promise<Ack>(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, code: 'FAILED' }), ANSWER_MS);
    socket.emit(event, payload, (ack: Ack) => {
      clearTimeout(timer);
      resolve(ack ?? { ok: false, code: 'FAILED' });
    });
  });

// The room chat of the room games: a floating button that opens the conversation. Only the
// players seated in the room can read and write it; the server keeps the last messages so a
// refresh or a reconnection shows them again.
export default function GameChat({ socket, game, roomId, myPlayerId, docked = false }: Props) {
  const t = useT(chatMessages);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // The recent conversation, on arrival and after every reconnection
  useEffect(() => {
    let live = true;
    const load = () =>
      void ask(socket, 'chat:history', { game, roomId }).then(ack => {
        if (live && ack.ok && ack.messages) setMessages(ack.messages);
      });
    load();
    socket.on('connect', load);
    const onMessage = (data: { game?: string; roomId?: string; message?: ChatMessage }) => {
      if (data?.game !== game || data.roomId !== roomId || !data.message) return;
      const message = data.message;
      setMessages(list => (list.some(m => m.id === message.id) ? list : [...list, message].slice(-50)));
      if (!openRef.current && message.playerId !== myPlayerId) setUnread(n => n + 1);
    };
    socket.on('chat:message', onMessage);
    return () => {
      live = false;
      socket.off('connect', load);
      socket.off('chat:message', onMessage);
    };
  }, [socket, game, roomId, myPlayerId]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Keep the newest message in view
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    const ack = await ask(socket, 'chat:send', { game, roomId, text: value });
    setSending(false);
    if (!ack.ok) {
      const key = `err_${ack.code}`;
      const tx = t as unknown as (k: string) => string;
      setError(tx(key) === key ? t('err_FAILED') : tx(key));
      return;
    }
    setText('');
  };

  // The options bar renders an empty slot for the docked button; find it after every render
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(docked ? document.getElementById('table-menu-chat') : null);
  });

  const label = unread > 0 ? t('openChatUnread', { count: unread }) : t('openChat');
  const badge = unread > 0 && (
    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-xs font-bold text-ink">
      {unread}
    </span>
  );
  const dockedButton =
    docked && slot && !open
      ? createPortal(
          <button type="button" onClick={() => setOpen(true)} aria-label={label} className="btn-quiet btn-sm relative min-h-11">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {t('chat')}
            {badge}
          </button>,
          slot,
        )
      : null;
  if (docked && slot && !open) return dockedButton;

  return (
    <div className={`fixed right-4 z-50 ${docked ? 'top-24' : 'bottom-4'}`}>
      {open ? (
        <div role="dialog" aria-label={t('chat')} className="panel flex h-96 w-[calc(100vw-2rem)] max-w-xs flex-col shadow-lift">
          <div className="flex items-center justify-between border-b border-white/10 py-1 pl-4 pr-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-chalk" aria-hidden="true" />
              <h2 className="font-semibold">{t('chat')}</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('closeChat')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-chalk transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4 [overflow-wrap:anywhere]" aria-live="polite">
            {messages.length === 0 ? (
              <p className="text-sm text-chalk">{t('noMessages')}</p>
            ) : (
              messages.map(m => {
                const mine = m.playerId === myPlayerId;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${mine ? 'bg-table-rim' : 'bg-felt-deep'} text-white`}>
                      <p className="mb-0.5 text-xs font-semibold text-chalk">{mine ? t('you') : m.name}</p>
                      <p className="text-sm">{m.text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            className="border-t border-white/10 p-3"
            onSubmit={e => {
              e.preventDefault();
              void send();
            }}
          >
            {error && (
              <p role="alert" className="mb-2 text-xs text-white">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('typeMessage')}
                aria-label={t('message')}
                className="field min-w-0 flex-1 px-3 py-2 text-base"
                maxLength={MAX_LENGTH}
                autoFocus
              />
              <button type="submit" disabled={!text.trim() || sending} aria-label={t('sendMessage')} className="btn-quiet btn-sm min-h-11 shrink-0">
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-table text-white shadow-lift ring-1 ring-inset ring-table-rim transition hover:bg-table-rim"
        >
          <MessageSquare className="h-6 w-6" aria-hidden="true" />
          {badge}
        </button>
      )}
    </div>
  );
}
