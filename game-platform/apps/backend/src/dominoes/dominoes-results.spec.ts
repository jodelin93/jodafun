import { Prisma } from '@prisma/client';
import { DominoResults } from './dominoes-results';
import type { DominoResult } from './dominoes.types';
import type { HandResult } from './engine/types';

const hand = (n: number, startSeat: number, points: number[], extra: Partial<HandResult> = {}): HandResult => ({
  hand: n,
  startSeat,
  ending: 'domino',
  outSeat: 1,
  remaining: [],
  pips: [12, 0],
  teamPips: [12, 0],
  winnerTeam: points[0] > 0 ? 0 : 1,
  points,
  scoresAfter: points,
  ...extra,
});

function result(players: 2 | 4, winnerTeam: number | null = 1, forfeit = false): DominoResult {
  return {
    outcome: {
      matchId: '22222222-2222-4222-8222-222222222222',
      winnerTeam,
      scores: [40, 105],
      forfeit,
      forfeitTeam: forfeit ? 0 : null,
      results: [
        hand(1, 2, [0, 12]),
        hand(2, 3, [40, 0], { ending: 'blocked', outSeat: null, pips: [3, 9, 4, 11], teamPips: [7, 20], winnerTeam: 0 }),
      ],
      finishedAt: 2_000,
    },
    players: Array.from({ length: players }, (_, seat) => ({ id: `p${seat}`, name: `P${seat}`, userId: `u${seat}`, seat })),
    mode: players === 4 ? 'partners' : 'head-to-head',
    capacity: players,
    targetScore: 100,
    rulesVersion: 1,
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

describe('DominoResults', () => {
  it('writes a partners match keyed by its id, with teams of opposite seats and every hand', async () => {
    const prisma = fakePrisma();
    expect(await new DominoResults(prisma as never).save(result(4))).toBe(true);
    expect(prisma.calls.findUnique[0]).toEqual({ where: { id: '22222222-2222-4222-8222-222222222222' }, select: { id: true } });
    const data = prisma.calls.create[0].data;
    expect(data).toEqual(
      expect.objectContaining({
        id: '22222222-2222-4222-8222-222222222222',
        gameType: 'dominoes',
        status: 'completed',
        startedAt: new Date(1_000),
        completedAt: new Date(2_000),
      }),
    );
    expect(data.settings).toEqual({
      mode: 'partners',
      players: 4,
      targetScore: 100,
      rulesVersion: 1,
      winnerTeam: 1,
      scores: [40, 105],
      hands: 2,
    });
    expect(data.participants.create.map((p: any) => [p.userId, p.seat, p.team, p.name, p.result, p.points])).toEqual([
      ['u0', 0, 0, 'P0', 'loss', 40],
      ['u1', 1, 1, 'P1', 'win', 105],
      ['u2', 2, 0, 'P2', 'loss', 40],
      ['u3', 3, 1, 'P3', 'win', 105],
    ]);
    expect(data.hands.create).toEqual([
      {
        handNumber: 1,
        dealerSeat: 2,
        pointsTeam0: 0,
        pointsTeam1: 12,
        breakdown: { ending: 'domino', outSeat: 1, pips: [12, 0], teamPips: [12, 0], winnerTeam: 1, points: [0, 12] },
      },
      {
        handNumber: 2,
        dealerSeat: 3,
        pointsTeam0: 40,
        pointsTeam1: 0,
        breakdown: { ending: 'blocked', outSeat: null, pips: [3, 9, 4, 11], teamPips: [7, 20], winnerTeam: 0, points: [40, 0] },
      },
    ]);
  });

  it('writes a head-to-head match with one player per side, and marks a forfeit', async () => {
    const prisma = fakePrisma();
    expect(await new DominoResults(prisma as never).save(result(2, 1, true))).toBe(true);
    const data = prisma.calls.create[0].data;
    expect(data.settings).toEqual(expect.objectContaining({ mode: 'head-to-head', players: 2, forfeit: true, forfeitTeam: 0 }));
    expect(data.participants.create.map((p: any) => [p.seat, p.team, p.result, p.points])).toEqual([
      [0, 0, 'loss', 40],
      [1, 1, 'win', 105],
    ]);
  });

  it('does nothing when the match is already stored', async () => {
    const prisma = fakePrisma(true);
    expect(await new DominoResults(prisma as never).save(result(4))).toBe(true);
    expect(prisma.calls.create).toHaveLength(0);
  });

  it('treats a concurrent duplicate write as already stored', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5' });
    expect(await new DominoResults(fakePrisma(false, duplicate) as never).save(result(4))).toBe(true);
  });

  it('passes on any other database error so the caller retries', async () => {
    await expect(new DominoResults(fakePrisma(false, new Error('down')) as never).save(result(2))).rejects.toThrow('down');
  });

  it('records nothing for a match abandoned before any tile was played', async () => {
    const prisma = fakePrisma();
    expect(await new DominoResults(prisma as never).save(result(2, null))).toBe(true);
    expect(prisma.calls.findUnique).toHaveLength(0);
    expect(prisma.calls.create).toHaveLength(0);
  });
});
