<template>
  <div class="page-shell">
    <PageHeader
      title="الشحنات والتتبع"
      subtitle="إدارة جميع الشحنات وتتبّع حالتها لدى شركات النقل"
      icon="mdi-truck-fast"
    >
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="store.loading" @click="reload"
        >تحديث</v-btn
      >
    </PageHeader>

    <!-- Filters -->
    <v-card class="page-section mb-3">
      <v-card-text>
        <div class="d-flex flex-wrap gap-3">
          <v-text-field
            v-model="filters.search"
            label="بحث (طلب / فاتورة / اسم / هاتف / كود Boxy / تتبّع)"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="min-width: 280px"
            class="flex-grow-1"
            @update:model-value="debouncedReload"
          />
          <v-select
            v-model="filters.providerId"
            :items="providerItems"
            item-title="name"
            item-value="id"
            label="شركة التوصيل"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="applyFilters"
          />
          <v-select
            v-model="filters.status"
            :items="statusItems"
            label="الحالة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
            @update:model-value="applyFilters"
          />
          <v-select
            v-model="filters.channelId"
            :items="channelItems"
            item-title="name"
            item-value="id"
            label="القناة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 200px"
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
            style="max-width: 170px"
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
            style="max-width: 170px"
            @update:model-value="applyFilters"
          />
        </div>
      </v-card-text>
    </v-card>

    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="store.shipments"
        :loading="store.loading"
        :items-per-page="store.pagination.limit"
        :page="store.pagination.page"
        :items-length="store.pagination.total"
        server-items-length
        density="comfortable"
        hide-default-footer
      >
        <template #[`item.createdAt`]="{ item }">{{ fmtDate(item.createdAt) }}</template>
        <template #[`item.providerName`]="{ item }">{{ item.providerName || '—' }}</template>
        <template #[`item.trackingNumber`]="{ item }">
          <span v-if="item.trackingNumber" class="text-caption font-weight-medium">{{
            item.trackingNumber
          }}</span>
          <span v-else class="text-disabled">—</span>
        </template>
        <template #[`item.lastSyncedAt`]="{ item }">{{ fmtDate(item.lastSyncedAt) }}</template>

        <template #[`item.orderInvoice`]="{ item }">
          <div class="d-flex flex-column">
            <span v-if="item.orderNumber" class="text-caption">طلب: {{ item.orderNumber }}</span>
            <span v-if="item.invoiceNumber" class="text-caption"
              >فاتورة: {{ item.invoiceNumber }}</span
            >
            <span v-if="!item.orderNumber && !item.invoiceNumber" class="text-disabled">—</span>
          </div>
        </template>

        <template #[`item.status`]="{ item }">
          <v-chip :color="statusMeta(item.status).color" size="small" variant="flat">
            <v-icon start size="14">{{ statusMeta(item.status).icon }}</v-icon>
            {{ statusMeta(item.status).label }}
          </v-chip>
        </template>

        <template #[`item.codAmount`]="{ item }">{{
          fmtMoney(item.codAmount, item.currency)
        }}</template>
        <template #[`item.deliveryFee`]="{ item }">{{
          fmtMoney(item.deliveryFee, item.currency)
        }}</template>

        <template #[`item.actions`]="{ item }">
          <v-btn
            icon="mdi-eye-outline"
            size="small"
            variant="text"
            title="عرض التفاصيل وسجل الحالات"
            @click="goDetail(item)"
          />
          <v-btn
            icon="mdi-map-marker-path"
            size="small"
            variant="text"
            color="info"
            title="تتبّع الشحنة"
            :disabled="!item.trackingUrl"
            @click="openTracking(item)"
          />
          <v-btn
            icon="mdi-cloud-sync-outline"
            size="small"
            variant="text"
            color="primary"
            title="تحديث الحالة"
            :disabled="isTerminalStatus(item.status) || !!busyId"
            :loading="busyId === item.id"
            @click="doSync(item)"
          />
          <v-btn
            icon="mdi-close-circle-outline"
            size="small"
            variant="text"
            color="error"
            title="إلغاء"
            :disabled="isTerminalStatus(item.status) || !!busyId"
            @click="confirmCancel(item)"
          />
        </template>
      </v-data-table>

      <PaginationControls
        :pagination="store.pagination"
        @update:page="changePage"
        @update:items-per-page="changeItemsPerPage"
      />
    </v-card>

    <ConfirmDialog
      v-model="cancelDialog"
      title="إلغاء الشحنة"
      message="هل أنت متأكد من إلغاء هذه الشحنة لدى شركة التوصيل؟"
      :details="selected ? `الشحنة: ${selected.shipmentNumber}` : ''"
      type="error"
      confirm-text="إلغاء الشحنة"
      cancel-text="تراجع"
      :loading="cancelling"
      @confirm="doCancel"
      @cancel="cancelDialog = false"
    />
  </div>
</template>

<script setup>
import { reactive, computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDeliveryShipmentStore } from '@/stores/deliveryShipment';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useSalesChannelStore } from '@/stores/salesChannel';
import { usePermissions } from '@/composables/usePermissions';
import { DELIVERY_STATUSES, statusMeta, isTerminalStatus } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const router = useRouter();
const store = useDeliveryShipmentStore();
const providerStore = useDeliveryProviderStore();
const channelStore = useSalesChannelStore();
const { hasPermission } = usePermissions();

const filters = reactive({
  search: '',
  providerId: null,
  status: null,
  channelId: null,
  dateFrom: null,
  dateTo: null,
});

const cancelDialog = ref(false);
const cancelling = ref(false);
const selected = ref(null);
const busyId = ref(null);

const headers = [
  { title: 'التاريخ', key: 'createdAt' },
  { title: 'شركة النقل', key: 'providerName', sortable: false },
  { title: 'رقم التتبّع', key: 'trackingNumber', sortable: false },
  { title: 'الطلب/الفاتورة', key: 'orderInvoice', sortable: false },
  { title: 'العميل', key: 'recipientName', sortable: false },
  { title: 'الهاتف', key: 'recipientPhone', sortable: false },
  { title: 'المحافظة', key: 'province', sortable: false },
  { title: 'الحالة', key: 'status', sortable: false },
  { title: 'آخر تحديث', key: 'lastSyncedAt', sortable: false },
  { title: 'الدفع عند الاستلام', key: 'codAmount', sortable: false },
  { title: 'الرسوم', key: 'deliveryFee', sortable: false },
  { title: 'إجراءات', key: 'actions', sortable: false },
];

const statusItems = DELIVERY_STATUSES.map((s) => ({ title: statusMeta(s).label, value: s }));
const providerItems = computed(() => providerStore.providers);
const channelItems = computed(() => channelStore.channels);

const fmtMoney = (v, cur) =>
  v == null
    ? '—'
    : `${new Intl.NumberFormat('en-US').format(Number(v) || 0)}${cur ? ' ' + cur : ''}`;
const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { hour12: false });
};

const params = () => ({
  page: store.pagination.page,
  limit: store.pagination.limit,
  ...(filters.search ? { search: filters.search } : {}),
  ...(filters.providerId ? { providerId: filters.providerId } : {}),
  ...(filters.status ? { status: filters.status } : {}),
  ...(filters.channelId ? { channelId: filters.channelId } : {}),
  ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
  ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
});

const reload = () => store.searchShipments(params());
const applyFilters = () => {
  store.pagination.page = 1;
  reload();
};
let searchTimer = null;
const debouncedReload = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 350);
};
const changePage = (p) => {
  const n = Number(p);
  if (isNaN(n) || n < 1 || n === store.pagination.page) return;
  store.pagination.page = n;
  reload();
};
const changeItemsPerPage = (limit) => {
  store.pagination.limit = Number(limit);
  store.pagination.page = 1;
  reload();
};

const goDetail = (row) => router.push(`/delivery/shipments/${row.id}`);

// Open the carrier's tracking page in a new window. Tracking is part of the
// shipment record (trackingUrl) — no separate tracking entity. The full status
// history lives in the shipment details («مسار الحالة»).
const openTracking = (row) => {
  if (row.trackingUrl) window.open(row.trackingUrl, '_blank', 'noopener');
};

const doSync = async (row) => {
  busyId.value = row.id;
  try {
    const updated = await store.syncShipment(row.id);
    if (updated) row.status = updated.status;
  } catch {
    /* notified */
  } finally {
    busyId.value = null;
  }
};

const confirmCancel = (row) => {
  selected.value = row;
  cancelDialog.value = true;
};
const doCancel = async () => {
  cancelling.value = true;
  try {
    await store.cancelShipment(selected.value.id);
    cancelDialog.value = false;
    reload();
  } catch {
    /* notified */
  } finally {
    cancelling.value = false;
  }
};

onMounted(() => {
  reload();
  // Provider + channel pickers are OPTIONAL filters on this page: only load
  // them when the user holds the matching read permission, so a 403 never
  // surfaces for a user who can see shipments but not provider/channel config.
  providerStore.fetchProviders({ optional: true });
  if (hasPermission('sales_channels:read') && !channelStore.channels.length) {
    channelStore.fetchChannels({ page: 1, limit: 100 });
  }
});
</script>
