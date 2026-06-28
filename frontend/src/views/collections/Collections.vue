<template>
  <div class="page-shell">
    <PageHeader
      title="التحصيل"
      subtitle="إدارة تحصيل أقساط العملاء — المستحق، المتأخر، والمدفوع"
      icon="mdi-cash-multiple"
      icon-color="primary"
    >
      <v-btn
        variant="tonal"
        color="primary"
        size="default"
        prepend-icon="mdi-refresh"
        :loading="isSearching"
        @click="reloadAll"
      >
        تحديث
      </v-btn>
    </PageHeader>

    <!-- ── Summary stat cards ─────────────────────────────────────────────── -->
    <div class="stats-grid">
      <StatCard
        label="مستحق اليوم"
        :value="stats.dueTodayCount"
        icon="mdi-calendar-today"
        icon-color="info"
      />
      <StatCard
        label="أقساط متأخرة"
        :value="stats.overdueCount"
        icon="mdi-alert-circle-outline"
        icon-color="error"
      />
      <StatCard label="إجمالي المستحق" icon="mdi-cash" icon-color="primary">
        <template #value>
          <div v-if="stats.dueByCurrency.length" class="cur-list">
            <div v-for="c in stats.dueByCurrency" :key="c.currency">
              {{ formatCurrency(c.amount, c.currency) }}
            </div>
          </div>
          <span v-else>{{ formatCurrency(0, 'IQD') }}</span>
        </template>
      </StatCard>
      <StatCard label="إجمالي المتأخر" icon="mdi-cash-clock" icon-color="error">
        <template #value>
          <div v-if="stats.overdueByCurrency.length" class="cur-list">
            <div v-for="c in stats.overdueByCurrency" :key="c.currency" class="text-error">
              {{ formatCurrency(c.amount, c.currency) }}
            </div>
          </div>
          <span v-else>{{ formatCurrency(0, 'IQD') }}</span>
        </template>
      </StatCard>
      <StatCard
        label="عملاء غير مسدّدين"
        :value="stats.customersWithUnpaid"
        icon="mdi-account-group-outline"
        icon-color="warning"
      />
    </div>

    <!-- ── Quick status filters ───────────────────────────────────────────── -->
    <v-btn-toggle
      :model-value="activeFilter"
      mandatory
      color="primary"
      variant="elevated"
      density="comfortable"
      class="filter-toggle gap-3"
      @update:model-value="onFilterChange"
    >
      <v-btn v-for="f in FILTERS" :key="f.value" :value="f.value" size="small">
        <v-icon start size="16">{{ f.icon }}</v-icon>
        {{ f.label }}
      </v-btn>
    </v-btn-toggle>

    <!-- ── Installments table (server-side, Recipe B) ─────────────────────── -->
    <SmartTable
      table-key="collections-installments"
      :headers="headers"
      :items="items"
      :loading="isSearching"
      :error="error"
      :total-items="pagination.total"
      :page="page"
      :page-size="pageSize"
      :search="query"
      :row-actions="rowActions"
      :row-class="rowClass"
      server-side
      :initial-load="false"
      search-placeholder="بحث: اسم العميل، رقم الفاتورة، رقم القسط…"
      show-export
      show-print
      print-title="أقساط التحصيل"
      export-file-base="collections-installments"
      :empty-title="emptyTitle"
      empty-description="لا توجد أقساط مطابقة لهذا الفلتر ضمن نطاقك."
      empty-icon="mdi-cash-check"
      @update:search="onQueryChange"
      @search-now="runNow"
      @clear-search="clear"
      @update:page="setPage"
      @update:page-size="setPageSize"
      @refresh="reloadAll"
    >
      <template #[`item.customerName`]="{ item }">
        <RouterLink
          v-if="item.customerId"
          :to="`/customers/${item.customerId}`"
          class="text-primary text-decoration-none font-weight-medium"
        >
          {{ item.customerName || '—' }}
        </RouterLink>
        <span v-else>{{ item.customerName || '—' }}</span>
      </template>

      <template #[`item.invoiceNumber`]="{ item }">
        <RouterLink
          v-if="item.saleId"
          :to="`/sales/${item.saleId}`"
          class="text-primary text-decoration-none"
        >
          {{ item.invoiceNumber || `#${item.saleId}` }}
        </RouterLink>
        <span v-else>—</span>
      </template>

      <template #[`item.remainingAmount`]="{ item }">
        <span
          :class="item.remainingAmount > 0 ? 'text-error font-weight-bold' : 'text-medium-emphasis'"
        >
          {{ formatCurrency(item.remainingAmount, item.currency) }}
        </span>
      </template>

      <template #[`item.overdueDays`]="{ item }">
        <v-chip
          v-if="item.overdueDays > 0"
          :color="agingColor(item.overdueDays)"
          size="x-small"
          label
        >
          {{ item.overdueDays }} يوم
        </v-chip>
        <span v-else class="text-medium-emphasis">—</span>
      </template>

      <template #[`item.status`]="{ item }">
        <v-chip :color="statusMeta(item).color" size="x-small" variant="flat" label>
          {{ statusMeta(item).label }}
        </v-chip>
      </template>
    </SmartTable>

    <!-- ── Collect installment dialog ─────────────────────────────────────── -->
    <v-dialog v-model="collect.open" max-width="440" persistent>
      <v-card v-if="collect.item" rounded="lg">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="success">mdi-cash-multiple</v-icon>
          قبض القسط
        </v-card-title>
        <v-divider />
        <v-card-text>
          <div class="collect-meta mb-3">
            <div>
              <span class="text-medium-emphasis">العميل:</span>
              {{ collect.item.customerName || '—' }}
            </div>
            <div>
              <span class="text-medium-emphasis">الفاتورة:</span>
              {{ collect.item.invoiceNumber || `#${collect.item.saleId}` }}
              — القسط {{ collect.item.installmentNumber }}
            </div>
            <div>
              <span class="text-medium-emphasis">المتبقي:</span>
              <strong class="text-error">{{
                formatCurrency(collect.item.remainingAmount, collect.item.currency)
              }}</strong>
            </div>
          </div>

          <v-text-field
            :model-value="groupNumber(collect.amount)"
            label="مبلغ التحصيل"
            :suffix="collect.item.currency"
            density="comfortable"
            variant="outlined"
            inputmode="numeric"
            :error-messages="collectError ? [collectError] : []"
            @input="(e) => (collect.amount = parseAmount(e.target.value))"
          />

          <div class="text-caption text-medium-emphasis mb-1">طريقة الدفع</div>
          <v-btn-toggle
            v-model="collect.method"
            mandatory
            color="primary"
            variant="outlined"
            density="comfortable"
            class="mb-3"
          >
            <v-btn value="cash" size="small"><v-icon start size="16">mdi-cash</v-icon> نقدي</v-btn>
            <v-btn value="card" size="small"
              ><v-icon start size="16">mdi-credit-card-outline</v-icon> بطاقة</v-btn
            >
          </v-btn-toggle>

          <v-text-field
            v-model="collect.note"
            label="ملاحظة (اختياري)"
            density="comfortable"
            variant="outlined"
            hide-details
            maxlength="120"
          />
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="collect.saving" @click="collect.open = false"
            >إلغاء</v-btn
          >
          <v-btn
            color="success"
            variant="flat"
            :loading="collect.saving"
            :disabled="!!collectError"
            @click="submitCollect"
          >
            تأكيد القبض
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useCollectionsStore } from '@/stores/collections';
import { useServerSearch } from '@/composables/useServerSearch';
import PageHeader from '@/components/PageHeader.vue';
import StatCard from '@/components/StatCard.vue';
import SmartTable from '@/components/common/SmartTable';
import { formatCurrency } from '@/utils/helpers';
import { groupNumber, parseAmount } from '@/composables/sales/moneyInput';

const collectionsStore = useCollectionsStore();

// Today (local) in YYYY-MM-DD — for the "due today" row highlight.
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const todayYmd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/* ── Quick status filters ─────────────────────────────────────────────────── */
const FILTERS = [
  { value: 'all', label: 'الكل', icon: 'mdi-format-list-bulleted' },
  { value: 'due_today', label: 'مستحق اليوم', icon: 'mdi-calendar-today' },
  { value: 'overdue', label: 'متأخر', icon: 'mdi-alert-circle-outline' },
  { value: 'due_7d', label: 'خلال 7 أيام', icon: 'mdi-calendar-week' },
  { value: 'unpaid', label: 'غير مدفوع', icon: 'mdi-cash-clock' },
  { value: 'paid', label: 'مدفوع', icon: 'mdi-check-circle-outline' },
];
const activeFilter = ref('all');

const emptyTitle = computed(
  () => `لا توجد أقساط — ${FILTERS.find((f) => f.value === activeFilter.value)?.label || ''}`
);

/* ── Table data + server search ───────────────────────────────────────────── */
const items = ref([]);
const pagination = ref({ page: 1, limit: 25, total: 0, totalPages: 0 });

const applyResult = (res) => {
  items.value = res.data || [];
  pagination.value = res.meta || pagination.value;
};

const {
  query,
  page,
  pageSize,
  isSearching,
  error,
  onQueryChange,
  runNow,
  clear,
  setFilters,
  setPage,
  setPageSize,
  refresh,
} = useServerSearch({
  limit: 25,
  initialFilters: { filter: 'all' },
  // load applies fresh results; apply re-applies a cached response.
  load: async (params, { signal }) => {
    const res = await collectionsStore.listInstallments(params, { signal });
    applyResult(res);
    return res;
  },
  apply: applyResult,
});

const onFilterChange = (val) => {
  if (!val || val === activeFilter.value) return;
  activeFilter.value = val;
  setFilters({ filter: val });
};

/* ── Stats cards ──────────────────────────────────────────────────────────── */
const stats = ref({
  dueTodayCount: 0,
  overdueCount: 0,
  customersWithUnpaid: 0,
  dueByCurrency: [],
  overdueByCurrency: [],
});
const loadStats = async () => {
  try {
    stats.value = await collectionsStore.stats();
  } catch {
    /* keep previous values */
  }
};

const reloadAll = () => {
  refresh();
  loadStats();
};

/* ── Columns ──────────────────────────────────────────────────────────────── */
const headers = [
  { title: 'العميل', key: 'customerName', minWidth: 150 },
  { title: 'الفاتورة', key: 'invoiceNumber' },
  { title: 'القسط', key: 'installmentNumber', format: 'number', align: 'end' },
  { title: 'الاستحقاق', key: 'dueDate', format: 'date' },
  { title: 'قيمة القسط', key: 'dueAmount', format: 'currency', align: 'end' },
  { title: 'المدفوع', key: 'paidAmount', format: 'currency', align: 'end' },
  { title: 'المتبقي', key: 'remainingAmount', format: 'currency', align: 'end' },
  {
    title: 'التأخير',
    key: 'overdueDays',
    align: 'end',
    exportValue: (r) => (r.overdueDays > 0 ? `${r.overdueDays} يوم` : '—'),
  },
  { title: 'الحالة', key: 'status', exportValue: (r) => statusMeta(r).label },
];

/* ── Visual status ────────────────────────────────────────────────────────── */
const agingColor = (days) => {
  if (days > 60) return 'error';
  if (days > 30) return 'warning';
  if (days > 7) return 'orange';
  return 'amber';
};

const statusMeta = (item) => {
  if (item.status === 'paid') return { label: 'مدفوع', color: 'success' };
  if (item.status === 'cancelled') return { label: 'ملغي', color: 'grey' };
  if (item.overdueDays > 0) return { label: 'متأخر', color: 'error' };
  if (item.dueDate === todayYmd) return { label: 'مستحق اليوم', color: 'warning' };
  return { label: 'قادم', color: 'info' };
};

const rowClass = (item) => {
  if (item.status === 'paid') return 'row-paid';
  if (item.status === 'cancelled') return 'row-cancelled';
  if (item.overdueDays > 0) return 'row-overdue';
  if (item.status === 'pending' && item.dueDate === todayYmd) return 'row-today';
  return '';
};

/* ── Row actions ──────────────────────────────────────────────────────────── */
const rowActions = (item) => [
  {
    key: 'collect',
    icon: 'mdi-cash-multiple',
    title: 'قبض القسط',
    color: 'success',
    primary: true,
    hidden: item.status !== 'pending',
    handler: () => openCollect(item),
  },
  {
    key: 'invoice',
    icon: 'mdi-receipt-text-outline',
    title: 'عرض الفاتورة',
    to: `/sales/${item.saleId}`,
  },
  {
    key: 'customer',
    icon: 'mdi-account-arrow-left',
    title: 'فتح ملف العميل',
    to: `/customers/${item.customerId}`,
  },
];

/* ── Collect dialog ───────────────────────────────────────────────────────── */
const collect = reactive({
  open: false,
  item: null,
  amount: 0,
  method: 'cash',
  note: '',
  saving: false,
});

const openCollect = (item) => {
  collect.item = item;
  collect.amount = Number(item.remainingAmount) || 0;
  collect.method = 'cash';
  collect.note = '';
  collect.saving = false;
  collect.open = true;
};

const collectError = computed(() => {
  if (!collect.item) return '';
  const amt = Number(collect.amount) || 0;
  if (amt <= 0) return 'أدخل مبلغاً أكبر من صفر';
  if (amt > Number(collect.item.remainingAmount) + 0.0001) return 'المبلغ يتجاوز المتبقي';
  return '';
});

const submitCollect = async () => {
  if (collectError.value || !collect.item) return;
  collect.saving = true;
  try {
    await collectionsStore.collectInstallment(collect.item.id, {
      amount: Number(collect.amount),
      paymentMethod: collect.method,
      note: collect.note || undefined,
      currency: collect.item.currency,
    });
    collect.open = false;
    reloadAll();
  } catch {
    /* error toast shown by the store */
  } finally {
    collect.saving = false;
  }
};

onMounted(() => {
  refresh();
  loadStats();
});
</script>

<style scoped lang="scss">
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.cur-list {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.filter-toggle {
  flex-wrap: wrap;
  height: auto;
  margin-bottom: 12px;
}

.collect-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.88rem;
}

/* Row tints by status (SmartTable applies the class to the <tr>). */
:deep(tr.row-overdue > td) {
  background: rgba(var(--v-theme-error), 0.06);
}
:deep(tr.row-today > td) {
  background: rgba(var(--v-theme-warning), 0.08);
}
:deep(tr.row-paid > td) {
  background: rgba(var(--v-theme-success), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.6);
}
:deep(tr.row-cancelled > td) {
  text-decoration: line-through;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
</style>
