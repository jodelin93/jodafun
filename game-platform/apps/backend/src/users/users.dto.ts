import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Trim, NFC-normalise (so "ë" counts as one character) and collapse inner whitespace
function normaliseName({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : value;
}

export class UpdateMeDto {
  @Transform(normaliseName)
  @IsString({ message: 'Name is required' })
  @Matches(/^[\s\S]{2,20}$/u, { message: 'Name must be between 2 and 20 characters' })
  @Matches(/^[\p{L}\p{M}\p{Nd} ._-]*$/u, {
    message: 'Name can only contain letters, numbers, spaces, "-", "_" and "."',
  })
  @Matches(/^(?!guest )/i, { message: 'Names starting with "Guest " are reserved' })
  name: string;
}

export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  // Validated on the raw query string so a bad value yields a single error message
  @IsOptional()
  @Matches(/^([1-9]|[1-4][0-9]|50)$/, { message: 'limit must be an integer between 1 and 50' })
  limit?: string;

  // Which game's history; Joda Memory when left out, as before
  @IsOptional()
  @IsIn(['joda-memory', 'african-casino', 'dominoes'])
  game?: string;
}
