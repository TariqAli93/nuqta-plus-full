<template>
  <div class="items-table">
    <!-- Empty state -->
    <div v-if="!items.length" class="items-empty">
      <v-icon size="34" color="medium-emphasis">mdi-cart-outline</v-icon>
      <div class="items-empty__title">لا توجد منتجات بعد</div>
      <div class="items-empty__hint">ابحث عن منتج أو امسح الباركود للبدء</div>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="items-row items-row--head" :class="{ 'items-row--with-interest': showInterest }">
        <div>المنتج</div>
        <div class="ta-center">الكمية</div>
        <div class="ta-end">السعر</div>
        <div class="ta-end">الخصم</div>
        <div v-if="showInterest" class="ta-end">فائدة الوحدة</div>
        <div class="ta-end">الإجمالي</div>
        <div></div>
      </div>

      <div
        v-for="(item, index) in items"
        :key="index"
        class="items-row"
        :class="{
          'items-row--error': getQuantityError(item).length > 0,
          'items-row--with-interest': showInterest,
        }"
      >
        <!-- Product (name + sku + unit) -->
        <div class="cell-product" data-label="المنتج">
          <div class="cell-product__name text-truncate">{{ item.productName || '—' }}</div>
          <div class="cell-product__sub">
            <span v-if="item.sku" class="cell-product__sku">{{ item.sku }}</span>
            <v-chip v-if="item.isService" size="x-small" color="secondary" variant="tonal">
              خدمة
            </v-chip>
            <v-select
              v-if="unitOptionsFor(item).length > 1"
              :model-value="item.unitId"
              :items="unitOptionsFor(item)"
              item-title="title"
              item-value="value"
              density="compact"
              variant="plain"
              hide-details
              class="cell-product__unit"
              @update:model-value="(v) => onUnit(item, v)"
            />
          </div>
        </div>

        <!-- Quantity stepper -->
        <div class="cell-qty" data-label="الكمية">
          <v-btn
            icon="mdi-minus"
            size="x-small"
            variant="tonal"
            :disabled="item.quantity <= 1"
            aria-label="إنقاص"
            @click="step(item, -1)"
          />
          <v-text-field
            v-model.number="item.quantity"
            type="number"
            min="1"
            density="compact"
            variant="outlined"
            hide-details
            class="cell-qty__field"
            :error="getQuantityError(item).length > 0"
          />
          <v-btn
            icon="mdi-plus"
            size="x-small"
            variant="tonal"
            aria-label="زيادة"
            @click="step(item, 1)"
          />
        </div>

        <!-- Price -->
        <div class="ta-end" data-label="السعر">
          <v-text-field
            v-if="canEditPrice"
            :model-value="groupNumber(item.unitPrice)"
            density="compact"
            variant="outlined"
            hide-details
            class="cell-num"
            @input="(e) => onPriceInput(item, e.target.value)"
          />
          <span v-else class="cell-readonly">{{ formatCurrency(item.unitPrice, currency) }}</span>
          <v-chip
            v-if="item.isCustomPrice"
            size="x-small"
            color="info"
            variant="tonal"
            label
            class="mt-1"
            :title="`السعر الأصلي: ${formatCurrency(item.unitPriceOriginal, currency)}`"
          >
            سعر مخصص
          </v-chip>
        </div>

        <!-- Discount -->
        <div class="ta-end" data-label="الخصم">
          <v-text-field
            :model-value="groupNumber(item.discount)"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="0"
            class="cell-num"
            @input="(e) => (item.discount = parseAmount(e.target.value))"
          />
        </div>

        <!-- Per-unit installment interest (فائدة الوحدة) — installment only -->
        <div v-if="showInterest" class="ta-end" data-label="فائدة الوحدة">
          <v-text-field
            :model-value="groupNumber(item.interestPerUnit)"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="0"
            class="cell-num"
            @input="(e) => (item.interestPerUnit = parseAmount(e.target.value))"
          />
        </div>

        <!-- Net -->
        <div class="ta-end cell-net" data-label="الإجمالي">
          {{ formatCurrency(netOf(item), currency) }}
        </div>

        <!-- Actions -->
        <div class="cell-actions">
          <v-btn
            :icon="item._notesOpen ? 'mdi-note-edit' : 'mdi-note-plus-outline'"
            size="x-small"
            variant="text"
            :color="item.notes ? 'primary' : undefined"
            aria-label="ملاحظة المنتج"
            @click="item._notesOpen = !item._notesOpen"
          />
          <v-btn
            icon="mdi-delete-outline"
            size="x-small"
            variant="text"
            color="error"
            :aria-label="`حذف ${item.productName || ''}`"
            @click="$emit('remove', index)"
          />
        </div>

        <!-- Per-line note -->
        <div v-if="item._notesOpen" class="cell-note">
          <v-text-field
            v-model="item.notes"
            label="ملاحظة المنتج"
            placeholder="مثال: بدون شاحن"
            prepend-inner-icon="mdi-note-text-outline"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            maxlength="1000"
          />
        </div>

        <!-- Inline quantity error -->
        <div v-if="getQuantityError(item).length" class="cell-error">
          {{ getQuantityError(item)[0] }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { formatCurrency } from '@/utils/formatters';
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';
import { clampItemDiscountPerUnit } from '@/utils/discountAllocation';

const props = defineProps({
  items: { type: Array, default: () => [] },
  currency: { type: String, default: 'IQD' },
  unitOptionsFor: { type: Function, required: true },
  getQuantityError: { type: Function, required: true },
  canEditPrice: { type: Boolean, default: false },
  // Show the per-unit installment interest column (installment invoices only).
  showInterest: { type: Boolean, default: false },
});

const emit = defineEmits(['remove', 'unit-change']);

// Apply a hand-edited unit price and flag the line as custom-priced when it
// diverges from the catalog/tier price (per-invoice only — never the product).
const onPriceInput = (item, raw) => {
  item.unitPrice = parseAmount(raw);
  item.isCustomPrice = Number(item.unitPrice) !== Number(item.unitPriceOriginal);
};

// Line net = qty·price − qty·(applied discount) (+ qty·interestPerUnit on
// installments). The item discount is clamped to the cost floor so the line net
// can never display below cost — matches the totals + the backend guard.
const appliedDiscountOf = (item) =>
  clampItemDiscountPerUnit(item.unitPrice, item.unitCostPrice || 0, item.discount || 0).applied;
const netOf = (item) =>
  item.quantity * item.unitPrice -
  appliedDiscountOf(item) * item.quantity +
  (props.showInterest ? (item.interestPerUnit || 0) * item.quantity : 0);

const step = (item, delta) => {
  const next = Number(item.quantity || 0) + delta;
  if (next >= 1) item.quantity = next;
};

const onUnit = (item, unitId) => {
  item.unitId = unitId;
  emit('unit-change', item);
};
</script>

<style scoped lang="scss">
.items-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 160px;
  max-height: 180px;
  text-align: center;

  &__title {
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.8);
  }
  &__hint {
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.55);
  }
}

.items-row {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) 120px minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1fr) 56px;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  min-height: 52px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);

  // 7-column variant: adds the «فائدة الوحدة» column for installment invoices.
  // Cash invoices keep the default 6-column layout untouched.
  &--with-interest {
    grid-template-columns:
      minmax(0, 2.4fr) 120px minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1fr) 56px;
  }

  &--head {
    position: sticky;
    top: 0;
    z-index: 1;
    min-height: 0;
    padding-block: 6px;
    background-color: rgb(var(--v-theme-surface));
    font-size: 0.74rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.55);
  }

  &--error {
    background-color: rgba(var(--v-theme-error), 0.04);
    border-radius: 8px;
  }
}

.cell-product {
  min-width: 0;

  &__name {
    font-weight: 600;
    font-size: 0.86rem;
    line-height: 1.2;
  }
  &__sub {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 18px;
  }
  &__sku {
    font-size: 0.7rem;
    color: rgba(var(--v-theme-on-surface), 0.5);
  }
  &__unit {
    max-width: 150px;
    font-size: 0.72rem;
    :deep(.v-field__input) {
      min-height: 20px;
      padding-top: 0;
      padding-bottom: 0;
    }
  }
}

.cell-qty {
  display: flex;
  align-items: center;
  gap: 3px;

  &__field {
    width: 50px;
    :deep(input) {
      text-align: center;
      padding-inline: 2px;
    }
  }
}

.cell-num :deep(input) {
  text-align: end;
}

.cell-readonly {
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.cell-net {
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  font-variant-numeric: tabular-nums;
  font-size: 0.88rem;
}

.cell-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.cell-note,
.cell-error {
  grid-column: 1 / -1;
}

.cell-error {
  font-size: 0.74rem;
  color: rgb(var(--v-theme-error));
  padding-inline-start: 4px;
}

.cell-note {
  padding-top: 2px;
  padding-bottom: 4px;
}

.ta-center {
  text-align: center;
}
.ta-end {
  text-align: end;
}

@media (max-width: 760px) {
  .items-row--head {
    display: none;
  }
  .items-row {
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    padding: 10px 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .cell-product {
    grid-column: 1 / -1;
  }
  .ta-end[data-label]::before,
  .cell-qty[data-label]::before {
    content: attr(data-label);
    display: block;
    font-size: 0.68rem;
    color: rgba(var(--v-theme-on-surface), 0.5);
    margin-bottom: 2px;
  }
  .cell-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
</style>
