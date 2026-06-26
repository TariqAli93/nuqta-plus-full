import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { useNavigation } from '@/composables/useNavigation';

/**
 * Keep the window/document title in sync with the current page (desktop
 * convention #20). Electron mirrors `document.title` to the window title (and
 * taskbar / Alt-Tab), so this gives the app a context-aware title even with a
 * custom frameless title bar. Mount once, in the shell.
 */
export function useWindowTitle(appName = 'نقطة بلس') {
  const route = useRoute();
  const { getPageTitle } = useNavigation();

  watch(
    () => route.path,
    (path) => {
      const title = getPageTitle(path);
      document.title = title && title !== appName ? `${title} — ${appName}` : appName;
    },
    { immediate: true }
  );
}
