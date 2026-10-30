import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DRAUGHTS_GAME_TYPE, type DraughtsResult } from './draughts.types';

// FMJD tournament scoring: a win is worth 2 match points, a draw 1, a loss 0
const MATCH_POINTS = { win: 2, draw: 1, loss: 0 } as const;

/**
 * Writes a finished draughts game once, into the tables the other room games use (games,
 * game_participants; no game_hands). The games row uses the game id as its primary key and is
 * created together with both participants in one statement, so a retry after a crash, a reconnect
 * or a duplicate call finds the row and does nothing.
 */
@Injectable()
export class DraughtsResults {
  constructor(private prisma: PrismaService) {}

  // True when the result is stored (now or by an earlier call)
  async save({ outcome, players, rulesVersion, routes, notation, startedAt, series }: DraughtsResult): Promise<boolean> {
    const existing = await this.prisma.game.findUnique({ where: { id: outcome.gameId }, select: { id: true } });
    if (existing) return true;
    const white = players.find(p => p.color === 'white');
    const black = players.find(p => p.color === 'black');
    const winner = outcome.winner === null ? null : players.find(p => p.color === outcome.winner);
    try {
      await this.prisma.game.create({
        data: {
          id: outcome.gameId,
          gameType: DRAUGHTS_GAME_TYPE,
          status: 'completed',
          player1Id: white?.userId ?? null,
          player2Id: black?.userId ?? null,
          winnerId: winner?.userId ?? null, // null for a draw
          settings: {
            rulesVersion,
            reason: outcome.reason,
            winnerColor: outcome.winner,
            moves: outcome.moves,
            notation,
            routes,
            ...(outcome.reason === 'forfeit' ? { forfeit: true } : {}),
            ...(series ? { series } : {}),
          },
          startedAt: new Date(startedAt),
          completedAt: new Date(outcome.finishedAt),
          participants: {
            create: players.map(p => {
              const result = outcome.winner === null ? 'draw' : p.color === outcome.winner ? 'win' : 'loss';
              return {
                userId: p.userId,
                seat: p.seat,
                team: p.color === 'white' ? 0 : 1,
                name: p.name.slice(0, 100),
                result,
                points: MATCH_POINTS[result],
              };
            }),
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
