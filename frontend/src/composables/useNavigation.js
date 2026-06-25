import { ref, computed, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { navigationRegistry, extraRouteTitles, APP_TITLE } from '@/shell/navigation/registry';

/**
 * Central navigation service.
 *
 * Single place that turns the {@link navigationRegistry} data into the visible,
 * RBAC-filtered, sorted tree the desktop rail renders. ALL gating
 * (permission / feature / capability / role / hidden) lives here — never in a
 * template — so visibility rules can't drift between components.
 *
 * This composable performs NO API calls. It reads only already-hydrated auth
 * state (permissions, feature flags, capabilities). Pinned items, recent pages
 * and group-expand state are UI preferences persisted to localStorage as
 * module-level singletons (shared across every consumer, no prop-drilling).
 */

// ── Persisted UI preferences (module-level singletons) ────────────────────
const PINNED_KEY = 'nuqta-nav-pinned';
const RECENT_KEY = 'nuqta-nav-opened-recent';
const OPENED_KEY = 'nuqta-nav-opened-groups';
const RECENT_LIMIT = 6;

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
const recentRoutes = ref(readJson(RECENT_KEY, []));
const openedGroupIds = ref(readJson(OPENED_KEY, []));

watch(pinnedIds, (v) => writeJson(PINNED_KEY, v), { deep: true });
watch(recentRoutes, (v) => writeJson(RECENT_KEY, v), { deep: true });
watch(openedGroupIds, (v) => writeJson(OPENED_KEY, v), { deep: true });

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

/** Leaf items that navigate to an in-app route (used for title/recent lookup). */
const allRouteLeaves = () => flattenAll().filter((i) => i.route && !isGroup(i));

const findByRoute = (path) => allRouteLeaves().find((i) => i.route === path) || null;

const isRouteActive = (route, path) => {
  if (!route) return false;
  if (route === '/') return path === '/';
  return path === route || path.startsWith(`${route}/`);
};

export function useNavigation() {
  const auth = useAuthStore();

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

  /** Visible leaf items, flattened — for keyboard nav / search / recent. */
  const visibleLeaves = computed(() =>
    tree.value.flatMap((item) => (isGroup(item) ? item.children : [item]))
  );

  // ── Active state ────────────────────────────────────────────────────────
  const isItemActive = (item, path) => isRouteActive(item.route, path);
  const isGroupActive = (group, path) =>
    isGroup(group) && group.children.some((c) => isRouteActive(c.route, path));

  // ── Page title (migrated from the old useNavigationMenu) ─────────────────
  const getPageTitle = (path) => {
    const exact = findByRoute(path);
    if (exact) return exact.label;
    if (extraRouteTitles[path]) return extraRouteTitles[path];

    // Longest-prefix match on a path-segment boundary so a parent like '/sales'
    // still labels '/sales/new', while '/' never swallows unrelated routes.
    const match = allRouteLeaves()
      .filter((i) => i.route !== '/' && (path === i.route || path.startsWith(`${i.route}/`)))
      .sort((a, b) => b.route.length - a.route.length)[0];
    return match?.label || APP_TITLE;
  };

  // ── Group expand / collapse (persisted) ──────────────────────────────────
  const isGroupOpen = (id) => openedGroupIds.value.includes(id);
  const toggleGroup = (id) => {
    openedGroupIds.value = isGroupOpen(id)
      ? openedGroupIds.value.filter((g) => g !== id)
      : [...openedGroupIds.value, id];
  };
  /** Open the group containing the active route without collapsing others. */
  const ensureActiveGroupOpen = (path) => {
    const group = tree.value.find((item) => isGroupActive(item, path));
    if (group && !isGroupOpen(group.id)) {
      openedGroupIds.value = [...openedGroupIds.value, group.id];
    }
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

  // ── Recent pages ─────────────────────────────────────────────────────────
  /** Record a visited route (call once, from the nav, on route change). */
  const trackRoute = (path) => {
    const leaf = findByRoute(path);
    if (!leaf || leaf.route === '/') return; // skip unknown + dashboard noise
    const next = [leaf.route, ...recentRoutes.value.filter((r) => r !== leaf.route)];
    recentRoutes.value = next.slice(0, RECENT_LIMIT);
  };
  const recentItems = computed(() => {
    const visibleByRoute = new Map(visibleLeaves.value.map((i) => [i.route, i]));
    return recentRoutes.value.map((r) => visibleByRoute.get(r)).filter(Boolean);
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
    isGroup,
    // active
    isItemActive,
    isGroupActive,
    // titles
    getPageTitle,
    findByRoute,
    // groups
    isGroupOpen,
    toggleGroup,
    ensureActiveGroupOpen,
    // pinned
    isPinned,
    canPin,
    togglePin,
    pinnedItems,
    // recent
    trackRoute,
    recentItems,
    // badges
    badgeFor,
  };
}
