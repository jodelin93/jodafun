import { IsIn, IsInt, IsOptional } from 'class-validator';

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const PERIODS = ['day', 'week', 'month', 'all'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];
export type Period = (typeof PERIODS)[number];

export class SubmitSoloScoreDto {
  @IsIn(DIFFICULTIES)
  difficulty: Difficulty;

  @IsInt()
  timeSeconds: number;

  @IsInt()
  moves: number;
}

export class FriendsLeaderboardQueryDto {
  @IsOptional()
  @IsIn(PERIODS)
  period: Period = 'all';
}

export class SoloLeaderboardQueryDto extends FriendsLeaderboardQueryDto {
  @IsIn(DIFFICULTIES)
  difficulty: Difficulty;
}
