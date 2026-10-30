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
}
