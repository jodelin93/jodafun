import { Module } from '@nestjs/common';
import { LeaderboardController, ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';

@Module({
  controllers: [ScoresController, LeaderboardController],
  providers: [ScoresService],
})
export class ScoresModule {}
