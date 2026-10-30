import { UsersService, draughtsStats, fiveStats } from './users.service';

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

  it('adds a dominoes block shaped like the casino block, losses and draws counted from their own rows', async () => {
    const totals = { gamesPlayed: 0, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, currentStreak: 0, bestStreak: 0 };
    // What the query returns for existing data: only win and loss rows, so draws are 0
    const casino = { gamesPlayed: 4, wins: 3, draws: 0, losses: 1, twoPlayer: 1, fourPlayer: 3, pointsFor: 30, pointsAgainst: 20 };
    const dominoes = { gamesPlayed: 2, wins: 1, draws: 0, losses: 1, twoPlayer: 2, fourPlayer: 0, pointsFor: 210, pointsAgainst: 180 };
    const prisma = fakePrisma([[totals], [], [casino], [dominoes], [], []]);
    const stats = await new UsersService(prisma as never).getStats('u');
    expect(prisma.bound[2]).toContain('african-casino');
    expect(prisma.bound[3]).toContain('dominoes');
    expect(prisma.bound[4]).toContain('international-draughts');
    expect(prisma.bound[5]).toEqual(['u', 'five-in-a-row']);
    // The same numbers as before the draws column existed (losses = gamesPlayed - wins for them)
    expect(stats.casino).toEqual({ ...casino, losses: 1, winRate: 75 });
    expect(stats.dominoes).toEqual({ ...dominoes, losses: 1, winRate: 50 });
    expect(stats.draughts).toEqual({
      gamesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
      currentStreak: 0,
      bestStreak: 0,
      asWhite: { gamesPlayed: 0, wins: 0, draws: 0, losses: 0 },
      asBlack: { gamesPlayed: 0, wins: 0, draws: 0, losses: 0 },
    });
    expect(stats.five).toEqual({
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      currentStreak: 0,
      bestStreak: 0,
      asX: { gamesPlayed: 0, wins: 0, losses: 0 },
      asO: { gamesPlayed: 0, wins: 0, losses: 0 },
    });
  });
});

describe('UsersService draughts stats and history', () => {
  it('counts draws as played but not won, and a draw ends a winning streak', async () => {
    // Newest first: win, win, draw, win, win, win, loss
    const rows = [
      { result: 'win', team: 0 },
      { result: 'win', team: 1 },
      { result: 'draw', team: 0 },
      { result: 'win', team: 1 },
      { result: 'win', team: 0 },
      { result: 'win', team: 1 },
      { result: 'loss', team: 0 },
    ];
    const prisma = fakePrisma([rows]);
    const stats = await new UsersService(prisma as never).getDraughtsStats('u');
    expect(prisma.bound[0]).toEqual(['u', 'international-draughts']);
    expect(stats).toEqual({
      gamesPlayed: 7,
      wins: 5,
      draws: 1,
      losses: 1,
      winRate: 71.4,
      currentStreak: 2,
      bestStreak: 3,
      asWhite: { gamesPlayed: 4, wins: 2, draws: 1, losses: 1 },
      asBlack: { gamesPlayed: 3, wins: 3, draws: 0, losses: 0 },
    });
  });

  it('has no current streak when the latest game was a draw', () => {
    const stats = draughtsStats([
      { result: 'draw', color: 'white' },
      { result: 'win', color: 'black' },
      { result: 'win', color: 'white' },
    ]);
    expect(stats).toEqual(expect.objectContaining({ gamesPlayed: 3, wins: 2, draws: 1, losses: 0, winRate: 66.7, currentStreak: 0, bestStreak: 2 }));
    expect(draughtsStats([{ result: 'draw', color: 'white' }])).toEqual(expect.objectContaining({ winRate: 0, currentStreak: 0, bestStreak: 0 }));
  });

  it('returns history rows with the colour, the opponent by name and how the game ended', async () => {
    const settings = { rulesVersion: 'FMJD-Annex1-2024-08-21', reason: 'agreement', winnerColor: null, moves: 41, notation: [], routes: [] };
    const finishedAt = new Date('2026-10-02T00:00:00Z');
    const rows = [
      { id: 'part-a', gameId: 'ga', finishedAt, result: 'draw', team: 1, seat: 0, settings },
      { id: 'part-b', gameId: 'gb', finishedAt, result: 'loss', team: 0, seat: 1, settings: { ...settings, reason: 'forfeit', winnerColor: 'black', forfeit: true, moves: 3 } },
      { id: 'part-c', gameId: 'gc', finishedAt, result: 'win', team: 0, seat: 0, settings },
    ];
    const others = [
      { gameId: 'ga', seat: 0, name: 'Me' },
      { gameId: 'ga', seat: 1, name: 'Bo' },
      { gameId: 'gb', seat: 0, name: 'Cy' },
      { gameId: 'gb', seat: 1, name: 'Me' },
    ];
    const prisma = fakePrisma([rows], others);
    const page = await new UsersService(prisma as never).getDraughtsHistory('u', undefined, 2);
    expect(prisma.bound[0]).toContain('international-draughts');
    expect(page.items).toEqual([
      {
        id: 'part-a',
        result: 'draw',
        color: 'black',
        opponent: { name: 'Bo' },
        reason: 'agreement',
        moves: 41,
        rulesVersion: 'FMJD-Annex1-2024-08-21',
        finishedAt,
        forfeit: false,
      },
      {
        id: 'part-b',
        result: 'loss',
        color: 'white',
        opponent: { name: 'Cy' },
        reason: 'forfeit',
        moves: 3,
        rulesVersion: 'FMJD-Annex1-2024-08-21',
        finishedAt,
        forfeit: true,
      },
    ]);
    expect(page.nextCursor).toBe('part-b');
  });

  it('rejects a cursor that is not one of the user’s rows', async () => {
    await expect(new UsersService(fakePrisma([]) as never).getDraughtsHistory('u', 'nope', 20)).rejects.toThrow('Invalid cursor');
  });
});

describe('UsersService five-in-a-row stats and history', () => {
  it('counts wins and losses by symbol (team 0 = X) with win streaks, newest first', async () => {
    // Newest first: win, win, loss, win, win, win, loss
    const rows = [
      { result: 'win', team: 0 },
      { result: 'win', team: 1 },
      { result: 'loss', team: 0 },
      { result: 'win', team: 1 },
      { result: 'win', team: 0 },
      { result: 'win', team: 1 },
      { result: 'loss', team: 1 },
    ];
    const prisma = fakePrisma([rows]);
    const stats = await new UsersService(prisma as never).getFiveStats('u');
    expect(prisma.bound[0]).toEqual(['u', 'five-in-a-row']);
    expect(stats).toEqual({
      gamesPlayed: 7,
      wins: 5,
      losses: 2,
      winRate: 71.4,
      currentStreak: 2,
      bestStreak: 3,
      asX: { gamesPlayed: 3, wins: 2, losses: 1 },
      asO: { gamesPlayed: 4, wins: 3, losses: 1 },
    });
    expect(Object.keys(stats)).not.toContain('draws');
  });

  it('has no current streak after a loss', () => {
    expect(fiveStats([{ result: 'loss', symbol: 'X' }, { result: 'win', symbol: 'O' }])).toEqual(
      expect.objectContaining({ gamesPlayed: 2, wins: 1, losses: 1, winRate: 50, currentStreak: 0, bestStreak: 1 }),
    );
  });

  it('returns history rows with the symbol, the opponent by name and how the game ended', async () => {
    const settings = { rulesVersion: 'five-in-a-row-1', reason: 'five', winnerSymbol: 'X', moves: 41, winLine: [] };
    const finishedAt = new Date('2026-10-30T00:00:00Z');
    const rows = [
      { id: 'part-a', gameId: 'ga', finishedAt, result: 'win', team: 0, seat: 1, settings },
      { id: 'part-b', gameId: 'gb', finishedAt, result: 'loss', team: 1, seat: 0, settings: { ...settings, reason: 'forfeit', winLine: null, moves: 3 } },
      { id: 'part-c', gameId: 'gc', finishedAt, result: 'win', team: 0, seat: 0, settings },
    ];
    const others = [
      { gameId: 'ga', seat: 0, name: 'Bo' },
      { gameId: 'ga', seat: 1, name: 'Me' },
      { gameId: 'gb', seat: 0, name: 'Me' },
    ];
    const prisma = fakePrisma([rows], others);
    const page = await new UsersService(prisma as never).getFiveHistory('u', undefined, 2);
    expect(prisma.bound[0]).toContain('five-in-a-row');
    expect(page).toEqual({
      items: [
        { id: 'part-a', result: 'win', symbol: 'X', opponent: { name: 'Bo' }, reason: 'five', moves: 41, finishedAt, forfeit: false },
        { id: 'part-b', result: 'loss', symbol: 'O', opponent: null, reason: 'forfeit', moves: 3, finishedAt, forfeit: true },
      ],
      nextCursor: 'part-b',
    });
  });

  it('rejects a cursor that is not one of the user’s rows', async () => {
    await expect(new UsersService(fakePrisma([]) as never).getFiveHistory('u', 'nope', 20)).rejects.toThrow('Invalid cursor');
  });
});
