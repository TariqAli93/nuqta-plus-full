<template>
  <div class="installment-form">
    <div class="field-grid">
      <!-- Down payment -->
      <v-text-field
        :model-value="groupNumber(sale.paidAmount)"
        label="الدفعة المقدمة"
        :suffix="currency"
        density="comfortable"
        variant="outlined"
        hide-details="auto"
        @input="(e) => set('paidAmount', parseAmount(e.target.value))"
      />

      <!-- Installment count -->
      <v-text-field
        :model-value="sale.installmentCount"
        label="عدد الأقساط"
        type="number"
        min="1"
        density="comfortable"
        variant="outlined"
        hide-details="auto"
        @update:model-value="(v) => set('installmentCount', Number(v))"
      />

      <!-- Interest is now entered per product line («فائدة الوحدة») in the
           items table — there is no invoice-level interest input here. -->

      <!-- First due date -->
      <v-text-field
        :model-value="sale.firstInstallmentDate"
        label="تاريخ أول قسط"
        type="date"
        prepend-inner-icon="mdi-calendar-start"
        density="comfortable"
        variant="outlined"
        hide-details="auto"
        @update:model-value="(v) => set('firstInstallmentDate', v)"
      />

      <!-- Periodicity -->
      <div class="period-field">
        <div class="text-caption text-medium-emphasis mb-1">الدورية</div>
        <v-btn-toggle
          :model-value="sale.installmentPeriod"
          color="primary"
          variant="elevated"
          class="period-toggle"
          @update:model-value="(v) => set('installmentPeriod', v)"
        >
          <v-btn value="monthly" size="small">شهري</v-btn>
          <v-btn value="weekly" size="small">أسبوعي</v-btn>
        </v-btn-toggle>
      </div>
    </div>

    <!-- Computed read-outs -->
    <div class="installment-readout">
      <div class="readout-item">
        <span class="readout-item__label">المبلغ بعد الفائدة</span>
        <span class="readout-item__value">{{ formatCurrency(totalWithInterest, currency) }}</span>
      </div>
      <div class="readout-item">
        <span class="readout-item__label">قيمة القسط</span>
        <span class="readout-item__value">{{ formatCurrency(installmentAmount, currency) }}</span>
      </div>
      <div class="readout-item">
        <span class="readout-item__label">النسبة الفعلية</span>
        <span class="readout-item__value">{{ actualInterestRate.toFixed(2) }}%</span>
      </div>
      <div class="readout-item">
        <span class="readout-item__label">المتبقي</span>
        <span class="readout-item__value text-error">{{
          formatCurrency(remainingAmount, currency)
        }}</span>
      </div>
    </div>

    <!-- Schedule preview -->
    <v-btn
      variant="text"
      size="small"
      class="mt-1"
      :prepend-icon="showSchedule ? 'mdi-chevron-up' : 'mdi-calendar-month-outline'"
      @click="showSchedule = !showSchedule"
    >
      {{ showSchedule ? 'إخفاء جدول الأقساط' : 'معاينة جدول الأقساط' }}
    </v-btn>

    <v-expand-transition>
      <v-table v-if="showSchedule && schedule.length" density="compact" class="schedule-table">
        <thead>
          <tr>
            <th class="text-right">#</th>
            <th class="text-right">الاستحقاق</th>
            <th class="text-right">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in schedule" :key="row.number">
            <td>{{ row.number }}</td>
            <td>{{ row.dueDate }}</td>
            <td class="font-weight-bold">{{ formatCurrency(row.amount, currency) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-expand-transition>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { formatCurrency } from '@/utils/formatters';
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';

defineProps({
  sale: { type: Object, required: true },
  currency: { type: String, default: 'IQD' },
  totalWithInterest: { type: Number, default: 0 },
  installmentAmount: { type: Number, default: 0 },
  actualInterestRate: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },
  schedule: { type: Array, default: () => [] },
});

const emit = defineEmits(['update']);
// Patch the sale model through the parent rather than mutating the prop.
const set = (key, value) => emit('update', { [key]: value });

const showSchedule = ref(false);
</script>

<style scoped lang="scss">
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.period-field {
  display: flex;
  flex-direction: column;
}
.period-toggle {
  width: 100%;
  gap: 10px;
  :deep(.v-btn) {
    flex: 1;
  }
}

.installment-readout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 14px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background-color: rgba(var(--v-theme-info), 0.08);
}

.readout-item {
  display: flex;
  flex-direction: column;

  &__label {
    font-size: 0.72rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }
  &__value {
    font-weight: 700;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
  }
}

.schedule-table {
  margin-top: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
}

@media (max-width: 600px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
