import { ref, reactive, computed, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAlertStore } from '@/stores/alert';
import { useNotificationStore } from '@/stores/notification';
import { useShellLayout } from '@/composables/useShellLayout';
import { useAppTheme } from '@/composables/useAppTheme';
import {
  createCommandRegistry,
  isCommandVisible,
  isCommandEnabled,
  getDisabledReason,
  resolveVisibleCommands,
  runCommand,
} from './core.js';
import { globalCommands } from './globalCommands.js';
import { pageCommands } from './pageCommands.js';
import { appCatalog } from './catalog.js';
import { navCommandsFromRegistry } from './navCommands.js';
import { openCommandPalette } from './useCommandPalette.js';
import { useCommandNavigator } from './commandNavigator.js';
import { openReportWindow } from '@/composables/useReportWindow';
import { customerCommands } from '@/features/customers/commands/customerCommands.js';

/**
 * Reactive command service (singleton).
 *
 * Wraps the pure {@link createCommandRegistry} with Vue reactivity and assembles
 * the runtime {@link CommandContext} from the router + stores. Every surface
 * (command bar, menu bar, palette, keyboard, context menus) executes commands
 * through `execute(id)` — a single, centrally error-handled path — so a command
 * is implemented exactly once.
 */

// ── Module singletons (shared across all consumers) ───────────────────────
const registry = createCommandRegistry();
registry.registerMany(globalCommands);
registry.registerMany(pageCommands);
// The full module command catalog (open-section + real operations).
registry.registerMany(appCatalog);
// "Open module" navigation commands derived from the single nav registry —
// so a page is declared exactly once (registry) and never re-listed by hand.
registry.registerMany(navCommandsFromRegistry);
// Feature-owned commands (aggregated centrally as features are migrated).
registry.registerMany(customerCommands);

// Reactivity bridge: bump a version ref whenever the registry changes so
// computeds over the (plain-Map) registry recompute.
const version = ref(0);
registry.subscribe(() => {
  version.value += 1;
});

// Per-command loading state and the active selection (selection-scope).
const loadingIds = reactive({});
const selectionState = reactive({ items: [], context: null });

export function setSelection(items = [], context = null) {
  selectionState.items = Array.isArray(items) ? items : [];
  selectionState.context = context;
}
export function clearSelection() {
  selectionState.items = [];
  selectionState.context = null;
}

export function useCommands() {
  const router = useRouter();
  const route = useRoute();
  const auth = useAuthStore();
  const alert = useAlertStore();
  const notify = useNotificationStore();
  const shell = useShellLayout();
  const theme = useAppTheme();
  const navigator = useCommandNavigator();

  /** Build the full runtime context handed to every command. */
  const buildContext = (extra = {}) => ({
    hasPermission: (p) => auth.hasPermission(p),
    hasFeature: (f) => auth.hasFeature(f),
    can: (c) => auth.can(c),
    route: route.path,
    params: route.params,
    query: route.query,
    selection: selectionState.items,
    selectionContext: selectionState.context,
    router,
    auth,
    notify,
    electron: typeof window !== 'undefined' ? window.electronAPI : undefined,
    app: {
      // Accepts a path string OR a CommandNavigationTarget ({routeName, tab,
      // action, payload, ...}) — the navigator handles tab selection + running
      // the page action once the page is ready.
      navigate: (target) => navigator.navigate(target),
      openReport: (type, params) => openReportWindow(type, params),
      refreshWorkspace: () => shell.refreshWorkspace(),
      toggleTheme: () => theme.toggleTheme(),
      openCommandPalette: () => openCommandPalette(),
      print: () => window.print(),
      logout: async () => {
        // Preserve the established logout semantics: if logout() throws on the
        // server we keep the session and do NOT navigate away.
        try {
          await auth.logout();
        } catch {
          return;
        }
        alert.disconnectRealtime();
        router.push({ name: 'Login' });
      },
    },
    ...extra,
  });

  /** Lightweight context for visibility/enabled filtering (reactive deps). */
  const filterContext = computed(() => ({
    hasPermission: (p) => auth.hasPermission(p),
    hasFeature: (f) => auth.hasFeature(f),
    can: (c) => auth.can(c),
    route: route.path,
    selection: selectionState.items,
  }));

  /**
   * Execute a command by id. Never throws — errors are captured centrally and
   * shown to the user with a clear Arabic message; loading state is tracked.
   */
  const execute = async (id, extra = {}) => {
    const cmd = registry.get(id);
    const ctx = buildContext(extra);
    return runCommand(cmd, ctx, {
      onStart: (c) => {
        loadingIds[c.id] = true;
      },
      onSettled: (c) => {
        delete loadingIds[c.id];
      },
      onError: (err, c) => {
        console.error('[command] execution failed:', c?.id, err);
        const detail = err?.message || (typeof err === 'string' ? err : '');
        notify.error(
          c ? `تعذّر تنفيذ «${c.title}»${detail ? `: ${detail}` : ''}` : 'تعذّر تنفيذ الأمر'
        );
      },
    });
  };

  // ── Reactive views over the registry ────────────────────────────────────
  const allCommands = computed(() => {
    version.value; // track registry mutations
    return registry.list();
  });

  const visibleCommands = computed(() => {
    version.value;
    return resolveVisibleCommands(registry.list(), filterContext.value);
  });

  /** Commands for the command bar, split into primary / overflow / selection. */
  const barCommands = computed(() => {
    version.value;
    const ctx = filterContext.value;
    const pageScoped = registry
      .list()
      .filter((c) => ['route', 'workspace', 'selection'].includes(c.scope || 'global'))
      .filter((c) => isCommandVisible(c, ctx));
    return {
      primary: pageScoped.filter((c) => c.primary && c.scope !== 'selection'),
      secondary: pageScoped.filter((c) => !c.primary && c.scope !== 'selection'),
      selection: pageScoped.filter((c) => c.scope === 'selection'),
    };
  });

  const isEnabled = (cmd) => isCommandEnabled(cmd, filterContext.value);
  const isVisible = (cmd) => isCommandVisible(cmd, filterContext.value);
  const isLoading = (id) => !!loadingIds[id];
  const disabledReason = (cmd) => getDisabledReason(cmd, filterContext.value);

  /**
   * Register page/selection commands for the current page. Returns an
   * unregister fn AND auto-unregisters on unmount, so a page never leaks its
   * commands into other routes.
   */
  const register = (cmds = []) => {
    const off = registry.registerMany(cmds);
    onUnmounted(off);
    return off;
  };

  return {
    // execution
    execute,
    // reactive views
    allCommands,
    visibleCommands,
    barCommands,
    // predicates / state
    isEnabled,
    isVisible,
    isLoading,
    disabledReason,
    // selection
    selection: computed(() => selectionState.items),
    setSelection,
    clearSelection,
    // registration
    register,
    registry,
  };
}
