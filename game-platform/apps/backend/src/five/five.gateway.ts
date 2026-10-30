import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RateLimiter } from '../game/game.utils';
import { SocketSessions } from '../game/socket-sessions';
import { FiveService } from './five.service';
import { checkTutorial, TUTORIAL_STEPS, tutorialStep } from './tutorial';

const RATE_LIMITED = { ok: false, code: 'RATE_LIMITED' } as const;
const BAD_REQUEST = { ok: false, code: 'BAD_REQUEST' } as const;
type Payload = Record<string, unknown> | undefined;

const tutorialIndex = (step: unknown) => (Number.isInteger(step) && (step as number) >= 0 && (step as number) < TUTORIAL_STEPS ? (step as number) : null);

// Infinite five-in-a-row events (five:*). Shares the Socket.IO server and connection with the
// Joda Memory gateway; who a socket belongs to comes from SocketSessions, everything else from
// FiveService.
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class FiveGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private joinLimiter = new RateLimiter(20, 60_000);
  private moveLimiter = new RateLimiter(10, 1000);
  // five:area, five:history and five:since: a client moving its view asks for areas often
  private viewLimiter = new RateLimiter(20, 1000);
  private tutorialLimiter = new RateLimiter(20, 1000);
  private lobbyLimiter = new RateLimiter(20, 10_000);

  constructor(
    private five: FiveService,
    private sessions: SocketSessions,
  ) {}

  afterInit(server: Server) {
    this.five.attach({
      toRoom: (roomId, event, payload) => server.to(roomId).emit(event, payload),
      toSocket: (socketId, event, payload) => server.to(socketId).emit(event, payload),
      join: (socketId, roomId) => server.in(socketId).socketsJoin(roomId),
      leave: (socketId, roomId) => server.in(socketId).socketsLeave(roomId),
    });
  }

  handleDisconnect(client: Socket) {
    this.joinLimiter.forget(client.id);
    this.moveLimiter.forget(client.id);
    this.viewLimiter.forget(client.id);
    this.tutorialLimiter.forget(client.id);
    this.lobbyLimiter.forget(client.id);
    this.five.disconnected(client.id);
  }

  @SubscribeMessage('five:create')
  async create(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.five.create(client.id, user, data ?? {});
  }

  @SubscribeMessage('five:join')
  async join(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.five.join(client.id, user, data ?? {});
  }

  @SubscribeMessage('five:rejoin')
  async rejoin(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.five.rejoin(client.id, user, data ?? {});
  }

  @SubscribeMessage('five:ready')
  ready(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.ready(client.id, data ?? {});
  }

  @SubscribeMessage('five:place')
  place(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.place(client.id, data ?? {});
  }

  @SubscribeMessage('five:resign')
  resign(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.resign(client.id, data ?? {});
  }

  @SubscribeMessage('five:pause')
  pause(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.pause(client.id, data ?? {});
  }

  @SubscribeMessage('five:resume')
  resume(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.resume(client.id, data ?? {});
  }

  @SubscribeMessage('five:rematch')
  rematch(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.rematch(client.id, data ?? {});
  }

  @SubscribeMessage('five:leave')
  leave(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.leave(client.id, data ?? {});
  }

  @SubscribeMessage('five:area')
  area(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.viewLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.area(client.id, data ?? {});
  }

  @SubscribeMessage('five:history')
  history(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.viewLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.history(client.id, data ?? {});
  }

  @SubscribeMessage('five:since')
  since(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.viewLimiter.allow(client.id)) return RATE_LIMITED;
    return this.five.since(client.id, data ?? {});
  }

  // The tutorial needs no room: lesson positions checked by the real rules
  @SubscribeMessage('five:tutorial')
  tutorial(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.tutorialLimiter.allow(client.id)) return RATE_LIMITED;
    const index = tutorialIndex(data?.step);
    const step = index === null ? null : tutorialStep(index);
    return step ? { ok: true, step } : BAD_REQUEST;
  }

  // Answers with the engine's TutorialCheck ({ ok: false, error } for a refused cell)
  @SubscribeMessage('five:tutorialCheck')
  tutorialCheck(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.tutorialLimiter.allow(client.id)) return RATE_LIMITED;
    const index = tutorialIndex(data?.step);
    if (index === null) return BAD_REQUEST;
    return checkTutorial(index, data?.cell) ?? BAD_REQUEST;
  }
}
