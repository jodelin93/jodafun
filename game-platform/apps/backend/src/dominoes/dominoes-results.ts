import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DOMINOES_GAME_TYPE, type DominoResult } from './dominoes.types';

const teamOfSeat = (capacity: number, seat: number) => (capacity === 4 ? seat % 2 : seat);

/**
 * Writes a finished Dominoes match once, into the same tables as Joda Casino (games,
 * game_participants, game_hands). The games row uses the match id as its primary key and is
 * created together with every participant and hand in one statement, so a retry after a crash,
 * a reconnect or a duplicate call finds the row and does nothing.
 */
@Injectable()
export class DominoResults {
  constructor(private prisma: PrismaService) {}

  // True when the result is stored (now or by an earlier call)
  async save({ outcome, players, mode, capacity, targetScore, rulesVersion, startedAt }: DominoResult): Promise<boolean> {
    if (outcome.winnerTeam === null) return true; // abandoned before any tile was played: nothing to record
    const existing = await this.prisma.game.findUnique({ where: { id: outcome.matchId }, select: { id: true } });
    if (existing) return true;
    try {
      await this.prisma.game.create({
        data: {
          id: outcome.matchId,
          gameType: DOMINOES_GAME_TYPE,
          status: 'completed',
          settings: {
            mode,
            players: capacity,
            targetScore,
            rulesVersion,
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
              dealerSeat: r.startSeat, // the seat that started the hand
              pointsTeam0: r.points[0] ?? 0,
              pointsTeam1: r.points[1] ?? 0,
              breakdown: {
                ending: r.ending,
                outSeat: r.outSeat,
                pips: r.pips,
                teamPips: r.teamPips,
                winnerTeam: r.winnerTeam,
                points: r.points,
              },
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
