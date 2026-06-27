import { reactive, computed, watch } from 'vue';

/**
 * useSmartTable — the persisted-state brain behind <SmartTable>. It owns the
 * three things every list page used to re-wire by hand and that the user
 * expects to survive a reload, INDEPENDENTLY per table (req #1, #2, #5):
 *
 *   1. column state   — visibility, order, width, pinned side
 *   2. density        — comfortable | default | compact
 *   3. saved views    — named snapshots of (columns + density + filters +
 *                       search + sort + pageSize)
 *
 * Everything is namespaced under a `tableKey` so `products-table` and
 * `customers-table` never collide. Live, non-persisted state (selection, the
 * current filter values, the live sort) stays in <SmartTable> itself; this
 * composable only persists the durable UI preferences and lets views snapshot
 * the live state through `saveView(name, liveState)` / `applyView(id)`.
 *
 * Storage is a single JSON blob per table at `nuqta-smarttable:<tableKey>`,
 * deep-watched and written back (mirrors useDashboardPrefs). A module-level
 * cache keeps two instances of the same table in sync and avoids duplicate
 * writers.
 *
 * @param {Object}  opts
 * @param {string}  opts.tableKey            REQUIRED — persistence namespace.
 * @param {import('vue').Ref<Array>} opts.columns  Base column defs (live; may
 *        change, e.g. feature-gated columns). Each: Vuetify header
 *        ({ key, title, align?, sortable?, width? }) plus optional SmartTable
 *        meta: hideable, pinnable, locked, defaultVisible, defaultWidth,
 *        minWidth, maxWidth.
 * @param {string}  [opts.defaultDensity='compact']
 * @param {boolean} [opts.persist=true]      Disable for dialog-embedded tables.
 */

const STORAGE_PREFIX = 'nuqta-smarttable';
const DENSITIES = ['comfortable', 'default', 'compact'];

// One reactive store + one writer per tableKey, shared across instances.
const stores = new Map();

function emptyState(defaultDensity) {
  return { columns: {}, density: defaultDensity, views: [], activeViewId: null };
}

function loadState(tableKey, defaultDensity) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${tableKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        columns: parsed.columns && typeof parsed.columns === 'object' ? parsed.columns : {},
        density: DENSITIES.includes(parsed.density) ? parsed.density : defaultDensity,
        views: Array.isArray(parsed.views) ? parsed.views : [],
        activeViewId: parsed.activeViewId ?? null,
      };
    }
  } catch {
    /* corrupt / unavailable storage — fall back to defaults */
  }
  return emptyState(defaultDensity);
}

function getStore(tableKey, defaultDensity, persist) {
  if (stores.has(tableKey)) return stores.get(tableKey);

  const state = reactive(persist ? loadState(tableKey, defaultDensity) : emptyState(defaultDensity));

  if (persist) {
    watch(
      state,
      (val) => {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}:${tableKey}`, JSON.stringify(val));
        } catch {
          /* ignore quota / privacy-mode errors */
        }
      },
      { deep: true }
    );
  }

  stores.set(tableKey, state);
  return state;
}

let viewSeq = 0;
const genId = () => `v_${Date.now().toString(36)}_${(viewSeq++).toString(36)}`;

export function useSmartTable({
  tableKey,
  columns,
  defaultDensity = 'compact',
  persist = true,
} = {}) {
  if (!tableKey) {
    // A keyless table can't persist anything meaningfully; warn once and run
    // in volatile mode so dialog tables that forget the key still work.
    console.warn('[SmartTable] tableKey is required for persistence; running volatile.');
    persist = false;
    tableKey = `__volatile_${genId()}`;
  }

  const state = getStore(tableKey, defaultDensity, persist);

  // ---- base column normalization ------------------------------------------
  const baseColumns = computed(() =>
    (columns?.value || []).map((c, i) => ({
      ...c,
      // Synthesize a stable key for accessor-less columns (e.g. actions).
      key: c.key ?? `col_${i}`,
      hideable: c.hideable !== false && c.locked !== true,
      pinnable: c.pinnable === true,
      defaultVisible: c.defaultVisible !== false,
      _index: i,
    }))
  );

  // ---- column state, merged live with persisted overrides ------------------
  /**
   * Full ordered column list (INCLUDING hidden) — drives the column manager.
   * Persisted order/visibility/width/pinned is applied per key; columns the
   * page added since last save are appended in their natural order; persisted
   * keys that no longer exist are simply ignored (robust to dynamic columns).
   */
  const orderedColumns = computed(() => {
    const cols = baseColumns.value.map((c) => {
      const saved = state.columns[c.key] || {};
      const order = Number.isFinite(saved.order) ? saved.order : c.defaultOrder ?? c._index;
      return {
        ...c,
        visible: c.locked ? true : saved.visible ?? c.defaultVisible,
        width: saved.width ?? c.defaultWidth ?? c.width ?? null,
        pinned: c.pinned ?? saved.pinned ?? null, // 'start' | 'end' | null
        order,
      };
    });
    return cols.sort((a, b) => a.order - b.order || a._index - b._index);
  });

  /** Only the visible columns, ordered — the headers handed to the table. */
  const visibleColumns = computed(() => orderedColumns.value.filter((c) => c.visible));

  const hiddenCount = computed(() => orderedColumns.value.filter((c) => !c.visible).length);

  function ensureCol(key) {
    if (!state.columns[key]) state.columns[key] = {};
    return state.columns[key];
  }

  function setColumnVisible(key, visible) {
    const col = baseColumns.value.find((c) => c.key === key);
    if (col?.locked) return; // never hide a locked/essential column (req #1)
    ensureCol(key).visible = visible;
  }

  function toggleColumn(key) {
    const current = orderedColumns.value.find((c) => c.key === key);
    if (current) setColumnVisible(key, !current.visible);
  }

  /** Persist a brand-new full order (array of keys), e.g. after drag-drop. */
  function setColumnOrder(orderedKeys) {
    orderedKeys.forEach((key, i) => {
      ensureCol(key).order = i;
    });
  }

  /** Move a column to land before/after another (drag-drop helper). */
  function moveColumn(fromKey, toKey, place = 'before') {
    const keys = orderedColumns.value.map((c) => c.key);
    const from = keys.indexOf(fromKey);
    if (from === -1) return;
    keys.splice(from, 1);
    let to = keys.indexOf(toKey);
    if (to === -1) to = keys.length;
    if (place === 'after') to += 1;
    keys.splice(to, 0, fromKey);
    setColumnOrder(keys);
  }

  function setColumnWidth(key, width) {
    const col = baseColumns.value.find((c) => c.key === key);
    const min = col?.minWidth ?? 56;
    const max = col?.maxWidth ?? 960;
    ensureCol(key).width = Math.max(min, Math.min(max, Math.round(width)));
  }

  function setColumnPinned(key, side) {
    // side: 'start' | 'end' | null
    ensureCol(key).pinned = side || null;
  }

  function resetColumns() {
    state.columns = {};
  }

  // ---- density -------------------------------------------------------------
  function setDensity(d) {
    if (DENSITIES.includes(d)) state.density = d;
  }

  // ---- saved views ---------------------------------------------------------
  const views = computed(() => state.views);
  const activeView = computed(() => state.views.find((v) => v.id === state.activeViewId) || null);

  /**
   * Snapshot the current column layout + density + the page's live state into a
   * named view. `liveState` is whatever <SmartTable> owns and wants restored:
   * { filters, search, sort, pageSize }.
   */
  function saveView(name, liveState = {}) {
    const id = genId();
    state.views.push({
      id,
      name: name?.trim() || `عرض ${state.views.length + 1}`,
      isDefault: false,
      state: {
        columns: JSON.parse(JSON.stringify(state.columns)),
        density: state.density,
        filters: JSON.parse(JSON.stringify(liveState.filters ?? {})),
        search: liveState.search ?? '',
        sort: JSON.parse(JSON.stringify(liveState.sort ?? [])),
        pageSize: liveState.pageSize ?? null,
      },
    });
    state.activeViewId = id;
    return id;
  }

  /**
   * Apply a saved view: restores the columns + density HERE (this composable
   * owns them) and RETURNS the live part for <SmartTable> to apply itself.
   */
  function applyView(id) {
    const view = state.views.find((v) => v.id === id);
    if (!view) return null;
    state.columns = JSON.parse(JSON.stringify(view.state.columns || {}));
    if (DENSITIES.includes(view.state.density)) state.density = view.state.density;
    state.activeViewId = id;
    return {
      filters: JSON.parse(JSON.stringify(view.state.filters ?? {})),
      search: view.state.search ?? '',
      sort: JSON.parse(JSON.stringify(view.state.sort ?? [])),
      pageSize: view.state.pageSize ?? null,
    };
  }

  function renameView(id, name) {
    const view = state.views.find((v) => v.id === id);
    if (view && name?.trim()) view.name = name.trim();
  }

  function deleteView(id) {
    const i = state.views.findIndex((v) => v.id === id);
    if (i !== -1) state.views.splice(i, 1);
    if (state.activeViewId === id) state.activeViewId = null;
  }

  function setDefaultView(id) {
    state.views.forEach((v) => {
      v.isDefault = v.id === id;
    });
  }

  /** The view to auto-apply on first mount, if the page opted into defaults. */
  const defaultView = computed(() => state.views.find((v) => v.isDefault) || null);

  /** Back to the factory layout: clears columns/density override + active view. */
  function resetToDefault() {
    resetColumns();
    state.density = defaultDensity;
    state.activeViewId = null;
  }

  return {
    // density
    density: computed(() => state.density),
    setDensity,
    // columns
    baseColumns,
    orderedColumns,
    visibleColumns,
    hiddenCount,
    toggleColumn,
    setColumnVisible,
    setColumnOrder,
    moveColumn,
    setColumnWidth,
    setColumnPinned,
    resetColumns,
    // views
    views,
    activeView,
    activeViewId: computed(() => state.activeViewId),
    defaultView,
    saveView,
    applyView,
    renameView,
    deleteView,
    setDefaultView,
    resetToDefault,
  };
}

export default useSmartTable;
