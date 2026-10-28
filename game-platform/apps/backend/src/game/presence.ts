import { randomUUID } from 'crypto';
import type { Difficulty } from './room-store';

export const INVITE_TTL_MS = 30_000;
const NAME_MAX_LENGTH = 20;

// A socket that said it is available to receive game requests
export interface PresenceEntry {
  socketId: string;
  name: string;
  playerKey?: string;
  userId: string | null;
  isGuest: boolean;
  since: number; // epoch ms when it became available
}

export interface Invite {
  id: string;
  fromId: string; // inviter socket id
  toId: string; // target socket id
  fromPlayerKey?: string;
  difficulty: Difficulty;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

// Requested name if it is 1-20 chars after trimming, else the session user's name, else 'Player'
export function presenceName(requested: unknown, sessionName: string | null | undefined): string {
  if (typeof requested === 'string') {
    const trimmed = requested.trim();
    if (trimmed.length >= 1 && trimmed.length <= NAME_MAX_LENGTH) return trimmed;
  }
  return sessionName?.trim().slice(0, NAME_MAX_LENGTH) || 'Player';
}

/**
 * In-memory presence and game requests. Both are per-connection and short-lived,
 * so nothing here is persisted. Every invite removal goes through removeInvite,
 * which clears its expiry timer.
 */
export class PresenceState {
  readonly available = new Map<string, PresenceEntry>();
  private invites = new Map<string, Invite>();

  getInvite(id: unknown): Invite | undefined {
    return typeof id === 'string' ? this.invites.get(id) : undefined;
  }

  outgoing(socketId: string): Invite | undefined {
    return [...this.invites.values()].find(i => i.fromId === socketId);
  }

  incoming(socketId: string): Invite | undefined {
    return [...this.invites.values()].find(i => i.toId === socketId);
  }

  // Every pending invite this socket sent or received
  invitesOf(socketId: string): Invite[] {
    return [...this.invites.values()].filter(i => i.fromId === socketId || i.toId === socketId);
  }

  addInvite(
    fromId: string,
    toId: string,
    fromPlayerKey: string | undefined,
    difficulty: Difficulty,
    onExpire: (invite: Invite) => void,
  ): Invite {
    const id = randomUUID();
    const invite: Invite = {
      id,
      fromId,
      toId,
      fromPlayerKey,
      difficulty,
      expiresAt: Date.now() + INVITE_TTL_MS,
      timer: setTimeout(() => {
        if (this.invites.get(id) !== invite) return;
        this.invites.delete(id);
        onExpire(invite);
      }, INVITE_TTL_MS),
    };
    this.invites.set(id, invite);
    return invite;
  }

  removeInvite(invite: Invite) {
    clearTimeout(invite.timer);
    this.invites.delete(invite.id);
  }
}
