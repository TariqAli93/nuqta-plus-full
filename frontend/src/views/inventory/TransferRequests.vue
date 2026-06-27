<template>
  <div class="page-shell">
    <PageHeader
      title="طلبات نقل المخزون"
      subtitle="إدارة طلبات النقل بين المخازن"
      icon="mdi-transfer"
    >
      <v-btn color="primary" prepend-icon="mdi-plus" :to="{ name: 'StockTransfer' }">
        طلب نقل جديد
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable (client-side display). The status filter stays
         server-side (the list is paginated server-side, so we keep refetching by
         status) via the page-owned #filters control + chips. Approve/reject are
         gated row actions; reject opens the page's own reason dialog. -->
    <SmartTable
      data-testid="transfer-requests-table"
      table-key="transfer-requests-table"
      :headers="headers"
      :items="transfers"
      :loading="loading"
      :page-size="50"
      :row-actions="rowActions"
      :filter-chips="filterChips"
      show-export
      show-print
      print-title="طلبات نقل المخزون"
      export-file-base="transfer-requests"
      empty-title="لا توجد طلبات نقل"
      empty-description="ابدأ بإنشاء طلب نقل جديد للمخزون."
      empty-icon="mdi-transfer"
      @refresh="reload"
      @clear-filters="clearStatusFilter"
      @remove-filter="clearStatusFilter"
    >
      <template #filters>
        <v-select
          v-model="statusFilter"
          :items="statusFilters"
          label="الحالة"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-filter-variant"
          hide-details
          @update:model-value="reload"
        />
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip :color="statusColor(item.status)" size="small">
          {{ statusLabel(item.status) }}
        </v-chip>
      </template>
      <template #[`item.createdAt`]="{ item }">
        {{ formatDate(item.createdAt) }}
      </template>
    </SmartTable>

    <!-- Reject dialog -->
    <v-dialog v-model="rejectDialog" max-width="480">
      <v-card>
        <v-card-title>رفض الطلب</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="rejectReason"
            label="سبب الرفض"
            rows="3"
            auto-grow
            density="comfortable"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="rejectDialog = false">إلغاء</v-btn>
          <v-btn color="error" :loading="acting" @click="submitReject">رفض</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useInventoryStore } from '@/stores/inventory';
import PageHeader from '@/components/PageHeader.vue';
import SmartTable from '@/components/common/SmartTable';

const inventoryStore = useInventoryStore();

const transfers = ref([]);
const loading = ref(false);
const statusFilter = ref(null);

const statusFilters = [
  { title: 'الكل', value: null },
  { title: 'قيد الموافقة', value: 'pending' },
  { title: 'تمت الموافقة', value: 'approved' },
  { title: 'مرفوض', value: 'rejected' },
];

const headers = [
  { title: 'الفرع', key: 'branchName' },
  { title: 'المنتج', key: 'productName' },
  { title: 'من', key: 'fromWarehouseName' },
  { title: 'إلى', key: 'toWarehouseName' },
  { title: 'الكمية', key: 'quantity', format: 'quantity', align: 'end' },
  { title: 'الحالة', key: 'status', exportValue: (r) => statusLabel(r.status) },
  { title: 'الطالب', key: 'requestedByName' },
  { title: 'التاريخ', key: 'createdAt', format: 'datetime' },
];

const statusLabel = (s) =>
  ({ pending: 'قيد الموافقة', approved: 'معتمد', rejected: 'مرفوض' })[s] || s;
const statusColor = (s) =>
  ({ pending: 'warning', approved: 'success', rejected: 'error' })[s] || 'grey';

const formatDate = (v) => {
  if (!v) return '';
  return new Date(v).toLocaleString('ar-IQ', { numberingSystem: 'latn' });
};

const reload = async () => {
  loading.value = true;
  try {
    transfers.value = await inventoryStore.fetchTransfers({
      status: statusFilter.value || undefined,
    });
  } finally {
    loading.value = false;
  }
};

const acting = ref(false);
const confirmApprove = async (row) => {
  acting.value = true;
  try {
    await inventoryStore.approveTransfer(row.id);
    await reload();
  } finally {
    acting.value = false;
  }
};

const rejectDialog = ref(false);
const rejectTarget = ref(null);
const rejectReason = ref('');

const openReject = (row) => {
  rejectTarget.value = row;
  rejectReason.value = '';
  rejectDialog.value = true;
};

const submitReject = async () => {
  acting.value = true;
  try {
    await inventoryStore.rejectTransfer(rejectTarget.value.id, rejectReason.value);
    rejectDialog.value = false;
    await reload();
  } finally {
    acting.value = false;
  }
};

// Approve / reject as gated row actions: shown only for pending requests and only
// to users who can approve warehouse transfers (mirrors the previous v-if).
// Reject keeps the page's own reason dialog rather than a generic confirm.
const rowActions = [
  {
    key: 'approve',
    icon: 'mdi-check',
    title: 'موافقة',
    color: 'success',
    primary: true,
    testId: 'transfer-approve',
    permission: 'approve_warehouse_transfer',
    hidden: (item) => item.status !== 'pending',
    handler: (item) => confirmApprove(item),
  },
  {
    key: 'reject',
    icon: 'mdi-close',
    title: 'رفض',
    color: 'error',
    danger: true,
    primary: true,
    testId: 'transfer-reject',
    permission: 'approve_warehouse_transfer',
    hidden: (item) => item.status !== 'pending',
    handler: (item) => openReject(item),
  },
];

const filterChips = computed(() => {
  if (!statusFilter.value) return [];
  const opt = statusFilters.find((s) => s.value === statusFilter.value);
  return [{ key: 'status', label: `الحالة: ${opt?.title ?? statusFilter.value}` }];
});

const clearStatusFilter = () => {
  statusFilter.value = null;
  reload();
};

onMounted(reload);
</script>
