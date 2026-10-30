/**
 * The rule set this engine plays: FMJD Annex 1 "Official FMJD rules for international draughts",
 * from the FMJD Annexes updated 21 August 2024 (which take precedence over the French FFJD
 * regulation of November 2015 where they differ). Every game records RULES_VERSION.
 */
export const RULES_VERSION = 'FMJD-Annex1-2024-08-21';

// Art. 6.2: 25 successive moves for each player with only kings moving, no man move, no capture
export const KING_MOVES_LIMIT = 50;
// Art. 6.3: 16 more moves each
export const ENDGAME_16_LIMIT = 32;
// Art. 6.3 (lone king alone on the long diagonal) and 6.4: 5 more moves each
export const ENDGAME_5_LIMIT = 10;
// Art. 6.1: third occurrence of the same position with the same player to move
export const REPETITIONS = 3;
