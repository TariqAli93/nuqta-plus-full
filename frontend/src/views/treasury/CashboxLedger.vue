<template>
  <div class="page-shell">
    <PageHeader
      :title="`كشف حركة الصندوق${ledger?.cashbox?.name ? ' — ' + ledger.cashbox.name : ''}`"
      subtitle="كل السندات والتحويلات مع الرصيد المتحرك"
      icon="mdi-format-list-bulleted"
    >
      <v-btn variant="text" prepend-icon="mdi-arrow-right" to="/treasury/cashboxes">
        رجوع للصناديق
      </v-btn>
    </PageHeader>

    <!-- Balances summary cards (kept above the table; show the true current
         balances regardless of the date window applied to the ledger). -->
    <div v-if="ledger" class="summary-grid page-section">
      <StatCard
        v-for="(amount, currency) in ledger.balances"
        :key="currency"
        :label="`الرصيد الحالي (${getCurrencySymbol(currency)})`"
        :value="formatCurrency(amount, currency)"
        icon="mdi-safe-square-outline"
        :icon-color="amount < 0 ? 'error' : 'success'"
      />
    </div>

    <!-- Unified SmartTable (client-side): the date-range filter drives a server
         re-fetch via reload() so the running balance stays correct for the
         window. The runningBalance column is order-dependent → sortable:false. -->
    <SmartTable
      data-testid="cashbox-ledger-table"
      table-key="cashbox-ledger-table"
      :headers="headers"
      :items="ledger?.entries || []"
      :loading="loading"
      :page-size="50"
      :filter-chips="filterChips"
      show-export
      show-print
      print-title="كشف حركة الصندوق"
      export-file-base="cashbox-ledger"
      empty-title="لا توجد حركات"
      empty-description="حركات هذا الصندوق (سندات وتحويلات) ستظهر هنا."
      empty-icon="mdi-format-list-bulleted"
      @clear-filters="clearFilters"
      @remove-filter="onRemoveFilter"
      @refresh="reload"
    >
      <!-- Page-owned date-range filter (server-side filtering on "تطبيق"). -->
      <template #filters>
        <v-row dense>
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
          <v-col cols="12" class="d-flex justify-end">
            <v-btn color="primary" prepend-icon="mdi-check" @click="reload">تطبيق</v-btn>
          </v-col>
        </v-row>
      </template>

      <!-- Custom cells pass straight through. -->
      <template #[`item.direction`]="{ item }">
        <v-chip size="small" :color="item.direction === 'in' ? 'success' : 'error'" variant="tonal">
          {{ item.direction === 'in' ? 'داخل' : 'خارج' }}
        </v-chip>
      </template>
      <template #[`item.amount`]="{ item }">
        <span
          class="font-weight-bold"
          :class="item.direction === 'in' ? 'text-success' : 'text-error'"
        >
          {{ item.direction === 'in' ? '+' : '−' }}{{ formatCurrency(item.amount, item.currency) }}
        </span>
      </template>
      <!-- Running balance: precomputed per row server-side; render the stored
           value as-is (never recompute). -->
      <template #[`item.runningBalance`]="{ item }">
        <span :class="item.runningBalance < 0 ? 'text-error' : ''">
          {{ formatCurrency(item.runningBalance, item.currency) }}
        </span>
      </template>
      <template #[`item.sourceType`]="{ item }">
        <v-chip size="x-small" variant="tonal">{{ sourceLabel(item.sourceType) }}</v-chip>
      </template>
    </SmartTable>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { useTreasuryStore } from '@/stores/treasury';
import PageHeader from '@/components/PageHeader.vue';
import StatCard from '@/components/StatCard.vue';
import SmartTable from '@/components/common/SmartTable';
import { formatCurrency, getCurrencySymbol } from '@/utils/formatters';

const route = useRoute();
const treasuryStore = useTreasuryStore();

const loading = computed(() => treasuryStore.loading);
const ledger = computed(() => treasuryStore.ledger);

const SOURCE_LABELS = {
  manual: 'وصل يدوي',
  sale_payment: 'دفعة بيع',
  sale_refund: 'استرداد مرتجع',
  collections: 'قبض دين',
  expense: 'مصروف',
  purchase_payment: 'دفعة شراء',
  purchase_refund: 'استرداد شراء',
  treasury_transfer: 'تحويل',
};
function sourceLabel(s) {
  return SOURCE_LABELS[s] || s;
}

const filters = reactive({ dateFrom: '', dateTo: '' });

const headers = [
  { title: 'التاريخ', key: 'date', format: 'date' },
  { title: 'الرقم', key: 'number', ltr: true },
  { title: 'الاتجاه', key: 'direction', exportValue: (r) => (r.direction === 'in' ? 'داخل' : 'خارج') },
  { title: 'المبلغ', key: 'amount', format: 'currency', align: 'end' },
  // Running balance is order-dependent — disable sorting so the total isn't scrambled.
  { title: 'الرصيد بعد الحركة', key: 'runningBalance', format: 'currency', align: 'end', sortable: false },
  { title: 'المصدر', key: 'sourceType', exportValue: (r) => sourceLabel(r.sourceType) },
  { title: 'البيان', key: 'description' },
];

const filterChips = computed(() => {
  const chips = [];
  if (filters.dateFrom) chips.push({ key: 'dateFrom', label: `من: ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: 'dateTo', label: `إلى: ${filters.dateTo}` });
  return chips;
});

async function reload() {
  const params = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  await treasuryStore.fetchLedger(route.params.id, params);
}

function clearFilters() {
  filters.dateFrom = '';
  filters.dateTo = '';
  reload();
}

function onRemoveFilter(key) {
  if (key === 'dateFrom') filters.dateFrom = '';
  if (key === 'dateTo') filters.dateTo = '';
  reload();
}

onMounted(reload);
</script>
