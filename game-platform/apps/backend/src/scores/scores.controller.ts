import { Body, Controller, Get, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrorFilter } from './api-error.filter';
import { ScoresService } from './scores.service';
import {
  FriendsLeaderboardQueryDto,
  SoloLeaderboardQueryDto,
  SubmitSoloScoreDto,
} from './scores.dto';

@Controller('scores')
@UseFilters(ApiErrorFilter)
export class ScoresController {
  constructor(private scoresService: ScoresService) {}

  @Post('solo')
  @UseGuards(SessionGuard)
  submitSolo(@Req() req: any, @Body() body: SubmitSoloScoreDto) {
    return this.scoresService.submitSoloRun(req.sessionUser.id, body);
  }
}

@Controller('leaderboard')
@UseFilters(ApiErrorFilter)
export class LeaderboardController {
  constructor(private scoresService: ScoresService) {}

  @Get('friends')
  getFriends(@Query() query: FriendsLeaderboardQueryDto) {
    return this.scoresService.getFriendsLeaderboard(query.period);
  }

  @Get('solo')
  getSolo(@Query() query: SoloLeaderboardQueryDto) {
    return this.scoresService.getSoloLeaderboard(query.difficulty, query.period);
  }
}
