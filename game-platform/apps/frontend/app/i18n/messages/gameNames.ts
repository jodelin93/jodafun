import { defineMessages } from '../I18nProvider';

// Game names that are translated (most games keep a proper name: GAME_TITLES in app/lib/games.ts)
export const gameNameMessages = defineMessages({
  en: {
    draughtsTitle: 'International Draughts',
    draughtsSubtitle: 'International draughts · 20 men',
    fiveTitle: 'Infinite Five-in-a-Row',
    fiveSubtitle: 'Five in a row on a grid without edges · 2 players',
  },
  fr: {
    draughtsTitle: 'Jeu de dames',
    draughtsSubtitle: 'Dames internationales · 20 pions',
    fiveTitle: 'Morpion infini',
    fiveSubtitle: 'Cinq alignés sur une grille sans limite · 2 joueurs',
  },
  ht: {
    draughtsTitle: 'Jwèt dam',
    draughtsSubtitle: 'Dam entènasyonal · 20 pyon',
    fiveTitle: 'Mòpyon san limit',
    fiveSubtitle: 'Senk youn dèyè lòt sou yon griy san bò · 2 jwè',
  },
  es: {
    draughtsTitle: 'Damas internacionales',
    draughtsSubtitle: 'Damas internacionales · 20 peones',
    fiveTitle: 'Cinco en raya infinito',
    fiveSubtitle: 'Cinco en raya en una cuadrícula sin bordes · 2 jugadores',
  },
});
