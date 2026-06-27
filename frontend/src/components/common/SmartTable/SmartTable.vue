<template>
  <div
    ref="rootRef"
    class="smart-table"
    :class="[`smart-table--${density}`, { 'smart-table--bordered': bordered }]"
    tabindex="0"
    @keydown="onKeydown"
  >
    <!-- ───────────────────────── Toolbar ───────────────────────── -->
    <SmartTableToolbar
      v-if="showToolbar"
      ref="toolbarRef"
      :search="searchState"
      :loading="loading"
      :search-placeholder="searchPlaceholder"
      :show-search="showSearch"
      :show-refresh="showRefresh"
      :show-density="showDensityControl"
      :density="density"
      :result-text="resultText"
      @update:search="onSearchInput"
      @search-now="onSearchNow"
      @clear-search="onSearchClear"
      @set-density="setDensity"
      @refresh="$emit('refresh')"
    >
      <template #tools>
        <SmartTableSavedViews
          v-if="showSavedViews"
          :views="views"
          :active-view-id="activeViewId"
          @apply="onApplyView"
          @create="onCreateView"
          @rename="renameView($event.id, $event.name)"
          @delete="deleteView"
          @set-default="setDefaultView"
          @reset="onResetView"
        />
        <SmartTableFilters
          v-if="hasAutoFilters || $slots.filters"
          :filters="filters"
          :model-value="filterState"
          :option-sources="filterOptionSources"
          :active-count="activeFilterCount"
          @update:model-value="onFiltersApply"
          @clear="onFiltersClear"
        >
          <template v-if="$slots.filters" #default="{ values, set }">
            <slot name="filters" :values="values" :set="set" />
          </template>
        </SmartTableFilters>
        <SmartTableColumnManager
          v-if="showColumnManager"
          :columns="orderedColumns"
          @toggle="toggleColumn"
          @reorder="setColumnOrder"
          @set-pinned="(e) => setColumnPinned(e.key, e.side)"
          @reset="resetColumns"
          @show-all="showAllColumns"
        />
        <SmartTableExportMenu
          v-if="showExport"
          :selected-count="selectedRows.length"
          :busy="exportBusy"
          @export="onExport"
        />
        <v-btn
          v-if="showPrint"
          size="small"
          variant="text"
          icon="mdi-printer-outline"
          title="طباعة (Ctrl+P)"
          aria-label="طباعة"
          @click="openPrint"
        />
      </template>
      <template #actions>
        <slot name="toolbar-actions" />
      </template>
    </SmartTableToolbar>

    <!-- ─────────────────── Active filter chips ─────────────────── -->
    <div v-if="chips.length" class="smart-table__chips">
      <v-chip
        v-for="chip in chips"
        :key="chip.key"
        size="small"
        closable
        variant="tonal"
        color="primary"
        @click:close="onRemoveChip(chip.key)"
      >
        {{ chip.label }}
      </v-chip>
      <v-btn size="x-small" variant="text" @click="onFiltersClear">مسح الكل</v-btn>
    </div>

    <!-- ───────────────────── Bulk action bar ───────────────────── -->
    <div v-if="selectable && selectedRows.length" class="smart-table__bulk">
      <SmartTableBulkActions
        :count="allResultsSelected ? totalItems : selectedRows.length"
        :actions="allowedBulkActions"
        :can-select-all-results="canSelectAllResults"
        :all-results-selected="allResultsSelected"
        :total-items="totalItems"
        @action="onBulkAction"
        @clear="clearSelection"
        @select-all-results="allResultsSelected = true"
        @clear-all-results="allResultsSelected = false"
      />
    </div>

    <!-- ──────────────────────── Error state ─────────────────────── -->
    <DesktopErrorState
      v-if="error && !rowCount"
      :error="error"
      retryable
      class="smart-table__state"
      @retry="$emit('refresh')"
    />

    <!-- ─────────────────────────── Table ───────────────────────── -->
    <div v-else class="smart-table__viewport" :style="viewportStyle">
      <component
        :is="tableComponent"
        v-model="selected"
        class="smart-table__grid"
        :headers="vuetifyHeaders"
        :items="displayItems"
        :items-length="serverSide ? totalItems : undefined"
        :loading="loading"
        :page="page"
        :items-per-page="pageSize"
        :sort-by="sortBy"
        :multi-sort="multiSort"
        :show-select="selectable"
        :item-value="itemValue"
        :density="density"
        :fixed-header="stickyHeader"
        :row-props="rowProps"
        :show-expand="!!$slots['expanded-row']"
        hide-default-footer
        @update:options="onTableOptions"
      >
        <!-- Forward every caller-provided slot (item.*, header.*, expanded-row…)
             except the ones SmartTable owns. -->
        <template v-for="name in forwardedSlots" :key="name" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps || {}" />
        </template>

        <!-- Default smart formatting for columns that declare `format` and have
             no caller slot — pages only template genuinely custom cells. -->
        <template v-for="col in autoFormatColumns" :key="`fmt-${col.key}`" #[`item.${col.key}`]="{ item }">
          <span :dir="isLtrColumn(col) ? 'ltr' : undefined" :class="{ 'st-cell-num': isNumericColumn(col) }">
            {{ formatColumnCell(col, item) }}
          </span>
        </template>

        <!-- Unified row-actions column (primary icons + “…” overflow). -->
        <template v-if="hasRowActions && !$slots['item.actions']" #[`item.actions`]="{ item }">
          <div class="st-actions-cell">
            <v-btn
              v-for="action in primaryActionsFor(item)"
              :key="action.key"
              :icon="action.icon"
              :color="action.color"
              :to="resolveTo(action, item)"
              :data-testid="action.testId"
              :loading="action._loading"
              :disabled="action._disabled"
              size="small"
              variant="text"
              :title="action.title"
              :aria-label="action.title"
              @click.stop="runAction(action, item)"
            />
            <v-menu v-if="overflowActionsFor(item).length" location="bottom end">
              <template #activator="{ props: m }">
                <v-btn v-bind="m" icon="mdi-dots-vertical" size="small" variant="text" title="إجراءات" @click.stop />
              </template>
              <v-list density="compact">
                <v-list-item
                  v-for="action in overflowActionsFor(item)"
                  :key="action.key"
                  :prepend-icon="action.icon"
                  :to="resolveTo(action, item)"
                  :data-testid="action.testId"
                  :disabled="action._disabled"
                  :class="{ 'text-error': action.danger }"
                  @click="runAction(action, item)"
                >
                  <v-list-item-title>{{ action.title }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </div>
        </template>

        <!-- Loading skeleton (no “no data” flicker during load). -->
        <template #loading>
          <slot name="loading">
            <TableSkeleton :rows="skeletonRows" :columns="vuetifyHeaders.length || 4" class="pa-3" />
          </slot>
        </template>

        <!-- Empty vs no-results, told apart by whether a query/filter is active. -->
        <template #no-data>
          <slot v-if="hasActiveQuery" name="no-results">
            <EmptyState
              title="لا توجد نتائج مطابقة"
              description="جرّب تعديل البحث أو الفلاتر"
              icon="mdi-magnify-close"
              :actions="[{ text: 'مسح البحث والفلاتر', icon: 'mdi-filter-remove-outline', onClick: clearAllQuery }]"
              compact
            />
          </slot>
          <slot v-else name="empty">
            <EmptyState
              :title="emptyTitle"
              :description="emptyDescription"
              :icon="emptyIcon"
              :actions="emptyActions"
              compact
            />
          </slot>
        </template>

        <!-- Optional totals row appended to the body (req #15). -->
        <template v-if="hasFooterTotals" #[`body.append`]>
          <tr class="st-totals-row">
            <td v-if="selectable" class="st-totals-row__cell" />
            <td v-for="col in vuetifyHeaders" :key="col.key" class="st-totals-row__cell" :class="totalCellClass(col)">
              <span v-if="footerTotals[col.key] != null" :dir="isLtrColumn(col) ? 'ltr' : undefined">
                {{ footerTotals[col.key] }}
              </span>
              <span v-else-if="col.key === totalsLabelKey" class="st-totals-row__label">الإجمالي</span>
            </td>
          </tr>
        </template>
      </component>
    </div>

    <!-- ───────────────────── Pagination footer ──────────────────── -->
    <div v-if="showFooter && rowCount" class="smart-table__footer">
      <div class="smart-table__footer-info text-caption text-medium-emphasis">
        <span>{{ rangeText }}</span>
        <span v-if="lastUpdatedText" class="smart-table__updated">· {{ lastUpdatedText }}</span>
      </div>
      <v-pagination
        :model-value="page"
        :length="totalPages"
        :total-visible="6"
        density="comfortable"
        @update:model-value="setPage"
      />
      <v-select
        :model-value="pageSize"
        :items="pageSizeOptions"
        density="compact"
        variant="outlined"
        hide-details
        class="smart-table__pagesize"
        label="لكل صفحة"
        @update:model-value="setPageSize"
      />
    </div>

    <!-- ─────────────────── Row context menu ─────────────────────── -->
    <v-menu v-model="ctxMenu.open" :target="ctxMenu.target" location="end">
      <v-list density="compact" min-width="200">
        <v-list-item
          v-for="action in ctxMenu.actions"
          :key="action.key"
          :prepend-icon="action.icon"
          :class="{ 'text-error': action.danger }"
          @click="runAction(action, ctxMenu.item)"
        >
          <v-list-item-title>{{ action.title }}</v-list-item-title>
        </v-list-item>
        <v-divider v-if="ctxMenu.actions.length" class="my-1" />
        <v-list-item prepend-icon="mdi-content-copy" title="نسخ قيمة الخلية" @click="copyCellValue" />
      </v-list>
    </v-menu>

    <!-- ───────────────────────── Side panel ─────────────────────── -->
    <SmartTableSidePanel
      v-if="showSidePanel"
      v-model="panel.open"
      :title="panelTitle"
      :subtitle="panelSubtitle"
      :loading="panelLoading"
      :has-prev="panel.index > 0"
      :has-next="panel.index < rowCount - 1"
      @prev="movePanel(-1)"
      @next="movePanel(1)"
      @open-full="$emit('row-open', panel.item)"
    >
      <template #status><slot name="preview-status" :item="panel.item" /></template>
      <slot name="preview" :item="panel.item" :close="closePanel" />
      <template v-if="$slots['preview-actions']" #actions>
        <slot name="preview-actions" :item="panel.item" :close="closePanel" />
      </template>
    </SmartTableSidePanel>

    <!-- ───────────────────────── Print view ─────────────────────── -->
    <SmartTablePrintView
      v-if="showPrint"
      v-model="printOpen"
      :title="printTitle || emptyTitle"
      :org-name="orgName"
      :user-name="currentUserName"
      :columns="printColumns"
      :rows="printRows"
      :totals="printTotals"
      :filters-text="filtersText"
      :scope-label="printScopeLabel"
    />

    <!-- ─────────────────── Confirm for risky actions ────────────── -->
    <ConfirmDialog
      v-model="confirm.open"
      :title="confirm.title"
      :message="confirm.message"
      :details="confirm.details"
      :type="confirm.type"
      :confirm-text="confirm.confirmText"
      @confirm="confirm.onConfirm"
      @cancel="confirm.open = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, useSlots } from 'vue';
import { VDataTable, VDataTableServer, VDataTableVirtual } from 'vuetify/components';
import { usePermissions } from '@/composables/usePermissions';
import { useAuthStore } from '@/stores/auth';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import DesktopErrorState from '@/ui/DesktopErrorState.vue';
import SmartTableToolbar from './SmartTableToolbar.vue';
import SmartTableColumnManager from './SmartTableColumnManager.vue';
import SmartTableFilters from './SmartTableFilters.vue';
import SmartTableExportMenu from './SmartTableExportMenu.vue';
import SmartTablePrintView from './SmartTablePrintView.vue';
import SmartTableSidePanel from './SmartTableSidePanel.vue';
import SmartTableBulkActions from './SmartTableBulkActions.vue';
import SmartTableSavedViews from './SmartTableSavedViews.vue';
import { useSmartTable } from './useSmartTable.js';
import { useSmartTableExport } from './useSmartTableExport.js';
import { formatCell, exportValue, LTR_FORMATS, NUMERIC_FORMATS } from './formatters.js';
import { displayCell } from '@/utils/reportExport.js';

/**
 * SmartTable — one unified, Fluent-styled desktop table for the whole app.
 * Wraps Vuetify's data tables and layers on: column management, density, row
 * selection + bulk actions, advanced filters + chips, saved views, export
 * (Excel/CSV/PDF/clipboard), smart print, a quick-view side panel, keyboard
 * navigation, a totals footer and smart cell formatting — every feature opt-in
 * via props so small/dialog tables stay lean (req #7–#10, #1–#5).
 *
 * Data is CONTROLLED: the page passes `items`/`loading`/`total-items` and reacts
 * to events. Two integration styles:
 *   - SmartTable-driven: listen to `@update:options` (page, itemsPerPage,
 *     sortBy, search, filters) and fetch.
 *   - Composable-driven: keep useServerSearch and wire the granular events
 *     (`update:search`, `search-now`, `clear-search`, `update:filters`,
 *     `update:page`, `update:page-size`, `update:sort`).
 *
 * Caller `#item.<key>` / `#header.<key>` slots pass straight through, so
 * existing custom cells keep working unchanged.
 */
const props = defineProps({
  tableKey: { type: String, required: true },
  headers: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: Object, default: null },
  totalItems: { type: Number, default: 0 },
  serverSide: { type: Boolean, default: false },
  itemValue: { type: String, default: 'id' },

  // feature toggles (opt-in)
  selectable: { type: Boolean, default: false },
  showToolbar: { type: Boolean, default: true },
  showSearch: { type: Boolean, default: true },
  showRefresh: { type: Boolean, default: true },
  showColumnManager: { type: Boolean, default: true },
  showDensityControl: { type: Boolean, default: true },
  showExport: { type: Boolean, default: false },
  showPrint: { type: Boolean, default: false },
  showSavedViews: { type: Boolean, default: false },
  showSidePanel: { type: Boolean, default: false },
  showFooter: { type: Boolean, default: true },
  multiSort: { type: Boolean, default: false },
  stickyHeader: { type: Boolean, default: true },
  bordered: { type: Boolean, default: true },
  virtual: { type: Boolean, default: false },

  // search / filters (controlled, optional)
  search: { type: String, default: '' },
  searchPlaceholder: { type: String, default: 'بحث في الجدول…' },
  filters: { type: Array, default: () => [] }, // auto-filter definitions
  filterValues: { type: Object, default: () => ({}) },
  filterChips: { type: Array, default: null }, // page-supplied chips (custom filters)
  filterOptionSources: { type: Object, default: () => ({}) },

  // pagination (controlled, optional)
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 25 },
  pageSizeOptions: { type: Array, default: () => [10, 25, 50, 100] },
  initialLoad: { type: Boolean, default: true },

  // actions / permissions
  rowActions: { type: [Array, Function], default: () => [] },
  bulkActions: { type: Array, default: () => [] },
  maxPrimaryActions: { type: Number, default: 2 },
  actionsLabel: { type: String, default: 'إجراءات' },
  actionsWidth: { type: [Number, String], default: 96 },

  // totals
  footerAggregates: { type: Object, default: null }, // { colKey: 'sum'|'avg'|fn }
  summary: { type: Object, default: null }, // server-provided totals { colKey: value }

  // states
  emptyTitle: { type: String, default: 'لا توجد بيانات بعد' },
  emptyDescription: { type: String, default: '' },
  emptyIcon: { type: String, default: 'mdi-database-off-outline' },
  emptyActions: { type: Array, default: () => [] },

  // misc
  rowClass: { type: Function, default: null },
  openOnRowClick: { type: Boolean, default: true },
  height: { type: [Number, String], default: null },
  maxHeight: { type: [Number, String], default: null },
  skeletonRows: { type: Number, default: 8 },
  defaultDensity: { type: String, default: 'compact' },
  printTitle: { type: String, default: '' },
  orgName: { type: String, default: '' },
  exportFileBase: { type: String, default: '' },
  exportFetcher: { type: Function, default: null }, // async () => allRows (server)
  lastUpdated: { type: [Date, Number, String], default: null },
});

const emit = defineEmits([
  'update:options',
  'update:search',
  'search-now',
  'clear-search',
  'update:filters',
  'update:filterValues',
  'clear-filters',
  'remove-filter',
  'update:page',
  'update:page-size',
  'update:sort',
  'update:selected',
  'row-click',
  'row-dblclick',
  'row-open',
  'bulk-action',
  'refresh',
  'export',
  'print',
  'panel-open',
]);

const { can } = usePermissions();
const auth = useAuthStore();
const currentUserName = computed(() => auth.user?.name || auth.user?.username || '');

const rootRef = ref(null);
const toolbarRef = ref(null);

/* ─────────────────────────── persisted state ─────────────────────────── */
const headersRef = computed(() => props.headers);
const {
  density,
  setDensity,
  orderedColumns,
  visibleColumns,
  toggleColumn,
  setColumnOrder,
  setColumnPinned,
  resetColumns,
  views,
  activeViewId,
  saveView,
  applyView,
  renameView,
  deleteView,
  setDefaultView,
  resetToDefault,
} = useSmartTable({
  tableKey: props.tableKey,
  columns: headersRef,
  defaultDensity: props.defaultDensity,
});

const showAllColumns = () => orderedColumns.value.forEach((c) => !c.visible && toggleColumn(c.key));

/* ─────────────── live (non-persisted) state, mirrored from props ─────────── */
const searchState = ref(props.search);
const filterState = reactive({ ...props.filterValues });
const page = ref(props.page);
const pageSize = ref(props.pageSize);
const sortBy = ref([]);

watch(() => props.search, (v) => { if (v !== searchState.value) searchState.value = v; });
watch(() => props.filterValues, (v) => Object.assign(filterState, v), { deep: true });
watch(() => props.page, (v) => { if (v !== page.value) page.value = v; });
watch(() => props.pageSize, (v) => { if (v !== pageSize.value) pageSize.value = v; });

/* ─────────────────────────── table component ─────────────────────────── */
const tableComponent = computed(() => {
  if (props.serverSide) return VDataTableServer;
  return props.virtual ? VDataTableVirtual : VDataTable;
});

const viewportStyle = computed(() => {
  const s = {};
  if (props.height) s.height = typeof props.height === 'number' ? `${props.height}px` : props.height;
  if (props.maxHeight) s.maxHeight = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight;
  return s;
});

/* ─────────────────────────── columns → headers ───────────────────────── */
const hasRowActions = computed(() => {
  const ra = typeof props.rowActions === 'function' ? props.rowActions({}) : props.rowActions;
  return Array.isArray(ra) && ra.length > 0;
});

const isNumericColumn = (col) => NUMERIC_FORMATS.has(col.format);
const isLtrColumn = (col) => LTR_FORMATS.has(col.format) || col.ltr === true;

const vuetifyHeaders = computed(() => {
  const cols = visibleColumns.value.map((c) => ({
    key: c.key,
    title: c.title,
    align: c.align || (isNumericColumn(c) ? 'end' : 'start'),
    sortable: props.serverSide ? c.sortable === true : c.sortable !== false && c.key !== 'actions',
    width: c.width ? (typeof c.width === 'number' ? `${c.width}px` : c.width) : undefined,
    nowrap: c.nowrap,
    cellProps: pinnedProps(c),
    headerProps: pinnedProps(c),
    _format: c.format,
  }));
  // Ensure a trailing actions column exists when row actions are configured.
  if (hasRowActions.value && !cols.some((c) => c.key === 'actions')) {
    cols.push({
      key: 'actions',
      title: props.actionsLabel,
      sortable: false,
      align: 'end',
      width: typeof props.actionsWidth === 'number' ? `${props.actionsWidth}px` : props.actionsWidth,
      cellProps: { class: 'st-pin-end' },
      headerProps: { class: 'st-pin-end' },
    });
  }
  return cols;
});

function pinnedProps(col) {
  if (col.pinned === 'start') return { class: 'st-pin-start' };
  if (col.pinned === 'end') return { class: 'st-pin-end' };
  return undefined;
}

/* Columns we auto-format (declare `format`, no caller slot, not actions). */
const $slots = useSlots();

const RESERVED_SLOTS = new Set([
  'filters', 'toolbar-actions', 'preview', 'preview-status', 'preview-actions',
  'empty', 'no-results', 'loading',
]);
const forwardedSlots = computed(() =>
  Object.keys($slots).filter((n) => !RESERVED_SLOTS.has(n))
);

const autoFormatColumns = computed(() =>
  visibleColumns.value.filter(
    (c) => c.format && c.key !== 'actions' && !$slots[`item.${c.key}`]
  )
);
const formatColumnCell = (col, item) => {
  const raw = typeof col.value === 'function' ? col.value(item) : item?.[col.key];
  const out = formatCell(col, raw, item);
  return out == null ? (raw ?? '—') : out;
};

/* ─────────────────────────── selection / bulk ────────────────────────── */
const selected = ref([]); // array of item-value keys (Vuetify model)
const allResultsSelected = ref(false);
const selectedRows = computed(() => {
  const set = new Set(selected.value);
  return props.items.filter((it) => set.has(it?.[props.itemValue]));
});
watch(selected, (v) => {
  if (!v.length) allResultsSelected.value = false;
  emit('update:selected', { keys: v, rows: selectedRows.value });
});
const clearSelection = () => {
  selected.value = [];
  allResultsSelected.value = false;
};
const canSelectAllResults = computed(
  () =>
    props.serverSide &&
    !allResultsSelected.value &&
    selected.value.length >= props.items.length &&
    props.totalItems > props.items.length
);

const allowedBulkActions = computed(() =>
  props.bulkActions
    .filter((a) => !a.permission || can(a.permission))
    .map((a) => ({ ...a, disabled: typeof a.disabled === 'function' ? a.disabled(selectedRows.value) : a.disabled }))
);
const onBulkAction = (key) => {
  const action = props.bulkActions.find((a) => a.key === key);
  if (!action) return;
  const run = () =>
    (action.handler ? action.handler(selectedRows.value, { allResults: allResultsSelected.value }) : null) ||
    emit('bulk-action', { key, rows: selectedRows.value, allResults: allResultsSelected.value });
  if (action.confirm) {
    // confirm may be a static object or a (rows, { allResults }) => config fn,
    // so the dialog can show a dynamic count, e.g. `حذف ${rows.length} عميل`.
    const cfg =
      typeof action.confirm === 'function'
        ? action.confirm(selectedRows.value, { allResults: allResultsSelected.value })
        : action.confirm;
    openConfirm(cfg, run);
  } else {
    run();
  }
};

/* ─────────────────────────── row actions ─────────────────────────────── */
const actionsForRow = (item) => {
  const list = typeof props.rowActions === 'function' ? props.rowActions(item) : props.rowActions;
  return (list || [])
    .filter((a) => !a.permission || can(a.permission))
    .filter((a) => !(typeof a.hidden === 'function' ? a.hidden(item) : a.hidden))
    .map((a) => ({
      ...a,
      _disabled: typeof a.disabled === 'function' ? a.disabled(item) : a.disabled,
      _loading: typeof a.loading === 'function' ? a.loading(item) : a.loading,
    }));
};
const primaryActionsFor = (item) => {
  const all = actionsForRow(item);
  const primaries = all.filter((a) => a.primary);
  if (primaries.length) return primaries;
  return all.slice(0, props.maxPrimaryActions);
};
const overflowActionsFor = (item) => {
  const all = actionsForRow(item);
  const primaries = all.filter((a) => a.primary);
  return primaries.length ? all.filter((a) => !a.primary) : all.slice(props.maxPrimaryActions);
};
const resolveTo = (action, item) =>
  typeof action.to === 'function' ? action.to(item) : action.to || undefined;

const runAction = (action, item) => {
  if (action._disabled) return;
  ctxMenu.open = false;
  const exec = () => action.handler?.(item);
  if (action.confirm) {
    const cfg = typeof action.confirm === 'function' ? action.confirm(item) : action.confirm;
    openConfirm(cfg, exec);
  } else if (action.handler) {
    exec();
  }
};

/* ─────────────────────────── confirm dialog ──────────────────────────── */
const confirm = reactive({
  open: false, title: 'تأكيد', message: '', details: '', type: 'warning',
  confirmText: 'تأكيد', onConfirm: () => {},
});
function openConfirm(cfg, onConfirm) {
  Object.assign(confirm, {
    title: cfg.title || 'تأكيد',
    message: cfg.message || 'هل أنت متأكد؟',
    details: cfg.details || '',
    type: cfg.type || 'warning',
    confirmText: cfg.confirmText || 'تأكيد',
    onConfirm: () => { confirm.open = false; onConfirm(); },
    open: true,
  });
}

/* ─────────────────────────── filters & chips ─────────────────────────── */
const hasAutoFilters = computed(() => props.filters.length > 0);
const activeFilterValues = computed(() =>
  Object.entries(filterState).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
);
const activeFilterCount = computed(() =>
  props.filterChips ? props.filterChips.length : activeFilterValues.value.length
);
const chips = computed(() => {
  if (props.filterChips) return props.filterChips;
  // Auto-build chips from filter definitions + values.
  const out = [];
  for (const [key, value] of activeFilterValues.value) {
    const def = findFilterDef(key);
    out.push({ key, label: chipLabel(def, key, value) });
  }
  return out;
});
function findFilterDef(key) {
  return props.filters.find(
    (f) => f.key === key || f.fromKey === key || f.toKey === key
  );
}
function chipLabel(def, key, value) {
  if (!def) return `${key}: ${value}`;
  if (def.type === 'number-range' || def.type === 'date-range') {
    const which = key === def.fromKey ? 'من' : 'إلى';
    return `${def.label} (${which}): ${value}`;
  }
  const opts = def.options || props.filterOptionSources[def.source] || [];
  if (Array.isArray(value)) {
    return `${def.label}: ${value.map((v) => optTitle(opts, v, def)).join('، ')}`;
  }
  return `${def.label}: ${optTitle(opts, value, def)}`;
}
function optTitle(opts, value, def) {
  const it = opts.find((o) => (o[def?.itemValue || 'value'] ?? o.value) === value);
  return it ? it[def?.itemTitle || 'title'] ?? it.title : value;
}

const onFiltersApply = (values) => {
  Object.keys(filterState).forEach((k) => delete filterState[k]);
  Object.assign(filterState, values);
  page.value = 1;
  emit('update:filters', { ...filterState });
  emit('update:filterValues', { ...filterState });
  emitOptions({ immediate: true });
};
const onFiltersClear = () => {
  Object.keys(filterState).forEach((k) => delete filterState[k]);
  page.value = 1;
  emit('clear-filters');
  emit('update:filters', {});
  emit('update:filterValues', {});
  emitOptions({ immediate: true });
};
const onRemoveChip = (key) => {
  const def = findFilterDef(key);
  if (def && (def.type === 'number-range' || def.type === 'date-range')) {
    delete filterState[key];
  } else {
    delete filterState[key];
  }
  page.value = 1;
  emit('remove-filter', key);
  emit('update:filters', { ...filterState });
  emit('update:filterValues', { ...filterState });
  emitOptions({ immediate: true });
};

/* ─────────────────────────── search handlers ─────────────────────────── */
const hasActiveQuery = computed(
  () => !!(searchState.value && searchState.value.trim()) || chips.value.length > 0
);
const onSearchInput = (val) => {
  searchState.value = val;
  page.value = 1;
  emit('update:search', val);
  emitOptions({ immediate: false }); // debounced for server search
};
const onSearchNow = () => {
  page.value = 1;
  emit('search-now');
  emitOptions({ immediate: true });
};
const onSearchClear = () => {
  searchState.value = '';
  page.value = 1;
  emit('clear-search');
  emit('update:search', '');
  emitOptions({ immediate: true });
};
const clearAllQuery = () => {
  onSearchClear();
  onFiltersClear();
};

/* ─────────────────────────── client filtering ────────────────────────── */
// For client tables, SmartTable does the search + auto-filter predicates in
// memory; Vuetify then sorts & paginates the result.
const filteredItems = computed(() => {
  if (props.serverSide) return props.items;
  let rows = props.items;
  const q = (searchState.value || '').trim().toLowerCase();
  if (q) {
    const searchCols = visibleColumns.value.filter((c) => c.searchable !== false && c.key !== 'actions');
    rows = rows.filter((row) =>
      searchCols.some((c) => {
        const v = typeof c.value === 'function' ? c.value(row) : row?.[c.key];
        return String(v ?? '').toLowerCase().includes(q);
      })
    );
  }
  for (const def of props.filters) {
    rows = applyFilterDef(rows, def);
  }
  return rows;
});
function applyFilterDef(rows, def) {
  if (typeof def.predicate === 'function') {
    const val = def.type?.includes('range')
      ? { from: filterState[def.fromKey], to: filterState[def.toKey] }
      : filterState[def.key];
    if (isActive(val)) return rows.filter((r) => def.predicate(r, val));
    return rows;
  }
  if (def.type === 'number-range' || def.type === 'date-range') {
    const from = filterState[def.fromKey];
    const to = filterState[def.toKey];
    const field = def.field || def.key;
    if (from == null && to == null) return rows;
    return rows.filter((r) => {
      const v = def.type === 'date-range' ? Date.parse(r[field]) : Number(r[field]);
      const lo = def.type === 'date-range' ? (from ? Date.parse(from) : -Infinity) : (from ?? -Infinity);
      const hi = def.type === 'date-range' ? (to ? Date.parse(to) : Infinity) : (to ?? Infinity);
      return v >= lo && v <= hi;
    });
  }
  const val = filterState[def.key];
  if (!isActive(val)) return rows;
  const field = def.field || def.key;
  if (def.type === 'multiselect' && Array.isArray(val)) return rows.filter((r) => val.includes(r[field]));
  if (def.type === 'text') return rows.filter((r) => String(r[field] ?? '').toLowerCase().includes(String(val).toLowerCase()));
  return rows.filter((r) => r[field] === val);
}
function isActive(v) {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some((x) => x != null && x !== '');
  return true;
}

const displayItems = computed(() => (props.serverSide ? props.items : filteredItems.value));
const rowCount = computed(() => (props.serverSide ? props.items.length : filteredItems.value.length));
const totalCount = computed(() => (props.serverSide ? props.totalItems : filteredItems.value.length));
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / (pageSize.value || 1))));

/* ─────────────────────────── pagination ──────────────────────────────── */
const setPage = (n) => {
  if (n === page.value) return;
  page.value = n;
  emit('update:page', n);
  emitOptions({ immediate: true });
};
const setPageSize = (n) => {
  pageSize.value = n;
  page.value = 1;
  emit('update:page-size', n);
  emitOptions({ immediate: true });
};

/* ─────────────────────────── sort ────────────────────────────────────── */
let firstOptions = true;
const onTableOptions = (opts) => {
  // Vuetify echoes page/itemsPerPage/sortBy. Keep our state in sync; for server
  // mode forward upward. Skip the initial mount emit when the page does its own
  // first load. Sorting flows through here (single source) — no separate
  // @update:sort-by handler, so we never double-fire.
  if (opts.sortBy && JSON.stringify(opts.sortBy) !== JSON.stringify(sortBy.value)) {
    sortBy.value = opts.sortBy;
    emit('update:sort', opts.sortBy);
  }
  if (firstOptions) {
    firstOptions = false;
    if (props.serverSide && !props.initialLoad) return;
  }
  if (props.serverSide) emitOptions({ immediate: true });
};

/* ─────────────────────────── options emitter ─────────────────────────── */
// A single consolidated emit with a dedupe guard, so the same (page, size,
// sort, search, filters) is never emitted twice in a row — this absorbs the
// overlap between the granular setters and Vuetify's own update:options.
let optionsTimer = null;
let lastOptionsKey = null;
function emitOptions({ immediate }) {
  if (optionsTimer) { clearTimeout(optionsTimer); optionsTimer = null; }
  const fire = () => {
    const payload = {
      page: page.value,
      itemsPerPage: pageSize.value,
      sortBy: sortBy.value,
      search: searchState.value,
      filters: { ...filterState },
    };
    const key = JSON.stringify(payload);
    if (key === lastOptionsKey) return;
    lastOptionsKey = key;
    emit('update:options', payload);
  };
  if (immediate) fire();
  else optionsTimer = setTimeout(fire, 300);
}

/* ─────────────────────────── saved views ─────────────────────────────── */
const onCreateView = (name) =>
  saveView(name, {
    filters: { ...filterState },
    search: searchState.value,
    sort: sortBy.value,
    pageSize: pageSize.value,
  });
const onApplyView = (id) => {
  const live = applyView(id);
  if (!live) return;
  Object.keys(filterState).forEach((k) => delete filterState[k]);
  Object.assign(filterState, live.filters || {});
  searchState.value = live.search || '';
  sortBy.value = live.sort || [];
  if (live.pageSize) pageSize.value = live.pageSize;
  page.value = 1;
  emit('update:search', searchState.value);
  emit('update:filters', { ...filterState });
  emitOptions({ immediate: true });
};
const onResetView = () => {
  resetToDefault();
  Object.keys(filterState).forEach((k) => delete filterState[k]);
  searchState.value = '';
  sortBy.value = [];
  page.value = 1;
  emitOptions({ immediate: true });
};

/* ─────────────────────────── totals footer ───────────────────────────── */
const hasFooterTotals = computed(() => !!(props.summary || props.footerAggregates));
const footerTotals = computed(() => {
  if (props.summary) return formatTotals(props.summary);
  if (!props.footerAggregates) return {};
  const src = props.serverSide ? props.items : filteredItems.value;
  const out = {};
  for (const [key, agg] of Object.entries(props.footerAggregates)) {
    const nums = src.map((r) => Number(r[key]) || 0);
    let val;
    if (typeof agg === 'function') val = agg(src);
    else if (agg === 'avg') val = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    else val = nums.reduce((a, b) => a + b, 0);
    const col = visibleColumns.value.find((c) => c.key === key);
    out[key] = col ? formatCell(col, val, {}) ?? val : val;
  }
  return out;
});
function formatTotals(summary) {
  const out = {};
  for (const [key, val] of Object.entries(summary)) {
    const col = visibleColumns.value.find((c) => c.key === key);
    out[key] = col ? formatCell(col, val, {}) ?? val : val;
  }
  return out;
}
// The column that should carry the "الإجمالي" label: the first visible column
// that isn't itself a total and isn't the actions column.
const totalsLabelKey = computed(() => {
  const h = vuetifyHeaders.value.find((c) => footerTotals.value[c.key] == null && c.key !== 'actions');
  return h?.key;
});
const totalCellClass = (col) => ({ 'st-cell-num': isNumericColumn(col) });

/* ─────────────────────────── row interactions ────────────────────────── */
const activeKey = ref(null);
const rowProps = ({ item, index }) => {
  const key = item?.[props.itemValue];
  const custom = props.rowClass ? props.rowClass(item) : '';
  return {
    class: [
      activeKey.value === key ? 'st-row-active' : '',
      typeof custom === 'string' ? custom : '',
    ],
    onClick: (e) => onRowClick(item, index, e),
    onDblclick: () => emit('row-dblclick', item),
    onContextmenu: (e) => onRowContext(item, e),
  };
};
function isInteractiveTarget(e) {
  return !!e.target.closest(
    '.st-actions-cell, .v-selection-control, button, a, input, .v-menu, .v-overlay'
  );
}
function onRowClick(item, index, e) {
  if (isInteractiveTarget(e)) return; // never on checkbox / action / link
  activeKey.value = item?.[props.itemValue];
  emit('row-click', item);
  if (props.openOnRowClick && props.showSidePanel) openPanel(item, index);
}

/* ─────────────────────────── side panel ──────────────────────────────── */
const panel = reactive({ open: false, item: null, index: -1 });
const panelLoading = computed(() => false); // pages can drive via :loading on their preview content
const panelTitle = computed(() => {
  const it = panel.item;
  if (!it) return '';
  return it.name || it.title || it.invoiceNumber || it.number || `#${it[props.itemValue]}`;
});
const panelSubtitle = computed(() => panel.item?.subtitle || '');
function openPanel(item, index) {
  panel.item = item;
  panel.index = index ?? displayItems.value.findIndex((r) => r[props.itemValue] === item[props.itemValue]);
  panel.open = true;
  emit('panel-open', item);
}
function closePanel() { panel.open = false; }
function movePanel(delta) {
  const next = panel.index + delta;
  const list = displayItems.value;
  if (next < 0 || next >= list.length) return;
  panel.item = list[next];
  panel.index = next;
  activeKey.value = panel.item[props.itemValue];
  emit('panel-open', panel.item);
}

/* ─────────────────────────── context menu ────────────────────────────── */
const ctxMenu = reactive({ open: false, target: [0, 0], item: null, actions: [], cellText: '' });
function onRowContext(item, e) {
  const acts = actionsForRow(item);
  if (!acts.length) return;
  e.preventDefault();
  activeKey.value = item?.[props.itemValue];
  ctxMenu.item = item;
  ctxMenu.actions = acts;
  ctxMenu.cellText = e.target.closest('td')?.innerText?.trim() || '';
  ctxMenu.target = [e.clientX, e.clientY];
  ctxMenu.open = true;
}
async function copyCellValue() {
  try { await navigator.clipboard.writeText(ctxMenu.cellText); } catch { /* ignore */ }
  ctxMenu.open = false;
}

/* ─────────────────────────── export ──────────────────────────────────── */
const { run: runExport } = useSmartTableExport();
const exportBusy = ref(false);
async function onExport({ format, scope, visibleOnly }) {
  emit('export', { format, scope, visibleOnly });
  const columns = (visibleOnly ? visibleColumns.value : orderedColumns.value).filter((c) => c.key !== 'actions');
  let rows;
  if (scope === 'selected') rows = selectedRows.value;
  else if (scope === 'page') rows = displayItems.value;
  else rows = await gatherAllRows();
  exportBusy.value = true;
  try {
    await runExport(format, {
      title: props.printTitle || props.emptyTitle,
      columns,
      rows,
      fileBase: props.exportFileBase || props.tableKey,
      meta: { branchLabel: '—', userName: currentUserName.value, generatedAt: new Date(), ...exportMeta() },
    });
  } catch (e) {
    console.error('[SmartTable] export failed', e);
  } finally {
    exportBusy.value = false;
  }
}
async function gatherAllRows() {
  if (!props.serverSide) return filteredItems.value;
  if (props.exportFetcher) {
    try { return (await props.exportFetcher()) || props.items; } catch { return props.items; }
  }
  // No server export route supplied — fall back to the current page and warn.
  console.warn('[SmartTable] server export without exportFetcher exports the current page only.');
  return props.items;
}
function exportMeta() {
  const meta = {};
  // Surface active date-range filters into the export header when present.
  for (const def of props.filters) {
    if (def.type === 'date-range') {
      if (filterState[def.fromKey]) meta.dateFrom = filterState[def.fromKey];
      if (filterState[def.toKey]) meta.dateTo = filterState[def.toKey];
    }
  }
  return meta;
}

/* ─────────────────────────── print ───────────────────────────────────── */
const printOpen = ref(false);
const printScope = ref('all');
const printColumns = computed(() =>
  visibleColumns.value
    .filter((c) => c.key !== 'actions' && c.printable !== false)
    .map((c) => ({ key: c.key, title: c.title, align: c.align, numeric: isNumericColumn(c) }))
);
const printSourceRows = computed(() => (props.serverSide ? props.items : filteredItems.value));
const printRows = computed(() =>
  printSourceRows.value.map((row) => {
    const o = {};
    for (const c of printColumns.value) {
      const raw = exportValue(visibleColumns.value.find((vc) => vc.key === c.key) || {}, row);
      o[c.key] = displayCell(raw, c.numeric ? 'number' : 'text');
    }
    return o;
  })
);
const printTotals = computed(() => (hasFooterTotals.value ? footerTotals.value : null));
const printScopeLabel = computed(() => (props.serverSide ? 'الصفحة الحالية' : 'كل النتائج'));
const filtersText = computed(() => chips.value.map((c) => c.label).join('  •  '));
function openPrint() {
  emit('print', { scope: printScope.value });
  printOpen.value = true;
}

/* ─────────────────────────── footer text ─────────────────────────────── */
const resultText = computed(() => (totalCount.value ? `${totalCount.value} نتيجة` : ''));
const rangeText = computed(() => {
  if (!totalCount.value) return '';
  const from = (page.value - 1) * pageSize.value + 1;
  const to = Math.min(page.value * pageSize.value, totalCount.value);
  return `عرض ${from}–${to} من ${totalCount.value}`;
});
const lastUpdatedText = computed(() => {
  if (!props.lastUpdated) return '';
  try {
    const d = new Date(props.lastUpdated);
    return `آخر تحديث ${new Intl.DateTimeFormat('ar-IQ', { hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' }).format(d)}`;
  } catch { return ''; }
});

/* ─────────────────────────── keyboard ────────────────────────────────── */
function inEditable(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
function onKeydown(e) {
  if (inEditable(e)) {
    // Only Escape should bubble out of the search box (handled elsewhere).
    return;
  }
  const list = displayItems.value;
  const curIdx = list.findIndex((r) => r[props.itemValue] === activeKey.value);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = Math.min(curIdx + 1, list.length - 1);
    if (list[next]) activeKey.value = list[next][props.itemValue];
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = Math.max(curIdx - 1, 0);
    if (list[prev]) activeKey.value = list[prev][props.itemValue];
  } else if (e.key === 'Enter' && activeKey.value != null) {
    const it = list[curIdx];
    if (it && props.showSidePanel) openPanel(it, curIdx);
    else if (it) emit('row-open', it);
  } else if (e.key === ' ' && props.selectable && activeKey.value != null) {
    e.preventDefault();
    toggleRowSelection(activeKey.value);
  } else if (e.ctrlKey && (e.key === 'a' || e.key === 'A') && props.selectable) {
    e.preventDefault();
    selected.value = list.map((r) => r[props.itemValue]);
  } else if (e.ctrlKey && (e.key === 'p' || e.key === 'P') && props.showPrint) {
    e.preventDefault();
    openPrint();
  } else if (e.ctrlKey && (e.key === 'f' || e.key === 'F') && props.showSearch) {
    e.preventDefault();
    toolbarRef.value?.focusSearch();
  } else if (e.key === 'Escape') {
    if (ctxMenu.open) ctxMenu.open = false;
    else if (panel.open) panel.open = false;
  } else if (e.key === 'Delete' && activeKey.value != null) {
    const it = list[curIdx];
    const del = it && actionsForRow(it).find((a) => a.key === 'delete');
    if (del) runAction(del, it);
  }
}
function toggleRowSelection(key) {
  const i = selected.value.indexOf(key);
  if (i === -1) selected.value = [...selected.value, key];
  else selected.value = selected.value.filter((k) => k !== key);
}

defineExpose({
  clearSelection,
  openPanel,
  closePanel,
  focusSearch: () => toolbarRef.value?.focusSearch(),
  // Programmatic triggers so pages can wire the command registry / shortcuts to
  // the same export & print the toolbar offers.
  exportData: (format = 'excel', opts = {}) =>
    onExport({ format, scope: opts.scope || 'all', visibleOnly: opts.visibleOnly !== false }),
  print: () => openPrint(),
});
</script>

<style scoped lang="scss">
.smart-table {
  display: flex;
  flex-direction: column;
  min-height: 0;
  outline: none;
  background: rgb(var(--v-theme-surface));

  &--bordered {
    border: 1px solid rgba(var(--v-border-color), 0.12);
    border-radius: 8px;
    overflow: hidden;
  }
}

.smart-table__chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 4px 10px 8px;
}
.smart-table__bulk {
  padding: 0 8px 8px;
}
.smart-table__state {
  padding: 24px;
}
.smart-table__viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.smart-table__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
  flex-wrap: wrap;
}
.smart-table__footer-info {
  flex: 1 1 auto;
  min-width: 120px;
}
.smart-table__pagesize {
  max-width: 120px;
}

/* Density: tighten the compact mode beyond Vuetify's default (req #2). */
.smart-table--compact :deep(.v-data-table__td),
.smart-table--compact :deep(.v-data-table__th) {
  padding-block: 2px;
  font-size: 12.5px;
}
.smart-table--compact :deep(.st-actions-cell .v-btn) {
  --v-btn-height: 26px;
}

/* Numeric cells: right-aligned, tabular figures (req #16). */
:deep(.st-cell-num),
.st-cell-num {
  font-variant-numeric: tabular-nums;
}

/* Row hover + active selection highlight (Fluent). */
:deep(tbody tr) {
  cursor: default;
}
:deep(tbody tr:hover > td) {
  background: rgba(var(--v-theme-on-surface), 0.03);
}
:deep(tbody tr.st-row-active > td) {
  background: rgba(var(--v-theme-primary), 0.1);
}

/* Sticky pinned columns (best-effort: select start + actions end). */
:deep(.st-pin-start),
:deep(.v-data-table__th--sticky-start),
:deep(td.v-data-table-column--fixed) {
  position: sticky;
}
:deep(.st-pin-end) {
  position: sticky;
  inset-inline-end: 0;
  background: rgb(var(--v-theme-surface));
  z-index: 1;
}
:deep(.st-pin-start) {
  inset-inline-start: 0;
  background: rgb(var(--v-theme-surface));
  z-index: 1;
}

.st-actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
}

.st-totals-row__cell {
  font-weight: 700;
  background: rgba(var(--v-theme-primary), 0.06);
  border-top: 2px solid rgba(var(--v-border-color), 0.18);
  padding: 6px 16px;
}
.st-totals-row__label {
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-inline-end: 6px;
}
.st-cell-num {
  text-align: end;
}
</style>
