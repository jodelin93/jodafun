import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CASINO_GAME_TYPE, type CasinoMatchPlayer, type CasinoOutcome } from './casino.types';

export interface CasinoResult {
  outcome: CasinoOutcome;
  players: CasinoMatchPlayer[];
  capacity: 2 | 4;
  targetPoints: number;
  startedAt: number;
}

const teamOfSeat = (capacity: number, seat: number) => (capacity === 4 ? seat % 2 : seat);

/**
 * Writes a finished Casino match once. The games row uses the match id as its primary key and is
 * created together with every participant and hand in one statement, so a retry after a crash,
 * a reconnect or a duplicate call finds the row and does nothing.
 */
@Injectable()
export class CasinoResults {
  constructor(private prisma: PrismaService) {}

  // True when the result is stored (now or by an earlier call)
  async save({ outcome, players, capacity, targetPoints, startedAt }: CasinoResult): Promise<boolean> {
    if (outcome.winnerTeam === null) return true; // abandoned before anyone played: nothing to record
    const existing = await this.prisma.game.findUnique({ where: { id: outcome.matchId }, select: { id: true } });
    if (existing) return true;
    try {
      await this.prisma.game.create({
        data: {
          id: outcome.matchId,
          gameType: CASINO_GAME_TYPE,
          status: 'completed',
          settings: {
            players: capacity,
            targetPoints,
            winnerTeam: outcome.winnerTeam,
            scores: outcome.scores,
            hands: outcome.results.length,
            ...(outcome.forfeit ? { forfeit: true, forfeitTeam: outcome.forfeitTeam } : {}),
          },
          startedAt: new Date(startedAt),
          completedAt: new Date(outcome.finishedAt),
          participants: {
            create: players.map(p => {
              const team = teamOfSeat(capacity, p.seat);
              return {
                userId: p.userId,
                seat: p.seat,
                team,
                name: p.name.slice(0, 100),
                result: team === outcome.winnerTeam ? 'win' : 'loss',
                points: outcome.scores[team] ?? 0,
              };
            }),
          },
          hands: {
            create: outcome.results.map(r => ({
              handNumber: r.hand,
              dealerSeat: r.dealer,
              pointsTeam0: r.teams[0].total,
              pointsTeam1: r.teams[1].total,
              breakdown: r.teams as unknown as Prisma.InputJsonValue,
            })),
          },
        },
      });
      return true;
    } catch (error) {
      // Another call stored it first
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return true;
      throw error;
    }
  }
}
