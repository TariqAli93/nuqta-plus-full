<template>
  <div class="page-shell">
    <PageHeader
      title="قيمة المخزون حسب التسعيرة"
      subtitle="قيمة البضاعة الموجودة فعلياً في المخزون مُقيّمة بسعر المفرد والجملة والوكيل (الكمية × السعر)"
      icon="mdi-cash-multiple"
    />

    <PermissionEmptyState
      v-if="!canReadInventory"
      title="لا تملك صلاحية عرض المخزون"
      message="تحتاج إلى صلاحية عرض المخزون لاستعراض قيمة البضاعة."
      icon="mdi-lock-outline"
      page-title="قيمة المخزون"
      :missing-permissions="[{ label: 'عرض المخزون وقيمته', permission: 'inventory:read' }]"
    />

    <template v-else>
      <!-- ── الفلاتر ─────────────────────────────────────────────────────────── -->
      <v-card class="mb-4">
        <v-card-text>
          <v-row dense>
            <v-col v-if="multiBranchOn" cols="12" sm="6" md="3">
              <v-select
                v-model="filters.branchId"
                :items="branchItems"
                item-title="name"
                item-value="id"
                label="الفرع"
                clearable
                density="comfortable"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col v-if="multiWarehouseOn" cols="12" sm="6" md="3">
              <v-select
                v-model="filters.warehouseId"
                :items="warehouseItems"
                item-title="name"
                item-value="id"
                label="المخزن"
                clearable
                density="comfortable"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="filters.categoryId"
                :items="categoryStore.categories"
                item-title="name"
                item-value="id"
                label="التصنيف"
                clearable
                density="comfortable"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-autocomplete
                v-model="filters.productId"
                :items="productStore.products"
                item-title="name"
                item-value="id"
                label="المادة"
                clearable
                density="comfortable"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="filters.priceType"
                :items="PRICE_TIERS"
                item-title="label"
                item-value="value"
                label="نوع التسعيرة (للإبراز)"
                density="comfortable"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6" md="3" class="d-flex align-center ga-2">
              <v-btn color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="load">
                عرض التقرير
              </v-btn>
              <v-btn variant="text" @click="resetFilters">مسح</v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- ── الملخّص لكل عملة ─────────────────────────────────────────────────── -->
      <template v-if="hasData">
        <div v-for="(totals, cur) in totalsByCurrency" :key="cur" class="mb-5">
          <div class="text-subtitle-2 text-medium-emphasis mb-2">
            العملة: <strong>{{ cur }}</strong> — إجمالي الكمية في المخزون:
            <strong>{{ formatQty(totals.totalQty) }}</strong>
          </div>
          <v-row dense>
            <v-col v-for="card in tierCards(totals)" :key="card.key" cols="12" sm="6" md="3">
              <v-card
                :variant="filters.priceType === card.key ? 'flat' : 'tonal'"
                :color="card.color"
                :class="{ 'tier-card--active': filters.priceType === card.key }"
              >
                <v-card-text>
                  <div class="d-flex align-center justify-space-between">
                    <span class="text-caption">{{ card.label }}</span>
                    <v-icon size="18">{{ card.icon }}</v-icon>
                  </div>
                  <div class="text-h6 font-weight-bold mt-1">
                    {{ formatCurrency(card.value, cur) }}
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- ── التفصيل لكل مادة ──────────────────────────────────────────────── -->
        <!-- Unified SmartTable (client-side: the page owns the report filters +
           fetch above; this just presents the already-loaded `rows`). Cells use
           `format` so per-row currency and quantities format consistently. -->
        <SmartTable
          table-key="inventory-valuation-table"
          :headers="tableHeaders"
          :items="rows"
          :loading="loading"
          show-export
          show-print
          print-title="قيمة المخزون حسب التسعيرة"
          export-file-base="inventory-valuation"
          search-placeholder="ابحث باسم المادة أو التصنيف..."
          empty-title="لا توجد بضاعة"
          empty-description="لا توجد بضاعة في المخزون مطابقة للفلاتر المحددة."
          empty-icon="mdi-package-variant-closed"
        />
      </template>

      <v-card v-else-if="!loading" variant="outlined" class="text-center pa-8">
        <v-icon size="48" color="grey">mdi-package-variant-closed</v-icon>
        <div class="text-body-1 mt-2 text-medium-emphasis">
          لا توجد بضاعة في المخزون مطابقة للفلاتر المحددة.
        </div>
      </v-card>
    </template>
  </div>
</template>

<script setup>
import { reactive, computed, onMounted } from 'vue';
import { useReportStore } from '@/stores/report';
import { useInventoryStore } from '@/stores/inventory';
import { useCategoryStore } from '@/stores/category';
import { useProductStore } from '@/stores/product';
import { useAuthStore } from '@/stores/auth';
import SmartTable from '@/components/common/SmartTable';
import PageHeader from '@/components/PageHeader.vue';
import PermissionEmptyState from '@/components/PermissionEmptyState.vue';
import { formatCurrency } from '@/utils/formatters';
import { PRICE_TIERS } from '@/utils/productUnits';

const reportStore = useReportStore();
const inventoryStore = useInventoryStore();
const categoryStore = useCategoryStore();
const productStore = useProductStore();
const authStore = useAuthStore();

const multiBranchOn = computed(() => authStore.hasFeature?.('multiBranch') === true);
const multiWarehouseOn = computed(() => authStore.hasFeature?.('multiWarehouse') === true);

// The page is reachable with `view:inventory`, but the valuation endpoint
// requires `inventory:read`. Guard the fetch so a user lacking it never
// triggers a 403 toast, and show an empty state instead.
const canReadInventory = computed(() => authStore.hasPermission('inventory:read'));

const filters = reactive({
  branchId: multiBranchOn.value ? inventoryStore.selectedBranchId || null : null,
  warehouseId: multiWarehouseOn.value ? inventoryStore.selectedWarehouseId || null : null,
  categoryId: null,
  productId: null,
  priceType: 'retail',
});

const loading = computed(() => reportStore.loading);
const report = computed(() => reportStore.inventoryValuation);
const totalsByCurrency = computed(() => report.value?.totalsByCurrency || {});
const rows = computed(() => report.value?.rows || []);
const hasData = computed(() => rows.value.length > 0);

const branchItems = computed(() => inventoryStore.branches);
const warehouseItems = computed(() => inventoryStore.warehousesForBranch);

// Four valuation cards per currency. The card matching the selected price-type
// filter is visually emphasised so the owner can focus on one tier.
const tierCards = (totals) => [
  {
    key: 'retail',
    label: 'قيمة المخزون — مفرد',
    value: totals.retailValue,
    color: 'primary',
    icon: 'mdi-tag',
  },
  {
    key: 'wholesale',
    label: 'قيمة المخزون — جملة',
    value: totals.wholesaleValue,
    color: 'indigo',
    icon: 'mdi-tag-multiple',
  },
  {
    key: 'agent',
    label: 'قيمة المخزون — وكيل',
    value: totals.agentValue,
    color: 'teal',
    icon: 'mdi-account-star',
  },
  {
    key: 'cost',
    label: 'قيمة المخزون — التكلفة',
    value: totals.costValue,
    color: 'blue-grey',
    icon: 'mdi-cash',
  },
];

// SmartTable column config. `currency` reads each row's `currency` field so the
// mixed-currency rows format correctly; `text` renders '—' for empty categories.
const tableHeaders = [
  { title: 'المادة', key: 'productName', format: 'text', minWidth: 200 },
  { title: 'التصنيف', key: 'categoryName', format: 'text' },
  { title: 'الكمية', key: 'quantity', align: 'end', format: 'quantity' },
  { title: 'قيمة المفرد', key: 'retailValue', align: 'end', format: 'currency' },
  { title: 'قيمة الجملة', key: 'wholesaleValue', align: 'end', format: 'currency' },
  { title: 'قيمة الوكيل', key: 'agentValue', align: 'end', format: 'currency' },
  { title: 'قيمة التكلفة', key: 'costValue', align: 'end', format: 'currency' },
];

const formatQty = (n) => (Number(n) || 0).toLocaleString('en-US');

// Drop empty filter keys so the backend only receives the active filters.
const buildParams = () => {
  const out = {};
  if (multiBranchOn.value && filters.branchId) out.branchId = filters.branchId;
  if (multiWarehouseOn.value && filters.warehouseId) out.warehouseId = filters.warehouseId;
  if (filters.categoryId) out.categoryId = filters.categoryId;
  if (filters.productId) out.productId = filters.productId;
  if (filters.priceType) out.priceType = filters.priceType;
  return out;
};

const load = async () => {
  if (!canReadInventory.value) return; // no inventory:read → don't hit the API
  await reportStore.fetchInventoryValuation(buildParams());
};

const resetFilters = () => {
  filters.branchId = null;
  filters.warehouseId = null;
  filters.categoryId = null;
  filters.productId = null;
  filters.priceType = 'retail';
  load();
};

onMounted(async () => {
  if (!canReadInventory.value) return; // page is hidden → skip all fetches
  // Load filter option sources (best-effort) then run the initial report.
  const tasks = [
    categoryStore.fetchCategories().catch(() => {}),
    productStore.fetch({ page: 1, limit: 500 }).catch(() => {}),
  ];
  if (multiBranchOn.value && inventoryStore.branches.length === 0) {
    tasks.push(inventoryStore.fetchBranches().catch(() => {}));
  }
  if (inventoryStore.warehouses.length === 0) {
    tasks.push(inventoryStore.fetchWarehouses(filters.branchId).catch(() => {}));
  }
  await Promise.all(tasks);
  await load();
});
</script>

<style scoped>
.tier-card--active {
  outline: 2px solid rgba(var(--v-theme-primary), 0.6);
}
</style>
