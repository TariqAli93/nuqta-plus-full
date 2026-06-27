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

    <!-- Unified SmartTable (client-side display). Filters stay server-side (the
         list is paginated server-side) via the page-owned #filters controls that
         call reload(); active filters surface as chips. Custom cells (type,
         amount, source, target, party, status) pass straight through, and cancel
         is a gated row action. -->
    <SmartTable
      data-testid="vouchers-table"
      table-key="vouchers-table"
      :headers="headers"
      :items="vouchers"
      :loading="loading"
      :row-actions="rowActions"
      :filter-chips="filterChips"
      show-export
      show-print
      print-title="وصولات القبض والدفع"
      export-file-base="vouchers"
      empty-title="لا توجد وصولات"
      empty-description="تُنشأ الوصولات يدوياً أو تلقائياً من القبض والدفع والمصاريف والمرتجعات."
      empty-icon="mdi-receipt-text-check-outline"
      @clear-filters="clearFilters"
      @remove-filter="onRemoveFilter"
    >
      <template #filters>
        <v-row dense>
          <v-col cols="12" sm="6">
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
          <v-col cols="12" sm="6">
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
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="filters.dateFrom"
              type="date"
              label="من تاريخ"
              density="comfortable"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="filters.dateTo"
              type="date"
              label="إلى تاريخ"
              density="comfortable"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" class="d-flex justify-end ga-2">
            <v-btn variant="text" @click="clearFilters">مسح</v-btn>
            <v-btn color="primary" prepend-icon="mdi-check" @click="reload">تطبيق</v-btn>
          </v-col>
        </v-row>
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
    </SmartTable>

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
import SmartTable from '@/components/common/SmartTable';
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
// Snapshot of the last *applied* filters, so the chips reflect what's actually
// loaded (the controls apply manually via the "تطبيق" button), not the draft.
const appliedFilters = ref({ ...filters });

const headers = [
  { title: 'الرقم', key: 'voucherNumber' },
  {
    title: 'النوع',
    key: 'voucherType',
    exportValue: (r) => (r.voucherType === 'receipt' ? 'قبض' : 'دفع'),
  },
  { title: 'التاريخ', key: 'voucherDate', format: 'date' },
  { title: 'المبلغ', key: 'amount', format: 'currency', align: 'end' },
  {
    title: 'الصندوق/الحساب',
    key: 'target',
    sortable: false,
    exportValue: (r) => r.cashboxName || r.bankAccountName || '-',
  },
  { title: 'الطرف', key: 'party', sortable: false, exportValue: (r) => r.customerName || '-' },
  { title: 'المصدر', key: 'sourceType', exportValue: (r) => sourceLabel(r.sourceType) },
  { title: 'البيان', key: 'description' },
  {
    title: 'الحالة',
    key: 'status',
    exportValue: (r) => (r.status === 'active' ? 'نافذ' : 'ملغى'),
  },
];

const filterChips = computed(() => {
  const a = appliedFilters.value;
  const chips = [];
  if (a.voucherType) {
    chips.push({ key: 'voucherType', label: `النوع: ${a.voucherType === 'receipt' ? 'قبض' : 'دفع'}` });
  }
  if (a.cashboxId) {
    const cb = cashboxOptions.value.find((c) => c.id === a.cashboxId);
    chips.push({ key: 'cashboxId', label: `الصندوق: ${cb?.name ?? a.cashboxId}` });
  }
  if (a.dateFrom) chips.push({ key: 'dateFrom', label: `من تاريخ: ${a.dateFrom}` });
  if (a.dateTo) chips.push({ key: 'dateTo', label: `إلى تاريخ: ${a.dateTo}` });
  return chips;
});

// Cancel as a gated row action: only manual, still-active vouchers, and only for
// users who can cancel (mirrors the previous v-if). The page keeps its own prompt
// because cancelling captures a free-text reason the generic confirm can't take.
const rowActions = [
  {
    key: 'cancel',
    icon: 'mdi-cancel',
    title: 'إلغاء الوصل',
    color: 'error',
    danger: true,
    permission: 'vouchers:cancel',
    hidden: (item) => !(item.status === 'active' && item.sourceType === 'manual'),
    handler: (item) => confirmCancel(item),
  },
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
  appliedFilters.value = { ...filters };
  await treasuryStore.fetchVouchers(params);
}

function clearFilters() {
  filters.voucherType = null;
  filters.cashboxId = null;
  filters.dateFrom = '';
  filters.dateTo = '';
  reload();
}

function onRemoveFilter(key) {
  if (key === 'dateFrom' || key === 'dateTo') filters[key] = '';
  else filters[key] = null;
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
