/**
 * Page Action Registry — pure core (no Vue), so it's unit-testable.
 *
 * Pages register the real implementations of their actions (open a dialog,
 * start a backup, refresh data…) keyed by a module key. A command's navigation
 * target sets a SINGLE pending action; when the destination page is ready (it
 * registers its actions on mount) the pending action runs EXACTLY ONCE and is
 * cleared. No `setTimeout`, no event bus — the page lifecycle drives it, with
 * an executionId guard preventing double execution.
 *
 * A handler is either a function or `{ execute, enabled? }`.
 */

const normalize = (h) =>
  typeof h === 'function' ? { execute: h, enabled: undefined } : { execute: h?.execute, enabled: h?.enabled };

export function createPageActionRegistry() {
  /** key → Map(actionId → {execute, enabled}) */
  const handlers = new Map();
  /** single pending action: { key, action, payload, executionId } | null */
  let pending = null;
  /** executionIds already run — guards against double execution */
  const consumed = new Set();

  function register(key, map = {}) {
    let m = handlers.get(key);
    if (!m) {
      m = new Map();
      handlers.set(key, m);
    }
    const ids = Object.keys(map);
    const entries = ids.map((id) => [id, normalize(map[id])]);
    for (const [id, h] of entries) m.set(id, h);
    // Unregister only the exact entries this call added.
    return () => {
      const mm = handlers.get(key);
      if (!mm) return;
      for (const [id, h] of entries) if (mm.get(id) === h) mm.delete(id);
    };
  }

  const get = (key, id) => handlers.get(key)?.get(id) || null;
  const has = (key, id) => !!get(key, id);

  function setPending(key, action, payload, executionId) {
    pending = { key, action, payload, executionId };
  }
  function clearPending() {
    pending = null;
  }

  /**
   * Run the pending action for `key` if its handler is registered and it hasn't
   * run yet. Idempotent. Returns a small result describing what happened.
   */
  async function flush(key) {
    if (!pending || pending.key !== key) return { ran: false, reason: 'no-pending' };
    if (consumed.has(pending.executionId)) return { ran: false, reason: 'already-run' };
    const handler = get(key, pending.action);
    if (!handler) return { ran: false, reason: 'no-handler' };

    const p = pending;
    consumed.add(p.executionId);
    pending = null;
    await handler.execute?.(p.payload);
    return { ran: true, action: p.action, executionId: p.executionId };
  }

  return {
    register,
    get,
    has,
    setPending,
    clearPending,
    flush,
    get pending() {
      return pending;
    },
  };
}
