import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomStore } from './room-store';
import { SocketSessions } from './socket-sessions';
import { CasinoGateway } from '../casino/casino.gateway';
import { CasinoService } from '../casino/casino.service';
import { CasinoResults } from '../casino/casino-results';
import { DominoesGateway } from '../dominoes/dominoes.gateway';
import { DominoesService } from '../dominoes/dominoes.service';
import { DominoResults } from '../dominoes/dominoes-results';
import { DraughtsGateway } from '../draughts/draughts.gateway';
import { DraughtsService } from '../draughts/draughts.service';
import { DraughtsResults } from '../draughts/draughts-results';
import { FiveGateway } from '../five/five.gateway';
import { FiveService } from '../five/five.service';
import { FiveResults } from '../five/five-results';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  providers: [
    GameGateway,
    RoomStore,
    SocketSessions,
    CasinoService,
    CasinoResults,
    CasinoGateway,
    DominoesService,
    DominoResults,
    DominoesGateway,
    DraughtsService,
    DraughtsResults,
    DraughtsGateway,
    FiveService,
    FiveResults,
    FiveGateway,
    ChatService,
    ChatGateway,
  ],
})
export class GameModule {}
