import { ref, watch } from 'vue';

/**
 * Desktop-shell layout preferences (UI-only state, persisted to localStorage).
 *
 * Module-level singletons so every shell component (title bar, command bar,
 * navigation) shares the same reactive state without prop-drilling. This is
 * pure presentation state — it never touches data, permissions or the backend.
 */
const NAV_KEY = 'nuqta-nav-collapsed';
const MENU_KEY = 'nuqta-menubar-visible';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const persist = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
};

const navCollapsed = ref(read(NAV_KEY, false));
const menuBarVisible = ref(read(MENU_KEY, true));

// Bumped to force the workspace to remount the current page (command-bar
// "refresh") without a heavy full window reload. The workspace folds this into
// its router-view :key.
const refreshTick = ref(0);

watch(navCollapsed, (v) => persist(NAV_KEY, v));
watch(menuBarVisible, (v) => persist(MENU_KEY, v));

export function useShellLayout() {
  return {
    navCollapsed,
    menuBarVisible,
    refreshTick,
    toggleNav: () => {
      navCollapsed.value = !navCollapsed.value;
    },
    toggleMenuBar: () => {
      menuBarVisible.value = !menuBarVisible.value;
    },
    refreshWorkspace: () => {
      refreshTick.value += 1;
    },
  };
}
