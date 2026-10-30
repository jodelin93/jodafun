import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export const CHAT_MAX_LENGTH = 300;
export const CHAT_KEPT = 50;
const ROOMS_KEPT = 2000;

export interface ChatMessage {
  id: string;
  playerId: string; // the public seat id, never a socket or account id
  name: string;
  text: string;
  at: number;
}

// Trims, folds runs of whitespace and caps the length; null when nothing is left
export function cleanChatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, CHAT_MAX_LENGTH) : null;
}

/**
 * The recent chat of every room of the room games (Joda Casino, Dominoes, draughts, five in a row),
 * kept in memory so a player who refreshes sees the conversation again. Only the last CHAT_KEPT
 * messages per room are kept, and only for the most recent ROOMS_KEPT rooms; chat is not saved to
 * the database.
 */
@Injectable()
export class ChatService {
  private rooms = new Map<string, ChatMessage[]>();

  add(game: string, roomId: string, sender: { playerId: string; name: string }, text: string): ChatMessage {
    const key = `${game}:${roomId}`;
    const message: ChatMessage = { id: randomUUID(), playerId: sender.playerId, name: sender.name, text, at: Date.now() };
    const list = this.rooms.get(key) ?? [];
    list.push(message);
    if (list.length > CHAT_KEPT) list.splice(0, list.length - CHAT_KEPT);
    // Most recently used rooms last, so the oldest can be dropped
    this.rooms.delete(key);
    this.rooms.set(key, list);
    if (this.rooms.size > ROOMS_KEPT) this.rooms.delete(this.rooms.keys().next().value!);
    return message;
  }

  history(game: string, roomId: string): ChatMessage[] {
    return [...(this.rooms.get(`${game}:${roomId}`) ?? [])];
  }
}
