<template>
  <div class="summary-panel">
    <!-- Invoice discount (single compact row) -->
    <span class="discount-row__label mb-2">خصم الفاتورة</span>
    <div class="discount-row">
      <v-btn-toggle
        :model-value="discountType"
        color="primary"
        variant="elevated"
        class="discount-row__type"
        @update:model-value="$emit('update:discountType', $event)"
      >
        <v-btn value="amount" size="x-small">مبلغ</v-btn>
        <v-btn value="percent" size="x-small">%</v-btn>
      </v-btn-toggle>
      <v-text-field
        :model-value="groupNumber(discountValue)"
        :suffix="discountType === 'percent' ? '%' : ''"
        placeholder="0"
        density="compact"
        variant="outlined"
        hide-details
        class="discount-row__value"
        @input="(e) => $emit('update:discountValue', parseAmount(e.target.value))"
      />
    </div>

    <v-divider class="my-2" />

    <!-- Totals -->
    <div class="totals">
      <div class="totals__row">
        <span>المجموع الفرعي</span>
        <span>{{ formatCurrency(subtotal, currency) }}</span>
      </div>
      <div v-if="itemsDiscount > 0" class="totals__row totals__row--muted">
        <span>خصم المنتجات</span>
        <span>− {{ formatCurrency(itemsDiscount, currency) }}</span>
      </div>
      <div v-if="discountAmount > 0" class="totals__row totals__row--muted">
        <span>الخصم الإضافي</span>
        <span>− {{ formatCurrency(discountAmount, currency) }}</span>
      </div>
      <div v-if="paymentType === 'installment'" class="totals__row">
        <span>الفائدة المضافة</span>
        <span>{{ formatCurrency(interestValue, currency) }}</span>
      </div>
    </div>

    <!-- Grand total -->
    <div class="grand">
      <span class="grand__label"
        >الإجمالي{{ paymentType === 'installment' ? ' بعد الفائدة' : '' }}</span
      >
      <span class="grand__value">{{ formatCurrency(grandTotal, currency) }}</span>
    </div>

    <div class="totals totals--foot">
      <div class="totals__row totals__row--soft">
        <span>{{ paymentType === 'installment' ? 'الدفعة المقدمة' : 'المبلغ المستلم' }}</span>
        <span>{{ formatCurrency(paidAmount, currency) }}</span>
      </div>
      <div
        v-if="paymentType === 'installment' || remainingAmount > 0"
        class="totals__row totals__row--rem"
      >
        <span>المبلغ المتبقي</span>
        <span>{{ formatCurrency(remainingAmount, currency) }}</span>
      </div>
      <div v-if="paymentType !== 'installment'" class="totals__row totals__row--status">
        <span>حالة الدفع</span>
        <v-chip :color="statusMeta.color" size="x-small" variant="flat">{{ statusMeta.label }}</v-chip>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatCurrency } from '@/utils/formatters';
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';

const props = defineProps({
  currency: { type: String, default: 'IQD' },
  subtotal: { type: Number, default: 0 },
  itemsDiscount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  interestValue: { type: Number, default: 0 },
  totalWithInterest: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },
  changeAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, default: 'paid' }, // paid | partially_paid | unpaid
  paymentType: { type: String, default: 'cash' },
  discountType: { type: String, default: 'amount' },
  discountValue: { type: Number, default: 0 },
});

defineEmits(['update:discountType', 'update:discountValue']);

const grandTotal = computed(() =>
  props.paymentType === 'installment' ? props.totalWithInterest : props.total
);

const STATUS_META = {
  paid: { label: 'مدفوعة بالكامل', color: 'success' },
  partially_paid: { label: 'مدفوعة جزئياً', color: 'warning' },
  unpaid: { label: 'غير مدفوعة', color: 'error' },
};
const statusMeta = computed(() => STATUS_META[props.paymentStatus] || STATUS_META.paid);
</script>

<style scoped lang="scss">
.summary-panel {
  display: flex;
  flex-direction: column;
}

.discount-row {
  display: flex;
  align-items: center;
  gap: 8px;

  &__label {
    flex: 0 0 auto;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
  }
  &__type {
    flex: 0 0 auto;
  }
  &__value {
    flex: 1 1 auto;
    :deep(input) {
      text-align: end;
    }
  }
}

.totals {
  display: flex;
  flex-direction: column;
  gap: 5px;

  &--foot {
    margin-top: 8px;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.84rem;
    color: rgba(var(--v-theme-on-surface), 0.8);
    font-variant-numeric: tabular-nums;

    &--muted {
      color: rgba(var(--v-theme-on-surface), 0.55);
      font-size: 0.78rem;
    }
    &--soft {
      color: rgba(var(--v-theme-on-surface), 0.65);
    }
    &--rem {
      font-weight: 600;
      color: rgb(var(--v-theme-error));
    }
    &--change {
      font-weight: 600;
      color: rgb(var(--v-theme-success));
    }
  }
}

.grand {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background-color: rgba(var(--v-theme-primary), 0.08);

  &__label {
    font-size: 0.82rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.7);
  }
  &__value {
    font-size: 1.55rem;
    font-weight: 800;
    color: rgb(var(--v-theme-primary));
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
}
</style>
