import { ref, watch } from 'vue';

/**
 * Command palette open-state + recent-commands memory (module singletons).
 *
 * Opening the palette is a STRUCTURED call (open()/close()), not a loose window
 * event — the palette component binds to `isOpen`, the keyboard/command layer
 * calls open(). Recents persist only command IDs (never arguments, records or
 * any sensitive data).
 */
const RECENT_KEY = 'nuqta-command-recent';
const RECENT_LIMIT = 8;

const read = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const isOpen = ref(false);
const recentIds = ref(read());

watch(
  recentIds,
  (v) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
  { deep: true }
);

export function openCommandPalette() {
  isOpen.value = true;
}
export function closeCommandPalette() {
  isOpen.value = false;
}
export function recordRecentCommand(id) {
  if (!id) return;
  recentIds.value = [id, ...recentIds.value.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
}

export function useCommandPalette() {
  return {
    isOpen,
    recentIds,
    open: openCommandPalette,
    close: closeCommandPalette,
    recordRecent: recordRecentCommand,
  };
}
