<template>
  <div class="page-shell">
    <PageHeader
      title="التسجيلات المالية"
      subtitle="كل عملية بيع وشراء وقبض ودفع تُسجَّل هنا تلقائياً. ويمكن إضافة تسجيل يدوي (قيد يومي للمحاسب)"
      icon="mdi-book-open-variant"
    >
      <v-btn
        v-if="canPostManual"
        color="primary"
        prepend-icon="mdi-pencil-plus"
        @click="openManual"
      >
        تسجيل يدوي
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable (Recipe A: SmartTable owns pagination + filters and
         drives fetching via @update:options). The journal API has no text
         search, so search is off; source/status/date filters live in the
         advanced-filter popover. Row click opens the read-only detail dialog. -->
    <SmartTable
      v-model:filter-values="filterValues"
      table-key="journal-entries-table"
      :headers="headers"
      :items="entries"
      :loading="loading"
      :total-items="pagination.total"
      server-side
      :show-search="false"
      :page="pagination.page"
      :page-size="pagination.limit"
      :filters="filterDefs"
      :open-on-row-click="false"
      show-export
      show-print
      print-title="التسجيلات المالية"
      export-file-base="journal-entries"
      :export-fetcher="fetchAllForExport"
      empty-title="لا توجد تسجيلات بعد"
      empty-description="ستظهر التسجيلات المالية هنا تلقائياً بعد كل عملية بيع أو شراء أو قبض أو دفع."
      empty-icon="mdi-book-outline"
      @update:options="loadEntries"
      @refresh="loadEntries"
      @row-click="openDetail($event.id)"
    >
      <template #[`item.entryNumber`]="{ item }">
        <span class="font-mono">{{ item.entryNumber }}</span>
      </template>
      <template #[`item.sourceType`]="{ item }">
        <v-chip size="x-small" variant="tonal" :color="sourceColor(item.sourceType)">
          {{ sourceLabel(item.sourceType) }}
        </v-chip>
      </template>
      <template #[`item.totalDebitBase`]="{ item }">
        <span class="font-mono">{{ formatCurrency(item.totalDebitBase, 'IQD') }}</span>
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip
          size="x-small"
          :color="item.status === 'reversed' ? 'grey' : 'success'"
          variant="tonal"
        >
          {{ item.status === 'reversed' ? 'ملغى' : 'مُسجّل' }}
        </v-chip>
      </template>
    </SmartTable>

    <!-- Detail dialog -->
    <v-dialog v-model="detailDialog" max-width="760">
      <v-card v-if="detail">
        <v-card-title class="dialog-title">
          <v-icon>mdi-book-open-variant</v-icon>
          <span>تسجيل رقم {{ detail.entryNumber }}</span>
          <v-chip v-if="detail.status === 'reversed'" size="small" color="grey" variant="tonal" class="ms-2">
            ملغى
          </v-chip>
          <v-chip v-if="detail.isOpening" size="small" color="info" variant="tonal" class="ms-2">رصيد بداية التشغيل</v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <div class="d-flex flex-wrap gap-4 mb-3 text-body-2">
            <div><span class="text-medium-emphasis">التاريخ:</span> {{ detail.entryDate }}</div>
            <div><span class="text-medium-emphasis">المصدر:</span> {{ sourceLabel(detail.sourceType) }}</div>
            <div v-if="detail.branchName"><span class="text-medium-emphasis">الفرع:</span> {{ detail.branchName }}</div>
          </div>
          <div class="mb-3 text-body-2">{{ detail.description }}</div>
          <v-table density="compact">
            <thead>
              <tr>
                <th class="text-start">الحساب</th>
                <th class="text-end">داخل</th>
                <th class="text-end">خارج</th>
                <th class="text-start">العملة</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in detail.lines" :key="l.id">
                <td>
                  <span class="font-mono text-caption">{{ l.accountCode }}</span> {{ l.accountName }}
                  <div v-if="l.description" class="text-caption text-medium-emphasis">{{ l.description }}</div>
                </td>
                <td class="text-end font-mono">{{ l.debit ? formatCurrency(l.debit, l.currency) : '' }}</td>
                <td class="text-end font-mono">{{ l.credit ? formatCurrency(l.credit, l.currency) : '' }}</td>
                <td>{{ l.currency }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="font-weight-bold">
                <td>الإجمالي (د.ع)</td>
                <td class="text-end font-mono">{{ formatCurrency(detail.totalDebitBase, 'IQD') }}</td>
                <td class="text-end font-mono">{{ formatCurrency(detail.totalCreditBase, 'IQD') }}</td>
                <td></td>
              </tr>
            </tfoot>
          </v-table>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-btn
            v-if="canPostManual && detail.sourceType === 'manual' && detail.status === 'posted'"
            color="error"
            variant="text"
            prepend-icon="mdi-undo"
            @click="reverse(detail)"
          >
            إلغاء التسجيل
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="detailDialog = false">إغلاق</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Manual entry dialog -->
    <ManualJournalForm v-model="manualDialog" :accounts="postableAccounts" @saved="onManualSaved" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useGlStore } from '@/stores/gl';
import { useAuthStore } from '@/stores/auth';
import api from '@/plugins/axios';
import SmartTable from '@/components/common/SmartTable';
import PageHeader from '@/components/PageHeader.vue';
import ManualJournalForm from '@/views/gl/ManualJournalForm.vue';
import { formatCurrency } from '@/utils/formatters';

const glStore = useGlStore();
const authStore = useAuthStore();

const loading = computed(() => glStore.loading);
const entries = computed(() => glStore.entries);
const pagination = computed(() => glStore.entriesPagination);
const postableAccounts = computed(() => glStore.postableAccounts);
const canPostManual = computed(() => authStore.can?.('canPostManualJournal'));

const SOURCE_META = {
  manual: { label: 'يدوي', color: 'primary' },
  sale: { label: 'بيع', color: 'success' },
  sale_return: { label: 'مرتجع بيع', color: 'warning' },
  payment: { label: 'دفعة', color: 'teal' },
  expense: { label: 'مصروف', color: 'orange' },
  voucher: { label: 'وصل', color: 'cyan' },
  purchase: { label: 'شراء', color: 'indigo' },
  purchase_return: { label: 'مرتجع شراء', color: 'deep-orange' },
  treasury_transfer: { label: 'تحويل', color: 'blue-grey' },
  shift_variance: { label: 'فرق وردية', color: 'red' },
  opening_balance: { label: 'رصيد بداية التشغيل', color: 'info' },
  reversal: { label: 'إلغاء', color: 'grey' },
};
const sourceLabel = (t) => SOURCE_META[t]?.label || t;
const sourceColor = (t) => SOURCE_META[t]?.color || 'grey';
const sourceOptions = Object.entries(SOURCE_META).map(([value, m]) => ({ value, title: m.label }));

// SmartTable column config. Source/amount/status cells are templated above; the
// `format`/`exportValue` here drive the export + print typing.
const headers = [
  { title: 'رقم التسجيل', key: 'entryNumber', ltr: true, sortable: false, minWidth: 130 },
  { title: 'التاريخ', key: 'entryDate', format: 'date', sortable: false },
  {
    title: 'المصدر',
    key: 'sourceType',
    sortable: false,
    exportValue: (r) => sourceLabel(r.sourceType),
  },
  { title: 'البيان', key: 'description', format: 'longtext', sortable: false, maxWidth: 320 },
  {
    title: 'المبلغ (د.ع)',
    key: 'totalDebitBase',
    align: 'end',
    format: 'number',
    sortable: false,
    exportTotal: true,
  },
  {
    title: 'الحالة',
    key: 'status',
    align: 'center',
    sortable: false,
    exportValue: (r) => (r.status === 'reversed' ? 'ملغى' : 'مُسجّل'),
  },
];

// Advanced-filter definitions (source type, status, date range) → built into
// the popover + chips by SmartTable, surfaced back through @update:options.
const filterDefs = [
  { key: 'sourceType', type: 'select', label: 'نوع المصدر', options: sourceOptions },
  {
    key: 'status',
    type: 'select',
    label: 'الحالة',
    options: [
      { title: 'مُرحّل', value: 'posted' },
      { title: 'معكوس', value: 'reversed' },
    ],
  },
  {
    type: 'date-range',
    label: 'التاريخ',
    fromKey: 'dateFrom',
    toKey: 'dateTo',
    field: 'entryDate',
  },
];
const filterValues = ref({});

const detailDialog = ref(false);
const detail = ref(null);
const manualDialog = ref(false);

// Last requested options, so refresh and the export-all fetcher reuse the
// active page/filters instead of resetting them.
const lastOptions = ref({ page: 1, itemsPerPage: pagination.value.limit, filters: {} });

function buildParams({ forExport = false } = {}) {
  const { page, itemsPerPage, filters } = lastOptions.value;
  const f = filters || {};
  const params = {
    page: forExport ? 1 : page || 1,
    limit: forExport ? 10000 : itemsPerPage || pagination.value.limit,
  };
  if (f.sourceType) params.sourceType = f.sourceType;
  if (f.status) params.status = f.status;
  if (f.dateFrom) params.dateFrom = f.dateFrom;
  if (f.dateTo) params.dateTo = f.dateTo;
  return params;
}

function loadEntries(opts = {}) {
  lastOptions.value = { ...lastOptions.value, ...opts };
  return glStore.fetchEntries(buildParams());
}

// Export "all results": query the API directly so the visible page isn't
// clobbered by the store mutating its own list.
async function fetchAllForExport() {
  const res = await api.get('/gl/journal', { params: buildParams({ forExport: true }) });
  return res?.data || [];
}

async function openDetail(id) {
  detail.value = await glStore.fetchEntry(id);
  detailDialog.value = true;
}

function openManual() {
  manualDialog.value = true;
}

async function onManualSaved() {
  manualDialog.value = false;
  lastOptions.value.page = 1;
  await loadEntries({ page: 1 });
}

async function reverse(entry) {
  const reason = prompt('سبب الإلغاء (اختياري):') || null;
  try {
    await glStore.reverseEntry(entry.id, reason);
    detailDialog.value = false;
    await loadEntries();
  } catch (err) {
    console.error('Failed to reverse entry', err);
  }
}

onMounted(async () => {
  // Accounts power the manual-entry account picker.
  if (postableAccounts.value.length === 0) {
    try {
      await glStore.fetchAccounts();
    } catch {
      /* ignore */
    }
  }
  await loadEntries();
});
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
