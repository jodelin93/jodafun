import { Prisma } from '@prisma/client';
import { FiveResults } from './five-results';
import type { FiveResult } from './five.types';
import type { FiveEndReason, FiveSymbol } from './engine/types';

const GAME_ID = '44444444-4444-4444-8444-444444444444';
const HUGE = (10n ** 300n).toString();

// Seat 0 played O, seat 1 X
function result(winner: FiveSymbol, reason: FiveEndReason): FiveResult {
  return {
    outcome: {
      gameId: GAME_ID,
      winner,
      reason,
      moves: 3,
      winLine: reason === 'five' ? [0, 1, 2, 3, 4].map(i => ({ x: String(i), y: '0' })) : null,
      finishedAt: 2_000,
    },
    players: [
      { id: 'p0', name: 'Ana', userId: 'u0', seat: 0, symbol: 'O' },
      { id: 'p1', name: 'Bo', userId: 'u1', seat: 1, symbol: 'X' },
    ],
    rulesVersion: 'five-in-a-row-1',
    moves: [
      { ply: 1, symbol: 'X', x: '0', y: '0' },
      { ply: 2, symbol: 'O', x: `-${HUGE}`, y: HUGE },
      { ply: 3, symbol: 'X', x: '-12', y: '345' },
    ],
    startedAt: 1_000,
  };
}

function fakePrisma(existing: boolean | (() => boolean) = false, createError?: unknown) {
  const calls = { create: [] as any[], findUnique: [] as any[] };
  return {
    calls,
    game: {
      findUnique: async (args: unknown) => {
        calls.findUnique.push(args);
        return (typeof existing === 'function' ? existing() : existing) ? { id: 'x' } : null;
      },
      create: async (args: unknown) => {
        if (createError) throw createError;
        calls.create.push(args);
        return {};
      },
    },
  };
}

describe('FiveResults', () => {
  it('writes the game, both players and every move in one create keyed by the game id', async () => {
    const prisma = fakePrisma();
    expect(await new FiveResults(prisma as never).save(result('O', 'resignation'))).toBe(true);
    expect(prisma.calls.findUnique[0]).toEqual({ where: { id: GAME_ID }, select: { id: true } });
    expect(prisma.calls.create).toHaveLength(1);
    const data = prisma.calls.create[0].data;
    expect(data).toEqual(
      expect.objectContaining({
        id: GAME_ID,
        gameType: 'five-in-a-row',
        status: 'completed',
        player1Id: 'u1', // X
        player2Id: 'u0', // O
        winnerId: 'u0',
        startedAt: new Date(1_000),
        completedAt: new Date(2_000),
      }),
    );
    expect(data.settings).toEqual({ rulesVersion: 'five-in-a-row-1', reason: 'resignation', winnerSymbol: 'O', moves: 3, winLine: null });
    expect(data.participants.create).toEqual([
      { userId: 'u0', seat: 0, team: 1, name: 'Ana', result: 'win', points: 1 },
      { userId: 'u1', seat: 1, team: 0, name: 'Bo', result: 'loss', points: 0 },
    ]);
    // Every move as a game_moves row, coordinates as canonical decimal strings of any size
    expect(data.moves).toEqual({
      createMany: {
        data: [
          { ply: 1, symbol: 'X', x: '0', y: '0' },
          { ply: 2, symbol: 'O', x: `-${HUGE}`, y: HUGE },
          { ply: 3, symbol: 'X', x: '-12', y: '345' },
        ],
      },
    });
    expect(data).not.toHaveProperty('hands');
  });

  it('keeps the winning line of a five', async () => {
    const prisma = fakePrisma();
    await new FiveResults(prisma as never).save(result('X', 'five'));
    const data = prisma.calls.create[0].data;
    expect(data.winnerId).toBe('u1');
    expect(data.settings).toEqual(
      expect.objectContaining({ reason: 'five', winnerSymbol: 'X', winLine: [0, 1, 2, 3, 4].map(i => ({ x: String(i), y: '0' })) }),
    );
    expect(data.participants.create.map((p: any) => [p.seat, p.team, p.result, p.points])).toEqual([
      [0, 1, 'loss', 0],
      [1, 0, 'win', 1],
    ]);
  });

  it('does nothing when the game is already stored', async () => {
    const prisma = fakePrisma(true);
    expect(await new FiveResults(prisma as never).save(result('X', 'forfeit'))).toBe(true);
    expect(prisma.calls.create).toHaveLength(0);
  });

  it('treats a concurrent duplicate of the game as already stored', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5' });
    let lookups = 0;
    // Not there at the first look, there after the failed create
    const prisma = fakePrisma(() => lookups++ > 0, duplicate);
    expect(await new FiveResults(prisma as never).save(result('X', 'five'))).toBe(true);
    expect(prisma.calls.findUnique).toHaveLength(2);
  });

  it('does not take a unique failure on a move (nothing stored) for a stored game', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5' });
    await expect(new FiveResults(fakePrisma(false, duplicate) as never).save(result('X', 'five'))).rejects.toBe(duplicate);
  });

  it('passes on any other database error so the caller retries', async () => {
    await expect(new FiveResults(fakePrisma(false, new Error('down')) as never).save(result('O', 'five'))).rejects.toThrow('down');
  });
});
