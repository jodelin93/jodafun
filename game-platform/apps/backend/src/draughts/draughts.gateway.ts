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
import { DraughtsService } from './draughts.service';
import { checkTutorial, TUTORIAL_STEPS, tutorialStep } from './tutorial';

const RATE_LIMITED = { ok: false, code: 'RATE_LIMITED' } as const;
const BAD_REQUEST = { ok: false, code: 'BAD_REQUEST' } as const;
type Payload = Record<string, unknown> | undefined;

const tutorialIndex = (step: unknown) => (Number.isInteger(step) && (step as number) >= 0 && (step as number) < TUTORIAL_STEPS ? (step as number) : null);

// International draughts events (draughts:*). Shares the Socket.IO server and connection with the
// Joda Memory gateway; who a socket belongs to comes from SocketSessions, everything else from
// DraughtsService.
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class DraughtsGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private joinLimiter = new RateLimiter(20, 60_000);
  private moveLimiter = new RateLimiter(10, 1000);
  private tutorialLimiter = new RateLimiter(20, 1000);
  private lobbyLimiter = new RateLimiter(20, 10_000);

  constructor(
    private draughts: DraughtsService,
    private sessions: SocketSessions,
  ) {}

  afterInit(server: Server) {
    this.draughts.attach({
      toRoom: (roomId, event, payload) => server.to(roomId).emit(event, payload),
      toSocket: (socketId, event, payload) => server.to(socketId).emit(event, payload),
      join: (socketId, roomId) => server.in(socketId).socketsJoin(roomId),
      leave: (socketId, roomId) => server.in(socketId).socketsLeave(roomId),
    });
  }

  handleDisconnect(client: Socket) {
    this.joinLimiter.forget(client.id);
    this.moveLimiter.forget(client.id);
    this.tutorialLimiter.forget(client.id);
    this.lobbyLimiter.forget(client.id);
    this.draughts.disconnected(client.id);
  }

  @SubscribeMessage('draughts:create')
  async create(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.draughts.create(client.id, user, data ?? {});
  }

  @SubscribeMessage('draughts:join')
  async join(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.draughts.join(client.id, user, data ?? {});
  }

  @SubscribeMessage('draughts:rejoin')
  async rejoin(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.draughts.rejoin(client.id, user, data ?? {});
  }

  @SubscribeMessage('draughts:ready')
  ready(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.ready(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:move')
  move(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.move(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:resign')
  resign(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.resign(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:offerDraw')
  offerDraw(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.offerDraw(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:respondDraw')
  respondDraw(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.respondDraw(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:pause')
  pause(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.pause(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:resume')
  resume(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.resume(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:rematch')
  rematch(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.rematch(client.id, data ?? {});
  }

  @SubscribeMessage('draughts:leave')
  leave(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.draughts.leave(client.id, data ?? {});
  }

  // The tutorial needs no room: practice positions checked by the real rules
  @SubscribeMessage('draughts:tutorial')
  tutorial(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.tutorialLimiter.allow(client.id)) return RATE_LIMITED;
    const index = tutorialIndex(data?.step);
    const step = index === null ? null : tutorialStep(index);
    return step ? { ok: true, step } : BAD_REQUEST;
  }

  // Answers with the engine's TutorialCheck ({ ok: false, error } for a rejected route)
  @SubscribeMessage('draughts:tutorialCheck')
  tutorialCheck(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.tutorialLimiter.allow(client.id)) return RATE_LIMITED;
    const index = tutorialIndex(data?.step);
    if (index === null) return BAD_REQUEST;
    return checkTutorial(index, data?.route) ?? BAD_REQUEST;
  }
}
