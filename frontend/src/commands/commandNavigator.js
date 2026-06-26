import { useRouter } from 'vue-router';
import { buildRouteLocation, moduleKeyForTarget } from './navigationTarget.js';
import { pageActions } from './pageActions.js';

let execCounter = 0;

/**
 * Unified command navigator: navigate to a {@link CommandNavigationTarget}, wait
 * for the navigation to complete, select the right internal tab (via query.tab,
 * read by the page), and run the page action exactly once when the page is
 * ready — without setTimeout.
 *
 * Flow:
 *   1. If the target carries an `action`, register it as the single PENDING
 *      action keyed by the destination module (with a unique executionId).
 *   2. `await router.push(location)` — completes the navigation.
 *   3. Flush the pending action for the destination key. For a SAME-PAGE target
 *      (already mounted + registered) it runs now; for a NEW navigation the
 *      page's `usePageActions(...)` flushes it on mount. The executionId guard
 *      ensures it runs ONCE regardless of which path fires first.
 */
export function useCommandNavigator() {
  const router = useRouter();

  const navigate = async (target) => {
    const t = typeof target === 'string' ? { path: target } : target || {};
    const key = moduleKeyForTarget(t);

    if (t.action) {
      pageActions.setPending(key, t.action, t.payload, `exec-${(execCounter += 1)}`);
    }

    try {
      await router.push(buildRouteLocation(t));
    } catch (err) {
      // Redundant/duplicated navigation (already on the target) is not an error
      // — fall through and flush. Any real failure drops the pending action so
      // nothing is left dangling.
      if (err?.name !== 'NavigationDuplicated' && !String(err?.message || '').includes('redundant')) {
        if (t.action) pageActions.clearPending();
        throw err;
      }
    }

    if (t.action) {
      await pageActions.flush(key);
    }
  };

  return { navigate };
}
