import { Prisma } from '@prisma/client';
import { DraughtsResults } from './draughts-results';
import type { DraughtsResult } from './draughts.types';
import type { Color, EndReason } from './engine/types';

const GAME_ID = '33333333-3333-4333-8333-333333333333';

// Seat 0 played black, seat 1 white
function result(winner: Color | null, reason: EndReason): DraughtsResult {
  return {
    outcome: { gameId: GAME_ID, winner, reason, moves: 2, finishedAt: 2_000 },
    players: [
      { id: 'p0', name: 'Ana', userId: 'u0', seat: 0, color: 'black' },
      { id: 'p1', name: 'Bo', userId: 'u1', seat: 1, color: 'white' },
    ],
    rulesVersion: 'FMJD-Annex1-2024-08-21',
    routes: [
      { from: 32, path: [28] },
      { from: 19, path: [23] },
    ],
    notation: ['32-28', '19-23'],
    startedAt: 1_000,
  };
}

function fakePrisma(existing = false, createError?: unknown) {
  const calls = { create: [] as any[], findUnique: [] as any[] };
  return {
    calls,
    game: {
      findUnique: async (args: unknown) => {
        calls.findUnique.push(args);
        return existing ? { id: 'x' } : null;
      },
      create: async (args: unknown) => {
        if (createError) throw createError;
        calls.create.push(args);
        return {};
      },
    },
  };
}

describe('DraughtsResults', () => {
  it('writes a won game keyed by its id: white is player 1, the winner and match points 2 / 0', async () => {
    const prisma = fakePrisma();
    expect(await new DraughtsResults(prisma as never).save(result('black', 'resignation'))).toBe(true);
    expect(prisma.calls.findUnique[0]).toEqual({ where: { id: GAME_ID }, select: { id: true } });
    const data = prisma.calls.create[0].data;
    expect(data).toEqual(
      expect.objectContaining({
        id: GAME_ID,
        gameType: 'international-draughts',
        status: 'completed',
        player1Id: 'u1',
        player2Id: 'u0',
        winnerId: 'u0',
        startedAt: new Date(1_000),
        completedAt: new Date(2_000),
      }),
    );
    expect(data.settings).toEqual({
      rulesVersion: 'FMJD-Annex1-2024-08-21',
      reason: 'resignation',
      winnerColor: 'black',
      moves: 2,
      notation: ['32-28', '19-23'],
      routes: [
        { from: 32, path: [28] },
        { from: 19, path: [23] },
      ],
    });
    expect(data.participants.create).toEqual([
      { userId: 'u0', seat: 0, team: 1, name: 'Ana', result: 'win', points: 2 },
      { userId: 'u1', seat: 1, team: 0, name: 'Bo', result: 'loss', points: 0 },
    ]);
    expect(data).not.toHaveProperty('hands');
  });

  it('writes a draw with no winner: both players draw, 1 point each', async () => {
    const prisma = fakePrisma();
    await new DraughtsResults(prisma as never).save(result(null, 'agreement'));
    const data = prisma.calls.create[0].data;
    expect(data.winnerId).toBeNull();
    expect(data.settings).toEqual(expect.objectContaining({ reason: 'agreement', winnerColor: null }));
    expect(data.settings).not.toHaveProperty('forfeit');
    expect(data.participants.create.map((p: any) => [p.seat, p.team, p.result, p.points])).toEqual([
      [0, 1, 'draw', 1],
      [1, 0, 'draw', 1],
    ]);
  });

  it('marks a forfeit', async () => {
    const prisma = fakePrisma();
    await new DraughtsResults(prisma as never).save(result('white', 'forfeit'));
    const data = prisma.calls.create[0].data;
    expect(data.winnerId).toBe('u1');
    expect(data.settings).toEqual(expect.objectContaining({ reason: 'forfeit', winnerColor: 'white', forfeit: true }));
  });

  it('does nothing when the game is already stored', async () => {
    const prisma = fakePrisma(true);
    expect(await new DraughtsResults(prisma as never).save(result('white', 'no-pieces'))).toBe(true);
    expect(prisma.calls.create).toHaveLength(0);
  });

  it('treats a concurrent duplicate write as already stored', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5' });
    expect(await new DraughtsResults(fakePrisma(false, duplicate) as never).save(result('white', 'blocked'))).toBe(true);
  });

  it('passes on any other database error so the caller retries', async () => {
    await expect(new DraughtsResults(fakePrisma(false, new Error('down')) as never).save(result(null, 'repetition'))).rejects.toThrow('down');
  });
});
