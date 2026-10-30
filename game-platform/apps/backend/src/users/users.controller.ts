import { Body, Controller, Get, Param, Patch, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrorFilter } from '../scores/api-error.filter';
import { UsersService } from './users.service';
import { HistoryQueryDto, UpdateMeDto } from './users.dto';

@Controller('users')
@UseFilters(ApiErrorFilter)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Patch('me')
  @UseGuards(SessionGuard)
  updateMe(@Req() req: any, @Body() body: UpdateMeDto) {
    return this.usersService.updateName(req.sessionUser.id, body.name);
  }

  @Get('me/stats')
  @UseGuards(SessionGuard)
  getMyStats(@Req() req: any) {
    return this.usersService.getStats(req.sessionUser.id);
  }

  @Get('me/history')
  @UseGuards(SessionGuard)
  getMyHistory(@Req() req: any, @Query() query: HistoryQueryDto) {
    const limit = Number(query.limit ?? 20);
    if (query.game === 'african-casino') {
      return this.usersService.getCasinoHistory(req.sessionUser.id, query.cursor, limit);
    }
    return this.usersService.getHistory(req.sessionUser.id, query.cursor, limit);
  }

  @Get(':id/profile')
  getProfile(@Param('id') id: string) {
    return this.usersService.getProfile(id);
  }
}
