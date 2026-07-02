<template>
  <!-- Reusable manual stock-adjustment dialog. State lives in the shared
       `inventoryDialog` store (so it survives remounts) and every save goes
       through the single `inventoryStore.adjustStock` → POST /inventory/adjust
       path — no adjustment business logic is duplicated here. Open it with the
       exposed `openFor(product)` method; it emits `saved` after a successful
       adjustment so the host page can refresh its list. -->
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
          class="mt-2"
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
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useInventoryStore } from '@/stores/inventory';
import { useInventoryDialogStore } from '@/stores/inventoryDialog';
import { useNotificationStore } from '@/stores/notification';
import { useProductStore } from '@/stores/product';
import {
  getInventoryMovementTypeLabel,
  manualInventoryMovementTypes,
} from '@/utils/inventoryMovementTypes';

const emit = defineEmits(['saved']);

const inventoryStore = useInventoryStore();
const inventoryDialogStore = useInventoryDialogStore();
const notificationStore = useNotificationStore();
const productStore = useProductStore();

// Writable refs so the form's v-model bindings keep working.
const { preselectedProduct, adjustForm } = storeToRefs(inventoryDialogStore);

const adjusting = ref(false);
const productUnitsCache = ref(new Map());

// Resolve a product's units via the product detail endpoint (already returns
// units in the payload) — cached so switching products doesn't re-fetch.
const fetchUnitsFor = async (productId) => {
  if (!productId) return [];
  if (productUnitsCache.value.has(productId)) return productUnitsCache.value.get(productId);
  try {
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
      : `${u.name} = ${Number(u.conversionFactor) || 1} ${
          units.find((b) => b.isBase)?.name || ''
        }`.trim(),
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
  // Prefer a warehouse-stock row (present when opened from the inventory page),
  // else fall back to the preselected product snapshot (products list page).
  const row = (inventoryStore.stock || []).find((r) => Number(r.productId) === pid);
  if (row) return !!row.tracksExpiry;
  const pre = preselectedProduct.value;
  if (pre && Number(pre.productId) === pid) return !!pre.tracksExpiry;
  return false;
});

// The (locked) product picker item: the warehouse stock list, plus the
// preselected product when it isn't stocked yet so its name renders.
const adjustProductItems = computed(() => {
  const list = inventoryStore.stock || [];
  const pre = preselectedProduct.value;
  if (pre?.productId && !list.some((r) => Number(r.productId) === Number(pre.productId))) {
    return [{ productId: pre.productId, name: pre.name || `#${pre.productId}` }, ...list];
  }
  return list;
});

// Auto-resolve the base unit when the selected product changes.
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

/**
 * Open the dialog for a product. Accepts either a products-list row (`id`) or a
 * warehouse-stock row (`productId`). Resolves the base unit first (reusing units
 * already carried on the row when present), and requires a selected warehouse.
 */
async function openFor(row) {
  const productId = Number(row?.id ?? row?.productId);
  if (!productId) return;
  const warehouseId = inventoryStore.selectedWarehouseId;
  if (!warehouseId) {
    notificationStore.error('اختر مخزناً من شريط الأدوات قبل تعديل المخزون');
    return;
  }
  const units = Array.isArray(row?.units) && row.units.length ? row.units : await fetchUnitsFor(productId);
  productUnitsCache.value.set(productId, units);
  const baseUnit = units.find((u) => u.isBase) || units[0] || null;
  inventoryDialogStore.openAdjustDialog({
    product: {
      productId,
      name: row?.name || `#${productId}`,
      sku: row?.sku ?? null,
      tracksExpiry: !!row?.tracksExpiry,
    },
    warehouseId,
    unitId: baseUnit?.id || null,
  });
}

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
      reason: (reason || '').trim(),
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
    // Close ONLY on a successful save, then let the host refresh its list.
    inventoryDialogStore.closeAdjustDialog();
    emit('saved', { productId });
  } catch {
    /* notification already surfaced by the store action */
  } finally {
    adjusting.value = false;
  }
};

defineExpose({ openFor });
</script>
