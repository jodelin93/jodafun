import { defineMessages } from '../I18nProvider';

// Game names that are translated (most games keep a proper name: GAME_TITLES in app/lib/games.ts)
export const gameNameMessages = defineMessages({
  en: {
    draughtsTitle: 'International Draughts',
    draughtsSubtitle: 'International draughts · 20 men',
  },
  fr: {
    draughtsTitle: 'Jeu de dames',
    draughtsSubtitle: 'Dames internationales · 20 pions',
  },
  ht: {
    draughtsTitle: 'Jwèt dam',
    draughtsSubtitle: 'Dam entènasyonal · 20 pyon',
  },
  es: {
    draughtsTitle: 'Damas internacionales',
    draughtsSubtitle: 'Damas internacionales · 20 peones',
  },
});
