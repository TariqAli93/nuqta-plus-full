<template>
  <div class="page-shell">
    <PageHeader
      title="التحويلات بين الصناديق"
      subtitle="نقل النقد بين الصناديق والحسابات المصرفية"
      icon="mdi-bank-transfer"
    >
      <v-btn v-if="canTransfer" color="primary" prepend-icon="mdi-plus" @click="openCreate">
        تحويل جديد
      </v-btn>
    </PageHeader>

    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="transfers"
        :loading="loading"
        density="comfortable"
        items-per-page="25"
      >
        <template #loading>
          <TableSkeleton :rows="5" :columns="headers.length" />
        </template>
        <template #[`item.amount`]="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.amount, item.currency) }}</span>
          <span v-if="item.toAmount" class="text-medium-emphasis text-caption">
            ← {{ formatCurrency(item.toAmount, item.toCurrency) }}
          </span>
        </template>
        <template #[`item.status`]="{ item }">
          <v-chip
            size="x-small"
            :color="item.status === 'active' ? 'success' : 'grey'"
            variant="tonal"
          >
            {{ item.status === 'active' ? 'نافذ' : 'ملغى' }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            v-if="canTransfer && item.status === 'active'"
            icon="mdi-cancel"
            size="small"
            variant="text"
            color="error"
            title="إلغاء التحويل"
            @click="confirmCancel(item)"
          />
        </template>
        <template #no-data>
          <EmptyState
            title="لا توجد تحويلات"
            description="انقل النقد بين الصناديق أو إلى الحسابات المصرفية."
            icon="mdi-bank-transfer"
            compact
          />
        </template>
      </v-data-table>
    </v-card>

    <!-- Create dialog -->
    <v-dialog v-model="dialog" max-width="560">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>mdi-bank-transfer</v-icon>
          <span>تحويل جديد</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form" @submit.prevent="save">
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="formData.from"
                  :items="targetOptions"
                  item-title="title"
                  item-value="key"
                  label="من *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'حدد المصدر']"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="formData.to"
                  :items="targetOptions"
                  item-title="title"
                  item-value="key"
                  label="إلى *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[
                    (v) => !!v || 'حدد الوجهة',
                    (v) => v !== formData.from || 'لا يمكن التحويل لنفس الجهة',
                  ]"
                />
              </v-col>
              <v-col cols="12" sm="7">
                <v-text-field
                  v-model.number="formData.amount"
                  type="number"
                  step="0.01"
                  label="المبلغ *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[
                    (v) => !!v || 'المبلغ مطلوب',
                    (v) => Number(v) > 0 || 'المبلغ يجب أن يكون أكبر من صفر',
                  ]"
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
                <v-switch
                  v-model="crossCurrency"
                  color="primary"
                  hide-details
                  label="تحويل بين عملتين (صرف)"
                />
              </v-col>
              <template v-if="crossCurrency">
                <v-col cols="12" sm="7">
                  <v-text-field
                    v-model.number="formData.toAmount"
                    type="number"
                    step="0.01"
                    label="المبلغ المستلم *"
                    variant="outlined"
                    density="comfortable"
                    :rules="[(v) => !crossCurrency || Number(v) > 0 || 'حدد المبلغ المستلم']"
                  />
                </v-col>
                <v-col cols="12" sm="5">
                  <v-select
                    v-model="formData.toCurrency"
                    :items="['IQD', 'USD']"
                    label="عملة الوجهة"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
              </template>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.transferDate"
                  type="date"
                  label="التاريخ"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model="formData.notes"
                  label="ملاحظات"
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
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">تنفيذ التحويل</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useTreasuryStore } from '@/stores/treasury';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
import { formatCurrency } from '@/utils/formatters';

const treasuryStore = useTreasuryStore();
const authStore = useAuthStore();

const loading = computed(() => treasuryStore.loading);
const transfers = computed(() => treasuryStore.transfers);
const canTransfer = computed(() => authStore.hasPermission?.('treasury:transfer'));

const targetOptions = computed(() => [
  ...treasuryStore.cashboxes.map((c) => ({ key: `cashbox:${c.id}`, title: `صندوق: ${c.name}` })),
  ...treasuryStore.bankAccounts.map((b) => ({ key: `bank:${b.id}`, title: `حساب: ${b.name}` })),
]);

const headers = [
  { title: 'الرقم', key: 'transferNumber' },
  { title: 'التاريخ', key: 'transferDate' },
  { title: 'من', key: 'fromName' },
  { title: 'إلى', key: 'toName' },
  { title: 'المبلغ', key: 'amount' },
  { title: 'الحالة', key: 'status' },
  { title: 'بواسطة', key: 'createdByName' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
];

const dialog = ref(false);
const saving = ref(false);
const crossCurrency = ref(false);
const form = ref(null);
const formData = reactive({
  from: null,
  to: null,
  amount: null,
  currency: 'IQD',
  toAmount: null,
  toCurrency: 'USD',
  transferDate: new Date().toISOString().slice(0, 10),
  notes: '',
});

function openCreate() {
  formData.from = null;
  formData.to = null;
  formData.amount = null;
  formData.currency = 'IQD';
  formData.toAmount = null;
  formData.toCurrency = 'USD';
  formData.transferDate = new Date().toISOString().slice(0, 10);
  formData.notes = '';
  crossCurrency.value = false;
  dialog.value = true;
}

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    const [fromKind, fromId] = String(formData.from).split(':');
    const [toKind, toId] = String(formData.to).split(':');
    await treasuryStore.createTransfer({
      fromCashboxId: fromKind === 'cashbox' ? Number(fromId) : undefined,
      fromBankAccountId: fromKind === 'bank' ? Number(fromId) : undefined,
      toCashboxId: toKind === 'cashbox' ? Number(toId) : undefined,
      toBankAccountId: toKind === 'bank' ? Number(toId) : undefined,
      amount: formData.amount,
      currency: formData.currency,
      toAmount: crossCurrency.value ? formData.toAmount : undefined,
      toCurrency: crossCurrency.value ? formData.toCurrency : undefined,
      transferDate: formData.transferDate || undefined,
      notes: formData.notes || null,
    });
    dialog.value = false;
    await Promise.all([treasuryStore.fetchTransfers(), treasuryStore.fetchCashboxes()]);
  } catch (err) {
    console.error('Failed to create transfer', err);
  } finally {
    saving.value = false;
  }
}

async function confirmCancel(item) {
  const reason = window.prompt(`سبب إلغاء التحويل ${item.transferNumber}؟`);
  if (reason === null) return;
  try {
    await treasuryStore.cancelTransfer(item.id, reason || null);
    await treasuryStore.fetchTransfers();
  } catch (err) {
    console.error('Failed to cancel transfer', err);
  }
}

onMounted(async () => {
  await Promise.all([
    treasuryStore.fetchCashboxes().catch(() => {}),
    authStore.hasFeature('bankAccounts')
      ? treasuryStore.fetchBankAccounts().catch(() => {})
      : Promise.resolve(),
  ]);
  await treasuryStore.fetchTransfers();
});
</script>
