import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomStore } from './room-store';

@Module({
  providers: [GameGateway, RoomStore],
})
export class GameModule {}
