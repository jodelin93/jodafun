import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FIVE_GAME_TYPE, type FiveResult } from './five.types';

/**
 * Writes a finished five-in-a-row game once: the games row (id = game id), both game_participants
 * rows and every move as a game_moves row, in one nested create that Prisma runs as one
 * transaction. A retry after a crash, a reconnect or a duplicate call finds the row and does
 * nothing; a concurrent duplicate fails on the primary key (P2002) and counts as stored. The
 * game_moves unique keys (game, ply) and (game, x, y) rule out a repeated move number or cell.
 */
@Injectable()
export class FiveResults {
  constructor(private prisma: PrismaService) {}

  // True when the result is stored (now or by an earlier call)
  async save({ outcome, players, rulesVersion, moves, startedAt }: FiveResult): Promise<boolean> {
    const existing = await this.prisma.game.findUnique({ where: { id: outcome.gameId }, select: { id: true } });
    if (existing) return true;
    const x = players.find(p => p.symbol === 'X');
    const o = players.find(p => p.symbol === 'O');
    const winner = outcome.winner === null ? null : players.find(p => p.symbol === outcome.winner);
    try {
      await this.prisma.game.create({
        data: {
          id: outcome.gameId,
          gameType: FIVE_GAME_TYPE,
          status: 'completed',
          player1Id: x?.userId ?? null,
          player2Id: o?.userId ?? null,
          winnerId: winner?.userId ?? null,
          settings: {
            rulesVersion,
            reason: outcome.reason,
            winnerSymbol: outcome.winner,
            moves: outcome.moves,
            winLine: outcome.winLine?.map(c => ({ x: c.x, y: c.y })) ?? null,
          },
          startedAt: new Date(startedAt),
          completedAt: new Date(outcome.finishedAt),
          participants: {
            create: players.map(p => {
              const result = p.symbol === outcome.winner ? 'win' : 'loss';
              return {
                userId: p.userId,
                seat: p.seat,
                team: p.symbol === 'X' ? 0 : 1,
                name: p.name.slice(0, 100),
                result,
                points: result === 'win' ? 1 : 0,
              };
            }),
          },
          moves: {
            createMany: { data: moves.map(m => ({ ply: m.ply, symbol: m.symbol, x: m.x, y: m.y })) },
          },
        },
      });
      return true;
    } catch (error) {
      // Another call stored it first. A unique failure on a move instead (a repeated ply or cell)
      // rolls everything back and must not pass for stored, so the row is looked up again.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const stored = await this.prisma.game.findUnique({ where: { id: outcome.gameId }, select: { id: true } });
        if (stored) return true;
      }
      throw error;
    }
  }
}
