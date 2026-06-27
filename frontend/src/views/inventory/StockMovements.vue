<template>
  <div class="page-shell">
    <PageHeader title="حركات المخزون" subtitle="سجل حركات المخزون والتعديلات" icon="mdi-history">
      <v-btn variant="text" prepend-icon="mdi-arrow-right" @click="router.back()"> رجوع </v-btn>
    </PageHeader>

    <!-- Unified SmartTable (Recipe A): one @update:options handler drives the
         server fetch; warehouse/movement-type filters live in the toolbar
         popover. No client search (the movements endpoint has no search param). -->
    <SmartTable
      v-model:filter-values="filterValues"
      table-key="stock-movements-table"
      :headers="headers"
      :items="inventoryStore.movements"
      :loading="inventoryStore.loading"
      :total-items="inventoryStore.movementsPagination.total"
      server-side
      :show-search="false"
      :filters="filterDefs"
      :page-size="20"
      :page-size-options="[10, 20, 50, 100]"
      show-export
      show-print
      print-title="حركات المخزون"
      export-file-base="stock-movements"
      empty-title="لا توجد حركات مخزون"
      empty-description="ستظهر هنا جميع حركات المخزون والتعديلات."
      empty-icon="mdi-history"
      @update:options="onOptions"
      @refresh="fetchMovements"
    >
      <template #[`item.movementType`]="{ item }">
        <v-chip :color="typeColor(item.movementType)" size="small">
          {{ typeLabel(item.movementType) }}
        </v-chip>
      </template>
      <template #[`item.quantityChange`]="{ item }">
        <span :class="item.quantityChange > 0 ? 'text-success' : 'text-error'">
          {{ item.quantityChange > 0 ? '+' : '' }}{{ item.quantityChange }}
        </span>
      </template>
    </SmartTable>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useInventoryStore } from '@/stores/inventory';
import PageHeader from '@/components/PageHeader.vue';
import SmartTable from '@/components/common/SmartTable';
import {
  getInventoryMovementTypeLabel,
  inventoryMovementTypeLabels,
} from '@/utils/inventoryMovementTypes';

const router = useRouter();
const inventoryStore = useInventoryStore();

// Filter state is owned here and two-way bound to SmartTable (v-model), so the
// global warehouse sync below can push into it without clobbering movementType.
const filterValues = ref({
  warehouseId: inventoryStore.selectedWarehouseId || null,
  movementType: null,
});

const movementTypes = Object.keys(inventoryMovementTypeLabels).map((value) => ({
  value,
  title: getInventoryMovementTypeLabel(value),
}));

const typeLabel = (t) => getInventoryMovementTypeLabel(t);
const typeColor = (t) =>
  ({
    sale: 'error',
    sale_cancel: 'warning',
    sale_return: 'warning',
    transfer_in: 'success',
    transfer_out: 'error',
    manual_adjustment_in: 'primary',
    manual_adjustment_out: 'error',
    opening_balance: 'info',
  })[t] || 'grey';

const headers = [
  { title: 'المنتج', key: 'productName', minWidth: 160 },
  { title: 'المخزن', key: 'warehouseName' },
  { title: 'النوع', key: 'movementType', exportValue: (r) => typeLabel(r.movementType) },
  { title: 'الكمية', key: 'quantityChange', format: 'number', align: 'end' },
  { title: 'قبل', key: 'quantityBefore', format: 'number', align: 'end' },
  { title: 'بعد', key: 'quantityAfter', format: 'number', align: 'end' },
  { title: 'ملاحظات', key: 'notes', format: 'text' },
  { title: 'المستخدم', key: 'createdByName' },
  { title: 'التاريخ', key: 'createdAt', format: 'datetime' },
];

const filterDefs = computed(() => [
  {
    key: 'warehouseId',
    type: 'select',
    label: 'المخزن',
    icon: 'mdi-warehouse',
    options: inventoryStore.warehouses.map((w) => ({ title: w.name, value: w.id })),
  },
  {
    key: 'movementType',
    type: 'select',
    label: 'نوع الحركة',
    icon: 'mdi-filter-variant',
    options: movementTypes,
  },
]);

// Remember the last page/size so the global-warehouse watch can re-fetch the
// current page (matching the original behaviour, which kept the current page).
const lastOpts = ref({ page: 1, itemsPerPage: 20 });

const fetchMovements = () =>
  inventoryStore.fetchMovements({
    warehouseId: filterValues.value.warehouseId || undefined,
    movementType: filterValues.value.movementType || undefined,
    page: lastOpts.value.page,
    limit: lastOpts.value.itemsPerPage,
  });

const onOptions = ({ page, itemsPerPage }) => {
  lastOpts.value = { page, itemsPerPage };
  fetchMovements();
};

// Global warehouse changed elsewhere → mirror into the filter chip and reload.
watch(
  () => inventoryStore.selectedWarehouseId,
  (v) => {
    filterValues.value = { ...filterValues.value, warehouseId: v || null };
    fetchMovements();
  }
);

onMounted(async () => {
  // Warehouse list only powers the filter dropdown; the table itself is loaded
  // by SmartTable's initial @update:options emit.
  if (inventoryStore.warehouses.length === 0) await inventoryStore.fetchWarehouses();
});
</script>
