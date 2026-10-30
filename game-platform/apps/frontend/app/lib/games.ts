import type { LucideIcon } from 'lucide-react';
import type { homeMessages } from '../i18n/messages/home';
import type { gameNameMessages } from '../i18n/messages/gameNames';
import { Brain, ChessKnight, CircleDot, Dices, WholeWord, Lightbulb, Palette, Spade } from 'lucide-react';

type MessageKey = keyof (typeof homeMessages)['en'];
export type GameNameKey = keyof (typeof gameNameMessages)['en'];

// Games with a real page and rooms behind them
export type PlayableGameId = 'joda-memory' | 'african-casino' | 'dominoes' | 'international-draughts';

// Proper names, never translated, except the games in TRANSLATED_NAMES (for those this is only the
// English fallback; show names through useGameTitle)
export const GAME_TITLES: Record<PlayableGameId, string> = {
  'joda-memory': 'Joda Memory',
  'african-casino': 'Joda Casino',
  dominoes: 'Dominoes',
  'international-draughts': 'International Draughts',
};

// Games whose name and subtitle are translated (app/i18n/messages/gameNames.ts)
export const TRANSLATED_NAMES: Partial<Record<string, { title: GameNameKey; subtitle: GameNameKey }>> = {
  'international-draughts': { title: 'draughtsTitle', subtitle: 'draughtsSubtitle' },
};

// True for a game id the site has rooms for (e.g. a server's `gameType` or a saved room's `game`)
export const isPlayableGameId = (value: unknown): value is PlayableGameId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(GAME_TITLES, value);

export type Game = {
  id: string;
  title: string;
  description: MessageKey;
  Icon: LucideIcon;
  // Ranges only ("1–2", "5–15"); the labels around them are translated where shown
  players: string;
  // Shown instead of the range when the count isn't one ("2 or 4 players")
  playersLabel?: MessageKey;
  duration: string;
  tags: MessageKey[];
  available: boolean;
};

// Single source for the game catalog shown on the home and games pages
export const GAMES: Game[] = [
  {
    id: 'joda-memory',
    title: 'Joda Memory',
    description: 'descMemory',
    Icon: Brain,
    players: '1–2',
    duration: '5–15',
    tags: ['tagMemory', 'tagCards', 'tagMultiplayer'],
    available: true,
  },
  {
    id: 'african-casino',
    title: 'Joda Casino',
    description: 'descCasino',
    Icon: Spade,
    players: '2–4',
    playersLabel: 'playersTwoOrFour',
    duration: '20–40',
    tags: ['tagCards', 'tagStrategy', 'tagTeams'],
    available: true,
  },
  {
    id: 'dominoes',
    title: 'Dominoes',
    description: 'descDominoes',
    Icon: Dices,
    players: '2–4',
    playersLabel: 'playersTwoOrFour',
    duration: '20–45',
    tags: ['tagTiles', 'tagStrategy', 'tagTeams'],
    available: true,
  },
  {
    id: 'international-draughts',
    title: 'International Draughts', // shown translated (useGameTitle)
    description: 'descDraughts',
    Icon: CircleDot,
    players: '2',
    duration: '15–45',
    tags: ['tagBoardGame', 'tagStrategy', 'tagClassic'],
    available: true,
  },
  {
    id: 'classic-chess',
    title: 'Classic Chess',
    description: 'descChess',
    Icon: ChessKnight,
    players: '2',
    duration: '15–60',
    tags: ['tagStrategy', 'tagClassic', 'tagTurnBased'],
    available: false,
  },
  {
    id: 'word-warriors',
    title: 'Word Warriors',
    description: 'descWords',
    Icon: WholeWord,
    players: '2–4',
    duration: '10–20',
    tags: ['tagWordGame', 'tagMultiplayer', 'tagPuzzle'],
    available: false,
  },
  {
    id: 'trivia-master',
    title: 'Trivia Master',
    description: 'descTrivia',
    Icon: Lightbulb,
    players: '1–8',
    duration: '10–30',
    tags: ['tagTrivia', 'tagKnowledge', 'tagMultiplayer'],
    available: false,
  },
  {
    id: 'color-match',
    title: 'Color Match',
    description: 'descColor',
    Icon: Palette,
    players: '1–4',
    duration: '3–10',
    tags: ['tagReflex', 'tagQuickGame', 'tagCasual'],
    available: false,
  },
];

export const gamePath = (game: Game) => `/games/${game.id}`;
