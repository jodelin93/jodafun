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
import { CasinoService } from './casino.service';
import { checkTutorial, tutorialStep } from './tutorial';

const RATE_LIMITED = { ok: false, code: 'RATE_LIMITED' } as const;
type Payload = Record<string, unknown> | undefined;

// Casino events (casino:*). Shares the Socket.IO server and connection with the Joda Memory
// gateway; who a socket belongs to comes from SocketSessions, everything else from CasinoService.
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class CasinoGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private joinLimiter = new RateLimiter(20, 60_000);
  private turnLimiter = new RateLimiter(10, 1000);
  private previewLimiter = new RateLimiter(20, 1000);
  private lobbyLimiter = new RateLimiter(20, 10_000);

  constructor(
    private casino: CasinoService,
    private sessions: SocketSessions,
  ) {}

  afterInit(server: Server) {
    this.casino.attach({
      toRoom: (roomId, event, payload) => server.to(roomId).emit(event, payload),
      toSocket: (socketId, event, payload) => server.to(socketId).emit(event, payload),
      join: (socketId, roomId) => server.in(socketId).socketsJoin(roomId),
      leave: (socketId, roomId) => server.in(socketId).socketsLeave(roomId),
    });
  }

  handleDisconnect(client: Socket) {
    this.joinLimiter.forget(client.id);
    this.turnLimiter.forget(client.id);
    this.previewLimiter.forget(client.id);
    this.lobbyLimiter.forget(client.id);
    this.casino.disconnected(client.id);
  }

  @SubscribeMessage('casino:create')
  async create(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.casino.create(client.id, user, data ?? {});
  }

  @SubscribeMessage('casino:join')
  async join(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.casino.join(client.id, user, data ?? {});
  }

  @SubscribeMessage('casino:rejoin')
  async rejoin(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.casino.rejoin(client.id, user, data ?? {});
  }

  @SubscribeMessage('casino:chooseSeat')
  chooseSeat(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.chooseSeat(client.id, data ?? {});
  }

  @SubscribeMessage('casino:setTarget')
  setTarget(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.setTarget(client.id, data ?? {});
  }

  @SubscribeMessage('casino:ready')
  ready(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.ready(client.id, data ?? {});
  }

  @SubscribeMessage('casino:submitTurn')
  submitTurn(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.turnLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.submitTurn(client.id, data ?? {});
  }

  @SubscribeMessage('casino:takeFromPile')
  takeFromPile(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.turnLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.takeFromPile(client.id, data ?? {});
  }

  @SubscribeMessage('casino:previewTurn')
  preview(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.previewLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.preview(client.id, data ?? {});
  }

  @SubscribeMessage('casino:hint')
  hint(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.previewLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.hint(client.id, data ?? {});
  }

  @SubscribeMessage('casino:hold')
  hold(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.turnLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.hold(client.id, data ?? {});
  }

  // The tutorial needs no room: practice positions checked by the real rules
  @SubscribeMessage('casino:tutorial')
  tutorial(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.previewLimiter.allow(client.id)) return RATE_LIMITED;
    const step = tutorialStep(data?.step);
    return step ? { ok: true, step } : { ok: false, code: 'BAD_REQUEST' };
  }

  @SubscribeMessage('casino:tutorialCheck')
  tutorialCheck(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.previewLimiter.allow(client.id)) return RATE_LIMITED;
    return { ok: true, ...checkTutorial(data?.step, data?.turn) };
  }

  @SubscribeMessage('casino:rematch')
  rematch(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.rematch(client.id, data ?? {});
  }

  @SubscribeMessage('casino:leave')
  leave(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.casino.leave(client.id, data ?? {});
  }
}
