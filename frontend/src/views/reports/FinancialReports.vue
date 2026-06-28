<template>
  <div class="page-shell">
    <PageHeader
      title="الربح والخسارة والوضع المالي"
      subtitle="أرقامك المالية مستخرجة تلقائياً من البيع والشراء والقبض والدفع — كلها بالدينار"
      icon="mdi-finance"
    />

    <PermissionEmptyState
      v-if="!canReadLedger"
      title="لا تملك صلاحية عرض الحسابات"
      message="تحتاج إلى صلاحية عرض دفتر الأستاذ العام لاستعراض التقارير المالية."
      icon="mdi-lock-outline"
      page-title="التقارير المالية"
      :missing-permissions="[{ label: 'عرض دفتر الأستاذ العام والقيود', permission: 'gl:read' }]"
    />

    <template v-else>
      <v-card class="page-section">
        <v-tabs v-model="tab" color="primary" density="comfortable" show-arrows>
          <v-tab value="trial">فحص توازن الحسابات</v-tab>
          <v-tab value="income">الربح والخسارة</v-tab>
          <v-tab value="balance">الوضع المالي</v-tab>
          <v-tab value="ledger">حركة الحسابات بالتفصيل</v-tab>
        </v-tabs>

        <v-divider />

        <!-- Date range (shared by trial / income / ledger; balance sheet uses as-of) -->
        <v-card-text class="d-flex flex-wrap gap-3 align-center">
          <template v-if="tab !== 'balance'">
            <v-text-field
              v-model="filters.dateFrom"
              type="date"
              label="من"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 170px"
            />
            <v-text-field
              v-model="filters.dateTo"
              type="date"
              label="إلى"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 170px"
            />
          </template>
          <v-text-field
            v-else
            v-model="filters.asOf"
            type="date"
            label="كما في تاريخ"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 200px"
          />
          <v-select
            v-if="tab === 'ledger'"
            v-model="filters.accountId"
            :items="postableAccounts"
            :item-title="(a) => `${a.code} — ${a.name}`"
            item-value="id"
            label="الحساب"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 320px"
          />
          <v-btn color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="reload">
            عرض
          </v-btn>
        </v-card-text>
      </v-card>

      <!-- فحص توازن الحسابات -->
      <template v-if="tab === 'trial'">
        <!-- Unified SmartTable: trial balance is a flat account list; the
           debit/credit totals feed the footer via :summary, and the zero side
           of each account stays blank (slots) to match the original. -->
        <SmartTable
          v-if="trial"
          table-key="trial-balance-table"
          class="page-section"
          :headers="trialHeaders"
          :items="trial.accounts"
          :loading="loading"
          item-value="accountId"
          :summary="{ debit: trial.totals.debit, credit: trial.totals.credit }"
          show-export
          show-print
          print-title="فحص توازن الحسابات"
          export-file-base="trial-balance"
          search-placeholder="ابحث بالرمز أو اسم الحساب..."
        >
          <template #[`item.debit`]="{ item }">
            <span class="font-mono">{{ item.debit ? fmt(item.debit) : '' }}</span>
          </template>
          <template #[`item.credit`]="{ item }">
            <span class="font-mono">{{ item.credit ? fmt(item.credit) : '' }}</span>
          </template>
        </SmartTable>
        <v-alert
          v-if="trial && !trial.totals.balanced"
          type="error"
          variant="tonal"
          density="compact"
          class="page-section"
          text="الحسابات غير متوازنة — راجع «تسجيلات تحتاج مراجعة» في المحاسبة المتقدمة."
        />
      </template>

      <!-- الربح والخسارة -->
      <v-card v-if="tab === 'income'" class="page-section">
        <v-card-text v-if="income">
          <div class="text-subtitle-1 font-weight-bold mb-2 text-success">الإيرادات</div>
          <v-table density="compact">
            <tbody>
              <tr v-for="r in income.revenue" :key="r.code">
                <td>{{ r.name }}</td>
                <td class="text-end font-mono">{{ fmt(r.amount) }}</td>
              </tr>
              <tr class="font-weight-bold">
                <td>إجمالي الإيرادات</td>
                <td class="text-end font-mono text-success">{{ fmt(income.totals.revenue) }}</td>
              </tr>
            </tbody>
          </v-table>

          <div class="text-subtitle-1 font-weight-bold mt-4 mb-2 text-error">المصروفات</div>
          <v-table density="compact">
            <tbody>
              <tr v-for="e in income.expenses" :key="e.code">
                <td>{{ e.name }}</td>
                <td class="text-end font-mono">{{ fmt(e.amount) }}</td>
              </tr>
              <tr class="font-weight-bold">
                <td>إجمالي المصروفات</td>
                <td class="text-end font-mono text-error">{{ fmt(income.totals.expenses) }}</td>
              </tr>
            </tbody>
          </v-table>

          <v-divider class="my-3" />
          <div class="d-flex justify-space-between align-center text-h6">
            <span>صافي الربح</span>
            <span
              class="font-mono"
              :class="income.totals.netProfit >= 0 ? 'text-success' : 'text-error'"
            >
              {{ fmt(income.totals.netProfit) }}
            </span>
          </div>
        </v-card-text>
      </v-card>

      <!-- الوضع المالي -->
      <v-card v-if="tab === 'balance'" class="page-section">
        <v-row v-if="balance" no-gutters>
          <v-col cols="12" md="6" class="pa-3">
            <div class="text-subtitle-1 font-weight-bold mb-2">ما تملكه (الأصول)</div>
            <v-table density="compact">
              <tbody>
                <tr v-for="a in balance.assets" :key="a.code">
                  <td>{{ a.name }}</td>
                  <td class="text-end font-mono">{{ fmt(a.amount) }}</td>
                </tr>
                <tr class="font-weight-bold">
                  <td>إجمالي ما تملكه</td>
                  <td class="text-end font-mono">{{ fmt(balance.totals.assets) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-col>
          <v-col cols="12" md="6" class="pa-3">
            <div class="text-subtitle-1 font-weight-bold mb-2">
              ما عليك ورأس مالك (الخصوم وحقوق الملكية)
            </div>
            <v-table density="compact">
              <tbody>
                <tr v-for="l in balance.liabilities" :key="l.code">
                  <td>{{ l.name }}</td>
                  <td class="text-end font-mono">{{ fmt(l.amount) }}</td>
                </tr>
                <tr v-for="e in balance.equity" :key="e.code + e.name">
                  <td>{{ e.name }}</td>
                  <td class="text-end font-mono">{{ fmt(e.amount) }}</td>
                </tr>
                <tr class="font-weight-bold">
                  <td>إجمالي ما عليك ورأس مالك</td>
                  <td class="text-end font-mono">{{ fmt(balance.totals.liabilitiesAndEquity) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-col>
        </v-row>
        <v-alert
          v-if="balance && !balance.totals.balanced"
          type="error"
          variant="tonal"
          density="compact"
          class="ma-3"
          text="الوضع المالي غير متوازن — راجع «تسجيلات تحتاج مراجعة» في المحاسبة المتقدمة."
        />
      </v-card>

      <!-- حركة الحسابات بالتفصيل -->
      <template v-if="tab === 'ledger'">
        <!-- Unified SmartTable: account movement. The opening balance is prepended
           as a synthetic first row; sorting is off so the running balance stays
           in order, and closing totals feed the footer via :summary. -->
        <SmartTable
          v-if="ledger"
          table-key="general-ledger-table"
          class="page-section"
          :headers="ledgerHeaders"
          :items="ledgerRows"
          :loading="loading"
          :summary="{
            debit: ledger.totals.debit,
            credit: ledger.totals.credit,
            balance: ledger.totals.closing,
          }"
          show-export
          show-print
          print-title="حركة الحسابات بالتفصيل"
          export-file-base="general-ledger"
          search-placeholder="ابحث في البيان أو رقم التسجيل..."
        >
          <template #[`item.debit`]="{ item }">
            <span class="font-mono">{{ item.debit ? fmt(item.debit) : '' }}</span>
          </template>
          <template #[`item.credit`]="{ item }">
            <span class="font-mono">{{ item.credit ? fmt(item.credit) : '' }}</span>
          </template>
          <template #[`item.balance`]="{ item }">
            <span class="font-mono">{{ fmt(item.balance) }}</span>
          </template>
        </SmartTable>
        <EmptyState
          v-else
          title="اختر حساباً"
          description="اختر حساباً من القائمة واضغط «عرض» لاستعراض حركته."
          icon="mdi-book-open-variant"
        />
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useGlStore } from '@/stores/gl';
import { useAuthStore } from '@/stores/auth';
import SmartTable from '@/components/common/SmartTable';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import PermissionEmptyState from '@/components/PermissionEmptyState.vue';
import { formatCurrency } from '@/utils/formatters';

const glStore = useGlStore();
const authStore = useAuthStore();

// The page is reachable with `reports:read_financial`, but the underlying GL
// endpoints (trial balance / income / balance sheet / ledger / accounts list)
// require `gl:read`. Guard every fetch so a user without it never triggers a
// 403 toast, and show an empty state instead.
const canReadLedger = computed(() => authStore.hasPermission('gl:read'));

const tab = ref('trial');
const loading = ref(false);
const trial = ref(null);
const income = ref(null);
const balance = ref(null);
const ledger = ref(null);
const postableAccounts = computed(() => glStore.postableAccounts);

const today = new Date().toISOString().slice(0, 10);
const filters = reactive({ dateFrom: '', dateTo: '', asOf: today, accountId: null });

const fmt = (v) => formatCurrency(v, 'IQD');

// SmartTable column configs. debit/credit/balance are templated (blank on zero,
// running balance) so `format` here only types the export; sorting is off on the
// ledger so the running balance keeps its chronological order.
const trialHeaders = [
  { title: 'الرمز', key: 'code', ltr: true, format: 'text', minWidth: 110 },
  { title: 'الحساب', key: 'name', format: 'text', minWidth: 200 },
  { title: 'داخل', key: 'debit', align: 'start', format: 'currency' },
  { title: 'خارج', key: 'credit', align: 'start', format: 'currency' },
];

const ledgerHeaders = [
  { title: 'التاريخ', key: 'entryDate', format: 'date', sortable: false },
  { title: 'التسجيل', key: 'entryNumber', ltr: true, format: 'text', sortable: false },
  { title: 'البيان', key: 'description', format: 'text', sortable: false, minWidth: 220 },
  { title: 'داخل', key: 'debit', align: 'start', format: 'currency', sortable: false },
  { title: 'خارج', key: 'credit', align: 'start', format: 'currency', sortable: false },
  { title: 'الرصيد', key: 'balance', align: 'start', format: 'currency', sortable: false },
];

// Prepend the opening balance as a synthetic first row so it appears (and
// exports) inline, matching the original opening-balance line.
const ledgerRows = computed(() => {
  if (!ledger.value) return [];
  const opening = {
    entryDate: null,
    entryNumber: null,
    description: 'رصيد بداية التشغيل',
    debit: null,
    credit: null,
    balance: ledger.value.opening,
  };
  return [opening, ...(ledger.value.lines || [])];
});

async function reload() {
  if (!canReadLedger.value) return; // no gl:read → don't hit the API
  loading.value = true;
  try {
    const range = { dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined };
    if (tab.value === 'trial') trial.value = await glStore.fetchTrialBalance(range);
    else if (tab.value === 'income') income.value = await glStore.fetchIncomeStatement(range);
    else if (tab.value === 'balance')
      balance.value = await glStore.fetchBalanceSheet({ asOf: filters.asOf || undefined });
    else if (tab.value === 'ledger' && filters.accountId)
      ledger.value = await glStore.fetchGeneralLedger({ ...range, accountId: filters.accountId });
  } catch (err) {
    console.error('Failed to load financial report', err);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!canReadLedger.value) return; // no gl:read → skip all secondary fetches
  if (postableAccounts.value.length === 0) {
    try {
      await glStore.fetchAccounts();
    } catch {
      /* ignore */
    }
  }
  await reload();
});
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
