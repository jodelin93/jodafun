import type { LucideIcon } from 'lucide-react';
import type { homeMessages } from '../i18n/messages/home';
import { Brain, ChessKnight, Grid3x3, WholeWord, Lightbulb, Palette } from 'lucide-react';

type MessageKey = keyof (typeof homeMessages)['en'];

export type Game = {
  id: string;
  title: string;
  description: MessageKey;
  Icon: LucideIcon;
  // Ranges only ("1–2", "5–15"); the labels around them are translated where shown
  players: string;
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
    id: 'speed-checkers',
    title: 'Speed Checkers',
    description: 'descCheckers',
    Icon: Grid3x3,
    players: '2',
    duration: '10–20',
    tags: ['tagStrategy', 'tagFastPaced', 'tagClassic'],
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
