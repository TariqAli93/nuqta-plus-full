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

    <!-- Balances summary -->
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

    <!-- Filters -->
    <v-card class="page-section filter-toolbar pa-3">
      <v-row dense>
        <v-col cols="12" sm="5">
          <v-text-field
            v-model="filters.dateFrom"
            type="date"
            label="من تاريخ"
            density="comfortable"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="5">
          <v-text-field
            v-model="filters.dateTo"
            type="date"
            label="إلى تاريخ"
            density="comfortable"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="2" class="flex items-center">
          <v-btn color="primary" block @click="reload">تطبيق</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Ledger -->
    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="ledger?.entries || []"
        :loading="loading"
        density="comfortable"
        items-per-page="50"
      >
        <template #loading>
          <TableSkeleton :rows="6" :columns="headers.length" />
        </template>
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
        <template #[`item.runningBalance`]="{ item }">
          <span :class="item.runningBalance < 0 ? 'text-error' : ''">
            {{ formatCurrency(item.runningBalance, item.currency) }}
          </span>
        </template>
        <template #[`item.sourceType`]="{ item }">
          <v-chip size="x-small" variant="tonal">{{ sourceLabel(item.sourceType) }}</v-chip>
        </template>
        <template #no-data>
          <EmptyState
            title="لا توجد حركات"
            description="حركات هذا الصندوق (سندات وتحويلات) ستظهر هنا."
            icon="mdi-format-list-bulleted"
            compact
          />
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { useTreasuryStore } from '@/stores/treasury';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatCard from '@/components/StatCard.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
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
  { title: 'التاريخ', key: 'date' },
  { title: 'الرقم', key: 'number' },
  { title: 'الاتجاه', key: 'direction' },
  { title: 'المبلغ', key: 'amount' },
  { title: 'الرصيد بعد الحركة', key: 'runningBalance' },
  { title: 'المصدر', key: 'sourceType' },
  { title: 'البيان', key: 'description' },
];

async function reload() {
  const params = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  await treasuryStore.fetchLedger(route.params.id, params);
}

onMounted(reload);
</script>
