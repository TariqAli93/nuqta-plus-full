<template>
  <component
    :is="server ? 'v-data-table-server' : 'v-data-table'"
    class="dt-data-grid"
    :headers="headers"
    :items="items"
    :loading="loading"
    :density="density"
    :items-per-page="itemsPerPage"
    :show-select="showSelect"
    :row-props="rowProps"
    v-bind="$attrs"
  >
    <!-- Forward every caller slot (column cells, item.* slots, etc.) except the
         loading / no-data ones we provide sensible desktop defaults for. -->
    <template v-for="name in forwardedSlotNames" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>

    <template #loading>
      <slot name="loading">
        <TableSkeleton :rows="skeletonRows" :columns="headers.length || 4" />
      </slot>
    </template>

    <template #no-data>
      <slot name="no-data">
        <EmptyState :title="emptyTitle" :description="emptyDescription" :icon="emptyIcon" />
      </slot>
    </template>
  </component>
</template>

<script setup>
import { computed, ref, useSlots } from 'vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
import EmptyState from '@/components/EmptyState.vue';

/**
 * Thin wrapper over Vuetify's data table that bundles the THREE things every
 * list page re-wires by hand: a skeleton `#loading` state, an `#no-data` empty
 * state, and a desktop-dense default. All other props/attrs and column slots
 * pass straight through, so callers use it exactly like `<v-data-table>`.
 *
 * Set `server` to back it with `<v-data-table-server>` (pass `items-length` +
 * `@update:options` via attrs). No business logic, no data fetching.
 *
 * @prop {Array} headers
 * @prop {Array} items
 * @prop {boolean} loading
 * @prop {boolean} server         Use the server-driven table variant.
 * @prop {string} density         Defaults to 'compact' (desktop).
 * @prop {boolean} showSelect     Enable the selection column.
 * @prop {string} itemKey         Field used to identify the active row.
 *
 * Row interactions (desktop): double-click → `open`, right-click → `row-menu`
 * (with the pointer event so the caller can position a context menu), single
 * click → `row-click` and a persistent active-row highlight.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  headers: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  server: { type: Boolean, default: false },
  density: { type: String, default: 'compact' },
  itemsPerPage: { type: [Number, String], default: 25 },
  showSelect: { type: Boolean, default: false },
  itemKey: { type: String, default: 'id' },
  skeletonRows: { type: Number, default: 8 },
  emptyTitle: { type: String, default: 'لا توجد بيانات' },
  emptyDescription: { type: String, default: '' },
  emptyIcon: { type: String, default: 'mdi-database-off-outline' },
});

const emit = defineEmits(['open', 'row-click', 'row-menu']);

const slots = useSlots();
const forwardedSlotNames = computed(() =>
  Object.keys(slots).filter((name) => name !== 'loading' && name !== 'no-data')
);

// Active (current) row — highlighted so the user always knows the selection.
const activeKey = ref(null);
const keyOf = (item) => item?.[props.itemKey];

const rowProps = ({ item }) => ({
  class: activeKey.value != null && keyOf(item) === activeKey.value ? 'dt-row-active' : '',
  onClick: () => {
    activeKey.value = keyOf(item);
    emit('row-click', item);
  },
  onDblclick: () => emit('open', item),
  onContextmenu: (event) => {
    event.preventDefault();
    activeKey.value = keyOf(item);
    emit('row-menu', { item, event });
  },
});
</script>

<style scoped lang="scss">
.dt-data-grid {
  :deep(tbody tr) {
    cursor: default;
  }
  :deep(tbody tr.dt-row-active > td) {
    background: rgba(var(--v-theme-primary), 0.1);
  }
}
</style>
