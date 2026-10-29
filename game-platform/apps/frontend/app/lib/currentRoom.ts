// Remembers the multiplayer room this browser is sitting in, so a player who navigates away by accident
// can get back while the server still holds their seat (5 minutes in the lobby, 60 seconds mid-game,
// a day in an alternate room).

const KEY = 'joda-current-room';
const CHANGE_EVENT = 'joda-current-room';
const HOLD_MS = 5 * 60 * 1000;

export type CurrentRoom = { roomId: string; savedAt: number; holdMs?: number };

export function readCurrentRoom(): CurrentRoom | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.roomId !== 'string' || typeof value?.savedAt !== 'number') return null;
    const holdMs = typeof value.holdMs === 'number' ? value.holdMs : HOLD_MS;
    if (Date.now() - value.savedAt > holdMs) {
      localStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function saveCurrentRoom(roomId: string, holdMs = HOLD_MS) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ roomId, savedAt: Date.now(), holdMs }));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage can be unavailable (private mode); the return link is a convenience
  }
}

export function clearCurrentRoom() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // See saveCurrentRoom
  }
}

// Calls `onChange` when the remembered room changes in this tab or another one
export function subscribeCurrentRoom(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export const roomPath = (roomId: string) => `/games/joda-memory?roomId=${roomId}`;
