<template>
  <div class="page-shell">
    <PageHeader
      title="التحصيل — الأقساط المتأخرة"
      subtitle="متابعة الأقساط المتأخرة عن موعد الاستحقاق"
      icon="mdi-alert-circle-outline"
      icon-color="error"
    >
      <v-btn
        variant="tonal"
        color="primary"
        size="default"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="refresh"
      >
        تحديث
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable (Recipe A): one @update:options handler drives the
         /collections/overdue fetch; aging / date-range / branch filters live in
         the toolbar popover. No client search (the endpoint has no search). -->
    <SmartTable
      v-model:filter-values="filterValues"
      table-key="collections-table"
      :headers="headers"
      :items="items"
      :loading="loading"
      :total-items="total"
      :row-actions="rowActions"
      server-side
      :show-search="false"
      :filters="filterDefs"
      :page-size="50"
      show-export
      show-print
      print-title="الأقساط المتأخرة"
      export-file-base="overdue-installments"
      empty-title="لا توجد أقساط متأخرة"
      empty-description="جميع الأقساط ضمن نطاقك مدفوعة أو مستحقة بعد اليوم."
      empty-icon="mdi-check-circle"
      @update:options="onOptions"
      @refresh="refresh"
    >
      <template #[`item.customerName`]="{ item }">
        <RouterLink
          :to="`/customers/${item.customerId}`"
          class="text-primary text-decoration-none"
        >
          {{ item.customerName || '—' }}
        </RouterLink>
      </template>
      <template #[`item.invoiceNumber`]="{ item }">
        <RouterLink
          v-if="item.saleId"
          :to="`/sales/${item.saleId}`"
          class="text-primary text-decoration-none"
        >
          {{ item.invoiceNumber || `#${item.saleId}` }}
        </RouterLink>
      </template>
      <template #[`item.remainingAmount`]="{ item }">
        <span class="text-error font-weight-bold">
          {{ formatCurrency(item.remainingAmount, item.currency) }}
        </span>
      </template>
      <template #[`item.overdueDays`]="{ item }">
        <v-chip :color="agingColor(item.overdueDays)" size="x-small">
          {{ item.overdueDays }} يوم
        </v-chip>
      </template>
    </SmartTable>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useCollectionsStore } from '@/stores/collections';
import { useAuthStore } from '@/stores/auth';
import * as uiAccess from '@/auth/uiAccess.js';
import PageHeader from '@/components/PageHeader.vue';
import SmartTable from '@/components/common/SmartTable';
import { formatCurrency } from '@/utils/helpers';

const collectionsStore = useCollectionsStore();
const authStore = useAuthStore();

const loading = ref(false);
const items = ref([]);
const total = ref(0);

const filterValues = ref({
  agingBucket: null,
  startDate: null,
  endDate: null,
  branchId: null,
});

const userRole = computed(() => authStore.user?.role);
const canPickBranch = computed(() => uiAccess.isGlobalAdmin(userRole.value));

const agingBuckets = [
  { title: '1–7 أيام', value: '1-7' },
  { title: '8–30 يوم', value: '8-30' },
  { title: '31–60 يوم', value: '31-60' },
  { title: 'أكثر من 60 يوم', value: '60+' },
];

const headers = [
  { title: 'العميل', key: 'customerName', minWidth: 140 },
  { title: 'الهاتف', key: 'customerPhone' },
  { title: 'الفاتورة', key: 'invoiceNumber' },
  { title: 'الفرع', key: 'branchName' },
  { title: 'القسط', key: 'installmentNumber', format: 'number', align: 'end' },
  { title: 'الاستحقاق', key: 'dueDate', format: 'date' },
  { title: 'المبلغ', key: 'dueAmount', format: 'currency', align: 'end' },
  { title: 'المتبقي', key: 'remainingAmount', format: 'currency', align: 'end' },
  { title: 'تأخر', key: 'overdueDays', exportValue: (r) => `${r.overdueDays} يوم` },
];

// Branch picker is admin-only, so the branch filter is added conditionally.
const filterDefs = computed(() => {
  const defs = [
    {
      key: 'agingBucket',
      type: 'select',
      label: 'فترة التأخر',
      icon: 'mdi-clock-alert-outline',
      options: agingBuckets,
    },
    { type: 'date-range', label: 'الفترة الزمنية', fromKey: 'startDate', toKey: 'endDate' },
  ];
  if (canPickBranch.value) {
    defs.push({
      key: 'branchId',
      type: 'text',
      label: 'رقم الفرع (اختياري)',
      icon: 'mdi-source-branch',
    });
  }
  return defs;
});

const rowActions = [
  {
    key: 'open',
    icon: 'mdi-account-arrow-left',
    title: 'فتح الملف',
    to: (item) => `/customers/${item.customerId}`,
    primary: true,
  },
];

const agingColor = (days) => {
  if (days > 60) return 'error';
  if (days > 30) return 'warning';
  if (days > 7) return 'orange';
  return 'amber';
};

const lastOpts = ref({ page: 1, itemsPerPage: 50 });

const reload = async () => {
  loading.value = true;
  try {
    const params = { page: lastOpts.value.page, limit: lastOpts.value.itemsPerPage };
    if (filterValues.value.agingBucket) params.agingBucket = filterValues.value.agingBucket;
    if (filterValues.value.startDate) params.startDate = filterValues.value.startDate;
    if (filterValues.value.endDate) params.endDate = filterValues.value.endDate;
    if (filterValues.value.branchId) params.branchId = Number(filterValues.value.branchId);
    const res = await collectionsStore.overdue(params);
    items.value = res.data;
    total.value = Number(res.meta?.total) || 0;
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const onOptions = ({ page, itemsPerPage }) => {
  lastOpts.value = { page, itemsPerPage };
  reload();
};

const refresh = () => reload();
</script>
