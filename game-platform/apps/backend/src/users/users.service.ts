import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isGuestEmail } from '../auth/session';
import { DIFFICULTIES, Difficulty } from '../scores/scores.dto';

const GAME_TYPE = 'joda-memory';
const CASINO = 'african-casino';
const DOMINOES = 'dominoes';
const DRAUGHTS = 'international-draughts';
const FIVE = 'five-in-a-row';
// Games recorded in game_participants (one row per seat, with teams)
export type TeamGameType = typeof CASINO | typeof DOMINOES;
export type GameResult = 'win' | 'loss' | 'draw';

type ColorRecord = { gamesPlayed: number; wins: number; draws: number; losses: number };
type SideRecord = { gamesPlayed: number; wins: number; losses: number };

// Win rate and win streaks of a two-player game, from the user's results newest first:
// winRate = wins / gamesPlayed × 100, rounded to 0.1; streaks count consecutive wins, and anything
// but a win (a loss or a draw) ends one
function winFigures(results: readonly { result: GameResult }[]) {
  const wins = results.filter(r => r.result === 'win').length;
  let currentStreak = 0;
  while (currentStreak < results.length && results[currentStreak].result === 'win') currentStreak++;
  let bestStreak = 0;
  let run = 0;
  for (const r of results) {
    run = r.result === 'win' ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  return { winRate: results.length ? Math.round((wins / results.length) * 1000) / 10 : 0, currentStreak, bestStreak };
}

/**
 * Draughts profile figures from the user's results, newest first. A draw is a game played but not
 * won: winRate = wins / gamesPlayed × 100, rounded to 0.1. Streaks count consecutive wins, newest
 * first, and a draw ends a winning streak just like a loss.
 */
export function draughtsStats(results: readonly { result: GameResult; color: 'white' | 'black' }[]) {
  const record = (rows: typeof results): ColorRecord => ({
    gamesPlayed: rows.length,
    wins: rows.filter(r => r.result === 'win').length,
    draws: rows.filter(r => r.result === 'draw').length,
    losses: rows.filter(r => r.result === 'loss').length,
  });
  return {
    ...record(results),
    ...winFigures(results),
    asWhite: record(results.filter(r => r.color === 'white')),
    asBlack: record(results.filter(r => r.color === 'black')),
  };
}

// Five-in-a-row profile figures from the user's results, newest first. The game has no draw, so
// every game is a win or a loss; winRate and streaks as for draughts.
export function fiveStats(results: readonly { result: GameResult; symbol: 'X' | 'O' }[]) {
  const record = (rows: typeof results): SideRecord => ({
    gamesPlayed: rows.length,
    wins: rows.filter(r => r.result === 'win').length,
    losses: rows.filter(r => r.result === 'loss').length,
  });
  return {
    ...record(results),
    ...winFigures(results),
    asX: record(results.filter(r => r.symbol === 'X')),
    asO: record(results.filter(r => r.symbol === 'O')),
  };
}

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
      casino: await this.getTeamGameStats(userId, CASINO),
      dominoes: await this.getTeamGameStats(userId, DOMINOES),
      draughts: await this.getDraughtsStats(userId),
      five: await this.getFiveStats(userId),
    };
  }

  // Joda Casino and Dominoes results: points are match points, never Memory pairs or times. Losses
  // and draws are counted from their own result rows (neither game records draws today, so draws is
  // always 0 for them).
  async getTeamGameStats(userId: string, gameType: TeamGameType) {
    const [row] = await this.prisma.$queryRaw<
      {
        gamesPlayed: number;
        wins: number;
        draws: number;
        losses: number;
        twoPlayer: number;
        fourPlayer: number;
        pointsFor: number;
        pointsAgainst: number;
      }[]
    >`
      SELECT COUNT(*)::int AS "gamesPlayed",
             COUNT(*) FILTER (WHERE p.result = 'win')::int AS wins,
             COUNT(*) FILTER (WHERE p.result = 'draw')::int AS draws,
             COUNT(*) FILTER (WHERE p.result = 'loss')::int AS losses,
             COUNT(*) FILTER (WHERE (g.settings->>'players')::int = 2)::int AS "twoPlayer",
             COUNT(*) FILTER (WHERE (g.settings->>'players')::int = 4)::int AS "fourPlayer",
             COALESCE(SUM(p.points), 0)::int AS "pointsFor",
             COALESCE(SUM((g.settings->'scores'->>(1 - p.team))::int), 0)::int AS "pointsAgainst"
      FROM game_participants p
      JOIN games g ON g.id = p.game_id
      WHERE p.user_id = ${userId} AND g.game_type = ${gameType}`;
    return {
      ...row,
      winRate: row.gamesPlayed ? Math.round((row.wins / row.gamesPlayed) * 1000) / 10 : 0,
    };
  }

  // Draughts results, newest first; see draughtsStats for how draws count
  async getDraughtsStats(userId: string) {
    const rows = await this.prisma.$queryRaw<{ result: GameResult; team: number }[]>`
      SELECT p.result, p.team
      FROM game_participants p
      JOIN games g ON g.id = p.game_id
      WHERE p.user_id = ${userId} AND g.game_type = ${DRAUGHTS}
      ORDER BY g.completed_at DESC, p.id DESC`;
    return draughtsStats(rows.map(r => ({ result: r.result, color: r.team === 0 ? 'white' : 'black' })));
  }

  // Five-in-a-row results, newest first; team 0 is X, 1 is O
  async getFiveStats(userId: string) {
    const rows = await this.prisma.$queryRaw<{ result: GameResult; team: number }[]>`
      SELECT p.result, p.team
      FROM game_participants p
      JOIN games g ON g.id = p.game_id
      WHERE p.user_id = ${userId} AND g.game_type = ${FIVE}
      ORDER BY g.completed_at DESC, p.id DESC`;
    return fiveStats(rows.map(r => ({ result: r.result, symbol: r.team === 0 ? 'X' : 'O' })));
  }

  // One row per draughts game the user played: their colour, the opponent by name, how it ended
  async getDraughtsHistory(userId: string, cursor: string | undefined, limit: number) {
    const { page, opponentOf, nextCursor } = await this.twoPlayerHistory(userId, DRAUGHTS, cursor, limit);
    return {
      items: page.map(r => ({
        id: r.id,
        result: r.result,
        color: r.team === 0 ? ('white' as const) : ('black' as const),
        // A name only: the opponent's account id stays private
        opponent: opponentOf(r),
        reason: r.settings?.reason ?? null,
        moves: r.settings?.moves ?? 0,
        rulesVersion: r.settings?.rulesVersion ?? null,
        finishedAt: r.finishedAt,
        forfeit: r.settings?.forfeit === true,
      })),
      nextCursor,
    };
  }

  // One row per five-in-a-row game the user played: their symbol, the opponent by name, how it ended
  async getFiveHistory(userId: string, cursor: string | undefined, limit: number) {
    const { page, opponentOf, nextCursor } = await this.twoPlayerHistory(userId, FIVE, cursor, limit);
    return {
      items: page.map(r => ({
        id: r.id,
        result: r.result,
        symbol: r.team === 0 ? ('X' as const) : ('O' as const),
        // A name only: the opponent's account id stays private
        opponent: opponentOf(r),
        reason: r.settings?.reason ?? null,
        moves: r.settings?.moves ?? 0,
        finishedAt: r.finishedAt,
        forfeit: r.settings?.reason === 'forfeit',
      })),
      nextCursor,
    };
  }

  // A page of the user's rows of a two-player game (draughts, five-in-a-row), newest first, with
  // the opponent of each row by name
  private async twoPlayerHistory(userId: string, gameType: string, cursor: string | undefined, limit: number) {
    let after = Prisma.empty;
    if (cursor) {
      const row = await this.prisma.gameParticipant.findFirst({
        where: { id: cursor, userId },
        select: { id: true },
      });
      if (!row) throw new BadRequestException('Invalid cursor');
      after = Prisma.sql`AND (g.completed_at, p.id) <
        (SELECT cg.completed_at, c.id FROM game_participants c JOIN games cg ON cg.id = c.game_id WHERE c.id = ${row.id})`;
    }
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        gameId: string;
        finishedAt: Date;
        result: GameResult;
        team: number;
        seat: number;
        settings: { reason?: string; moves?: number; rulesVersion?: string; forfeit?: boolean } | null;
      }[]
    >`
      SELECT p.id, p.game_id AS "gameId", g.completed_at AS "finishedAt", p.result, p.team, p.seat, g.settings
      FROM game_participants p
      JOIN games g ON g.id = p.game_id
      WHERE p.user_id = ${userId} AND g.game_type = ${gameType} ${after}
      ORDER BY g.completed_at DESC, p.id DESC
      LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const others = page.length
      ? await this.prisma.gameParticipant.findMany({
          where: { gameId: { in: page.map(r => r.gameId) } },
          select: { gameId: true, seat: true, name: true },
        })
      : [];
    const opponentOf = (r: (typeof page)[number]) => {
      const opponent = others.find(o => o.gameId === r.gameId && o.seat !== r.seat);
      return opponent ? { name: opponent.name } : null;
    };
    return { page, opponentOf, nextCursor: rows.length > limit ? page[page.length - 1].id : null };
  }

  // One row per Casino or Dominoes match the user played, with their teammate and opponents by name
  async getTeamGameHistory(userId: string, gameType: TeamGameType, cursor: string | undefined, limit: number) {
    let after = Prisma.empty;
    if (cursor) {
      const row = await this.prisma.gameParticipant.findFirst({
        where: { id: cursor, userId },
        select: { id: true },
      });
      if (!row) throw new BadRequestException('Invalid cursor');
      after = Prisma.sql`AND (g.completed_at, p.id) <
        (SELECT cg.completed_at, c.id FROM game_participants c JOIN games cg ON cg.id = c.game_id WHERE c.id = ${row.id})`;
    }
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        gameId: string;
        playedAt: Date;
        result: GameResult;
        team: number;
        seat: number;
        settings: {
          players?: number;
          targetPoints?: number; // Casino
          targetScore?: number; // Dominoes
          mode?: string; // Dominoes
          scores?: number[];
          hands?: number;
          forfeit?: boolean;
        } | null;
      }[]
    >`
      SELECT p.id, p.game_id AS "gameId", g.completed_at AS "playedAt", p.result, p.team, p.seat, g.settings
      FROM game_participants p
      JOIN games g ON g.id = p.game_id
      WHERE p.user_id = ${userId} AND g.game_type = ${gameType} ${after}
      ORDER BY g.completed_at DESC, p.id DESC
      LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const others = page.length
      ? await this.prisma.gameParticipant.findMany({
          where: { gameId: { in: page.map(r => r.gameId) } },
          select: { gameId: true, seat: true, team: true, name: true },
          orderBy: { seat: 'asc' },
        })
      : [];
    return {
      items: page.map(r => {
        const table = others.filter(o => o.gameId === r.gameId && o.seat !== r.seat);
        const scores = r.settings?.scores ?? [0, 0];
        return {
          id: r.id,
          playedAt: r.playedAt,
          result: r.result,
          players: r.settings?.players === 4 ? 4 : 2,
          // Dominoes rows carry the same fields (the target score as targetPoints) plus the mode
          ...(gameType === DOMINOES ? { mode: r.settings?.mode === 'partners' ? 'partners' : 'head-to-head' } : {}),
          targetPoints: (gameType === DOMINOES ? r.settings?.targetScore : r.settings?.targetPoints) ?? null,
          hands: r.settings?.hands ?? null,
          forfeit: r.settings?.forfeit === true,
          teamPoints: scores[r.team] ?? 0,
          opponentPoints: scores[1 - r.team] ?? 0,
          // Names only: other players' account ids stay private, as in Joda Memory history
          teammates: table.filter(o => o.team === r.team).map(o => ({ name: o.name })),
          opponents: table.filter(o => o.team !== r.team).map(o => ({ name: o.name })),
        };
      }),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
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
