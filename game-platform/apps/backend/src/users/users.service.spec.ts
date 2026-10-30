import { UsersService } from './users.service';

// Answers each raw query with the next queued result and records the values bound into it
function fakePrisma(answers: unknown[][], others: unknown[] = []) {
  const bound: unknown[][] = [];
  return {
    bound,
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      bound.push(values);
      return answers.shift() ?? [];
    },
    gameParticipant: { findMany: async () => others, findFirst: async () => null },
  };
}

const row = (gameId: string, settings: object) => ({
  id: `part-${gameId}`,
  gameId,
  playedAt: new Date('2026-10-01T00:00:00Z'),
  result: 'win',
  team: 0,
  seat: 0,
  settings,
});
const table = (gameId: string) => [
  { gameId, seat: 0, team: 0, name: 'Me' },
  { gameId, seat: 1, team: 1, name: 'Bo' },
  { gameId, seat: 2, team: 0, name: 'Cy' },
  { gameId, seat: 3, team: 1, name: 'Di' },
];

describe('UsersService team-game history and stats', () => {
  it('returns Casino rows exactly as before', async () => {
    const prisma = fakePrisma([[row('g1', { players: 4, targetPoints: 7, scores: [8, 3], hands: 5 })]], table('g1'));
    const page = await new UsersService(prisma as never).getTeamGameHistory('u', 'african-casino', undefined, 20);
    expect(prisma.bound[0]).toContain('african-casino');
    expect(page.items[0]).toEqual({
      id: 'part-g1',
      playedAt: new Date('2026-10-01T00:00:00Z'),
      result: 'win',
      players: 4,
      targetPoints: 7,
      hands: 5,
      forfeit: false,
      teamPoints: 8,
      opponentPoints: 3,
      teammates: [{ name: 'Cy' }],
      opponents: [{ name: 'Bo' }, { name: 'Di' }],
    });
    expect(Object.keys(page.items[0])).not.toContain('mode');
  });

  it('returns Dominoes rows in the same shape, with the mode and the target score', async () => {
    const settings = { mode: 'partners', players: 4, targetScore: 150, scores: [152, 90], hands: 9, forfeit: true, forfeitTeam: 1 };
    const prisma = fakePrisma([[row('g2', settings)]], table('g2'));
    const page = await new UsersService(prisma as never).getTeamGameHistory('u', 'dominoes', undefined, 20);
    expect(prisma.bound[0]).toContain('dominoes');
    expect(page.items[0]).toEqual(
      expect.objectContaining({ players: 4, mode: 'partners', targetPoints: 150, hands: 9, forfeit: true, teamPoints: 152, opponentPoints: 90 }),
    );
    expect(page.items[0].teammates).toEqual([{ name: 'Cy' }]);
    expect(page.nextCursor).toBeNull();
  });

  it('adds a dominoes block shaped like the casino block to the stats', async () => {
    const totals = { gamesPlayed: 0, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, currentStreak: 0, bestStreak: 0 };
    const casino = { gamesPlayed: 4, wins: 3, twoPlayer: 1, fourPlayer: 3, pointsFor: 30, pointsAgainst: 20 };
    const dominoes = { gamesPlayed: 2, wins: 1, twoPlayer: 2, fourPlayer: 0, pointsFor: 210, pointsAgainst: 180 };
    const prisma = fakePrisma([[totals], [], [casino], [dominoes]]);
    const stats = await new UsersService(prisma as never).getStats('u');
    expect(prisma.bound[2]).toContain('african-casino');
    expect(prisma.bound[3]).toContain('dominoes');
    expect(stats.casino).toEqual({ ...casino, losses: 1, winRate: 75 });
    expect(stats.dominoes).toEqual({ ...dominoes, losses: 1, winRate: 50 });
  });
});
