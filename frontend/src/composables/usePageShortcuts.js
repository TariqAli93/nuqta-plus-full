import { onMounted, onUnmounted } from 'vue';

/**
 * Page-scoped keyboard shortcuts (desktop conventions). Opt-in per page — only
 * the handlers you pass are bound, and each preventDefault's the browser/Electron
 * default (Ctrl+S "save page", Ctrl+F "find in page", etc.).
 *
 * Deliberately does NOT bind:
 *   - Ctrl+N  → owned by the command system (route-scoped create command)
 *   - Ctrl+K / Ctrl+Shift+P / Escape → owned by the global shell layers
 *   - F5      → global "refresh workspace" (remounts the page; no Electron reload)
 * …so there is exactly one handler per shortcut, app-wide.
 *
 * @param {{ onSave?: Function, onSearch?: Function, onDelete?: Function }} handlers
 */
const isTypingTarget = (el) =>
  !!el &&
  (el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true);

export function usePageShortcuts(handlers = {}) {
  const onKeydown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = (e.key || '').toLowerCase();

    if (mod && key === 's' && handlers.onSave) {
      e.preventDefault();
      handlers.onSave(e);
    } else if (mod && key === 'f' && handlers.onSearch) {
      e.preventDefault();
      handlers.onSearch(e);
    } else if (key === 'delete' && handlers.onDelete && !isTypingTarget(e.target)) {
      e.preventDefault();
      handlers.onDelete(e);
    }
  };

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
