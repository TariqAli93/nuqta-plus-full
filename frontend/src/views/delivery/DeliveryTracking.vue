<template>
  <div class="page-shell">
    <PageHeader
      title="تتبع الشحنات"
      subtitle="متابعة شحنات شركات التوصيل وتحديث حالاتها"
      icon="mdi-truck-fast"
    >
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="store.loading" @click="reload">
        تحديث
      </v-btn>
    </PageHeader>

    <v-card class="page-section mb-3">
      <v-card-text>
        <div class="d-flex flex-wrap gap-3">
          <v-select
            v-model="store.filters.status"
            :items="statusFilterItems"
            label="الحالة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 240px"
            @update:model-value="applyFilters"
          />
          <v-select
            v-model="store.filters.providerId"
            :items="store.providers"
            item-title="name"
            item-value="id"
            label="شركة التوصيل"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 240px"
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
        @click:row="(_, { item }) => openDetail(item)"
      >
        <template #[`item.providerName`]="{ item }">
          <v-chip v-if="item.providerName" size="small" variant="tonal">
            <v-icon start size="14">mdi-truck-outline</v-icon>{{ item.providerName }}
          </v-chip>
          <span v-else class="text-disabled">—</span>
        </template>

        <template #[`item.trackingNumber`]="{ item }">
          <span v-if="item.trackingNumber" class="font-mono">{{ item.trackingNumber }}</span>
          <span v-else class="text-disabled">—</span>
        </template>

        <template #[`item.status`]="{ item }">
          <v-chip :color="statusMeta(item.status).color" size="small" variant="flat">
            <v-icon start size="14">{{ statusMeta(item.status).icon }}</v-icon>
            {{ statusMeta(item.status).label }}
          </v-chip>
        </template>

        <template #[`item.lastUpdate`]="{ item }">
          {{ formatDateTime(item.lastSyncedAt || item.createdAt) }}
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn
            icon="mdi-timeline-clock-outline"
            size="small"
            variant="text"
            title="التفاصيل والمسار"
            @click.stop="openDetail(item)"
          />
          <v-btn
            icon="mdi-cloud-sync-outline"
            size="small"
            variant="text"
            color="primary"
            title="مزامنة الحالة"
            :disabled="isTerminalStatus(item.status)"
            :loading="syncingId === item.id"
            @click.stop="doSync(item)"
          />
          <v-btn
            icon="mdi-close-circle-outline"
            size="small"
            variant="text"
            color="error"
            title="إلغاء الشحنة"
            :disabled="isTerminalStatus(item.status)"
            @click.stop="confirmCancel(item)"
          />
        </template>
      </v-data-table>

      <PaginationControls
        :pagination="store.pagination"
        @update:page="changePage"
        @update:items-per-page="changeItemsPerPage"
      />
    </v-card>

    <!-- Detail + timeline -->
    <v-dialog v-model="detailDialog" max-width="640" scrollable>
      <v-card v-if="detail">
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-truck-fast</v-icon>
          <span>الشحنة {{ detail.shipmentNumber }}</span>
          <v-spacer />
          <v-chip :color="statusMeta(detail.status).color" size="small" variant="flat">
            <v-icon start size="14">{{ statusMeta(detail.status).icon }}</v-icon>
            {{ statusMeta(detail.status).label }}
          </v-chip>
        </v-card-title>
        <v-divider />

        <v-card-text class="pt-4" style="max-height: 68vh">
          <v-row dense class="mb-2">
            <v-col cols="12" sm="6">
              <div class="text-caption text-medium-emphasis">شركة التوصيل</div>
              <div>{{ detail.providerName || '—' }}</div>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="text-caption text-medium-emphasis">رقم التتبع</div>
              <div>
                <a v-if="detail.trackingUrl" :href="detail.trackingUrl" target="_blank" rel="noopener">
                  {{ detail.trackingNumber || 'فتح التتبع' }}
                  <v-icon size="14">mdi-open-in-new</v-icon>
                </a>
                <span v-else class="font-mono">{{ detail.trackingNumber || '—' }}</span>
              </div>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="text-caption text-medium-emphasis">المستلم</div>
              <div>{{ detail.recipientName || '—' }}<span v-if="detail.recipientPhone"> — {{ detail.recipientPhone }}</span></div>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="text-caption text-medium-emphasis">آخر تحديث</div>
              <div>{{ formatDateTime(lastUpdate(detail)) }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-3" />
          <div class="text-subtitle-2 mb-2">مسار الشحنة</div>

          <v-timeline v-if="detail.events?.length" side="end" align="start" density="compact">
            <v-timeline-item
              v-for="ev in detail.events"
              :key="ev.id"
              :dot-color="ev.status ? statusMeta(ev.status).color : 'grey'"
              :icon="ev.status ? statusMeta(ev.status).icon : eventMeta(ev.eventType).icon"
              size="small"
            >
              <div class="d-flex justify-space-between align-center gap-2">
                <strong>{{ ev.status ? statusMeta(ev.status).label : eventMeta(ev.eventType).label }}</strong>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDateTime(ev.occurredAt || ev.createdAt) }}
                </span>
              </div>
              <div v-if="ev.message" class="text-caption mt-1">{{ ev.message }}</div>
              <div v-if="ev.providerStatus" class="text-caption text-medium-emphasis">
                حالة الشركة: {{ ev.providerStatus }}
              </div>
            </v-timeline-item>
          </v-timeline>
          <div v-else class="text-center text-medium-emphasis py-6">لا يوجد مسار بعد</div>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-3">
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-cloud-sync-outline"
            :disabled="isTerminalStatus(detail.status)"
            :loading="syncingId === detail.id"
            @click="doSync(detail)"
          >
            مزامنة
          </v-btn>
          <v-btn
            color="error"
            variant="text"
            prepend-icon="mdi-close-circle-outline"
            :disabled="isTerminalStatus(detail.status)"
            @click="confirmCancel(detail)"
          >
            إلغاء الشحنة
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="detailDialog = false">إغلاق</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
import { ref, onMounted } from 'vue';
import { useDeliveryShipmentStore } from '@/stores/deliveryShipment';
import { DELIVERY_STATUSES, statusMeta, eventMeta, isTerminalStatus } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const store = useDeliveryShipmentStore();

const detailDialog = ref(false);
const detail = ref(null);
const cancelDialog = ref(false);
const cancelling = ref(false);
const selected = ref(null);
const syncingId = ref(null);

const headers = [
  { title: 'رقم الشحنة', key: 'shipmentNumber' },
  { title: 'الشركة', key: 'providerName', sortable: false },
  { title: 'رقم التتبع', key: 'trackingNumber', sortable: false },
  { title: 'الحالة', key: 'status', sortable: false },
  { title: 'آخر تحديث', key: 'lastUpdate', sortable: false },
  { title: 'إجراءات', key: 'actions', sortable: false },
];

const statusFilterItems = DELIVERY_STATUSES.map((s) => ({ title: statusMeta(s).label, value: s }));

const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { hour12: false });
};

// Truest "last update" = newest event time, else last sync, else updated/created.
const lastUpdate = (s) =>
  s?.events?.[0]?.createdAt || s?.lastSyncedAt || s?.updatedAt || s?.createdAt;

const openDetail = async (shipment) => {
  detail.value = shipment;
  detailDialog.value = true;
  try {
    detail.value = await store.fetchShipment(shipment.id); // full row + events timeline
  } catch {
    // surfaced via notification store
  }
};

const doSync = async (shipment) => {
  syncingId.value = shipment.id;
  try {
    const updated = await store.syncShipment(shipment.id);
    if (detail.value?.id === shipment.id) detail.value = await store.fetchShipment(shipment.id);
    else if (updated) shipment.status = updated.status;
  } catch {
    // surfaced via notification store
  } finally {
    syncingId.value = null;
  }
};

const confirmCancel = (shipment) => {
  selected.value = shipment;
  cancelDialog.value = true;
};
const doCancel = async () => {
  cancelling.value = true;
  try {
    await store.cancelShipment(selected.value.id);
    if (detail.value?.id === selected.value.id) detail.value = await store.fetchShipment(selected.value.id);
    cancelDialog.value = false;
  } catch {
    // surfaced via notification store
  } finally {
    cancelling.value = false;
  }
};

const reload = () => store.fetchShipments();
const applyFilters = () => {
  store.pagination.page = 1;
  store.fetchShipments({ page: 1 });
};
const changePage = (page) => {
  const n = Number(page);
  if (isNaN(n) || n < 1 || n === store.pagination.page) return;
  store.pagination.page = n;
  store.fetchShipments({ page: n });
};
const changeItemsPerPage = (limit) => {
  store.pagination.limit = Number(limit);
  store.pagination.page = 1;
  store.fetchShipments({ page: 1 });
};

onMounted(() => {
  store.fetchShipments();
  store.fetchProviders();
});
</script>

<style scoped>
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
