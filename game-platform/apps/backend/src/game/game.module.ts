import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomStore } from './room-store';
import { SocketSessions } from './socket-sessions';
import { CasinoGateway } from '../casino/casino.gateway';
import { CasinoService } from '../casino/casino.service';
import { CasinoResults } from '../casino/casino-results';

@Module({
  providers: [GameGateway, RoomStore, SocketSessions, CasinoService, CasinoResults, CasinoGateway],
})
export class GameModule {}
