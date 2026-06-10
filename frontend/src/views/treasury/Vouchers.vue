<template>
  <div class="page-shell">
    <PageHeader
      title="وصولات القبض والدفع"
      subtitle="المبالغ الداخلة (قبض) والخارجة (دفع) من الصندوق"
      icon="mdi-receipt-text-check-outline"
    >
      <v-btn
        v-if="canCreateReceipt"
        color="success"
        prepend-icon="mdi-cash-plus"
        class="me-2"
        @click="openCreate('receipt')"
      >
        وصل قبض
      </v-btn>
      <v-btn
        v-if="canCreatePayment"
        color="error"
        prepend-icon="mdi-cash-minus"
        @click="openCreate('payment')"
      >
        وصل دفع
      </v-btn>
    </PageHeader>

    <!-- Filters -->
    <v-card class="page-section filter-toolbar pa-3">
      <v-row dense>
        <v-col cols="12" sm="6" md="3">
          <v-select
            v-model="filters.voucherType"
            :items="[
              { value: 'receipt', title: 'قبض' },
              { value: 'payment', title: 'دفع' },
            ]"
            label="النوع"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-select
            v-model="filters.cashboxId"
            :items="cashboxOptions"
            item-title="name"
            item-value="id"
            label="الصندوق"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-text-field
            v-model="filters.dateFrom"
            type="date"
            label="من تاريخ"
            density="comfortable"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-text-field
            v-model="filters.dateTo"
            type="date"
            label="إلى تاريخ"
            density="comfortable"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="12">
          <v-btn variant="text" class="ml-2" @click="clearFilters">مسح</v-btn>
          <v-btn color="primary" prepend-icon="mdi-check" @click="reload">تطبيق</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Table -->
    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="vouchers"
        :loading="loading"
        density="comfortable"
        items-per-page="25"
      >
        <template #loading>
          <TableSkeleton :rows="5" :columns="headers.length" />
        </template>
        <template #[`item.voucherType`]="{ item }">
          <v-chip
            size="small"
            :color="item.voucherType === 'receipt' ? 'success' : 'error'"
            variant="tonal"
          >
            {{ item.voucherType === 'receipt' ? 'قبض' : 'دفع' }}
          </v-chip>
        </template>
        <template #[`item.amount`]="{ item }">
          <span
            class="font-weight-bold"
            :class="item.voucherType === 'receipt' ? 'text-success' : 'text-error'"
          >
            {{ item.voucherType === 'receipt' ? '+' : '−' }}{{ formatCurrency(item.amount, item.currency) }}
          </span>
        </template>
        <template #[`item.sourceType`]="{ item }">
          <v-chip size="x-small" variant="tonal">{{ sourceLabel(item.sourceType) }}</v-chip>
        </template>
        <template #[`item.target`]="{ item }">
          {{ item.cashboxName || item.bankAccountName || '-' }}
        </template>
        <template #[`item.party`]="{ item }">
          {{ item.customerName || '-' }}
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
            v-if="canCancel && item.status === 'active' && item.sourceType === 'manual'"
            icon="mdi-cancel"
            size="small"
            variant="text"
            color="error"
            title="إلغاء الوصل"
            @click="confirmCancel(item)"
          />
        </template>
        <template #no-data>
          <EmptyState
            title="لا توجد وصولات"
            description="تُنشأ الوصولات يدوياً أو تلقائياً من القبض والدفع والمصاريف والمرتجعات."
            icon="mdi-receipt-text-check-outline"
            compact
          />
        </template>
      </v-data-table>
    </v-card>

    <VoucherFormDialog
      v-model="dialog"
      :voucher-type="dialogType"
      :cashboxes="cashboxOptions"
      :bank-accounts="bankAccountOptions"
      @saved="reload"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useTreasuryStore } from '@/stores/treasury';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
import VoucherFormDialog from '@/components/treasury/VoucherFormDialog.vue';
import { formatCurrency } from '@/utils/formatters';

const treasuryStore = useTreasuryStore();
const authStore = useAuthStore();

const loading = computed(() => treasuryStore.loading);
const vouchers = computed(() => treasuryStore.vouchers);
const cashboxOptions = computed(() => treasuryStore.cashboxes);
const bankAccountOptions = computed(() => treasuryStore.bankAccounts);
const canCreateReceipt = computed(() => authStore.hasPermission?.('vouchers:create_receipt'));
const canCreatePayment = computed(() => authStore.hasPermission?.('vouchers:create_payment'));
const canCancel = computed(() => authStore.hasPermission?.('vouchers:cancel'));

const SOURCE_LABELS = {
  manual: 'يدوي',
  sale_payment: 'دفعة بيع',
  sale_refund: 'استرداد مرتجع',
  collections: 'تحصيل دين',
  expense: 'مصروف',
  purchase_payment: 'دفعة شراء',
  purchase_refund: 'استرداد شراء',
};
function sourceLabel(s) {
  return SOURCE_LABELS[s] || s;
}

const filters = reactive({
  voucherType: null,
  cashboxId: null,
  dateFrom: '',
  dateTo: '',
});

const headers = [
  { title: 'الرقم', key: 'voucherNumber' },
  { title: 'النوع', key: 'voucherType' },
  { title: 'التاريخ', key: 'voucherDate' },
  { title: 'المبلغ', key: 'amount' },
  { title: 'الصندوق/الحساب', key: 'target', sortable: false },
  { title: 'الطرف', key: 'party', sortable: false },
  { title: 'المصدر', key: 'sourceType' },
  { title: 'البيان', key: 'description' },
  { title: 'الحالة', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
];

const dialog = ref(false);
const dialogType = ref('receipt');

function openCreate(type) {
  dialogType.value = type;
  dialog.value = true;
}

async function reload() {
  const params = { ...filters };
  Object.keys(params).forEach((k) => {
    if (params[k] === null || params[k] === '' || params[k] === undefined) delete params[k];
  });
  await treasuryStore.fetchVouchers(params);
}

function clearFilters() {
  filters.voucherType = null;
  filters.cashboxId = null;
  filters.dateFrom = '';
  filters.dateTo = '';
  reload();
}

async function confirmCancel(item) {
  const reason = window.prompt(`سبب إلغاء الوصل ${item.voucherNumber}؟`);
  if (reason === null) return;
  try {
    await treasuryStore.cancelVoucher(item.id, reason || null);
    await reload();
  } catch (err) {
    console.error('Failed to cancel voucher', err);
  }
}

onMounted(async () => {
  await Promise.all([
    treasuryStore.fetchCashboxes().catch(() => {}),
    authStore.hasFeature('bankAccounts')
      ? treasuryStore.fetchBankAccounts().catch(() => {})
      : Promise.resolve(),
  ]);
  await reload();
});
</script>
