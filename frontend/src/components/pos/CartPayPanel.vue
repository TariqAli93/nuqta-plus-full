<template>
  <div class="cart__pay">
    <div class="pay__total pay__total--compact">
      <span class="pay__total-label">الإجمالي</span>
      <span class="pay__total-value" data-testid="pos-total">
        {{ formatMoney(total, currency) }}
      </span>
    </div>

    <div v-if="appliedDiscount > 0 || taxValue > 0" class="pay__breakdown pay__breakdown--compact">
      <div class="pay__row">
        <span>الفرعي</span>
        <span>{{ formatMoney(subtotal, currency) }}</span>
      </div>

      <div v-if="appliedDiscount > 0" class="pay__row pay__row--warning">
        <span>الخصم</span>
        <span>- {{ formatMoney(appliedDiscount, currency) }}</span>
      </div>

      <div v-if="taxValue > 0" class="pay__row">
        <span>الضريبة</span>
        <span>{{ formatMoney(taxValue, currency) }}</span>
      </div>
    </div>

    <v-alert
      v-if="discountCapped"
      type="warning"
      variant="tonal"
      density="compact"
      class="pay__alert"
      icon="mdi-alert"
    >
      أقصى خصم مسموح: <strong>{{ formatMoney(appliedDiscount, currency) }}</strong>
    </v-alert>

    <div class="pay__methods-row">
      <v-btn-toggle
        :model-value="payment.method"
        class="pay__methods"
        color="primary"
        mandatory
        @update:model-value="emit('methodChange', $event)"
      >
        <v-btn
          v-for="method in paymentMethods"
          :key="method.value"
          :value="method.value"
          :prepend-icon="method.icon"
          size="small"
          variant="elevated"
        >
          {{ method.label }}
        </v-btn>
      </v-btn-toggle>
    </div>

    <v-text-field
      v-if="payment.method === 'card'"
      :model-value="payment.reference"
      data-testid="pos-card-ref"
      variant="outlined"
      density="compact"
      hide-details="auto"
      label="مرجع البطاقة *"
      autocomplete="off"
      prepend-inner-icon="mdi-credit-card-outline"
      @update:model-value="emit('updatePaymentReference', $event)"
    />

    <div class="pay__readout pay__readout--compact" :class="changeStateClass">
      <div class="pay__readout-row">
        <span>المستلم</span>
        <strong>{{ formatMoney(payment.paidAmount || 0, currency) }}</strong>
      </div>

      <div class="pay__readout-row">
        <span>{{ changeLabel }}</span>
        <strong>{{ formatMoney(changeAmount, currency) }}</strong>
      </div>
    </div>

    <v-expansion-panels variant="accordion" class="pay__expander pay__expander--dense">
      <v-expansion-panel rounded="lg">
        <v-expansion-panel-title>
          <v-icon size="16" start>mdi-tune-variant</v-icon>
          خصم / ضريبة / ملاحظة
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <div class="pay__adjust">
            <v-text-field
              :model-value="groupNumber(saleDiscount.value)"
              :min="0"
              variant="outlined"
              density="compact"
              hide-details
              control-variant="split"
              label="خصم"
              @update:model-value="emit('updateSaleDiscountValue', parseAmount($event))"
            >
              <template #prepend>
                <v-btn-toggle
                  :model-value="saleDiscount.type"
                  mandatory
                  density="compact"
                  color="primary"
                  variant="outlined"
                  @update:model-value="emit('updateSaleDiscountType', $event)"
                >
                  <v-btn value="amount" size="x-small" icon="mdi-cash" />
                  <v-btn value="percent" size="x-small" icon="mdi-percent" />
                </v-btn-toggle>
              </template>
            </v-text-field>

            <v-number-input
              :model-value="tax.value"
              type="number"
              :min="0"
              variant="outlined"
              density="compact"
              hide-details
              control-variant="split"
              label="ضريبة %"
              :readonly="!tax.enabled"
              @update:model-value="emit('updateTaxValue', $event)"
            >
              <template #prepend>
                <v-switch
                  :model-value="tax.enabled"
                  density="compact"
                  color="primary"
                  hide-details
                  @update:model-value="emit('updateTaxEnabled', $event)"
                />
              </template>
            </v-number-input>

            <v-textarea
              :model-value="saleNotes"
              data-testid="pos-sale-notes"
              label="ملاحظة الفاتورة"
              variant="outlined"
              density="compact"
              rows="1"
              auto-grow
              no-resize
              counter="1000"
              maxlength="1000"
              prepend-inner-icon="mdi-note-text-outline"
              @update:model-value="emit('updateSaleNotes', $event)"
            />
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel rounded="lg">
        <v-expansion-panel-title>
          <v-icon size="16" start>mdi-dialpad</v-icon>
          إدخال مبلغ مستلم
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <div class="numpad__quick">
            <v-btn
              v-for="amount in quickAmounts"
              :key="amount"
              size="small"
              variant="tonal"
              @click="emit('addToPaid', amount)"
            >
              +{{ shortAmount(amount) }}
            </v-btn>
          </div>

          <div class="numpad__keys">
            <v-btn
              v-for="key in numpadKeys"
              :key="key.value"
              size="small"
              variant="tonal"
              :color="key.value === 'back' ? 'error' : undefined"
              @click="emit('numpad', key.value)"
            >
              <v-icon v-if="key.icon" size="18">{{ key.icon }}</v-icon>
              <span v-else>{{ key.label }}</span>
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div class="pay__actions pay__actions--compact pa-3">
      <v-btn
        v-if="draftsVisible"
        variant="outlined"
        size="large"
        prepend-icon="mdi-content-save-outline"
        :disabled="draftsDisabled || itemsLength === 0 || submitting || !hasActivePeriod"
        @click="emit('hold')"
      >
        مسودة
      </v-btn>

      <v-btn
        data-testid="pos-checkout"
        size="large"
        color="primary"
        class="pay__checkout"
        :loading="submitting"
        :disabled="!canSubmit || !hasActivePeriod || discountCapped || itemDiscountCapped"
        @click="emit('checkout')"
      >
        <v-icon start>mdi-check-circle-outline</v-icon>
        دفع وإتمام
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';
import { formatCurrency as formatMoney } from '@/utils/formatters';

defineProps({
  currency: { type: String, required: true },
  total: { type: Number, required: true },
  subtotal: { type: Number, required: true },
  appliedDiscount: { type: Number, required: true },
  taxValue: { type: Number, required: true },
  discountCapped: { type: Boolean, default: false },
  payment: { type: Object, required: true },
  paymentMethods: { type: Array, default: () => [] },
  changeStateClass: { type: String, default: '' },
  changeLabel: { type: String, required: true },
  changeAmount: { type: Number, required: true },
  saleDiscount: { type: Object, required: true },
  tax: { type: Object, required: true },
  saleNotes: { type: String, default: '' },
  quickAmounts: { type: Array, default: () => [] },
  numpadKeys: { type: Array, default: () => [] },
  draftsVisible: { type: Boolean, default: false },
  draftsDisabled: { type: Boolean, default: false },
  itemsLength: { type: Number, default: 0 },
  submitting: { type: Boolean, default: false },
  hasActivePeriod: { type: Boolean, default: true },
  canSubmit: { type: Boolean, default: false },
  itemDiscountCapped: { type: Boolean, default: false },
});

const emit = defineEmits([
  'methodChange',
  'updatePaymentReference',
  'updateSaleDiscountValue',
  'updateSaleDiscountType',
  'updateTaxValue',
  'updateTaxEnabled',
  'updateSaleNotes',
  'addToPaid',
  'numpad',
  'hold',
  'checkout',
]);

const shortAmount = (amount) => {
  if (amount >= 1_000_000) return `${amount / 1_000_000}M`;
  if (amount >= 1_000) return `${amount / 1_000}k`;
  return String(amount);
};
</script>
