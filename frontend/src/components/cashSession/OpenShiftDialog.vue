<template>
  <v-dialog v-model="dialog" max-width="460">
    <v-card class="bg-surface-soft rounded-lg">
      <v-card-title class="d-flex align-center gap-2">
        <v-icon color="primary">mdi-cash-register</v-icon>
        <span>فتح وردية</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pt-4">
        <p class="text-body-2 text-medium-emphasis mb-3">
          أدخل المبلغ النقدي الموجود في الدُرج عند بداية الوردية.
        </p>
        <v-text-field
          data-testid="open-shift-cash"
          v-model.number="openingCash"
          label="النقد الافتتاحي"
          type="number"
          min="0"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          autofocus
          :error-messages="error ? [error] : []"
          @keyup.enter="onConfirm"
        />
        <v-select
          data-testid="open-shift-currency"
          v-model="currency"
          :items="currencies"
          label="العملة"
          variant="outlined"
          density="comfortable"
          hide-details
          class="mt-3"
        />
        <!-- الخزينة: اختيار الصندوق الذي تعمل عليه الوردية -->
        <v-select
          v-if="treasuryOn && cashboxOptions.length > 1"
          v-model="cashboxId"
          :items="cashboxOptions"
          item-title="name"
          item-value="id"
          label="الصندوق"
          variant="outlined"
          density="comfortable"
          hide-details
          class="mt-3"
          prepend-inner-icon="mdi-safe-square-outline"
        />
        <v-textarea
          data-testid="open-shift-notes"
          v-model="notes"
          label="ملاحظات (اختياري)"
          rows="2"
          auto-grow
          variant="outlined"
          density="comfortable"
          hide-details
          class="mt-3"
        />
      </v-card-text>
      <v-divider />
      <v-card-actions class="justify-end gap-2 pa-3">
        <v-btn data-testid="open-shift-cancel" variant="outlined" :disabled="loading" @click="onCancel"> إلغاء </v-btn>
        <v-btn
          data-testid="open-shift-confirm"
          color="primary"
          variant="elevated"
          :loading="loading"
          :disabled="!isValid"
          @click="onConfirm"
        >
          فتح الوردية
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryStore } from '@/stores/treasury';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  defaultCurrency: { type: String, default: 'USD' },
  cancelable: { type: Boolean, default: true },
});

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel']);

const authStore = useAuthStore();
const treasuryStore = useTreasuryStore();

const dialog = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const openingCash = ref(0);
const currency = ref(props.defaultCurrency);
const cashboxId = ref(null);
const notes = ref('');
const error = ref('');
const currencies = [
  { title: 'USD', value: 'USD' },
  { title: 'IQD', value: 'IQD' },
];

const treasuryOn = computed(() => authStore.hasFeature('treasury'));
const cashboxOptions = computed(() => treasuryStore.cashboxes || []);

const isValid = computed(
  () => Number.isFinite(Number(openingCash.value)) && Number(openingCash.value) >= 0
);

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      openingCash.value = 0;
      currency.value = props.defaultCurrency;
      notes.value = '';
      error.value = '';
      cashboxId.value = null;
      if (treasuryOn.value && cashboxOptions.value.length === 0) {
        // Lazy-load the boxes so the picker has options; failure is non-fatal
        // (the backend falls back to the default cashbox).
        try {
          await treasuryStore.fetchCashboxes();
        } catch {
          /* ignore */
        }
      }
      const defaultBox = cashboxOptions.value.find((c) => c.isDefault);
      if (defaultBox) cashboxId.value = defaultBox.id;
    }
  }
);

const onConfirm = () => {
  if (!isValid.value) {
    error.value = 'يجب إدخال مبلغ صفر أو أكثر';
    return;
  }
  emit('confirm', {
    openingCash: Number(openingCash.value) || 0,
    currency: currency.value,
    notes: notes.value?.trim() || null,
    cashboxId: treasuryOn.value ? cashboxId.value || null : null,
  });
};

const onCancel = () => {
  emit('cancel');
  dialog.value = false;
};
</script>
