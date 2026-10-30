import { Prisma } from '@prisma/client';
import { CasinoResults, type CasinoResult } from './casino-results';

const result = (winnerTeam: number | null = 1): CasinoResult => ({
  outcome: {
    matchId: '11111111-1111-4111-8111-111111111111',
    winnerTeam,
    scores: [14, 23],
    forfeit: false,
    forfeitTeam: null,
    results: [
      {
        hand: 1,
        dealer: 3,
        lastCapturer: 2,
        teams: [
          { cards: 25, total: 0 },
          { cards: 27, total: 1 },
        ],
        scoresAfter: [0, 1],
      },
    ],
    finishedAt: 2_000,
  },
  players: [0, 1, 2, 3].map(seat => ({ id: `p${seat}`, name: `P${seat}`, userId: `u${seat}`, seat })),
  capacity: 4,
  targetPoints: 21,
  startedAt: 1_000,
});

function fakePrisma(existing = false, createError?: unknown) {
  const calls = { create: [] as any[] };
  return {
    calls,
    game: {
      findUnique: async () => (existing ? { id: 'x' } : null),
      create: async (args: unknown) => {
        if (createError) throw createError;
        calls.create.push(args);
        return {};
      },
    },
  };
}

describe('CasinoResults', () => {
  it('writes the match, every participant with their team, and each hand', async () => {
    const prisma = fakePrisma();
    expect(await new CasinoResults(prisma as never).save(result())).toBe(true);
    const data = prisma.calls.create[0].data;
    expect(data.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(data.gameType).toBe('african-casino');
    expect(data.participants.create.map((p: any) => [p.seat, p.team, p.result, p.points])).toEqual([
      [0, 0, 'loss', 14],
      [1, 1, 'win', 23],
      [2, 0, 'loss', 14],
      [3, 1, 'win', 23],
    ]);
    expect(data.hands.create).toEqual([expect.objectContaining({ handNumber: 1, dealerSeat: 3, pointsTeam0: 0, pointsTeam1: 1 })]);
  });

  it('does nothing when the match is already stored', async () => {
    const prisma = fakePrisma(true);
    expect(await new CasinoResults(prisma as never).save(result())).toBe(true);
    expect(prisma.calls.create).toHaveLength(0);
  });

  it('treats a concurrent duplicate write as already stored', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5' });
    const prisma = fakePrisma(false, duplicate);
    expect(await new CasinoResults(prisma as never).save(result())).toBe(true);
  });

  it('records nothing for a match abandoned before anyone played', async () => {
    const prisma = fakePrisma();
    expect(await new CasinoResults(prisma as never).save(result(null))).toBe(true);
    expect(prisma.calls.create).toHaveLength(0);
  });
});
