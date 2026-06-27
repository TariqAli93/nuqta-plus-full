# SmartTable

One unified, Microsoft-Fluent-styled desktop table for the whole app. It wraps
Vuetify's `v-data-table` / `v-data-table-server` and layers on column
management, density, selection + bulk actions, advanced filters + chips, saved
views, export (Excel/CSV/PDF/clipboard), smart printing, a quick-view side
panel, keyboard navigation, a totals footer and smart cell formatting — **every
feature opt-in via props**, so a small dialog table stays as lean as a full page
stays powerful.

```js
import SmartTable from '@/components/common/SmartTable';
```

The data is **controlled**: the page owns fetching and passes `items`, `loading`,
`total-items`; SmartTable owns the presentation/UX. Existing `#item.<key>` /
`#header.<key>` slots pass straight through, so custom cells keep working.

---

## Two integration recipes

### Recipe A — SmartTable-driven (new / simple tables)

Let SmartTable own search/filters/sort/pagination and just react to one event.

```vue
<SmartTable
  table-key="categories-table"
  :headers="headers"
  :items="store.items"
  :loading="store.loading"
  :total-items="store.pagination.total"
  server-side
  :filters="filterDefs"
  v-model:filter-values="filterValues"
  @update:options="load"
/>
```

```js
function load({ page, itemsPerPage, sortBy, search, filters }) {
  store.fetch({ page, limit: itemsPerPage, search, sortBy, ...filters });
}
```

### Recipe B — composable-driven (preserve `useServerSearch` pages)

Keep `useServerSearch` as the data engine and wire SmartTable's granular events
to its methods. This is what **Products.vue** (the reference) does.

```vue
<SmartTable
  table-key="products-table"
  :headers="headers"
  :items="store.products"
  :loading="tableLoading"
  :error="error"
  :total-items="store.pagination.total"
  server-side
  :initial-load="false"
  :page="store.pagination.page"
  :page-size="store.pagination.limit"
  :search="query"
  :filter-chips="filterChips"
  :row-actions="rowActions"
  @update:search="onQueryChange"
  @search-now="runNow"
  @clear-search="clear"
  @update:page="setPage"
  @update:page-size="setPageSize"
  @clear-filters="onClearFilters"
  @remove-filter="onRemoveFilter"
  @refresh="refresh"
>
  <template #filters> <!-- page-owned v-selects that call setFilters --> </template>
  <template #[`item.name`]="{ item }"> …highlighted cell… </template>
</SmartTable>
```

> Set `:initial-load="false"` when the page does its own first fetch
> (`onMounted → refresh()`), so SmartTable doesn't double-fire.

For a **client-side** table just pass the full array and omit `server-side`;
SmartTable does search + filtering in memory and Vuetify sorts + paginates.

---

## Column config (`headers`)

A superset of Vuetify headers. Minimum is `{ key, title }`.

| field | purpose |
|---|---|
| `key`, `title` | as Vuetify (use `key: 'actions'` only if you template it yourself) |
| `align` | `'start' \| 'center' \| 'end'` (numeric columns auto-`end`) |
| `sortable` | client: default true; **server: default false** (set `true` only if the API sorts) |
| `width`, `minWidth`, `maxWidth` | column sizing (px) |
| `format` | smart formatter for display **and** export type — see below |
| `value(row)` | accessor when the field isn't a plain key |
| `exportValue(row)` | raw value for export/print (overrides `value`/`key`); never truncated |
| `exportTotal: true` | include a summed total for this column in exports |
| `searchable: false` | exclude from client-side search |
| `hideable: false` / `locked: true` | can't be hidden in the column manager |
| `pinnable: true` | user may pin to start/end |
| `defaultVisible: false` | start hidden |
| `printable: false` | exclude from the print view |
| `ltr: true` | force LTR rendering (ids/codes) |

**`format`** values: `text`, `longtext`, `number`, `quantity`, `percent`,
`currency` (reads `row.currency`), `date`, `datetime`, `relative`, `time`,
`phone`, `barcode`, `sku`, `boolean`, or a `(value, row, col) => string` fn.

A column may have **both** a `format` and a `#item.<key>` slot: the slot wins for
display, the `format` drives export/print typing. Columns with a `format` and no
slot are auto-rendered (so you only template genuinely custom cells).

---

## Row actions (`row-actions`)

Array (or `(row) => array`). Primary actions render as icon buttons; the rest
collapse into a `…` menu. Right-click gives the same actions as a context menu.

```js
const rowActions = computed(() => [
  { key: 'edit', icon: 'mdi-pencil', title: 'تعديل', to: (i) => `/x/${i.id}/edit`, primary: true, testId: 'x-edit' },
  { key: 'delete', icon: 'mdi-delete', title: 'حذف', color: 'error', danger: true,
    permission: 'x:delete',                 // hidden unless can('x:delete')
    hidden: (i) => i.locked,                // or per-row visibility
    disabled: (i) => i.posted,              // greyed out
    handler: (i) => onDelete(i),
    confirm: (i) => ({ title:'حذف', message:'…', details:`#${i.id}`, type:'error', confirmText:'حذف' }),
  },
]);
```

`permission` → `usePermissions().can(permission)`. `to` → router-link.
`confirm` → built-in `ConfirmDialog` runs before `handler`.

## Bulk actions (`bulk-actions`) + `selectable`

```js
const bulkActions = [
  { key: 'archive', icon: 'mdi-archive', title: 'أرشفة', permission: 'x:update',
    handler: (rows, { allResults }) => archive(rows) },
  { key: 'delete', icon: 'mdi-delete', title: 'حذف', danger: true, permission: 'x:delete',
    confirm: { title:'حذف', message:'حذف العناصر المحددة؟', type:'error' },
    handler: (rows) => bulkDelete(rows) },
];
```

Add `selectable`. The bar shows the selected count, primary actions + overflow,
and (server) a **"select all N results"** escalation. Permission-gated upstream.

## Advanced filters

- **Auto:** pass `:filters="defs"` + `v-model:filter-values="values"`. SmartTable
  renders the controls in a popover and builds the chips.
  ```js
  const defs = [
    { key:'status', type:'select', label:'الحالة', options:[{title,value}] },
    { key:'branchId', type:'select', label:'الفرع', source:'branch' }, // from :filter-option-sources
    { type:'number-range', label:'السعر', fromKey:'minPrice', toKey:'maxPrice', field:'price' },
    { type:'date-range', label:'التاريخ', fromKey:'startDate', toKey:'endDate', field:'createdAt' },
    { key:'tags', type:'multiselect', label:'الوسوم', options:[…] },
  ];
  ```
- **Custom:** use the `#filters` slot for bespoke controls (they call your own
  `setFilters`), and pass `:filter-chips="chips"`. Wire `@remove-filter` +
  `@clear-filters`.

---

## Props (summary)

`tableKey` (req), `headers`, `items`, `loading`, `error`, `totalItems`,
`serverSide`, `itemValue` (`'id'`); toggles `selectable`, `showExport`,
`showPrint`, `showSavedViews`, `showSidePanel`, `showColumnManager`,
`showDensityControl`, `showSearch`, `showRefresh`, `showToolbar`, `showFooter`,
`multiSort`, `stickyHeader`, `virtual`; data `search`, `searchPlaceholder`,
`filters`, `filterValues`, `filterChips`, `filterOptionSources`, `page`,
`pageSize`, `pageSizeOptions`, `initialLoad`; actions `rowActions`,
`bulkActions`, `maxPrimaryActions`; totals `footerAggregates` (`{key:'sum'|'avg'|fn}`),
`summary` (server totals `{key:value}`); states `emptyTitle/Description/Icon/Actions`;
misc `rowClass(row)`, `openOnRowClick`, `height`, `maxHeight`, `printTitle`,
`orgName`, `exportFileBase`, `exportFetcher` (async → all rows for server export),
`lastUpdated`.

## Events

`update:options`, `update:search`, `search-now`, `clear-search`,
`update:filters`, `update:filter-values`, `clear-filters`, `remove-filter`,
`update:page`, `update:page-size`, `update:sort`, `update:selected`,
`row-click`, `row-dblclick`, `row-open`, `bulk-action`, `refresh`, `export`,
`print`, `panel-open`.

## Slots

`#item.<key>`, `#header.<key>`, `#expanded-row` (pass-through); `#filters`
(`{ values, set }`), `#toolbar-actions`; `#preview` / `#preview-status` /
`#preview-actions` (`{ item, close }`); `#empty`, `#no-results`, `#loading`.

## Exposed methods (`ref`)

`clearSelection()`, `openPanel(item, index)`, `closePanel()`, `focusSearch()`,
`exportData(format?, { scope?, visibleOnly? })`, `print()`.

---

## Conversion checklist

1. Replace the `<v-data-table>`/`<table>` + its filter card + pagination with
   `<SmartTable>`. Give it a unique **`table-key`** (`xxx-table`).
2. Move `headers` to SmartTable column config; add `format` to money/number/date
   columns; add `exportValue` where the cell is computed.
3. Keep every custom `#item.<key>` slot **unchanged** (they pass through).
4. Replace the per-row action buttons with `:row-actions` (drop the page's own
   `ConfirmDialog` for deletes — use the action's `confirm`).
5. Server pages: keep `useServerSearch` and wire the granular events
   (Recipe B). Simple pages: use `@update:options` (Recipe A).
6. Move filter controls into `#filters` (+ `:filter-chips`) or `:filters` defs.
7. Add `selectable` + `:bulk-actions` only where it makes sense.
8. Turn on `show-export` / `show-print` / `show-saved-views` where useful.
9. Remove now-unused imports (`PaginationControls`, `TableSkeleton`, `EmptyState`,
   `SearchBar`, `AdvancedFilters`, `ConfirmDialog`, `useExport`).
10. `npx eslint <file>` must pass.

## Gotchas

- **Stores are singular**: `@/stores/product`, `@/stores/category` (not plural).
- **API envelope**: `api.get()` resolves to `{ data, meta:{ page, limit, total, totalPages } }`.
- Don't compute "all results" totals from one server page — use `summary` (server) or a client table.
- Don't hardcode colors — the components use `var(--v-theme-*)` and adapt to light/dark + RTL.
- Server sort is **opt-in per column** (`sortable: true`) and only if the API supports it.
