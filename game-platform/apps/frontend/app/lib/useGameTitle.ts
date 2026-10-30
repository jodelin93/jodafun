import { useCallback } from 'react';
import { useT } from '../i18n/I18nProvider';
import { gameNameMessages } from '../i18n/messages/gameNames';
import { GAMES, GAME_TITLES, TRANSLATED_NAMES } from './games';

// A game's name as shown to this visitor: translated for the games in TRANSLATED_NAMES, the proper
// name otherwise. `subtitle` is null for games without one.
export function useGameTitle() {
  const t = useT(gameNameMessages);
  const title = useCallback(
    (id: string) => {
      const names = TRANSLATED_NAMES[id];
      if (names) return t(names.title);
      return (GAME_TITLES as Record<string, string>)[id] ?? GAMES.find((g) => g.id === id)?.title ?? id;
    },
    [t],
  );
  const subtitle = useCallback(
    (id: string) => {
      const names = TRANSLATED_NAMES[id];
      return names ? t(names.subtitle) : null;
    },
    [t],
  );
  return { title, subtitle };
}
