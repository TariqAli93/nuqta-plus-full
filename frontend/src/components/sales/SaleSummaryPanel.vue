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

    <!-- Cost-floor warning for a LINE's own discount («خصم المنتج»). -->
    <v-alert
      v-if="itemDiscountCapped"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-2 discount-warning"
      icon="mdi-alert"
    >
      لا يمكن تطبيق خصم المنتج بالكامل لأن ذلك سيجعل سعر البيع أقل من سعر التكلفة.
      تم تطبيق أقصى خصم مسموح، وبقي {{ formatCurrency(itemDiscountUnapplied, currency) }} غير مطبق.
    </v-alert>

    <!-- Cost-floor warning: the requested INVOICE discount would sell a product
         below its cost, so it was capped at the safe maximum. -->
    <v-alert
      v-if="discountCapped"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-2 discount-warning"
      icon="mdi-alert"
    >
      لا يمكن تطبيق الخصم بالكامل لأن ذلك سيجعل سعر البيع أقل من سعر التكلفة.
      تم تطبيق أقصى خصم مسموح وهو {{ formatCurrency(discountAmount, currency) }}،
      وبقي {{ formatCurrency(unappliedDiscount, currency) }} غير مطبق.
    </v-alert>

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
      <div v-if="paymentType === 'installment' && interestValue > 0" class="totals__row">
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
  // Invoice-discount cost-floor feedback. `discountAmount` is the amount actually
  // applied; `unappliedDiscount` is what was dropped to keep every line ≥ cost.
  requestedDiscount: { type: Number, default: 0 },
  unappliedDiscount: { type: Number, default: 0 },
  discountCapped: { type: Boolean, default: false },
  // Item-level («خصم المنتج») cost-floor feedback.
  itemDiscountUnapplied: { type: Number, default: 0 },
  itemDiscountCapped: { type: Boolean, default: false },
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
  gap: 8px;
}

.discount-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;

  &__label {
    display: inline-block;
    font-size: 0.76rem;
    font-weight: 800;
    color: rgba(var(--v-theme-on-surface), 0.58);
  }

  &__type {
    border-radius: 10px;

    :deep(.v-btn) {
      font-weight: 800;
    }
  }

  &__value {
    min-width: 0;

    :deep(.v-field) {
      min-height: 36px;
      border-radius: 10px;
    }

    :deep(input) {
      text-align: end;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
  }
}

.discount-warning {
  line-height: 1.55;
}

.totals {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &--foot {
    margin-top: 2px;
    padding-top: 4px;
  }

  &__row {
    min-height: 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.84rem;
    color: rgba(var(--v-theme-on-surface), 0.78);
    font-variant-numeric: tabular-nums;

    span:last-child {
      font-weight: 800;
    }

    &--muted {
      color: rgba(var(--v-theme-on-surface), 0.55);
      font-size: 0.78rem;
    }

    &--soft {
      color: rgba(var(--v-theme-on-surface), 0.66);
    }

    &--rem {
      font-weight: 800;
      color: rgb(var(--v-theme-error));
    }

    &--change {
      font-weight: 800;
      color: rgb(var(--v-theme-success));
    }
  }
}

.grand {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 4px 0;
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.13), rgba(var(--v-theme-primary), 0.06));
  border: 1px solid rgba(var(--v-theme-primary), 0.18);

  &__label {
    font-size: 0.76rem;
    font-weight: 800;
    color: rgba(var(--v-theme-on-surface), 0.66);
  }

  &__value {
    font-size: clamp(1.45rem, 3vw, 1.85rem);
    font-weight: 950;
    line-height: 1.05;
    color: rgb(var(--v-theme-primary));
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
}
</style>

