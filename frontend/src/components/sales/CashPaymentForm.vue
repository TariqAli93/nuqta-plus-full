<template>
  <div ref="root" class="cash-form">
    <div class="cash-row">
      <span class="cash-row__label">المبلغ المطلوب</span>
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
      :error-messages="shortfall ? ['المبلغ المستلم أقل من الإجمالي'] : []"
      @input="(e) => $emit('update:receivedAmount', parseAmount(e.target.value))"
    />

    <div class="cash-row cash-row--change" :class="{ 'cash-row--warn': shortfall }">
      <span class="cash-row__label">{{ shortfall ? 'النقص' : 'الباقي للعميل' }}</span>
      <span class="cash-row__value">
        {{ formatCurrency(shortfall ? total - receivedAmount : changeAmount, currency) }}
      </span>
    </div>
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
  changeAmount: { type: Number, default: 0 },
});

defineEmits(['update:receivedAmount']);

const root = ref(null);
const shortfall = computed(() => Number(props.receivedAmount || 0) < Number(props.total || 0));

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
  gap: 10px;
}

.cash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;

  &__label {
    color: rgba(var(--v-theme-on-surface), 0.65);
  }
  &__value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  &--change {
    padding: 8px 10px;
    border-radius: 8px;
    background-color: rgba(var(--v-theme-success), 0.1);

    .cash-row__value {
      color: rgb(var(--v-theme-success));
      font-size: 1rem;
    }
  }

  &--warn {
    background-color: rgba(var(--v-theme-error), 0.1);
    .cash-row__value {
      color: rgb(var(--v-theme-error));
    }
  }
}
</style>
