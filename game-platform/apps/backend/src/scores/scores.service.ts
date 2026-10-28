import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isGuestEmail } from '../auth/session';
import { PAIRS_BY_DIFFICULTY } from '../game/game.gateway';
import { Difficulty, Period, SubmitSoloScoreDto } from './scores.dto';

const GAME_TYPE = 'joda-memory';
const LEADERBOARD_SIZE = 50;
// A friends game only counts on the leaderboard once it reached this round (forfeits before it don't)
const MIN_LEADERBOARD_ROUNDS = 4;
const MAX_TIME_SECONDS = 3600;
const MAX_MOVES = 1000;

// Timestamps are stored as UTC "timestamp without time zone", so compare against UTC now
const PERIOD_INTERVALS: Record<Period, string | null> = {
  day: '1 day',
  week: '7 days',
  month: '30 days',
  all: null,
};

@Injectable()
export class ScoresService {
  constructor(private prisma: PrismaService) {}

  async submitSoloRun(userId: string, dto: SubmitSoloScoreDto) {
    const pairs = PAIRS_BY_DIFFICULTY[dto.difficulty];
    if (
      dto.moves < pairs ||
      dto.timeSeconds < pairs ||
      dto.timeSeconds > MAX_TIME_SECONDS ||
      dto.moves > MAX_MOVES
    ) {
      throw new BadRequestException('Implausible run');
    }

    const previousBest = await this.prisma.soloRun.findFirst({
      where: { userId, gameType: GAME_TYPE, difficulty: dto.difficulty },
      orderBy: [{ timeSeconds: 'asc' }, { moves: 'asc' }],
    });

    await this.prisma.soloRun.create({
      data: {
        userId,
        gameType: GAME_TYPE,
        difficulty: dto.difficulty,
        timeSeconds: dto.timeSeconds,
        moves: dto.moves,
      },
    });

    const personalBest =
      !previousBest ||
      dto.timeSeconds < previousBest.timeSeconds ||
      (dto.timeSeconds === previousBest.timeSeconds && dto.moves < previousBest.moves);

    const rankRows = await this.prisma.$queryRaw<{ rank: number }[]>`
      WITH best AS (${this.bestSoloRunsSql(dto.difficulty, 'all')}),
      ranked AS (
        SELECT user_id, ROW_NUMBER() OVER (ORDER BY time_seconds, moves, created_at, user_id)::int AS rank
        FROM best
      )
      SELECT rank FROM ranked WHERE user_id = ${userId}`;

    return { saved: true, personalBest, rank: rankRows[0]?.rank ?? null };
  }

  async getFriendsLeaderboard(period: Period) {
    const rows = await this.prisma.$queryRaw<
      { userId: string; name: string | null; email: string | null; wins: number; games: number }[]
    >`
      SELECT mh.user_id AS "userId", u.name, u.email,
             COUNT(*) FILTER (WHERE mh.result = 'win')::int AS wins,
             COUNT(*)::int AS games
      FROM match_history mh
      JOIN games g ON g.id = mh.game_id
      JOIN users u ON u.id = mh.user_id
      WHERE g.game_type = ${GAME_TYPE} ${this.periodFilterSql('mh.played_at', period)}
        -- Only games that reached round 4 count (short forfeits don't); older rows fall back to rounds won + lost
        AND COALESCE((g.settings->>'roundsPlayed')::int, mh.rounds_won + mh.rounds_lost) >= ${MIN_LEADERBOARD_ROUNDS}
      GROUP BY mh.user_id, u.name, u.email
      ORDER BY wins DESC,
               COUNT(*) FILTER (WHERE mh.result = 'win')::float / COUNT(*) DESC,
               games DESC,
               mh.user_id
      LIMIT ${LEADERBOARD_SIZE}`;

    return {
      period,
      entries: rows.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: row.name ?? 'Player',
        isGuest: isGuestEmail(row.email),
        wins: row.wins,
        games: row.games,
        winRate: row.games ? Math.round((row.wins / row.games) * 1000) / 10 : 0,
      })),
    };
  }

  async getSoloLeaderboard(difficulty: Difficulty, period: Period) {
    const rows = await this.prisma.$queryRaw<
      {
        userId: string;
        name: string | null;
        email: string | null;
        timeSeconds: number;
        moves: number;
        playedAt: Date;
      }[]
    >`
      WITH best AS (${this.bestSoloRunsSql(difficulty, period)})
      SELECT b.user_id AS "userId", u.name, u.email,
             b.time_seconds AS "timeSeconds", b.moves, b.created_at AS "playedAt"
      FROM best b
      JOIN users u ON u.id = b.user_id
      ORDER BY b.time_seconds, b.moves, b.created_at, b.user_id
      LIMIT ${LEADERBOARD_SIZE}`;

    return {
      period,
      difficulty,
      entries: rows.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: row.name ?? 'Player',
        isGuest: isGuestEmail(row.email),
        timeSeconds: row.timeSeconds,
        moves: row.moves,
        playedAt: row.playedAt,
      })),
    };
  }

  // Best run per user: lowest time, then fewest moves, then earliest
  private bestSoloRunsSql(difficulty: Difficulty, period: Period) {
    return Prisma.sql`
      SELECT DISTINCT ON (user_id) user_id, time_seconds, moves, created_at
      FROM solo_runs
      WHERE game_type = ${GAME_TYPE} AND difficulty = ${difficulty}
        ${this.periodFilterSql('created_at', period)}
      ORDER BY user_id, time_seconds, moves, created_at`;
  }

  private periodFilterSql(column: 'mh.played_at' | 'created_at', period: Period) {
    const interval = PERIOD_INTERVALS[period];
    if (!interval) return Prisma.empty;
    return Prisma.sql`AND ${Prisma.raw(column)} >= (NOW() AT TIME ZONE 'UTC') - ${interval}::interval`;
  }
}
