<template>
  <div ref="root" class="cash-form">
    <div class="cash-row">
      <span class="cash-row__label">إجمالي الفاتورة</span>
      <span class="cash-row__value">{{ formatCurrency(total, currency) }}</span>
    </div>

    <v-text-field
      :model-value="groupNumber(receivedAmount)"
      label="المبلغ المستلم"
      :suffix="currency"
      data-testid="cash-received"
      density="comfortable"
      variant="outlined"
      hide-details="auto"
      prepend-inner-icon="mdi-cash"
      persistent-hint
      @input="(e) => $emit('update:receivedAmount', parseAmount(e.target.value))"
    />

    <!-- Outstanding balance (debt) — replaces the old change/الباقي line. -->
    <div class="cash-row cash-row--remaining" :class="{ 'cash-row--paid': remainingAmount <= 0 }">
      <span class="cash-row__label">المبلغ المتبقي</span>
      <span class="cash-row__value">{{ formatCurrency(remainingAmount, currency) }}</span>
    </div>

    <div class="cash-row">
      <span class="cash-row__label">حالة الدفع</span>
      <v-chip :color="statusMeta.color" size="small" variant="flat" :prepend-icon="statusMeta.icon">
        {{ statusMeta.label }}
      </v-chip>
    </div>

    <!-- A deferred / partial sale needs a customer to owe the balance. -->
    <v-alert
      v-if="remainingAmount > 0 && !hasCustomer"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-1"
    >
      يجب تحديد العميل عند وجود مبلغ متبقٍ.
    </v-alert>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { formatCurrency } from '@/utils/formatters';
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';

const props = defineProps({
  currency: { type: String, default: 'IQD' },
  total: { type: Number, default: 0 },
  receivedAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, default: 'paid' }, // paid | partially_paid | unpaid
  hasCustomer: { type: Boolean, default: false },
});

defineEmits(['update:receivedAmount']);

const root = ref(null);

const STATUS_META = {
  paid: { label: 'مدفوعة بالكامل', color: 'success', icon: 'mdi-check-circle-outline' },
  partially_paid: { label: 'مدفوعة جزئياً', color: 'warning', icon: 'mdi-circle-half-full' },
  unpaid: { label: 'غير مدفوعة', color: 'error', icon: 'mdi-clock-alert-outline' },
};
const statusMeta = computed(() => STATUS_META[props.paymentStatus] || STATUS_META.paid);

defineExpose({
  focus() {
    root.value?.querySelector('input')?.focus();
  },
});
</script>

<style scoped lang="scss">
.cash-form {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.cash-row {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.84rem;

  &__label {
    color: rgba(var(--v-theme-on-surface), 0.62);
    font-weight: 700;
  }

  &__value {
    font-weight: 850;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), 0.86);
  }

  &--remaining {
    padding: 9px 10px;
    border-radius: 12px;
    background: rgba(var(--v-theme-error), 0.09);
    border: 1px solid rgba(var(--v-theme-error), 0.16);

    .cash-row__value {
      color: rgb(var(--v-theme-error));
      font-size: 1.05rem;
    }

    &.cash-row--paid {
      background: rgba(var(--v-theme-success), 0.09);
      border-color: rgba(var(--v-theme-success), 0.16);

      .cash-row__value {
        color: rgb(var(--v-theme-success));
      }
    }
  }
}

:deep(.v-field) {
  min-height: 42px;
  border-radius: 11px;
}

:deep(input) {
  text-align: end;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
</style>

