import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isGuestEmail } from '../auth/session';
import { DIFFICULTIES, Difficulty } from '../scores/scores.dto';

const GAME_TYPE = 'joda-memory';

type SoloBest = { bestTimeSeconds: number; bestMoves: number; runs: number } | null;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async updateName(userId: string, name: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, name: true },
    });
    return { id: user.id, name: user.name };
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      name: user.name ?? 'Player',
      isGuest: isGuestEmail(user.email),
      memberSince: user.createdAt,
      stats: await this.getStats(user.id),
    };
  }

  async getStats(userId: string) {
    // Multiplayer totals and streaks. Games are ordered newest first (rn = 1 is the latest);
    // for consecutive wins rn - ROW_NUMBER() is constant, so each grp is one winning run and
    // grp = 0 is the run that includes the most recent game.
    const [totals] = await this.prisma.$queryRaw<
      {
        gamesPlayed: number;
        wins: number;
        losses: number;
        roundsWon: number;
        roundsLost: number;
        currentStreak: number;
        bestStreak: number;
      }[]
    >`
      WITH h AS (
        SELECT mh.result, mh.rounds_won, mh.rounds_lost,
               ROW_NUMBER() OVER (ORDER BY mh.played_at DESC, mh.id DESC) AS rn
        FROM match_history mh
        JOIN games g ON g.id = mh.game_id
        WHERE mh.user_id = ${userId} AND g.game_type = ${GAME_TYPE}
      ),
      w AS (
        SELECT rn - ROW_NUMBER() OVER (ORDER BY rn) AS grp FROM h WHERE result = 'win'
      )
      SELECT
        (SELECT COUNT(*) FROM h)::int AS "gamesPlayed",
        (SELECT COUNT(*) FROM h WHERE result = 'win')::int AS wins,
        (SELECT COUNT(*) FROM h WHERE result = 'loss')::int AS losses,
        (SELECT COALESCE(SUM(rounds_won), 0) FROM h)::int AS "roundsWon",
        (SELECT COALESCE(SUM(rounds_lost), 0) FROM h)::int AS "roundsLost",
        (SELECT COUNT(*) FROM w WHERE grp = 0)::int AS "currentStreak",
        (SELECT COALESCE(MAX(len), 0) FROM (SELECT COUNT(*) AS len FROM w GROUP BY grp) s)::int
          AS "bestStreak"`;

    const soloRows = await this.prisma.$queryRaw<
      { difficulty: Difficulty; bestTimeSeconds: number; bestMoves: number; runs: number }[]
    >`
      SELECT difficulty,
             MIN(time_seconds)::int AS "bestTimeSeconds",
             MIN(moves)::int AS "bestMoves",
             COUNT(*)::int AS runs
      FROM solo_runs
      WHERE user_id = ${userId} AND game_type = ${GAME_TYPE}
        AND difficulty IN (${Prisma.join([...DIFFICULTIES])})
      GROUP BY difficulty`;

    const solo = Object.fromEntries(DIFFICULTIES.map((d) => [d, null])) as Record<
      Difficulty,
      SoloBest
    >;
    for (const row of soloRows) {
      solo[row.difficulty] = {
        bestTimeSeconds: row.bestTimeSeconds,
        bestMoves: row.bestMoves,
        runs: row.runs,
      };
    }

    return {
      ...totals,
      winRate: totals.gamesPlayed
        ? Math.round((totals.wins / totals.gamesPlayed) * 1000) / 10
        : 0,
      solo,
    };
  }

  async getHistory(userId: string, cursor: string | undefined, limit: number) {
    let after = Prisma.empty;
    if (cursor) {
      const row = await this.prisma.matchHistory.findFirst({
        where: { id: cursor, userId },
        select: { id: true },
      });
      if (!row) throw new BadRequestException('Invalid cursor');
      // Keyset pagination matching ORDER BY played_at DESC, id DESC. The cursor's played_at is
      // read in SQL so microsecond precision and the timestamp type are preserved.
      after = Prisma.sql`AND (mh.played_at, mh.id) <
        (SELECT c.played_at, c.id FROM match_history c WHERE c.id = ${row.id})`;
    }

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        playedAt: Date;
        result: 'win' | 'loss';
        opponentId: string | null;
        opponentName: string | null;
        roundsWon: number;
        roundsLost: number;
        totalScore: number;
        forfeit: boolean;
        difficulty: string | null;
      }[]
    >`
      SELECT mh.id, mh.played_at AS "playedAt", mh.result,
             mh.opponent_id AS "opponentId", o.name AS "opponentName",
             mh.rounds_won AS "roundsWon", mh.rounds_lost AS "roundsLost",
             mh.total_score AS "totalScore",
             COALESCE(g.settings->>'forfeit' = 'true', false) AS forfeit,
             g.settings->>'difficulty' AS difficulty
      FROM match_history mh
      JOIN games g ON g.id = mh.game_id
      LEFT JOIN users o ON o.id = mh.opponent_id
      WHERE mh.user_id = ${userId} AND g.game_type = ${GAME_TYPE} ${after}
      ORDER BY mh.played_at DESC, mh.id DESC
      LIMIT ${limit + 1}`;

    const page = rows.slice(0, limit);
    return {
      items: page.map(({ opponentId, opponentName, ...row }) => ({
        ...row,
        opponentName: opponentId ? (opponentName ?? 'Player') : null,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }
}
