<template>
  <div class="page-shell">
    <PageHeader
      title="إدارة المخزون"
      :subtitle="inventoryStore.selectedWarehouse?.name || 'لم يتم اختيار مخزن'"
      icon="mdi-warehouse"
    >
      <v-btn
        v-if="canRequestTransfer"
        color="primary"
        prepend-icon="mdi-transfer"
        size="default"
        :to="{ name: 'StockTransfer' }"
      >
        نقل مخزون
      </v-btn>
      <v-btn
        v-if="canAdjust"
        data-testid="inventory-adjust-btn"
        color="warning"
        variant="tonal"
        prepend-icon="mdi-tune"
        size="default"
        :loading="isInitialLoading"
        :disabled="!inventoryStore.selectedWarehouseId"
        @click="openAdjustDialog(null)"
      >
        إضافة / تعديل مخزون
      </v-btn>
      <v-btn
        color="primary"
        variant="text"
        prepend-icon="mdi-history"
        size="default"
        :to="{ name: 'StockMovements' }"
      >
        حركات المخزون
      </v-btn>
    </PageHeader>

    <!-- No warehouse exists yet — make the path forward obvious instead of
         showing an empty table and forcing the user into branch settings. -->
    <v-alert
      v-if="inventoryStore.needsWarehouseSetup"
      type="info"
      variant="tonal"
      class="page-section"
      icon="mdi-warehouse"
    >
      <div class="d-flex flex-wrap align-center justify-space-between gap-3">
        <span> لا يوجد مخزن. سيتم إنشاء مخزن افتراضي أو يرجى إنشاء مخزن للبدء. </span>
        <v-btn
          v-if="canManageWarehouses"
          color="primary"
          :loading="creatingDefaultWarehouse"
          prepend-icon="mdi-plus"
          @click="createDefaultWarehouse"
        >
          إنشاء مخزن افتراضي
        </v-btn>
      </div>
    </v-alert>

    <!-- Unified SmartTable (client-side): the built-in search replaces the old
         search field and the low-stock toggle becomes a boolean filter; both
         filter the loaded warehouse stock in memory. -->
    <SmartTable
      v-model:filter-values="filterValues"
      class="page-section"
      data-testid="inventory-table"
      table-key="inventory-table"
      :headers="headers"
      :items="filteredStock"
      :loading="inventoryStore.loading"
      item-value="productId"
      :row-actions="rowActions"
      :filters="filterDefs"
      show-export
      export-file-base="inventory"
      print-title="تقرير المخزون"
      search-placeholder="البحث عن منتج بالاسم أو الرمز"
      empty-title="لا توجد بيانات لعرضها"
      :empty-description="emptyDescription"
      empty-icon="mdi-warehouse"
      @refresh="reload"
    >
      <template #[`item.quantity`]="{ item }">
        <v-chip :color="item.isLowStock ? 'error' : 'success'" size="small">
          {{ item.quantity }}
        </v-chip>
      </template>
      <template #[`item.expiryStatus`]="{ item }">
        <v-chip
          size="small"
          variant="tonal"
          :color="
            item.expiryStatus === 'منتهي'
              ? 'error'
              : item.expiryStatus?.includes('7')
                ? 'warning'
                : item.expiryStatus === 'بدون تاريخ انتهاء'
                  ? 'grey'
                  : 'success'
          "
        >
          {{ item.expiryStatus }}
        </v-chip>
      </template>
    </SmartTable>

    <!-- Adjust dialog -->
    <v-dialog
      :model-value="inventoryDialogStore.isAdjustDialogOpen"
      persistent
      max-width="520"
      @update:model-value="(value) => { if (!value) inventoryDialogStore.closeAdjustDialog(); }"
    >
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="warning">mdi-tune</v-icon>
          <span>تعديل يدوي للمخزون</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-autocomplete
            v-model="adjustForm.productId"
            data-testid="inventory-adjust-product"
            :items="adjustProductItems"
            item-title="name"
            item-value="productId"
            label="المنتج"
            density="comfortable"
            variant="outlined"
            :disabled="!!preselectedProduct"
            class="mb-3"
          />
          <v-row dense class="mb-3">
            <v-col cols="12" sm="6">
              <v-select
                v-model="adjustForm.movementType"
                data-testid="inventory-adjust-type"
                :items="movementTypeOptions"
                label="نوع حركة المخزون"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field
                v-model.number="adjustForm.quantity"
                data-testid="inventory-adjust-qty"
                label="الكمية"
                type="number"
                min="1"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" sm="3">
              <v-select
                v-model="adjustForm.unitId"
                :items="unitOptionsForSelected"
                item-title="title"
                item-value="value"
                label="الوحدة"
                variant="outlined"
                density="comfortable"
                :disabled="unitOptionsForSelected.length <= 1"
              />
            </v-col>
          </v-row>

          <v-text-field
            v-model="adjustForm.reason"
            data-testid="inventory-adjust-reason"
            label="سبب التعديل (اختياري)"
            variant="outlined"
            density="comfortable"
            hide-details
          />
          <v-text-field
            v-if="isIncreaseMovement && selectedProductTracksExpiry"
            v-model="adjustForm.expiryDate"
            label="تاريخ الانتهاء"
            type="date"
            variant="outlined"
            density="comfortable"
            hide-details
          />
          <v-text-field
            v-if="isIncreaseMovement"
            v-model.number="adjustForm.costPrice"
            label="سعر الكلفة (اختياري)"
            type="number"
            min="0"
            variant="outlined"
            density="comfortable"
            class="mt-2"
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="inventoryDialogStore.closeAdjustDialog()">إلغاء</v-btn>
          <v-btn
            data-testid="inventory-adjust-save"
            color="primary"
            :loading="adjusting"
            @click="submitAdjust"
            >حفظ</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useInventoryStore } from '@/stores/inventory';
import { useInventoryDialogStore } from '@/stores/inventoryDialog';
import { useNotificationStore } from '@/stores/notification';
import { useAuthStore } from '@/stores/auth';
import { useProductStore } from '@/stores/product';
import PageHeader from '@/components/PageHeader.vue';
import SmartTable from '@/components/common/SmartTable';
import {
  getInventoryMovementTypeLabel,
  manualInventoryMovementTypes,
} from '@/utils/inventoryMovementTypes';

const inventoryStore = useInventoryStore();
const inventoryDialogStore = useInventoryDialogStore();
const notificationStore = useNotificationStore();
const authStore = useAuthStore();
const productStore = useProductStore();
const router = useRouter();
const route = useRoute();

// Dialog state lives in a standalone store so it survives page reload/remount.
// These refs stay writable (storeToRefs) so v-model bindings keep working.
const { preselectedProduct, adjustForm } = storeToRefs(inventoryDialogStore);

const canAdjust = computed(() => authStore.hasPermission?.('inventory:adjust') === true);
// Mirror the StockTransfer route/menu gate (feature flag + capability) in
// addition to the permission, so the transfer buttons never lead to a
// feature-disabled route that would silently redirect to the dashboard.
const canRequestTransfer = computed(
  () =>
    authStore.hasPermission?.('inventory:transfer') === true &&
    authStore.hasFeature?.('inventoryTransfers') === true &&
    authStore.can?.('canTransferStock') === true
);

const canManageWarehouses = computed(() => authStore.hasPermission?.('inventory:manage') === true);

const creatingDefaultWarehouse = ref(false);
const createDefaultWarehouse = async () => {
  creatingDefaultWarehouse.value = true;
  try {
    await inventoryStore.ensureDefaultWarehouse();
    await reload();
  } catch {
    /* notification already handled */
  } finally {
    creatingDefaultWarehouse.value = false;
  }
};

const headers = [
  { title: 'المنتج', key: 'name', minWidth: 180 },
  { title: 'الرمز', key: 'sku', format: 'sku' },
  { title: 'السعر', key: 'sellingPrice', format: 'currency', align: 'end', searchable: false },
  { title: 'الكمية', key: 'quantity', align: 'end', searchable: false },
  { title: 'الحد الأدنى', key: 'lowStockThreshold', format: 'number', align: 'end', searchable: false },
  { title: 'أقرب تاريخ انتهاء', key: 'nearestExpiry', format: 'date', searchable: false },
  { title: 'حالة الصلاحية', key: 'expiryStatus', searchable: false },
];

// Low-stock toggle → a client-side boolean filter (predicate handles 1/0/bool).
const filterDefs = [
  {
    key: 'lowStock',
    type: 'boolean',
    label: 'حالة المخزون',
    trueLabel: 'المنخفض فقط',
    falseLabel: 'ضمن الحد',
    predicate: (row, val) => (val === true ? !!row.isLowStock : !row.isLowStock),
  },
];
const filterValues = ref({});

const emptyDescription = computed(() =>
  inventoryStore.selectedWarehouseId
    ? 'لا توجد منتجات في هذا المخزن — أضف مخزوناً أو عدّل البحث.'
    : 'اختر مخزنًا من شريط الأدوات لعرض المخزون.'
);

// Row actions: adjust + transfer, both primary (inline) like the original,
// each gated on its existing capability.
const rowActions = computed(() => {
  const list = [];
  if (canAdjust.value) {
    list.push({
      key: 'adjust',
      icon: 'mdi-tune',
      title: 'إضافة / تعديل مخزون',
      primary: true,
      handler: (item) => openAdjustDialog(item),
    });
  }
  if (canRequestTransfer.value) {
    list.push({
      key: 'transfer',
      icon: 'mdi-transfer',
      title: 'نقل',
      primary: true,
      handler: (item) => openTransferFor(item),
    });
  }
  return list;
});

const expiryMap = ref(new Map());
const filteredStock = computed(() =>
  (inventoryStore.stock || []).map((row) => {
    const key = `${row.productId}:${row.warehouseId || inventoryStore.selectedWarehouseId}`;
    const ex = expiryMap.value.get(key);
    return {
      ...row,
      nearestExpiry: ex?.nearestExpiry || null,
      expiryStatus: ex?.status || (row.tracksExpiry ? 'صالح' : 'بدون تاريخ انتهاء'),
    };
  })
);

const reload = async () => {
  if (!inventoryStore.selectedWarehouseId) return;
  // Load the warehouse stock and the expiry alerts in parallel so the page's
  // base data is ready together — the post-create auto-open waits on this.
  const [, alerts] = await Promise.all([
    inventoryStore.fetchWarehouseStock(inventoryStore.selectedWarehouseId),
    inventoryStore.fetchExpiryAlerts({
      warehouseId: inventoryStore.selectedWarehouseId,
    }),
  ]);
  const map = new Map();
  for (const row of alerts || []) {
    const key = `${row.productId}:${row.warehouseId}`;
    const cur = map.get(key);
    if (!cur || (row.expiryDate && (!cur.nearestExpiry || row.expiryDate < cur.nearestExpiry))) {
      map.set(key, { nearestExpiry: row.expiryDate, status: row.status });
    }
  }
  expiryMap.value = map;
};

// ── Initial load + post-create auto-open ────────────────────────────────────
// The page's base data (warehouses → stock + expiry alerts) must finish loading
// BEFORE we open the add-stock dialog for a just-created product. Otherwise an
// in-flight reload settling after the dialog opened could disrupt it. So we only
// *record* the deep-link request up front and open the dialog at the very end of
// the initial load.
const isInitialLoading = ref(true);
const pendingOpenAddStockProductId = ref(null);
const handledAutoOpenAddStock = ref(false);

// Capture the deep-link request ONCE (immediate) — do NOT open here. Both the
// preferred `?openAddStock=1` and the legacy `?action=adjust` are honoured.
watch(
  () => route.query,
  () => {
    if (handledAutoOpenAddStock.value) return;
    const wants =
      route.query.openAddStock === '1' ||
      route.query.openAddStock === 1 ||
      route.query.action === 'adjust';
    if (wants && route.query.productId) {
      pendingOpenAddStockProductId.value = Number(route.query.productId);
      handledAutoOpenAddStock.value = true;
    }
  },
  { immediate: true }
);

// Refresh stock + expiry when the active warehouse changes. IMPORTANT: this must
// NEVER close the add-stock dialog — it only reloads data. It also stays out of
// the way during the initial load (initInventoryPage drives that reload itself),
// so it can't race the auto-open while a deep-link request is still pending.
watch(
  () => inventoryStore.selectedWarehouseId,
  async (id) => {
    if (!id) return;
    if (isInitialLoading.value) return;
    await reload();
    // NEVER close the dialog or reset the adjust form here — switching the
    // active warehouse must leave an open add-stock dialog untouched.
  }
);

async function initInventoryPage() {
  isInitialLoading.value = true;
  try {
    if (inventoryStore.branches.length === 0) await inventoryStore.fetchBranches();
    if (inventoryStore.warehouses.length === 0) await inventoryStore.fetchWarehouses();
    // A deep-link can land here before app-level init resolved a warehouse —
    // resolve one so the stock/expiry load (and the auto-open) have a target.
    if (!inventoryStore.selectedWarehouseId) {
      await inventoryStore.resolveActiveWarehouse();
    }
    if (inventoryStore.selectedWarehouseId) {
      await reload(); // warehouse stock + expiry alerts, in parallel
    }
    // Only now — after the base data is loaded — open the dialog if requested.
    await handlePendingOpenAddStockDialog();
  } finally {
    isInitialLoading.value = false;
  }
}

// Open the add-stock dialog for the just-created product, AFTER the base data
// has loaded. Verifies the product exists (never opens an empty dialog). The
// dialog state lives in the store, so it survives reloads/watchers/remounts —
// the order here only governs correctness, not survival.
async function handlePendingOpenAddStockDialog() {
  const productId = Number(pendingOpenAddStockProductId.value);
  if (!productId) return;

  pendingOpenAddStockProductId.value = null; // consume once

  if (!canAdjust.value) {
    cleanInventoryRouteQueryWithoutRouter();
    return;
  }

  if (!inventoryStore.selectedWarehouseId) {
    notificationStore.error('اختر مخزناً قبل إضافة كمية افتتاحية');
    cleanInventoryRouteQueryWithoutRouter();
    return;
  }

  // Prefer the loaded warehouse-stock row; a brand-new product has none yet, so
  // fall back to loading the product to confirm it exists and show its name.
  let product = null;
  const stockRow = (inventoryStore.stock || []).find((r) => Number(r.productId) === productId);
  if (stockRow) {
    product = {
      productId: Number(stockRow.productId),
      name: stockRow.name,
      sku: stockRow.sku,
      tracksExpiry: !!stockRow.tracksExpiry,
    };
  } else {
    try {
      const loaded = await productStore.fetchProduct(productId);
      const p = loaded?.data || loaded || productStore.currentProduct;
      if (!p || Number(p.id) !== productId) {
        notificationStore.error('تعذر العثور على المنتج الذي تم إنشاؤه');
        cleanInventoryRouteQueryWithoutRouter();
        return;
      }
      product = {
        productId: Number(p.id),
        name: p.name || `#${p.id}`,
        sku: p.sku || null,
        tracksExpiry: !!p.tracksExpiry,
      };
    } catch {
      notificationStore.error('تعذّر تحميل بيانات المنتج');
      cleanInventoryRouteQueryWithoutRouter();
      return;
    }
  }

  // Resolve the base unit BEFORE opening so the dialog shows it immediately.
  const units = await fetchUnitsFor(productId);
  const baseUnit = units.find((u) => u.isBase) || units[0] || null;

  inventoryDialogStore.openAdjustDialog({
    product,
    warehouseId: inventoryStore.selectedWarehouseId,
    unitId: baseUnit?.id || null,
  });

  cleanInventoryRouteQueryWithoutRouter();
}

// Strip the auto-open trigger params from the URL WITHOUT going through
// vue-router. router.replace mutates the reactive route (and would remount a
// keyed <router-view>), which is exactly what used to snap the dialog shut.
// window.history.replaceState rewrites the address bar silently — no router
// reactivity, no remount, no effect on the open dialog.
function cleanInventoryRouteQueryWithoutRouter() {
  const url = new URL(window.location.href);
  if (
    !url.searchParams.has('openAddStock') &&
    !url.searchParams.has('productId') &&
    !url.searchParams.has('action')
  ) {
    return;
  }
  url.searchParams.delete('openAddStock');
  url.searchParams.delete('productId');
  url.searchParams.delete('action');
  const newUrl = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
  window.history.replaceState(window.history.state, '', newUrl);
}

// Adjust dialog state now lives in `inventoryDialogStore` (isAdjustDialogOpen,
// preselectedProduct, adjustForm) so it survives page reload/remount. Only the
// transient submit-spinner stays local.
const adjusting = ref(false);
const productUnitsCache = ref(new Map());

const fetchUnitsFor = async (productId) => {
  if (!productId) return [];
  if (productUnitsCache.value.has(productId)) return productUnitsCache.value.get(productId);
  try {
    // Reuse the product detail endpoint — it already returns units in the
    // same payload as the product, so we don't need a dedicated unit route.
    await productStore.fetchProduct(productId);
    const product = productStore.currentProduct || {};
    const units = Array.isArray(product?.units) ? product.units : [];
    productUnitsCache.value.set(productId, units);
    return units;
  } catch {
    productUnitsCache.value.set(productId, []);
    return [];
  }
};

const unitOptionsForSelected = computed(() => {
  const units = productUnitsCache.value.get(adjustForm.value.productId) || [];
  if (units.length === 0) {
    return [{ value: null, title: 'قطعة' }];
  }
  return units.map((u) => ({
    value: u.id,
    title: u.isBase
      ? `${u.name} (الأساسية)`
      : `${u.name} = ${Number(u.conversionFactor) || 1} ${units.find((b) => b.isBase)?.name || ''}`.trim(),
  }));
});

const movementTypeOptions = manualInventoryMovementTypes.map((value) => ({
  value,
  title: getInventoryMovementTypeLabel(value),
}));
const increaseMovementTypes = new Set([
  'opening_balance',
  'stock_in',
  'adjustment_in',
  'correction_in',
]);
const isIncreaseMovement = computed(() => increaseMovementTypes.has(adjustForm.value.movementType));
const selectedProductTracksExpiry = computed(() => {
  const pid = Number(adjustForm.value.productId);
  const row = (inventoryStore.stock || []).find((r) => Number(r.productId) === pid);
  if (row) return !!row.tracksExpiry;
  // Deep-linked new product isn't in the stock list yet — fall back to the
  // preselected product snapshot loaded in maybeOpenAdjustFromRoute.
  const pre = preselectedProduct.value;
  if (pre && Number(pre.productId) === pid) return !!pre.tracksExpiry;
  return false;
});

// Items for the (locked) product picker: the warehouse stock list, plus the
// preselected product when it isn't stocked yet (a freshly created product),
// so its name renders instead of a blank field.
const adjustProductItems = computed(() => {
  const list = inventoryStore.stock || [];
  const pre = preselectedProduct.value;
  if (pre?.productId && !list.some((r) => Number(r.productId) === Number(pre.productId))) {
    return [{ productId: pre.productId, name: pre.name || `#${pre.productId}` }, ...list];
  }
  return list;
});

// Manual open (header button / table row). Resolves the base unit first, then
// opens the dialog via the store. `row` may be null (open with no preselection
// so the cashier picks a product in the autocomplete).
const openAdjustDialog = async (row) => {
  let unitId = null;
  if (row?.productId) {
    const units = await fetchUnitsFor(Number(row.productId));
    const baseUnit = units.find((u) => u.isBase) || units[0] || null;
    unitId = baseUnit?.id || null;
  }
  inventoryDialogStore.openAdjustDialog({
    product: row || null,
    warehouseId: inventoryStore.selectedWarehouseId,
    unitId,
  });
};

watch(
  () => adjustForm.value.productId,
  async (productId) => {
    if (!productId) return;
    const units = await fetchUnitsFor(productId);
    const baseUnit = units.find((u) => u.isBase) || units[0] || null;
    if (!adjustForm.value.unitId) {
      adjustForm.value.unitId = baseUnit?.id || null;
    }
  }
);

const submitAdjust = async () => {
  const { productId, unitId, quantity, movementType, reason, expiryDate, costPrice } =
    adjustForm.value;
  if (!productId || !quantity) {
    notificationStore.error('أكمل بيانات التعديل قبل الحفظ');
    return;
  }
  adjusting.value = true;
  try {
    await inventoryStore.adjustStock({
      productId,
      warehouseId: adjustForm.value.warehouseId || inventoryStore.selectedWarehouseId,
      quantityChange: quantity,
      unitId: unitId || undefined,
      movementType,
      reason: reason.trim(),
      expiryDate:
        isIncreaseMovement.value && selectedProductTracksExpiry.value && expiryDate
          ? expiryDate
          : null,
      costPrice:
        isIncreaseMovement.value &&
        !(costPrice === '' || costPrice === null || costPrice === undefined)
          ? costPrice
          : undefined,
    });
    // Close ONLY on a successful save, then refresh the table.
    inventoryDialogStore.closeAdjustDialog();
    await reload();
  } catch {
    /* notification already handled */
  } finally {
    adjusting.value = false;
  }
};

const openTransferFor = (item) => {
  router.push({ name: 'StockTransfer', query: { productId: item.productId } });
};

onMounted(initInventoryPage);
</script>
