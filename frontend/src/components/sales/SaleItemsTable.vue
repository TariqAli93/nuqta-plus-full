<template>
  <section class="sale-lines">
    <div v-if="!items.length" class="empty-state">
      <v-icon size="38" color="medium-emphasis">mdi-cart-outline</v-icon>
      <strong>لا توجد منتجات بعد</strong>
      <span>ابحث عن منتج أو امسح الباركود للبدء</span>
    </div>

    <template v-else>
      <div class="table-head" :class="{ 'has-interest': showInterest }">
        <span>المنتج</span>
        <span class="num">الكلفة</span>
        <span class="center">الكمية</span>
        <span class="num">السعر</span>
        <span class="num">الخصم</span>
        <span v-if="showInterest" class="num">الفائدة</span>
        <span class="num">الإجمالي</span>
        <span></span>
      </div>

      <article
        v-for="(item, index) in items"
        :key="index"
        class="line"
        :class="{
          'has-error': getQuantityError(item).length > 0,
          'has-interest': showInterest,
        }"
      >
        <div class="product" data-label="المنتج">
          <div class="product__name text-truncate">{{ item.productName || '—' }}</div>

          <div class="product__meta">
            <span v-if="item.sku" class="sku">{{ item.sku }}</span>

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
              class="unit-select"
              @update:model-value="(v) => onUnit(item, v)"
            />
          </div>
        </div>

        <div class="cell read" data-label="الكلفة">
          {{ formatCurrency(item.unitCostPrice || 0, currency) }}
        </div>

        <div class="qty" data-label="الكمية">
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
            class="qty__input"
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

        <div class="cell" data-label="السعر">
          <v-text-field
            v-if="canEditPrice"
            :model-value="groupNumber(item.unitPrice || 0)"
            density="compact"
            variant="outlined"
            hide-details
            class="money-input"
            @input="(e) => onPriceInput(item, e.target.value)"
          >
            <template #append-inner>
              <v-btn
                v-if="item.isCustomPrice"
                icon="mdi-restore"
                size="x-small"
                variant="text"
                color="primary"
                :title="`السعر الأصلي: ${formatCurrency(item.unitPriceOriginal || 0, currency)}`"
                @click.stop="resetPrice(item)"
              />
            </template>
          </v-text-field>

          <span v-else class="read">
            {{ formatCurrency(item.unitPrice || 0, currency) }}
          </span>
        </div>

        <div class="cell" data-label="الخصم">
          <v-text-field
            :model-value="groupNumber(item.discount || 0)"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="0"
            class="money-input"
            @input="(e) => (item.discount = parseAmount(e.target.value))"
          />
        </div>

        <div v-if="showInterest" class="cell" data-label="الفائدة">
          <v-text-field
            :model-value="groupNumber(item.interestPerUnit || 0)"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="0"
            class="money-input"
            @input="(e) => (item.interestPerUnit = parseAmount(e.target.value))"
          />
        </div>

        <div class="cell total" data-label="الإجمالي">
          {{ formatCurrency(netOf(item), currency) }}
        </div>

        <div class="actions">
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

        <div v-if="item.isCustomPrice" class="badge-row">
          <v-chip size="x-small" color="info" variant="tonal" label>
            سعر مخصص — الأصلي {{ formatCurrency(item.unitPriceOriginal || 0, currency) }}
          </v-chip>
        </div>

        <div v-if="item._notesOpen" class="full-row">
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

        <div v-if="getQuantityError(item).length" class="error-row">
          {{ getQuantityError(item)[0] }}
        </div>
      </article>
    </template>
  </section>
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
  showInterest: { type: Boolean, default: false },
});

const emit = defineEmits(['remove', 'unit-change']);

const onPriceInput = (item, raw) => {
  item.unitPrice = parseAmount(raw);
  item.isCustomPrice = Number(item.unitPrice) !== Number(item.unitPriceOriginal);
};

const resetPrice = (item) => {
  item.unitPrice = item.unitPriceOriginal;
  item.isCustomPrice = false;
};

const appliedDiscountOf = (item) =>
  clampItemDiscountPerUnit(
    Number(item.unitPrice || 0),
    Number(item.unitCostPrice || 0),
    Number(item.discount || 0),
  ).applied;

const netOf = (item) => {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unitPrice || 0);
  const interest = props.showInterest ? Number(item.interestPerUnit || 0) : 0;

  return quantity * unitPrice - appliedDiscountOf(item) * quantity + interest * quantity;
};

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
.sale-lines {
  width: 100%;
  min-width: 0;
}

.empty-state {
  min-height: 170px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  text-align: center;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 14px;
  background: rgba(var(--v-theme-surface-variant), 0.22);

  strong {
    font-size: 0.95rem;
    color: rgba(var(--v-theme-on-surface), 0.86);
  }

  span {
    font-size: 0.78rem;
    color: rgba(var(--v-theme-on-surface), 0.56);
  }
}

.table-head,
.line {
  display: grid;
  grid-template-columns:
    minmax(170px, 1.9fr)
    minmax(70px, 0.68fr)
    minmax(104px, 0.9fr)
    minmax(92px, 0.9fr)
    minmax(82px, 0.78fr)
    minmax(110px, 1fr)
    56px;
  gap: 8px;
  align-items: center;
}

.table-head.has-interest,
.line.has-interest {
  grid-template-columns:
    minmax(170px, 1.9fr)
    minmax(70px, 0.68fr)
    minmax(104px, 0.9fr)
    minmax(92px, 0.9fr)
    minmax(82px, 0.78fr)
    minmax(82px, 0.78fr)
    minmax(110px, 1fr)
    56px;
}

.table-head {
  position: sticky;
  top: 0;
  z-index: 3;
  padding: 8px 10px;
  font-size: 0.72rem;
  font-weight: 850;
  color: rgba(var(--v-theme-on-surface), 0.58);
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.line {
  min-height: 58px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.065);
  transition: background-color 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.026);
  }

  &.has-error {
    background: rgba(var(--v-theme-error), 0.045);
    border-radius: 10px;
  }
}

.product {
  min-width: 0;

  &__name {
    font-size: 0.88rem;
    font-weight: 850;
    line-height: 1.25;
  }

  &__meta {
    min-height: 19px;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
  }
}

.sku {
  font-size: 0.68rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
}

.unit-select {
  max-width: 128px;
  font-size: 0.7rem;

  :deep(.v-field__input) {
    min-height: 20px;
    padding-top: 0;
    padding-bottom: 0;
  }
}

.cell {
  min-width: 0;
  text-align: end;
}

.read {
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.total {
  font-size: 0.9rem;
  font-weight: 950;
  color: rgb(var(--v-theme-primary));
  font-variant-numeric: tabular-nums;
}

.qty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  &__input {
    width: 50px;
    flex: 0 0 50px;

    :deep(input) {
      text-align: center;
      padding-inline: 2px;
      font-weight: 850;
    }
  }
}

.money-input {
  width: 100%;

  :deep(.v-field) {
    min-height: 34px;
    border-radius: 9px;
  }

  :deep(.v-field__input) {
    min-height: 34px;
    padding-inline: 6px;
  }

  :deep(input) {
    text-align: end;
    font-size: 0.82rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.full-row,
.error-row,
.badge-row {
  grid-column: 1 / -1;
}

.badge-row {
  margin-top: -2px;
}

.full-row {
  padding-top: 2px;
  padding-bottom: 4px;
}

.error-row {
  font-size: 0.74rem;
  color: rgb(var(--v-theme-error));
}

.center {
  text-align: center;
}

.num {
  text-align: end;
}

@media (max-width: 1280px) {
  .table-head,
  .line {
    grid-template-columns:
      minmax(150px, 1.7fr)
      minmax(98px, 0.95fr)
      minmax(86px, 0.82fr)
      minmax(94px, 0.95fr)
      50px;
  }

  .table-head.has-interest,
  .line.has-interest {
    grid-template-columns:
      minmax(150px, 1.7fr)
      minmax(98px, 0.95fr)
      minmax(86px, 0.82fr)
      minmax(86px, 0.82fr)
      minmax(94px, 0.95fr)
      50px;
  }

  .table-head span:nth-child(2),
  .line > .read[data-label='الكلفة'] {
    display: none;
  }
}

@media (max-width: 1080px) {
  .table-head {
    display: none;
  }

  .line,
  .line.has-interest {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 9px 12px;
    padding: 10px;
    margin-bottom: 9px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
    border-radius: 14px;
    background: rgb(var(--v-theme-surface));
  }

  .product {
    grid-column: 1 / 2;
  }

  .actions {
    grid-column: 2 / 3;
    grid-row: 1;
    align-self: start;
  }

  .qty,
  .cell {
    &::before {
      content: attr(data-label);
      display: block;
      margin-bottom: 4px;
      font-size: 0.68rem;
      font-weight: 750;
      color: rgba(var(--v-theme-on-surface), 0.52);
      text-align: start;
    }
  }

  .qty {
    justify-content: flex-start;
  }

  .cell {
    text-align: start;
  }

  .total {
    text-align: end;
    padding-top: 6px;
    border-top: 1px dashed rgba(var(--v-theme-on-surface), 0.12);
  }
}

@media (max-width: 760px) {
  .line,
  .line.has-interest {
    grid-template-columns: 1fr auto;
  }

  .qty,
  .cell {
    grid-column: 1 / -1;
  }

  .money-input {
    max-width: 100%;
  }
}
</style>
