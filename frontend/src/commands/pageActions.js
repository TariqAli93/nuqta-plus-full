import { onMounted, onUnmounted } from 'vue';
import { createPageActionRegistry } from './pageActionCore.js';

/**
 * Singleton Page Action Registry + the Vue composable pages use to register
 * their real action handlers. Command Palette / Command Bar / keyboard /
 * context menus all reach the SAME handler through this registry (no
 * duplicated execution).
 */
export const pageActions = createPageActionRegistry();

/**
 * Register a page's action handlers for the lifetime of the component, and flush
 * any pending command action the moment the page is ready (lifecycle-aware — no
 * setTimeout). Auto-unregisters on unmount.
 *
 * @param {string} key       Module key (route name lowercased, e.g. 'settings').
 * @param {Object} handlers  { actionId: fn | { execute, enabled } }
 *
 * Usage:
 *   usePageActions('products', {
 *     create: openCreateDialog,
 *     export: exportProducts,
 *     refresh: loadProducts,
 *   });
 */
export function usePageActions(key, handlers) {
  let off = null;
  onMounted(async () => {
    off = pageActions.register(key, handlers);
    await pageActions.flush(key);
  });
  onUnmounted(() => off?.());
}
