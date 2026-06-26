import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  navigationRegistry,
  navigationFooter,
  extraRouteTitles,
  APP_TITLE,
} from '@/shell/navigation/registry';

/**
 * Central navigation service.
 *
 * Single place that turns the {@link navigationRegistry} data into the visible,
 * RBAC-filtered, sorted tree the desktop drawer renders. ALL gating
 * (permission / feature / capability / role / hidden) lives here — never in a
 * template — so visibility rules can't drift between components.
 *
 * This composable performs NO API calls. It reads only already-hydrated auth
 * state (permissions, feature flags, capabilities). Pinned items and the
 * accordion's manually-expanded group are UI preferences persisted to
 * localStorage as module-level singletons (shared across every consumer).
 */

// ── Persisted UI preferences (module-level singletons) ────────────────────
const PINNED_KEY = 'nuqta-nav-pinned';
const OPEN_GROUP_KEY = 'nuqta-nav-open-group';

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy-mode */
  }
};

const pinnedIds = ref(readJson(PINNED_KEY, []));
// Accordion state: the ONE group the user manually expanded. The group that
// contains the active route is always open on top of this (so navigating never
// hides where you are). `null` = nothing manually expanded.
const manualOpenId = ref(readJson(OPEN_GROUP_KEY, null));

watch(pinnedIds, (v) => writeJson(PINNED_KEY, v), { deep: true });
watch(manualOpenId, (v) => writeJson(OPEN_GROUP_KEY, v));

// ── Static helpers over the (unfiltered) registry ─────────────────────────
const isGroup = (item) => Array.isArray(item.children) && item.children.length > 0;

/** Every item, flattened (parents + children), against the raw registry. */
const flattenAll = (items = navigationRegistry, acc = []) => {
  for (const item of items) {
    acc.push(item);
    if (isGroup(item)) flattenAll(item.children, acc);
  }
  return acc;
};

/** Leaf items that navigate to an in-app route — registry tree + fixed footer
 *  (so /settings & /about still resolve a title and an active state). The
 *  registry is static, so this is computed once. */
const ROUTE_LEAVES = [...flattenAll(navigationRegistry), ...navigationFooter].filter(
  (i) => i.route && !isGroup(i)
);

const findByRoute = (path) => ROUTE_LEAVES.find((i) => i.route === path) || null;

/**
 * The ONE active leaf route for a path: the LONGEST registry route that matches
 * on a path-segment boundary (an exact match always wins). This is what stops a
 * parent-ish route like '/sales' (الفواتير) from lighting up while you're on
 * '/sales/pos' (بيع جديد) — only the single most-specific item is active.
 * Memoised on the last path since it's called once per row each render.
 */
let activeRouteCache = { path: null, route: undefined };
const resolveActiveRoute = (path) => {
  if (activeRouteCache.path === path) return activeRouteCache.route;
  let result = null;
  if (ROUTE_LEAVES.some((i) => i.route === path)) {
    result = path; // exact match wins
  } else {
    const match = ROUTE_LEAVES.filter(
      (i) => i.route !== '/' && path.startsWith(`${i.route}/`)
    ).sort((a, b) => b.route.length - a.route.length)[0];
    result = match ? match.route : null;
  }
  activeRouteCache = { path, route: result };
  return result;
};

export function useNavigation() {
  const auth = useAuthStore();
  const route = useRoute();

  // Single gate evaluated for both group parents and leaves.
  const passes = (item) => {
    if (item.hidden) return false;
    if (item.feature && !auth.hasFeature(item.feature)) return false;
    if (
      Array.isArray(item.anyFeature) &&
      item.anyFeature.length > 0 &&
      !item.anyFeature.some((f) => auth.hasFeature(f))
    ) {
      return false;
    }
    if (item.capability && !auth.can(item.capability)) return false;
    if (
      Array.isArray(item.roles) &&
      item.roles.length > 0 &&
      !item.roles.includes(auth.user?.role)
    ) {
      return false;
    }
    if (item.permission && !auth.hasPermission(item.permission)) return false;
    return true;
  };

  const byOrder = (a, b) => (a.order ?? 9999) - (b.order ?? 9999);

  /** Visible, RBAC-filtered, ordered navigation tree. */
  const tree = computed(() => {
    if (!auth.user?.role) return [];
    return navigationRegistry
      .filter(passes)
      .map((item) => {
        if (!isGroup(item)) return item;
        const children = item.children.filter(passes);
        if (children.length === 0) return null; // hide empty groups
        return { ...item, children };
      })
      .filter(Boolean)
      .sort(byOrder);
  });

  /** Visible leaf items, flattened — for pinned / search. */
  const visibleLeaves = computed(() =>
    tree.value.flatMap((item) => (isGroup(item) ? item.children : [item]))
  );

  /** Fixed footer links (settings / about), gated the same way. */
  const footerItems = computed(() => navigationFooter.filter(passes));

  // ── Active state (single most-specific match — never two rows at once) ────
  const isItemActive = (item, path = route.path) =>
    !!item.route && item.route === resolveActiveRoute(path);
  const isGroupActive = (group, path = route.path) => {
    if (!isGroup(group)) return false;
    const active = resolveActiveRoute(path);
    return group.children.some((c) => c.route && c.route === active);
  };

  // ── Page title (migrated from the old useNavigationMenu) ─────────────────
  const getPageTitle = (path) => {
    const exact = findByRoute(path);
    if (exact) return exact.label;
    if (extraRouteTitles[path]) return extraRouteTitles[path];

    // Fall back to the most-specific matching nav route (same resolver as the
    // active state) so e.g. '/sales/123' is still titled "الفواتير".
    const active = resolveActiveRoute(path);
    return (active && findByRoute(active)?.label) || APP_TITLE;
  };

  // ── Accordion: one manual-open group + the active group always open ──────
  const isGroupOpen = (group) =>
    manualOpenId.value === group.id || isGroupActive(group, route.path);
  const toggleGroup = (group) => {
    // Toggling the manual slot; the active group stays open regardless because
    // isGroupOpen ORs in isGroupActive. Opening a new group collapses the
    // previously manually-opened one.
    manualOpenId.value = manualOpenId.value === group.id ? null : group.id;
  };
  /** On navigation, make the active route's group THE manually-open one so other
   *  sections collapse (accordion). On a group-less route (dashboard) we keep
   *  the last opened section, honouring "remember the last open section". */
  const openActiveGroup = (path = route.path) => {
    const active = tree.value.find((item) => isGroupActive(item, path));
    if (active) manualOpenId.value = active.id;
  };

  // ── Pinned items ─────────────────────────────────────────────────────────
  const isPinned = (id) => pinnedIds.value.includes(id);
  const canPin = (item) => item.pinnable !== false && !!item.route;
  const togglePin = (item) => {
    if (!canPin(item)) return;
    pinnedIds.value = isPinned(item.id)
      ? pinnedIds.value.filter((p) => p !== item.id)
      : [...pinnedIds.value, item.id];
  };
  const pinnedItems = computed(() => {
    const visibleById = new Map(visibleLeaves.value.map((i) => [i.id, i]));
    return pinnedIds.value.map((id) => visibleById.get(id)).filter(Boolean);
  });

  // ── Badges ───────────────────────────────────────────────────────────────
  // Extension point: live counts can be layered on here from already-loaded
  // stores (NO data fetching). Static badges declared in the registry win when
  // no dynamic value is present.
  const dynamicBadges = computed(() => ({}));
  const badgeFor = (item) => {
    const dyn = dynamicBadges.value[item.id];
    return dyn !== undefined && dyn !== null ? dyn : (item.badge ?? null);
  };

  return {
    // data
    tree,
    visibleLeaves,
    footerItems,
    isGroup,
    // active
    isItemActive,
    isGroupActive,
    // titles
    getPageTitle,
    findByRoute,
    // groups (accordion)
    isGroupOpen,
    toggleGroup,
    openActiveGroup,
    // pinned
    isPinned,
    canPin,
    togglePin,
    pinnedItems,
    // badges
    badgeFor,
  };
}
