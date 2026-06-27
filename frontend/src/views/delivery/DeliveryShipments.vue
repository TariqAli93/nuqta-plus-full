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

    <!-- Unified SmartTable: built-in 7-field search + advanced-filter popover
         (provider / status / channel / date range) + columns + export + print +
         footer pagination. Row actions (details / tracking / sync / cancel) are
         gated by row state; cancel uses the action's built-in confirm. -->
    <SmartTable
      table-key="delivery-shipments-table"
      :headers="headers"
      :items="store.shipments"
      :loading="store.loading"
      :total-items="store.pagination.total"
      server-side
      :initial-load="false"
      :page="store.pagination.page"
      :page-size="store.pagination.limit"
      :search="filters.search"
      search-placeholder="بحث (طلب / فاتورة / اسم / هاتف / كود Boxy / تتبّع)"
      :filter-chips="filterChips"
      :row-actions="rowActions"
      show-export
      show-print
      print-title="الشحنات والتتبع"
      export-file-base="delivery-shipments"
      empty-title="لا توجد شحنات"
      empty-description="أرسل طلباتك إلى شركات التوصيل لتظهر هنا"
      empty-icon="mdi-truck-fast"
      @update:search="onSearchInput"
      @search-now="onSearchNow"
      @clear-search="onSearchClear"
      @update:page="changePage"
      @update:page-size="changeItemsPerPage"
      @clear-filters="onClearFilters"
      @remove-filter="onRemoveFilter"
      @refresh="reload"
    >
      <!-- Provider / status / channel / date filters live in the toolbar popover;
           the search box is owned by SmartTable. -->
      <template #filters>
        <v-row dense>
          <v-col cols="12" sm="6">
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
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="filters.status"
              :items="statusItems"
              label="الحالة"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="12" sm="6">
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
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-text-field
              v-model="filters.dateFrom"
              type="date"
              label="من تاريخ"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-text-field
              v-model="filters.dateTo"
              type="date"
              label="إلى تاريخ"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              @update:model-value="applyFilters"
            />
          </v-col>
        </v-row>
      </template>

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
          <span v-if="item.invoiceNumber" class="text-caption">فاتورة: {{ item.invoiceNumber }}</span>
          <span v-if="!item.orderNumber && !item.invoiceNumber" class="text-disabled">—</span>
        </div>
      </template>

      <template #[`item.status`]="{ item }">
        <v-chip :color="statusMeta(item.status).color" size="small" variant="flat">
          <v-icon start size="14">{{ statusMeta(item.status).icon }}</v-icon>
          {{ statusMeta(item.status).label }}
        </v-chip>
      </template>

      <template #[`item.codAmount`]="{ item }">{{ fmtMoney(item.codAmount, item.currency) }}</template>
      <template #[`item.deliveryFee`]="{ item }">{{
        fmtMoney(item.deliveryFee, item.currency)
      }}</template>
    </SmartTable>
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
import SmartTable from '@/components/common/SmartTable';

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

// Tracks the shipment currently being synced/cancelled so Sync + Cancel are
// disabled across the table while one is in flight.
const busyId = ref(null);

// Server-side: sorting stays off (the /delivery/shipments API doesn't sort).
// `format` drives export/print typing; date / money cells keep their bespoke
// formatting via #item slots, with `exportValue` flattening computed cells.
const headers = [
  { title: 'التاريخ', key: 'createdAt', format: 'datetime' },
  { title: 'شركة النقل', key: 'providerName', sortable: false },
  { title: 'رقم التتبّع', key: 'trackingNumber', sortable: false },
  {
    title: 'الطلب/الفاتورة',
    key: 'orderInvoice',
    sortable: false,
    exportValue: (r) =>
      [r.orderNumber ? `طلب: ${r.orderNumber}` : null, r.invoiceNumber ? `فاتورة: ${r.invoiceNumber}` : null]
        .filter(Boolean)
        .join(' / ') || '—',
  },
  { title: 'العميل', key: 'recipientName', sortable: false },
  { title: 'الهاتف', key: 'recipientPhone', sortable: false },
  { title: 'المحافظة', key: 'province', sortable: false },
  { title: 'الحالة', key: 'status', sortable: false, exportValue: (r) => statusMeta(r.status).label },
  { title: 'آخر تحديث', key: 'lastSyncedAt', format: 'datetime' },
  {
    title: 'الدفع عند الاستلام',
    key: 'codAmount',
    sortable: false,
    format: 'currency',
    exportValue: (r) => r.codAmount ?? '',
  },
  {
    title: 'الرسوم',
    key: 'deliveryFee',
    sortable: false,
    format: 'currency',
    exportValue: (r) => r.deliveryFee ?? '',
  },
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

// SmartTable owns the search box; mirror it into the local filter and reuse the
// existing debounce (typing) / immediate-apply (Enter, clear).
const onSearchInput = (val) => {
  filters.search = val ?? '';
  debouncedReload();
};
const onSearchNow = () => applyFilters();
const onSearchClear = () => {
  filters.search = '';
  applyFilters();
};

// Active-filter chips (provider / status / channel / date range).
const filterChips = computed(() => {
  const chips = [];
  if (filters.providerId) {
    const p = providerItems.value.find((x) => x.id === filters.providerId);
    chips.push({ key: 'providerId', label: `شركة التوصيل: ${p?.name ?? filters.providerId}` });
  }
  if (filters.status) chips.push({ key: 'status', label: `الحالة: ${statusMeta(filters.status).label}` });
  if (filters.channelId) {
    const c = channelItems.value.find((x) => x.id === filters.channelId);
    chips.push({ key: 'channelId', label: `القناة: ${c?.name ?? filters.channelId}` });
  }
  if (filters.dateFrom) chips.push({ key: 'dateFrom', label: `من تاريخ: ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: 'dateTo', label: `إلى تاريخ: ${filters.dateTo}` });
  return chips;
});
const onRemoveFilter = (key) => {
  filters[key] = null;
  applyFilters();
};
const onClearFilters = () => {
  filters.search = '';
  filters.providerId = null;
  filters.status = null;
  filters.channelId = null;
  filters.dateFrom = null;
  filters.dateTo = null;
  applyFilters();
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

const doCancel = async (row) => {
  busyId.value = row.id;
  try {
    await store.cancelShipment(row.id);
    reload();
  } catch {
    /* notified */
  } finally {
    busyId.value = null;
  }
};

// Per-row actions: details + tracking are always available; Sync + Cancel are
// gated on a non-terminal status and disabled while any row is busy. Cancel runs
// SmartTable's built-in confirm before the handler.
const rowActions = computed(() => [
  {
    key: 'detail',
    icon: 'mdi-eye-outline',
    title: 'عرض التفاصيل وسجل الحالات',
    primary: true,
    handler: goDetail,
  },
  {
    key: 'track',
    icon: 'mdi-map-marker-path',
    title: 'تتبّع الشحنة',
    color: 'info',
    primary: true,
    disabled: (i) => !i.trackingUrl,
    handler: openTracking,
  },
  {
    key: 'sync',
    icon: 'mdi-cloud-sync-outline',
    title: 'تحديث الحالة',
    color: 'primary',
    primary: true,
    disabled: (i) => isTerminalStatus(i.status) || !!busyId.value,
    handler: doSync,
  },
  {
    key: 'cancel',
    icon: 'mdi-close-circle-outline',
    title: 'إلغاء',
    color: 'error',
    danger: true,
    primary: true,
    disabled: (i) => isTerminalStatus(i.status) || !!busyId.value,
    handler: doCancel,
    confirm: (i) => ({
      title: 'إلغاء الشحنة',
      message: 'هل أنت متأكد من إلغاء هذه الشحنة لدى شركة التوصيل؟',
      details: `الشحنة: ${i.shipmentNumber}`,
      type: 'error',
      confirmText: 'إلغاء الشحنة',
    }),
  },
]);

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
