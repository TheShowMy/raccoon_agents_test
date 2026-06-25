import { writable, derived, get } from 'svelte/store';

// --- Internal ID & z-index counters ---
let nextId = 1;
let nextZ = 100;

// --- Windows state ---
// Each window: { id, appId, title, x, y, width, height, zIndex, minimized, maximized, prevState }
// prevState = { x, y, width, height } captured before maximized
export const windows = writable([]);
export const focusedWindowId = writable(null);

// --- Derived: active app id ---
// When a window is focused, use its appId. Otherwise default to 'finder'.
export const activeAppId = derived(
  [windows, focusedWindowId],
  ([$windows, $focusedWindowId]) => {
    if ($focusedWindowId) {
      const win = $windows.find(w => w.id === $focusedWindowId);
      if (win) return win.appId;
    }
    return 'finder';
  }
);

// --- Helper: bring a window to front ---
function bringToFront(wins, id) {
  const z = nextZ++;
  return wins.map(w =>
    w.id === id ? { ...w, zIndex: z } : w
  );
}

// --- Actions ---
export function openWindow(appId, title) {
  const id = `win-${nextId++}`;
  const z = nextZ++;
  const offset = (get(windows).length % 10) * 28;

  windows.update(wins => [
    ...wins,
    {
      id,
      appId,
      title,
      x: 100 + offset,
      y: 80 + offset,
      width: 620,
      height: 420,
      zIndex: z,
      minimized: false,
      maximized: false,
      prevState: null,
    },
  ]);
  focusedWindowId.set(id);
}

export function closeWindow(id) {
  windows.update(wins => wins.filter(w => w.id !== id));
  focusedWindowId.update(current => (current === id ? null : current));
}

export function focusWindow(id) {
  focusedWindowId.set(id);
  windows.update(wins => bringToFront(wins, id));
}

export function toggleMinimize(id) {
  windows.update(wins =>
    bringToFront(
      wins.map(w =>
        w.id === id ? { ...w, minimized: !w.minimized, maximized: false } : w
      ),
      id
    )
  );
  focusedWindowId.set(id);
}

export function toggleMaximize(id) {
  windows.update(wins => {
    const win = wins.find(w => w.id === id);
    if (!win) return wins;

    if (win.maximized) {
      // Restore
      const prev = win.prevState || { x: 100, y: 80, width: 620, height: 420 };
      return bringToFront(
        wins.map(w =>
          w.id === id
            ? { ...w, maximized: false, minimized: false, prevState: null, ...prev }
            : w
        ),
        id
      );
    } else {
      // Save current state and maximize
      return bringToFront(
        wins.map(w =>
          w.id === id
            ? {
                ...w,
                maximized: true,
                minimized: false,
                prevState: { x: w.x, y: w.y, width: w.width, height: w.height },
              }
            : w
        ),
        id
      );
    }
  });
  focusedWindowId.set(id);
}

export function moveWindow(id, x, y) {
  windows.update(wins =>
    wins.map(w => (w.id === id ? { ...w, x, y } : w))
  );
}

export function resizeWindow(id, width, height) {
  windows.update(wins =>
    wins.map(w => (w.id === id ? { ...w, width, height } : w))
  );
}

// --- Derived: list of window ids grouped by appId, for focus-by-app ---
export function getWindowIdsByApp(appId) {
  return get(windows)
    .filter(w => w.appId === appId)
    .map(w => w.id);
}
