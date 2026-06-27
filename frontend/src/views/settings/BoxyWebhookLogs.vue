<template>
  <div class="page-shell">
    <PageHeader
      title="سجل الـ Webhook — Boxy"
      subtitle="الإعدادات ← التكاملات ← موفّرو التوصيل ← Boxy ← سجل الـ Webhook (للتشخيص)"
      icon="mdi-webhook"
    >
      <v-btn variant="text" prepend-icon="mdi-arrow-right" to="/settings/integrations/delivery-providers/boxy">
        رجوع
      </v-btn>
    </PageHeader>

    <v-alert v-if="!canView" type="warning" variant="tonal" class="page-section">
      لا تملك صلاحية عرض سجل الـ Webhook.
    </v-alert>

    <template v-else>
      <v-alert type="info" variant="tonal" density="compact" class="mb-3">
        هذه الشاشة للتشخيص فقط — تعرض كل محاولة Webhook واردة من Boxy.
      </v-alert>

      <!-- Unified SmartTable (Recipe A): one @update:options handler drives the
           webhook-logs fetch; result / status / date filters live in the toolbar
           popover. No client search (the endpoint has no search param). -->
      <SmartTable
        v-model:filter-values="filterValues"
        table-key="boxy-webhook-logs-table"
        :headers="headers"
        :items="logs"
        :loading="loading"
        :total-items="total"
        :row-actions="rowActions"
        server-side
        :show-search="false"
        :filters="filterDefs"
        :page-size="20"
        :page-size-options="[10, 20, 50, 100]"
        show-export
        export-file-base="boxy-webhook-logs"
        empty-title="لا توجد سجلات Webhook"
        empty-description="لم تُستلم أي محاولة Webhook من Boxy بعد."
        empty-icon="mdi-webhook"
        @update:options="onOptions"
        @refresh="load"
      >
        <template #[`item.receivedAt`]="{ item }">{{ fmtDate(item.receivedAt) }}</template>

        <template #[`item.status`]="{ item }">
          <v-chip :color="item.status === 'processed' ? 'success' : 'error'" size="small" variant="tonal">
            <v-icon start size="14">
              {{ item.status === 'processed' ? 'mdi-check-circle' : 'mdi-alert-circle' }}
            </v-icon>
            {{ item.status === 'processed' ? 'تمت المعالجة' : 'فشل' }}
          </v-chip>
        </template>

        <template #[`item.shipmentNumber`]="{ item }">
          <RouterLink v-if="item.shipmentId" :to="`/delivery/shipments/${item.shipmentId}`">
            {{ item.shipmentNumber || `#${item.shipmentId}` }}
          </RouterLink>
          <span v-else class="text-disabled">لا يوجد</span>
        </template>

        <template #[`item.errorMessage`]="{ item }">
          <span v-if="item.errorMessage" class="text-error">{{ item.errorMessage }}</span>
          <span v-else class="text-disabled">—</span>
        </template>
      </SmartTable>
    </template>

    <!-- Raw payload viewer -->
    <v-dialog v-model="payloadDialog" max-width="640" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-code-json</v-icon>
          <span>Payload الخام</span>
          <v-spacer />
          <v-btn size="small" variant="text" prepend-icon="mdi-content-copy" @click="copyPayload">نسخ</v-btn>
        </v-card-title>
        <v-divider />
        <v-card-text>
          <pre class="payload">{{ payloadText }}</pre>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="payloadDialog = false">إغلاق</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notification';
import { DELIVERY_STATUSES, statusMeta } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';
import SmartTable from '@/components/common/SmartTable';

const store = useDeliveryProviderStore();
const authStore = useAuthStore();
const notify = useNotificationStore();

const canView = computed(() => authStore.hasPermission('delivery_webhooks:view'));

const logs = ref([]);
const loading = ref(false);
const total = ref(0);
const filterValues = ref({ status: null, normalizedStatus: null, dateFrom: null, dateTo: null });

const payloadDialog = ref(false);
const payloadText = ref('');

const headers = [
  { title: 'وقت الاستلام', key: 'receivedAt', format: 'datetime' },
  {
    title: 'النتيجة',
    key: 'status',
    exportValue: (r) => (r.status === 'processed' ? 'تمت المعالجة' : 'فشل'),
  },
  {
    title: 'الشحنة المطابقة',
    key: 'shipmentNumber',
    exportValue: (r) => r.shipmentNumber || (r.shipmentId ? `#${r.shipmentId}` : 'لا يوجد'),
  },
  { title: 'حالة المزوّد', key: 'providerStatus', format: 'text' },
  { title: 'رسالة الخطأ', key: 'errorMessage', exportValue: (r) => r.errorMessage || '' },
];

const processedItems = [
  { title: 'تمت المعالجة', value: 'processed' },
  { title: 'فشل', value: 'failed' },
];
const statusItems = DELIVERY_STATUSES.map((s) => ({ title: statusMeta(s).label, value: s }));

const filterDefs = [
  {
    key: 'status',
    type: 'select',
    label: 'النتيجة',
    icon: 'mdi-check-decagram-outline',
    options: processedItems,
  },
  {
    key: 'normalizedStatus',
    type: 'select',
    label: 'الحالة',
    icon: 'mdi-truck-outline',
    options: statusItems,
  },
  { type: 'date-range', label: 'التاريخ', fromKey: 'dateFrom', toKey: 'dateTo' },
];

const rowActions = [
  {
    key: 'payload',
    icon: 'mdi-code-json',
    title: 'عرض الـ payload',
    handler: (item) => viewPayload(item),
    primary: true,
  },
];

// Diagnostic screen: keep the precise 24h en-GB timestamp (slot wins for display;
// the column's `format: 'datetime'` only types the export).
const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { hour12: false });
};

const lastOpts = ref({ page: 1, itemsPerPage: 20 });

async function load() {
  if (!canView.value) return;
  loading.value = true;
  try {
    const { data, meta } = await store.fetchWebhookLogs({
      providerCode: 'BOXY',
      page: lastOpts.value.page,
      limit: lastOpts.value.itemsPerPage,
      ...(filterValues.value.status ? { status: filterValues.value.status } : {}),
      ...(filterValues.value.normalizedStatus
        ? { normalizedStatus: filterValues.value.normalizedStatus }
        : {}),
      ...(filterValues.value.dateFrom ? { dateFrom: filterValues.value.dateFrom } : {}),
      ...(filterValues.value.dateTo ? { dateTo: filterValues.value.dateTo } : {}),
    });
    logs.value = data;
    total.value = Number(meta.total) || 0;
  } catch {
    /* notified by the store */
  } finally {
    loading.value = false;
  }
}

const onOptions = ({ page, itemsPerPage }) => {
  lastOpts.value = { page, itemsPerPage };
  load();
};

const viewPayload = (item) => {
  try {
    payloadText.value = JSON.stringify(item.payload, null, 2);
  } catch {
    payloadText.value = String(item.payload);
  }
  payloadDialog.value = true;
};
const copyPayload = async () => {
  try {
    await navigator.clipboard.writeText(payloadText.value);
    notify.success('تم النسخ');
  } catch {
    notify.error('تعذّر النسخ');
  }
};
</script>

<style scoped>
.payload {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 8px;
  padding: 12px;
  font-size: 0.78rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
