/**
 * Command system — pure core (NO Vue, NO Pinia, NO DOM).
 *
 * Everything in this file is framework-free so it can be unit-tested directly
 * with `node --test`. The Vue/Pinia layer (useCommands.js) is a thin reactive
 * wrapper around these primitives.
 *
 * @typedef {Object} CommandContext
 * @property {(permission: string|string[]) => boolean} hasPermission
 * @property {string}   route      Current route path (e.g. '/customers').
 * @property {any[]}    selection  Currently selected records (selection scope).
 * @property {Object}   [router]   Vue Router instance (app runtime only).
 * @property {Object}   [auth]     Auth store (app runtime only).
 * @property {Object}   [notify]   Notification store (app runtime only).
 * @property {Object}   [app]      Shell helpers: navigate / refreshWorkspace /
 *                                 openCommandPalette / toggleTheme / logout.
 * @property {Object}   [electron] window.electronAPI (app runtime only).
 *
 * @typedef {Object} AppCommand
 * @property {string}   id
 * @property {string}   title
 * @property {string}   [description]
 * @property {string}   [icon]
 * @property {string}   [shortcut]
 * @property {string}   [group]
 * @property {string[]} [keywords]
 * @property {string|string[]} [permission]
 * @property {'global'|'route'|'workspace'|'selection'} [scope]
 * @property {string[]} [routes]   Restrict a route/selection command to paths.
 * @property {boolean}  [primary]  Render as a primary button in the command bar.
 * @property {(ctx: CommandContext) => boolean} [visible]
 * @property {(ctx: CommandContext) => boolean} [enabled]
 * @property {string|((ctx: CommandContext) => string)} [disabledReason]
 *           Human-readable reason shown when the command is disabled.
 * @property {(ctx: CommandContext) => (void|Promise<void>)} execute
 */

/**
 * Create an isolated command registry (a Map plus change subscribers).
 * Used as a module singleton by useCommands, and instantiated fresh per test.
 */
export function createCommandRegistry() {
  const map = new Map();
  const subscribers = new Set();
  const notify = () => {
    for (const fn of subscribers) fn();
  };

  return {
    /**
     * Register a command. Returns an unregister function. Re-registering the
     * same id replaces the previous definition (last writer wins).
     * @param {AppCommand} cmd
     */
    register(cmd) {
      if (!cmd || typeof cmd.id !== 'string' || cmd.id === '') {
        throw new Error('registerCommand: a command must have a non-empty string id');
      }
      if (typeof cmd.execute !== 'function') {
        throw new Error(`registerCommand: command "${cmd.id}" must have an execute() function`);
      }
      map.set(cmd.id, cmd);
      notify();
      return () => {
        // Only remove if this exact definition is still the active one.
        if (map.get(cmd.id) === cmd) {
          map.delete(cmd.id);
          notify();
        }
      };
    },

    /** Register many commands at once; returns a single unregister-all fn. */
    registerMany(cmds = []) {
      const offs = cmds.map((c) => this.register(c));
      return () => offs.forEach((off) => off());
    },

    unregister(id) {
      if (map.delete(id)) notify();
    },

    get(id) {
      return map.get(id) || null;
    },
    has(id) {
      return map.has(id);
    },
    list() {
      return [...map.values()];
    },
    clear() {
      map.clear();
      notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    get size() {
      return map.size;
    },
  };
}

/** True if `cmd` is allowed by RBAC for this context. */
export function passesPermission(cmd, ctx) {
  if (!cmd.permission) return true;
  return !!ctx.hasPermission(cmd.permission);
}

/** True if the command's route restriction matches the current path. */
export function matchesRoute(cmd, path) {
  if (!Array.isArray(cmd.routes) || cmd.routes.length === 0) return true;
  return cmd.routes.some((r) => path === r || (typeof path === 'string' && path.startsWith(`${r}/`)));
}

/** True if the command's scope is satisfied by the context. */
export function matchesScope(cmd, ctx) {
  const scope = cmd.scope || 'global';
  if (scope === 'global') return true;
  if (scope === 'route' || scope === 'workspace') return matchesRoute(cmd, ctx.route);
  if (scope === 'selection') {
    return matchesRoute(cmd, ctx.route) && Array.isArray(ctx.selection) && ctx.selection.length > 0;
  }
  return true;
}

/**
 * Whether a command should appear at all: RBAC + scope + its own visible()
 * predicate (predicate errors fail closed = hidden).
 */
export function isCommandVisible(cmd, ctx) {
  if (!cmd) return false;
  if (!passesPermission(cmd, ctx)) return false;
  if (!matchesScope(cmd, ctx)) return false;
  if (typeof cmd.visible === 'function') {
    try {
      return !!cmd.visible(ctx);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Whether a (visible) command is currently actionable. enabled() errors fail
 * closed = disabled.
 */
export function isCommandEnabled(cmd, ctx) {
  if (!cmd) return false;
  if (typeof cmd.enabled === 'function') {
    try {
      return !!cmd.enabled(ctx);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Reason a (visible) command is disabled, or null when it is enabled. Falls
 * back to a generic message when the command is disabled but declares no
 * specific `disabledReason`.
 */
export function getDisabledReason(cmd, ctx) {
  if (!cmd || isCommandEnabled(cmd, ctx)) return null;
  if (typeof cmd.disabledReason === 'function') {
    try {
      return cmd.disabledReason(ctx) || 'غير متاح حالياً';
    } catch {
      return 'غير متاح حالياً';
    }
  }
  if (typeof cmd.disabledReason === 'string') return cmd.disabledReason;
  return 'غير متاح حالياً';
}

/** All visible commands for a context. */
export function resolveVisibleCommands(list, ctx) {
  return list.filter((cmd) => isCommandVisible(cmd, ctx));
}

/**
 * Execute a command with centralised lifecycle + error capture.
 *
 * Never throws — always resolves to a result object. Hooks let the caller drive
 * loading state and surface errors to the user:
 *   onStart(cmd)            → mark loading
 *   onSuccess(cmd)
 *   onError(error, cmd)     → show a clear message to the user
 *   onSettled(cmd)          → clear loading
 *
 * @returns {Promise<{ok: boolean, error?: Error, skipped?: boolean, reason?: string}>}
 */
export async function runCommand(cmd, ctx, hooks = {}) {
  if (!cmd) {
    const error = new Error('command not found');
    hooks.onError?.(error, null);
    return { ok: false, error, reason: 'not-found' };
  }
  if (!isCommandVisible(cmd, ctx)) {
    return { ok: false, skipped: true, reason: 'not-visible' };
  }
  if (!isCommandEnabled(cmd, ctx)) {
    return { ok: false, skipped: true, reason: 'disabled' };
  }
  try {
    hooks.onStart?.(cmd);
    await cmd.execute(ctx);
    hooks.onSuccess?.(cmd);
    return { ok: true };
  } catch (error) {
    hooks.onError?.(error, cmd);
    return { ok: false, error };
  } finally {
    hooks.onSettled?.(cmd);
  }
}
