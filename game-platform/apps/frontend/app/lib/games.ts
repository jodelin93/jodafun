import type { LucideIcon } from 'lucide-react';
import { Brain, ChessKnight, Grid3x3, WholeWord, Lightbulb, Palette } from 'lucide-react';

export type Game = {
  id: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  players: string;
  duration: string;
  tags: string[];
  available: boolean;
};

// Single source for the game catalog shown on the home and games pages
export const GAMES: Game[] = [
  {
    id: 'joda-memory',
    title: 'Joda Memory',
    description: 'Flip cards and find the matching pairs. Play alone to beat your best time, or take turns with a friend.',
    Icon: Brain,
    players: '1–2 players',
    duration: '5–15 min',
    tags: ['Memory', 'Cards', 'Multiplayer'],
    available: true,
  },
  {
    id: 'classic-chess',
    title: 'Classic Chess',
    description: 'The game of strategy, played against a friend.',
    Icon: ChessKnight,
    players: '2 players',
    duration: '15–60 min',
    tags: ['Strategy', 'Classic', 'Turn-based'],
    available: false,
  },
  {
    id: 'speed-checkers',
    title: 'Speed Checkers',
    description: 'Checkers with a timer on every turn.',
    Icon: Grid3x3,
    players: '2 players',
    duration: '10–20 min',
    tags: ['Strategy', 'Fast-paced', 'Classic'],
    available: false,
  },
  {
    id: 'word-warriors',
    title: 'Word Warriors',
    description: 'Build better words than your opponents to win the round.',
    Icon: WholeWord,
    players: '2–4 players',
    duration: '10–20 min',
    tags: ['Word Game', 'Multiplayer', 'Puzzle'],
    available: false,
  },
  {
    id: 'trivia-master',
    title: 'Trivia Master',
    description: 'Answer questions across categories and see who knows the most.',
    Icon: Lightbulb,
    players: '1–8 players',
    duration: '10–30 min',
    tags: ['Trivia', 'Knowledge', 'Multiplayer'],
    available: false,
  },
  {
    id: 'color-match',
    title: 'Color Match',
    description: 'Match colors as fast as you can. Speed and accuracy both count.',
    Icon: Palette,
    players: '1–4 players',
    duration: '3–10 min',
    tags: ['Reflex', 'Quick Game', 'Casual'],
    available: false,
  },
];

export const gamePath = (game: Game) => `/games/${game.id}`;
