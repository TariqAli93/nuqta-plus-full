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

    <!-- Filters -->
    <v-card class="page-section">
      <v-card-text class="d-flex flex-wrap gap-3 align-center">
        <v-select
          v-model="filters.sourceType"
          :items="sourceOptions"
          item-title="label"
          item-value="value"
          label="نوع المصدر"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          style="max-width: 220px"
          @update:model-value="reload"
        />
        <v-select
          v-model="filters.status"
          :items="[{ label: 'مُرحّل', value: 'posted' }, { label: 'معكوس', value: 'reversed' }]"
          item-title="label"
          item-value="value"
          label="الحالة"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          style="max-width: 160px"
          @update:model-value="reload"
        />
        <v-text-field
          v-model="filters.dateFrom"
          type="date"
          label="من"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 170px"
          @update:model-value="reload"
        />
        <v-text-field
          v-model="filters.dateTo"
          type="date"
          label="إلى"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 170px"
          @update:model-value="reload"
        />
      </v-card-text>
    </v-card>

    <v-card class="page-section">
      <v-card-text v-if="!loading && entries.length === 0">
        <EmptyState title="لا توجد تسجيلات بعد" description="ستظهر التسجيلات المالية هنا تلقائياً بعد كل عملية بيع أو شراء أو قبض أو دفع." icon="mdi-book-outline" />
      </v-card-text>
      <v-table v-else density="comfortable">
        <thead>
          <tr>
            <th class="text-start">رقم التسجيل</th>
            <th class="text-start">التاريخ</th>
            <th class="text-start">المصدر</th>
            <th class="text-start">البيان</th>
            <th class="text-end">المبلغ (د.ع)</th>
            <th class="text-center">الحالة</th>
            <th class="text-end"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id" class="cursor-pointer" @click="openDetail(e.id)">
            <td class="font-mono">{{ e.entryNumber }}</td>
            <td>{{ e.entryDate }}</td>
            <td>
              <v-chip size="x-small" variant="tonal" :color="sourceColor(e.sourceType)">
                {{ sourceLabel(e.sourceType) }}
              </v-chip>
            </td>
            <td class="text-truncate" style="max-width: 280px">{{ e.description }}</td>
            <td class="text-end font-mono">{{ formatCurrency(e.totalDebitBase, 'IQD') }}</td>
            <td class="text-center">
              <v-chip size="x-small" :color="e.status === 'reversed' ? 'grey' : 'success'" variant="tonal">
                {{ e.status === 'reversed' ? 'ملغى' : 'مُسجّل' }}
              </v-chip>
            </td>
            <td class="text-end">
              <v-icon size="18" color="grey">mdi-chevron-left</v-icon>
            </td>
          </tr>
        </tbody>
      </v-table>

      <div v-if="pagination.totalPages > 1" class="d-flex justify-center pa-3">
        <v-pagination
          v-model="filters.page"
          :length="pagination.totalPages"
          density="comfortable"
          @update:model-value="reload"
        />
      </div>
    </v-card>

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
import { computed, onMounted, reactive, ref } from 'vue';
import { useGlStore } from '@/stores/gl';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
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
const sourceOptions = Object.entries(SOURCE_META).map(([value, m]) => ({ value, label: m.label }));

const filters = reactive({ page: 1, sourceType: null, status: null, dateFrom: '', dateTo: '' });

const detailDialog = ref(false);
const detail = ref(null);
const manualDialog = ref(false);

async function reload() {
  await glStore.fetchEntries({
    page: filters.page,
    sourceType: filters.sourceType || undefined,
    status: filters.status || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });
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
  filters.page = 1;
  await reload();
}

async function reverse(entry) {
  const reason = prompt('سبب الإلغاء (اختياري):') || null;
  try {
    await glStore.reverseEntry(entry.id, reason);
    detailDialog.value = false;
    await reload();
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
  await reload();
});
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
