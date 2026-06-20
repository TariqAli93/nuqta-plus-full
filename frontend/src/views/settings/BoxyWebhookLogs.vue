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

      <!-- Filters -->
      <v-card class="page-section mb-3">
        <v-card-text>
          <div class="d-flex flex-wrap gap-3">
            <v-select
              v-model="filters.status"
              :items="processedItems"
              label="النتيجة"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              style="max-width: 200px"
              @update:model-value="applyFilters"
            />
            <v-select
              v-model="filters.normalizedStatus"
              :items="statusItems"
              label="الحالة"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              style="max-width: 220px"
              @update:model-value="applyFilters"
            />
            <v-text-field
              v-model="filters.dateFrom"
              type="date"
              label="من تاريخ"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              style="max-width: 180px"
              @update:model-value="applyFilters"
            />
            <v-text-field
              v-model="filters.dateTo"
              type="date"
              label="إلى تاريخ"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              style="max-width: 180px"
              @update:model-value="applyFilters"
            />
          </div>
        </v-card-text>
      </v-card>

      <v-card class="page-section">
        <v-data-table
          :headers="headers"
          :items="logs"
          :loading="loading"
          :items-per-page="pagination.limit"
          :page="pagination.page"
          :items-length="pagination.total"
          server-items-length
          density="comfortable"
          hide-default-footer
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

          <template #[`item.providerStatus`]="{ item }">{{ item.providerStatus || '—' }}</template>

          <template #[`item.errorMessage`]="{ item }">
            <span v-if="item.errorMessage" class="text-error">{{ item.errorMessage }}</span>
            <span v-else class="text-disabled">—</span>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn icon="mdi-code-json" size="small" variant="text" title="عرض الـ payload" @click="viewPayload(item)" />
          </template>
        </v-data-table>

        <PaginationControls
          :pagination="pagination"
          @update:page="changePage"
          @update:items-per-page="changeItemsPerPage"
        />
      </v-card>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notification';
import { DELIVERY_STATUSES, statusMeta } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';
import PaginationControls from '@/components/PaginationControls.vue';

const store = useDeliveryProviderStore();
const authStore = useAuthStore();
const notify = useNotificationStore();

const canView = computed(() => authStore.hasPermission('delivery_webhooks:view'));

const logs = ref([]);
const loading = ref(false);
const pagination = reactive({ page: 1, limit: 20, total: 0, totalPages: 0 });
const filters = reactive({ status: null, normalizedStatus: null, dateFrom: null, dateTo: null });

const payloadDialog = ref(false);
const payloadText = ref('');

const headers = [
  { title: 'وقت الاستلام', key: 'receivedAt' },
  { title: 'النتيجة', key: 'status', sortable: false },
  { title: 'الشحنة المطابقة', key: 'shipmentNumber', sortable: false },
  { title: 'حالة المزوّد', key: 'providerStatus', sortable: false },
  { title: 'رسالة الخطأ', key: 'errorMessage', sortable: false },
  { title: 'Payload', key: 'actions', sortable: false },
];

const processedItems = [
  { title: 'تمت المعالجة', value: 'processed' },
  { title: 'فشل', value: 'failed' },
];
const statusItems = DELIVERY_STATUSES.map((s) => ({ title: statusMeta(s).label, value: s }));

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { hour12: false });
};

async function load() {
  if (!canView.value) return;
  loading.value = true;
  try {
    const { data, meta } = await store.fetchWebhookLogs({
      providerCode: 'BOXY',
      page: pagination.page,
      limit: pagination.limit,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.normalizedStatus ? { normalizedStatus: filters.normalizedStatus } : {}),
      ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
    });
    logs.value = data;
    pagination.total = Number(meta.total) || 0;
    pagination.totalPages = Number(meta.totalPages) || 0;
  } catch {
    /* notified */
  } finally {
    loading.value = false;
  }
}

const applyFilters = () => {
  pagination.page = 1;
  load();
};
const changePage = (p) => {
  const n = Number(p);
  if (isNaN(n) || n < 1 || n === pagination.page) return;
  pagination.page = n;
  load();
};
const changeItemsPerPage = (limit) => {
  pagination.limit = Number(limit);
  pagination.page = 1;
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

onMounted(load);
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
