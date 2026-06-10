<template>
  <v-dialog :model-value="modelValue" max-width="560" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="dialog-title">
        <v-icon :color="isReceipt ? 'success' : 'error'">
          {{ isReceipt ? 'mdi-cash-plus' : 'mdi-cash-minus' }}
        </v-icon>
        <span>{{ isReceipt ? 'وصل قبض جديد' : 'وصل دفع جديد' }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pt-4">
        <v-alert
          v-if="isReceipt"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
          text="لقبض دين عميل عن فاتورة، استخدم شاشة قبض الديون — يُنشأ وصل القبض تلقائياً. هذا النموذج للإيرادات الأخرى."
        />
        <v-form ref="form" @submit.prevent="save">
          <v-row dense>
            <v-col cols="12" sm="7">
              <v-text-field
                v-model.number="formData.amount"
                type="number"
                step="0.01"
                :label="isReceipt ? 'المبلغ المقبوض *' : 'المبلغ المصروف *'"
                variant="outlined"
                density="comfortable"
                :rules="[
                  (v) => !!v || 'المبلغ مطلوب',
                  (v) => Number(v) > 0 || 'المبلغ يجب أن يكون أكبر من صفر',
                ]"
                required
              />
            </v-col>
            <v-col cols="12" sm="5">
              <v-select
                v-model="formData.currency"
                :items="['IQD', 'USD']"
                label="العملة"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12">
              <v-select
                v-model="formData.target"
                :items="targetOptions"
                item-title="title"
                item-value="key"
                :label="isReceipt ? 'إلى (صندوق/حساب) *' : 'من (صندوق/حساب) *'"
                variant="outlined"
                density="comfortable"
                :rules="[(v) => !!v || 'حدد الصندوق أو الحساب']"
                required
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="formData.voucherDate"
                type="date"
                label="التاريخ"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="formData.category"
                :label="isReceipt ? 'فئة الإيراد' : 'فئة المصروف'"
                variant="outlined"
                density="comfortable"
                placeholder="مثال: إيجار، أرباح، خدمات..."
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="formData.referenceNumber"
                label="رقم مرجعي (اختياري)"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="formData.description"
                label="البيان"
                variant="outlined"
                density="comfortable"
                rows="2"
                auto-grow
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">إلغاء</v-btn>
        <v-btn :color="isReceipt ? 'success' : 'error'" :loading="saving" @click="save">
          حفظ الوصل
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useTreasuryStore } from '@/stores/treasury';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  voucherType: { type: String, default: 'receipt' },
  cashboxes: { type: Array, default: () => [] },
  bankAccounts: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue', 'saved']);

const treasuryStore = useTreasuryStore();
const form = ref(null);
const saving = ref(false);

const isReceipt = computed(() => props.voucherType === 'receipt');

const targetOptions = computed(() => [
  ...props.cashboxes.map((c) => ({ key: `cashbox:${c.id}`, title: `صندوق: ${c.name}` })),
  ...props.bankAccounts.map((b) => ({ key: `bank:${b.id}`, title: `حساب: ${b.name}` })),
]);

const formData = reactive({
  amount: null,
  currency: 'IQD',
  target: null,
  voucherDate: new Date().toISOString().slice(0, 10),
  category: '',
  referenceNumber: '',
  description: '',
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      formData.amount = null;
      formData.currency = 'IQD';
      formData.target = props.cashboxes.length === 1 ? `cashbox:${props.cashboxes[0].id}` : null;
      formData.voucherDate = new Date().toISOString().slice(0, 10);
      formData.category = '';
      formData.referenceNumber = '';
      formData.description = '';
    }
  }
);

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    const [kind, id] = String(formData.target).split(':');
    await treasuryStore.createVoucher(props.voucherType, {
      amount: formData.amount,
      currency: formData.currency,
      cashboxId: kind === 'cashbox' ? Number(id) : undefined,
      bankAccountId: kind === 'bank' ? Number(id) : undefined,
      voucherDate: formData.voucherDate || undefined,
      category: formData.category || null,
      referenceNumber: formData.referenceNumber || null,
      description: formData.description || null,
    });
    emit('update:modelValue', false);
    emit('saved');
  } catch (err) {
    console.error('Failed to save voucher', err);
  } finally {
    saving.value = false;
  }
}
</script>
