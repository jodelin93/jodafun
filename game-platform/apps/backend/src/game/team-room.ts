import type { SessionUser } from '../auth/session';

// Tells the rest of the platform (presence, invitations) when a socket takes or leaves a seat
export interface SeatListener {
  seated(socketId: string): void;
  unseated(socketId: string): void;
}

/**
 * A game played at a room of 2 or 4 seats (Joda Casino, Dominoes). The Joda Memory gateway uses
 * this to invite people into such a room and to keep the online list right, whatever the game.
 */
export interface TeamRoomGame {
  seatListener: SeatListener | null;
  // The inviter's room, while it is in its lobby, and how many seats are free
  inviteRoom(
    socketId: string,
    roomId: unknown,
  ): { room: { id: string; capacity: 2 | 4; players: { socketId: string; name: string }[] }; freeSeats: number } | null;
  // Seats someone through the same checks as joining by link
  join(
    socketId: string,
    user: SessionUser | null,
    input: { roomId?: unknown; name?: unknown; playerKey?: unknown },
  ): Promise<{ ok: true; roomId: string } | { ok: false; code: string }>;
  seatedSocket(socketId: string): boolean;
  // Who is sending a chat message: the seat this socket holds in that room, or null
  chatSender(socketId: string, roomId: unknown): { roomId: string; playerId: string; name: string } | null;
}

// A paused match: no moves are accepted until it is resumed
export interface RoomPause {
  by: string; // player id of whoever paused
  at: number;
}

// What everyone at the table sees about a pause
export interface PauseView {
  byId: string;
  byName: string;
  since: number;
}

// Whoever paused resumes; anyone else may once that player has left or lost connection,
// so a match never stays frozen by someone who is gone
export function canResume(pause: RoomPause, playerId: string, players: readonly { id: string; connected: boolean }[]): boolean {
  if (pause.by === playerId) return true;
  const owner = players.find(p => p.id === pause.by);
  return !owner || !owner.connected;
}

export function pauseView(pause: RoomPause | null | undefined, players: readonly { id: string; name: string }[]): PauseView | null {
  if (!pause) return null;
  return { byId: pause.by, byName: players.find(p => p.id === pause.by)?.name ?? '', since: pause.at };
}
