<template>
  <div class="page-shell">
    <PageHeader
      title="إدارة المنتجات"
      subtitle="إدارة كتالوج المنتجات والمخزون والأسعار"
      icon="mdi-package-variant"
    >
      <v-btn
        v-if="canManageProducts"
        data-testid="product-new-btn"
        color="primary"
        prepend-icon="mdi-plus"
        size="default"
        to="/products/new"
        aria-label="إضافة منتج جديد"
      >
        منتج جديد
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable: search + advanced filters + columns + export + print
         + saved views, backed by the existing useServerSearch data engine. -->
    <SmartTable
      ref="tableRef"
      data-testid="products-table"
      table-key="products-table"
      :headers="headers"
      :items="items"
      :loading="tableLoading"
      :error="error"
      :total-items="pagination.total"
      server-side
      :initial-load="false"
      :page="pagination.page"
      :page-size="pagination.limit"
      :search="query"
      :search-placeholder="'ابحث بالاسم، الرمز، الباركود، الوحدة...'"
      :filter-chips="filterChips"
      :row-actions="rowActions"
      show-export
      show-print
      show-saved-views
      print-title="قائمة المنتجات"
      export-file-base="products"
      :empty-title="'لا توجد منتجات'"
      :empty-description="'ابدأ بإضافة منتج جديد لبناء مخزونك'"
      empty-icon="mdi-package-variant"
      :empty-actions="[
        { text: 'إضافة منتج جديد', icon: 'mdi-plus', to: '/products/new', color: 'primary' },
      ]"
      @update:search="onQueryChange"
      @search-now="runNow"
      @clear-search="clear"
      @update:page="setPage"
      @update:page-size="setPageSize"
      @clear-filters="onClearFilters"
      @remove-filter="onRemoveFilter"
      @refresh="refresh"
    >
      <!-- Advanced filters live in the toolbar popover (page-owned controls). -->
      <template #filters>
        <v-row dense>
          <v-col v-if="canReadCategories" cols="12" sm="6">
            <v-select
              v-model="selectedCategory"
              :items="categories"
              item-title="name"
              item-value="id"
              label="التصنيف"
              clearable
              density="comfortable"
              variant="outlined"
              hide-details
              prepend-inner-icon="mdi-shape-outline"
              @update:model-value="onCategoryChange"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="statusFilter"
              :items="statusOptions"
              item-title="title"
              item-value="value"
              label="الحالة"
              clearable
              density="comfortable"
              variant="outlined"
              hide-details
              prepend-inner-icon="mdi-flag-outline"
              @update:model-value="onStatusChange"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="productTypeFilter"
              :items="productTypeOptions"
              item-title="title"
              item-value="value"
              label="نوع المنتج"
              placeholder="الكل"
              clearable
              density="comfortable"
              variant="outlined"
              hide-details
              prepend-inner-icon="mdi-shape-plus-outline"
              @update:model-value="onTypeChange"
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-text-field
              v-model.number="minPrice"
              type="number"
              label="السعر من"
              density="comfortable"
              variant="outlined"
              hide-details
              min="0"
              @update:model-value="onPriceChange"
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-text-field
              v-model.number="maxPrice"
              type="number"
              label="السعر إلى"
              density="comfortable"
              variant="outlined"
              hide-details
              min="0"
              @update:model-value="onPriceChange"
            />
          </v-col>
        </v-row>
      </template>

      <!-- Custom cells (search highlighting, chips, badges) pass straight through. -->
      <template #[`item.name`]="{ item }">
        <div class="d-flex flex-column py-1">
          <span class="font-weight-medium">
            <template v-if="searchActive">
              <template v-for="(seg, i) in highlightOf(item.name)" :key="i">
                <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
                <template v-else>{{ seg.text }}</template>
              </template>
            </template>
            <template v-else>{{ item.name }}</template>
          </span>
          <MatchBadge
            v-if="item.matchedField"
            :field="item.matchedField"
            :value="item.matchedValue"
            class="mt-1 align-self-start"
          />
        </div>
      </template>
      <template #[`item.sku`]="{ item }">
        <span dir="ltr" class="st-cell-num">
          <template v-if="searchActive">
            <template v-for="(seg, i) in highlightOf(item.sku)" :key="i">
              <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
              <template v-else>{{ seg.text }}</template>
            </template>
          </template>
          <template v-else>{{ item.sku }}</template>
        </span>
      </template>
      <template #[`item.barcode`]="{ item }">
        <span dir="ltr" class="st-cell-num">
          <template v-if="searchActive">
            <template v-for="(seg, i) in highlightOf(item.barcode)" :key="i">
              <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
              <template v-else>{{ seg.text }}</template>
            </template>
          </template>
          <template v-else>{{ item.barcode }}</template>
        </span>
      </template>
      <template #[`item.productType`]="{ item }">
        <v-chip
          :color="isServiceItem(item) ? 'purple' : 'blue-grey'"
          size="small"
          variant="tonal"
          :prepend-icon="isServiceItem(item) ? 'mdi-room-service-outline' : 'mdi-package-variant'"
        >
          {{ isServiceItem(item) ? 'خدمة' : 'منتج' }}
        </v-chip>
      </template>
      <template #[`item.stock`]="{ item }">
        <span v-if="isServiceItem(item)" class="text-caption text-medium-emphasis">لا ينطبق</span>
        <div v-else class="d-flex align-center ga-1">
          <v-chip
            :color="isLowStock(item) ? 'error' : 'success'"
            size="small"
            :title="`المتوفر في المخزن المحدد: ${resolvedStock(item)}`"
          >
            {{ resolvedStock(item) }}
          </v-chip>
          <span v-if="item.totalStock != null" class="text-caption text-medium-emphasis">
            / {{ item.totalStock }} إجمالي
          </span>
        </div>
      </template>
      <template #[`item.sellingPrice`]="{ item }">
        {{ formatCurrency(item.sellingPrice, item.currency) }}
      </template>
      <template #[`item.wholesalePrice`]="{ item }">
        <span :class="{ 'text-medium-emphasis': item.wholesalePrice == null }">
          {{
            item.wholesalePrice == null ? '—' : formatCurrency(item.wholesalePrice, item.currency)
          }}
        </span>
      </template>
      <template #[`item.agentPrice`]="{ item }">
        <span :class="{ 'text-medium-emphasis': item.agentPrice == null }">
          {{ item.agentPrice == null ? '—' : formatCurrency(item.agentPrice, item.currency) }}
        </span>
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip :color="getStatusColor(item.status)" size="small">
          {{ getStatusText(item.status) }}
        </v-chip>
      </template>
      <template #[`item.expiry`]="{ item }">
        <v-chip :color="item.tracksExpiry ? 'info' : 'grey'" size="small" variant="tonal">
          {{ item.tracksExpiry ? 'له تاريخ انتهاء' : 'بدون تاريخ انتهاء' }}
        </v-chip>
      </template>
    </SmartTable>

    <!-- Manual stock adjustment (increase / decrease / correction …) for the
         selected product. Reuses the shared inventory-adjust workflow + endpoint;
         refreshes the list on a successful save. -->
    <StockAdjustDialog ref="adjustDialog" @saved="refresh" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useProductStore } from '@/stores/product';
import { useCategoryStore } from '@/stores/category';
import { useAuthStore } from '@/stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { usePermissions } from '@/composables/usePermissions';
import * as uiAccess from '@/auth/uiAccess.js';
import PageHeader from '@/components/PageHeader.vue';
import MatchBadge from '@/components/MatchBadge.vue';
import SmartTable from '@/components/common/SmartTable';
import StockAdjustDialog from '@/components/inventory/StockAdjustDialog.vue';
import { useServerSearch } from '@/composables/useServerSearch';
import { highlightSegments } from '@/utils/highlight';
import { formatCurrency } from '@/utils/formatters';
import { usePageActions } from '@/commands/pageActions';
import { useUndo } from '@/composables/useUndo';
import { useNotificationStore } from '@/stores/notification';

const productStore = useProductStore();
const categoryStore = useCategoryStore();
const authStore = useAuthStore();
const inventoryStore = useInventoryStore();
const notificationStore = useNotificationStore();
const { registerUndo } = useUndo();

const { can } = usePermissions();
const canReadCategories = computed(() => can('categories:read'));
// Same permission the inventory page + backend enforce for POST /inventory/adjust.
const canAdjustInventory = computed(() => can('inventory:adjust'));

const userRole = computed(() => authStore.user?.role);
const canManageProducts = computed(() =>
  userRole.value ? uiAccess.canManageProducts(userRole.value) : false
);
const agentPricingOn = computed(() => authStore.hasFeature?.('agentPricing') === true);
const canDeleteProducts = computed(() =>
  userRole.value ? uiAccess.canManageProducts(userRole.value) : false
);

const tableRef = ref(null);
const adjustDialog = ref(null);
const categories = ref([]);

const selectedCategory = ref(null);
const statusFilter = ref(null);
const productTypeFilter = ref(null);
const minPrice = ref(null);
const maxPrice = ref(null);

const statusOptions = [
  { title: 'متاح', value: 'available' },
  { title: 'نفذ', value: 'out_of_stock' },
  { title: 'متوقف', value: 'discontinued' },
];
const productTypeOptions = [
  { title: 'منتجات مخزنية', value: 'inventory' },
  { title: 'خدمات', value: 'service' },
];
const productTypeLabel = (v) =>
  v === 'service' ? 'خدمات' : v === 'inventory' ? 'منتجات مخزنية' : '';

const currentWarehouseId = () => inventoryStore.selectedWarehouseId || undefined;

// The `product` Pinia store slice is SHARED across screens: POS (PosScreen) and
// the New-Sale form load the FULL catalogue into it with `limit: 1000` for
// offline barcode/search, and InventoryValuation loads 500. If this list page
// bound straight to that shared slice, opening Products right after visiting POS
// would flash ~1000 stale rows AND inherit `pagination.limit = 1000` as the
// table's items-per-page — the exact freeze-then-settle-to-25 bug — until the
// fresh limit-25 request landed. So the list view keeps its OWN isolated items
// + pagination and never reads the shared store's list/pagination state.
const PAGE_SIZE = 25;
const items = ref([]);
const pagination = ref({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });

// Single funnel for both fresh (`load`) and cached (`apply`) responses so ONLY
// this page's local state is ever touched. `limit` is pinned to PAGE_SIZE — the
// backend meta is trusted for page/total but never for the render page size.
const applyResponse = (res) => {
  items.value = res?.data || [];
  const meta = res?.meta;
  pagination.value = {
    page: Number(meta?.page) || 1,
    limit: PAGE_SIZE,
    total: Number(meta?.total) || 0,
    totalPages: Number(meta?.totalPages) || 0,
  };
};

const {
  query,
  isSearching,
  error,
  onQueryChange,
  runNow,
  clear,
  setFilters,
  clearFilters,
  setPage,
  setPageSize,
  refresh,
} = useServerSearch({
  limit: PAGE_SIZE,
  initialFilters: {
    categoryId: null,
    status: null,
    productType: null,
    minPrice: null,
    maxPrice: null,
  },
  load: async (params, opts) => {
    const res = await productStore.fetch(
      { ...params, warehouseId: currentWarehouseId() },
      { ...opts, silent: true }
    );
    applyResponse(res);
    return res;
  },
  apply: (res) => applyResponse(res),
});

const tableLoading = computed(() => isSearching.value || productStore.loading);

const filterChips = computed(() => {
  const chips = [];
  if (selectedCategory.value) {
    const cat = categories.value.find((c) => c.id === selectedCategory.value);
    chips.push({ key: 'categoryId', label: `التصنيف: ${cat?.name ?? selectedCategory.value}` });
  }
  if (statusFilter.value)
    chips.push({ key: 'status', label: `الحالة: ${getStatusText(statusFilter.value)}` });
  if (productTypeFilter.value)
    chips.push({
      key: 'productType',
      label: `النوع: ${productTypeLabel(productTypeFilter.value)}`,
    });
  if (minPrice.value) chips.push({ key: 'minPrice', label: `السعر من: ${minPrice.value}` });
  if (maxPrice.value) chips.push({ key: 'maxPrice', label: `السعر إلى: ${maxPrice.value}` });
  return chips;
});

// Only run the (allocating) segment splitter when there is actually something
// to highlight. On the default, no-query catalogue view every name/sku/barcode
// cell would otherwise call highlightSegments on each render; this keeps those
// cells to a plain text interpolation. `matchedField` is NULL from the backend
// when not searching, so the MatchBadge stays hidden too.
const searchActive = computed(() => !!(query.value && query.value.trim()));
const highlightOf = (value) => highlightSegments(value, query.value);

const onCategoryChange = () => setFilters({ categoryId: selectedCategory.value || null });
const onStatusChange = () => setFilters({ status: statusFilter.value || null });
const onTypeChange = () => setFilters({ productType: productTypeFilter.value || null });
const onPriceChange = () =>
  setFilters({ minPrice: minPrice.value || null, maxPrice: maxPrice.value || null });

const onRemoveFilter = (key) => {
  if (key === 'categoryId') selectedCategory.value = null;
  if (key === 'status') statusFilter.value = null;
  if (key === 'productType') productTypeFilter.value = null;
  if (key === 'minPrice') minPrice.value = null;
  if (key === 'maxPrice') maxPrice.value = null;
  setFilters({ [key]: null });
};

const onClearFilters = () => {
  selectedCategory.value = null;
  statusFilter.value = null;
  productTypeFilter.value = null;
  minPrice.value = null;
  maxPrice.value = null;
  clearFilters();
};

const headers = computed(() => [
  { title: 'الاسم', key: 'name', minWidth: 180 },
  { title: 'رمز المنتج', key: 'sku', format: 'sku', ltr: true },
  { title: 'النوع', key: 'productType', sortable: false },
  { title: 'التصنيف', key: 'category' },
  { title: 'سعر المفرد', key: 'sellingPrice', format: 'currency', align: 'end' },
  ...(agentPricingOn.value
    ? [
        { title: 'سعر الجملة', key: 'wholesalePrice', format: 'currency', align: 'end' },
        { title: 'سعر الوكيل', key: 'agentPrice', format: 'currency', align: 'end' },
      ]
    : []),
  { title: 'المخزون', key: 'stock', sortable: false, exportValue: (r) => r.totalStock ?? r.stock },
  { title: 'الحد الأدنى للمخزون', key: 'minStock', format: 'number', align: 'end' },
  { title: 'باركود', key: 'barcode', format: 'barcode', ltr: true },
  {
    title: 'حالة الصلاحية',
    key: 'expiry',
    sortable: false,
    exportValue: (r) => (r.tracksExpiry ? 'له تاريخ انتهاء' : 'بدون تاريخ انتهاء'),
  },
  { title: 'الحالة', key: 'status', exportValue: (r) => getStatusText(r.status) },
]);

// Row actions: edit + delete, gated on the existing role-based UI access.
const rowActions = computed(() => {
  const list = [];
  if (canManageProducts.value) {
    list.push({
      key: 'edit',
      icon: 'mdi-pencil',
      title: 'تعديل',
      to: (item) => `/products/${item.id}/edit`,
      primary: true,
    });
  }
  if (canAdjustInventory.value) {
    list.push({
      key: 'inventory',
      icon: 'mdi-tune',
      title: 'إدارة المخزون',
      // Services have no stock — offer the action only for inventory products.
      hidden: (item) => isServiceItem(item),
      handler: (item) => adjustDialog.value?.openFor(item),
    });
  }
  if (canDeleteProducts.value) {
    list.push({
      key: 'delete',
      icon: 'mdi-delete',
      title: 'حذف',
      color: 'error',
      danger: true,
      handler: (item) => handleDelete(item),
      confirm: (item) => ({
        title: 'تحذير: حذف نهائي',
        message:
          'سيتم حذف المنتج نهائياً. سيتم الاحتفاظ باسم المنتج داخل الفواتير الملغية فقط، ولن تتأثر سجلات الأرشفة. إذا كان المنتج مستخدماً في بيانات فعالة (فواتير أو عمليات غير ملغية) فسيُرفض الحذف.',
        details: `المنتج: ${item.name}`,
        type: 'error',
        confirmText: 'حذف نهائي',
      }),
    });
  }
  return list;
});

const getStatusColor = (status) =>
  ({ available: 'success', out_of_stock: 'warning', discontinued: 'error' })[status] || 'grey';
const getStatusText = (status) =>
  ({ available: 'متاح', out_of_stock: 'نفذ', discontinued: 'متوقف' })[status] || status;

const isServiceItem = (item) => item?.productType === 'service';
const resolvedStock = (item) => {
  if (inventoryStore.selectedWarehouseId && item.warehouseStock != null) return item.warehouseStock;
  return item.totalStock != null ? item.totalStock : item.stock;
};
const isLowStock = (item) => {
  if (isServiceItem(item)) return false;
  const qty = resolvedStock(item);
  const threshold =
    item.lowStockThreshold && item.lowStockThreshold > 0
      ? item.lowStockThreshold
      : item.minStock || 0;
  return qty <= threshold;
};

const handleDelete = async (product) => {
  const productName = product.name;
  try {
    await productStore.deleteProduct(product.id);
    // Instant feedback on the isolated local list, then refresh to resync
    // counts/totals from the server.
    items.value = items.value.filter((p) => p.id !== product.id);
    refresh();
    registerUndo(
      {
        undo: async () => {
          notificationStore.info('لا يمكن التراجع عن حذف المنتج');
        },
      },
      `تم حذف المنتج "${productName}"`
    );
  } catch (err) {
    notificationStore.error(err?.message || 'فشل حذف المنتج');
    console.error('Error deleting product:', err?.message);
  }
};

// Command Registry: products.export / products.refresh run THESE handlers from
// the command bar / palette / shortcuts.
usePageActions('products', {
  export: () => tableRef.value?.exportData('excel', { scope: 'all' }),
  refresh: () => refresh(),
});

onMounted(async () => {
  if (inventoryStore.branches.length === 0) await inventoryStore.fetchBranches();
  if (inventoryStore.warehouses.length === 0) await inventoryStore.fetchWarehouses();

  refresh();

  if (canReadCategories.value) {
    const { data } = await categoryStore.fetchCategories();
    categories.value = data || [];
  }
});

watch(
  () => inventoryStore.selectedWarehouseId,
  () => refresh()
);
</script>

<style scoped lang="scss">
.search-hl {
  background-color: rgba(var(--v-theme-warning), 0.38);
  color: inherit;
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 700;
}
</style>
