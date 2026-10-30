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
import { parseMove } from './engine/match';
import { DominoesService } from './dominoes.service';
import { checkTutorial, TUTORIAL_STEPS, tutorialStep, type TutorialAction } from './tutorial';

const RATE_LIMITED = { ok: false, code: 'RATE_LIMITED' } as const;
const BAD_REQUEST = { ok: false, code: 'BAD_REQUEST' } as const;
type Payload = Record<string, unknown> | undefined;

const tutorialIndex = (step: unknown) => (Number.isInteger(step) && (step as number) >= 0 && (step as number) < TUTORIAL_STEPS ? (step as number) : null);

// A tutorial action as sent by the client: { type: 'pass' } or { type: 'play', move: { tile, end } }
function parseTutorialAction(raw: unknown): TutorialAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const action = raw as { type?: unknown; move?: unknown };
  if (action.type === 'pass') return { type: 'pass' };
  if (action.type !== 'play') return null;
  const parsed = parseMove(action.move);
  return parsed.ok ? { type: 'play', move: parsed.move } : null;
}

// Dominoes events (dominoes:*). Shares the Socket.IO server and connection with the Joda Memory
// gateway; who a socket belongs to comes from SocketSessions, everything else from DominoesService.
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class DominoesGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private joinLimiter = new RateLimiter(20, 60_000);
  private moveLimiter = new RateLimiter(10, 1000);
  private tutorialLimiter = new RateLimiter(20, 1000);
  private lobbyLimiter = new RateLimiter(20, 10_000);

  constructor(
    private dominoes: DominoesService,
    private sessions: SocketSessions,
  ) {}

  afterInit(server: Server) {
    this.dominoes.attach({
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
    this.dominoes.disconnected(client.id);
  }

  @SubscribeMessage('dominoes:create')
  async create(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.dominoes.create(client.id, user, data ?? {});
  }

  @SubscribeMessage('dominoes:join')
  async join(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.dominoes.join(client.id, user, data ?? {});
  }

  @SubscribeMessage('dominoes:rejoin')
  async rejoin(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.joinLimiter.allow(client.id)) return RATE_LIMITED;
    const user = await this.sessions.user(client.id);
    return this.dominoes.rejoin(client.id, user, data ?? {});
  }

  @SubscribeMessage('dominoes:chooseSeat')
  chooseSeat(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.chooseSeat(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:setTarget')
  setTarget(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.setTarget(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:ready')
  ready(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.ready(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:start')
  start(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.start(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:play')
  play(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.play(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:pass')
  pass(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.moveLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.pass(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:pause')
  pause(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.pause(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:resume')
  resume(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.resume(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:rematch')
  rematch(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.rematch(client.id, data ?? {});
  }

  @SubscribeMessage('dominoes:leave')
  leave(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.lobbyLimiter.allow(client.id)) return RATE_LIMITED;
    return this.dominoes.leave(client.id, data ?? {});
  }

  // The tutorial needs no room: practice positions checked by the real rules
  @SubscribeMessage('dominoes:tutorial')
  tutorial(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.tutorialLimiter.allow(client.id)) return RATE_LIMITED;
    const index = tutorialIndex(data?.step);
    const step = index === null ? null : tutorialStep(index);
    return step ? { ok: true, step: index, ...step, total: TUTORIAL_STEPS } : BAD_REQUEST;
  }

  @SubscribeMessage('dominoes:tutorialCheck')
  tutorialCheck(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.tutorialLimiter.allow(client.id)) return RATE_LIMITED;
    const index = tutorialIndex(data?.step);
    if (index === null) return BAD_REQUEST;
    const action = parseTutorialAction(data?.action);
    if (!action) return { ok: false, error: { code: 'BAD_MOVE' } };
    return checkTutorial(index, action) ?? BAD_REQUEST;
  }
}
