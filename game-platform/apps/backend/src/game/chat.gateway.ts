import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { CasinoService } from '../casino/casino.service';
import { DominoesService } from '../dominoes/dominoes.service';
import { DraughtsService } from '../draughts/draughts.service';
import { FiveService } from '../five/five.service';
import { ChatService, cleanChatText } from './chat.service';
import { RateLimiter } from './game.utils';
import type { TeamRoomGame } from './team-room';

type Payload = Record<string, unknown> | undefined;

// Chat for the room games (Joda Memory has its own, older chat in game.gateway). A message is
// accepted only from a socket seated in that room, and goes to everyone in the room.
//   chat:send    { game, roomId, text }  → { ok: true, message } | { ok: false, code }
//   chat:history { game, roomId }        → { ok: true, messages } | { ok: false, code }
//   server → room: chat:message { game, roomId, message }
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  private sendLimiter = new RateLimiter(5, 10_000);
  private historyLimiter = new RateLimiter(20, 10_000);
  private games: Record<string, TeamRoomGame>;

  constructor(
    private chat: ChatService,
    casino: CasinoService,
    dominoes: DominoesService,
    draughts: DraughtsService,
    five: FiveService,
  ) {
    this.games = { 'african-casino': casino, dominoes, 'international-draughts': draughts, 'five-in-a-row': five };
  }

  private senderOf(client: Socket, data: Payload) {
    const game = typeof data?.game === 'string' ? data.game : '';
    const service = Object.prototype.hasOwnProperty.call(this.games, game) ? this.games[game] : undefined;
    const sender = service?.chatSender(client.id, data?.roomId) ?? null;
    return sender ? { game, sender } : null;
  }

  @SubscribeMessage('chat:send')
  send(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    const found = this.senderOf(client, data);
    if (!found) return { ok: false, code: 'NOT_SEATED' };
    const text = cleanChatText(data?.text);
    if (!text) return { ok: false, code: 'EMPTY_MESSAGE' };
    if (!this.sendLimiter.allow(client.id)) return { ok: false, code: 'RATE_LIMITED' };
    const message = this.chat.add(found.game, found.sender.roomId, found.sender, text);
    this.server.to(found.sender.roomId).emit('chat:message', { game: found.game, roomId: found.sender.roomId, message });
    return { ok: true, message };
  }

  @SubscribeMessage('chat:history')
  history(@MessageBody() data: Payload, @ConnectedSocket() client: Socket) {
    if (!this.historyLimiter.allow(client.id)) return { ok: false, code: 'RATE_LIMITED' };
    const found = this.senderOf(client, data);
    if (!found) return { ok: false, code: 'NOT_SEATED' };
    return { ok: true, messages: this.chat.history(found.game, found.sender.roomId) };
  }
}
