<template>
  <div class="page-shell">
    <PageHeader
      title="تنبيهات الصلاحية"
      subtitle="متابعة الكميات المنتهية أو القريبة من الانتهاء"
      icon="mdi-calendar-alert"
    />

    <!-- Unified SmartTable (client-side): the branch/warehouse/status filters
         become advanced-filter defs applied in memory; toolbar refresh re-fetches. -->
    <SmartTable
      v-model:filter-values="filterValues"
      table-key="expiry-alerts-table"
      :headers="headers"
      :items="rows"
      :loading="loading"
      :filters="filterDefs"
      search-placeholder="ابحث بالمنتج، الفرع، المخزن..."
      show-export
      export-file-base="expiry-alerts"
      empty-icon="mdi-calendar-alert"
      empty-title="لا توجد بيانات صلاحية"
      empty-description="لا توجد كميات منتهية أو قريبة من الانتهاء."
      @refresh="load"
    >
      <!-- Filters active but nothing matched. -->
      <template #no-results>
        <EmptyState
          title="لا توجد بيانات صلاحية"
          description="لا توجد كميات مطابقة للفلاتر الحالية."
          icon="mdi-calendar-search"
          compact
        />
      </template>
    </SmartTable>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useInventoryStore } from '@/stores/inventory';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import SmartTable from '@/components/common/SmartTable';

const inventoryStore = useInventoryStore();
const loading = ref(false);
const rows = ref([]);
// Bound to SmartTable via v-model:filter-values — SmartTable filters `rows`
// in memory (branchId/warehouseId/status all live on each alert row).
const filterValues = ref({ branchId: null, warehouseId: null, status: null });

const statuses = [
  'منتهي',
  'ينتهي خلال 7 أيام',
  'ينتهي خلال 30 يوم',
  'ينتهي خلال 60 يوم',
  'صالح',
  'بدون تاريخ انتهاء',
];

const headers = [
  { title: 'المنتج', key: 'productName' },
  { title: 'الفرع', key: 'branchName' },
  { title: 'المخزن', key: 'warehouseName' },
  { title: 'الكمية المتبقية', key: 'remainingQuantity', format: 'number', align: 'end' },
  { title: 'تاريخ الانتهاء', key: 'expiryDate', format: 'date' },
  { title: 'الحالة', key: 'status' },
];

const branchOptions = computed(() =>
  (inventoryStore.branches || []).map((b) => ({ title: b.name, value: b.id }))
);
// Cascade: warehouse options narrow to the selected branch (as before).
const warehouseOptions = computed(() =>
  (inventoryStore.warehouses || [])
    .filter((w) => !filterValues.value.branchId || w.branchId === filterValues.value.branchId)
    .map((w) => ({ title: w.name, value: w.id }))
);

const filterDefs = computed(() => [
  { key: 'branchId', type: 'select', label: 'الفرع', options: branchOptions.value },
  { key: 'warehouseId', type: 'select', label: 'المخزن', options: warehouseOptions.value },
  {
    key: 'status',
    type: 'select',
    label: 'الحالة',
    options: statuses.map((s) => ({ title: s, value: s })),
  },
]);

const load = async () => {
  loading.value = true;
  try {
    // Fetch the full set once; SmartTable does branch/warehouse/status filtering.
    const result = await inventoryStore.fetchExpiryAlerts();
    rows.value = result || [];
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  if (inventoryStore.branches.length === 0) await inventoryStore.fetchBranches();
  if (inventoryStore.warehouses.length === 0) await inventoryStore.fetchWarehouses();
  await load();
});
</script>
