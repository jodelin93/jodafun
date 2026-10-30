// A random id per browser so the server can hand a seat back after a drop, reload or new tab.
// Same storage key as Joda Memory, so one browser is one player across games.
export function getPlayerKey(): string {
  const KEY = 'joda-player-key';
  try {
    let key = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
    if (!key) key = crypto.randomUUID();
    localStorage.setItem(KEY, key);
    return key;
  } catch {
    return ((window as unknown as { __jodaPlayerKey?: string }).__jodaPlayerKey ??= crypto.randomUUID());
  }
}
