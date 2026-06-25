import { computed } from 'vue';
import { useTheme } from 'vuetify';

/**
 * Light/Dark theme control, preserving the exact persistence behaviour that
 * previously lived inline in MainLayout.vue (localStorage key `nuqta-theme`,
 * default `light`, plus syncing `document.documentElement.style.colorScheme`).
 *
 * UI concern only. Must be called from within a component `setup()` because it
 * depends on Vuetify's `useTheme()`.
 */
const STORAGE_KEY = 'nuqta-theme';

export function useAppTheme() {
  const theme = useTheme();

  const isDark = computed(() => theme.global.current.value.dark);

  const applyColorScheme = (name) => {
    document.documentElement.style.colorScheme = name === 'dark' ? 'dark' : 'light';
  };

  const setTheme = (name) => {
    theme.change(name);
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      /* ignore persistence failure */
    }
    applyColorScheme(name);
  };

  const toggleTheme = () => setTheme(isDark.value ? 'light' : 'dark');

  /** Restore the saved theme on shell mount (mirrors the old MainLayout init). */
  const initTheme = () => {
    let saved = 'light';
    try {
      saved = localStorage.getItem(STORAGE_KEY) || 'light';
    } catch {
      saved = 'light';
    }
    theme.change(saved);
    applyColorScheme(saved);
  };

  return { isDark, setTheme, toggleTheme, initTheme };
}
