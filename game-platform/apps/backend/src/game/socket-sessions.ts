import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSessionUser, type SessionUser } from '../auth/session';

// The signed-in user behind each socket, resolved once from the session cookie on connect and
// shared by every gateway (null = anonymous)
@Injectable()
export class SocketSessions {
  private users = new Map<string, Promise<SessionUser | null>>();

  constructor(private prisma: PrismaService) {}

  track(client: Socket) {
    this.users.set(
      client.id,
      resolveSessionUser(this.prisma, client.handshake.headers.cookie).catch(error => {
        console.error(`Session lookup failed for ${client.id}:`, error);
        return null;
      }),
    );
  }

  forget(socketId: string) {
    this.users.delete(socketId);
  }

  async user(socketId: string): Promise<SessionUser | null> {
    return (await this.users.get(socketId)) ?? null;
  }
}
