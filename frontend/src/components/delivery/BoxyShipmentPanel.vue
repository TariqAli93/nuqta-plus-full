<template>
  <v-card v-if="shipment" class="page-section mb-3">
    <v-card-title class="d-flex align-center gap-2">
      <v-icon color="primary">mdi-truck-fast</v-icon>
      <span>شحنة Boxy</span>
      <v-spacer />
      <v-chip :color="statusMeta(shipment.status).color" size="small" variant="flat">
        <v-icon start size="14">{{ statusMeta(shipment.status).icon }}</v-icon>
        {{ statusMeta(shipment.status).label }}
      </v-chip>
    </v-card-title>
    <v-divider />

    <v-card-text class="pt-4">
      <!-- Clear error when the shipment failed -->
      <v-alert v-if="shipment.status === 'FAILED' && lastError" type="error" variant="tonal" class="mb-3">
        {{ lastError }}
      </v-alert>

      <v-row dense>
        <v-col v-for="f in fields" :key="f.label" cols="12" sm="6" md="4">
          <div class="text-caption text-medium-emphasis">{{ f.label }}</div>
          <div class="oc-val">{{ f.value || '—' }}</div>
        </v-col>
      </v-row>
    </v-card-text>

    <v-divider />
    <v-card-actions class="pa-3 flex-wrap gap-2">
      <v-btn
        variant="tonal"
        color="primary"
        size="small"
        prepend-icon="mdi-cloud-sync-outline"
        :loading="busy === 'sync'"
        :disabled="!!busy"
        @click="doSync"
      >
        مزامنة الحالة
      </v-btn>

      <v-btn
        v-if="!isTerminal"
        variant="text"
        color="error"
        size="small"
        prepend-icon="mdi-close-circle-outline"
        :loading="busy === 'cancel'"
        :disabled="!!busy"
        @click="doCancel"
      >
        إلغاء الشحنة
      </v-btn>

      <v-btn
        v-if="shipment.labelSupported"
        variant="text"
        size="small"
        prepend-icon="mdi-printer-outline"
        :loading="busy === 'label'"
        :disabled="!!busy"
        @click="doPrintLabel"
      >
        طباعة الملصق
      </v-btn>

      <v-btn
        v-if="shipment.trackingNumber"
        variant="text"
        size="small"
        prepend-icon="mdi-content-copy"
        :disabled="!!busy"
        @click="copyTracking"
      >
        نسخ كود التتبّع
      </v-btn>

      <v-btn
        v-if="shipment.trackingUrl"
        variant="text"
        size="small"
        prepend-icon="mdi-open-in-new"
        :disabled="!!busy"
        :href="shipment.trackingUrl"
        target="_blank"
        rel="noopener"
      >
        فتح رابط التتبّع
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useDeliveryShipmentStore } from '@/stores/deliveryShipment';
import { useNotificationStore } from '@/stores/notification';
import { statusMeta, isTerminalStatus } from '@/constants/delivery';

const props = defineProps({
  order: { type: Object, default: null },
  sale: { type: Object, default: null },
});

const store = useDeliveryShipmentStore();
const notify = useNotificationStore();

const shipment = ref(null);
const busy = ref(null); // 'sync' | 'cancel' | 'label' | null — disables all actions

const entityId = computed(() => props.order?.id || props.sale?.id || null);

const isTerminal = computed(() => isTerminalStatus(shipment.value?.status));
const lastError = computed(() => {
  const ev = (shipment.value?.events || []).find((e) => e.eventType === 'ERROR');
  return ev?.message || null;
});

const fmtMoney = (v, cur) =>
  v == null ? '' : `${new Intl.NumberFormat('en-US').format(Number(v) || 0)}${cur ? ' ' + cur : ''}`;
const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { hour12: false });
};

const fields = computed(() => {
  const s = shipment.value || {};
  return [
    { label: 'المزوّد', value: s.providerName || 'Boxy' },
    { label: 'معرّف Boxy (UID)', value: s.providerShipmentId },
    { label: 'كود المنصّة', value: s.platformCode },
    { label: 'كود التتبّع', value: s.trackingNumber },
    { label: 'حالة المزوّد', value: s.providerStatus },
    { label: 'الحالة الداخلية', value: statusMeta(s.status).label },
    { label: 'رسوم التوصيل', value: fmtMoney(s.deliveryFee, s.currency) },
    { label: 'مبلغ الدفع عند الاستلام', value: fmtMoney(s.codAmount, s.currency) },
    { label: 'آخر مزامنة', value: fmtDate(s.lastSyncedAt) },
    { label: 'تاريخ الإنشاء', value: fmtDate(s.createdAt) },
  ];
});

async function load() {
  if (!entityId.value) return;
  const list = await store.fetchForEntity(
    props.order ? { onlineOrderId: entityId.value } : { saleId: entityId.value }
  );
  if (!list.length) {
    shipment.value = null;
    return;
  }
  // Newest shipment (list is ordered by createdAt desc).
  shipment.value = await store.fetchShipment(list[0].id);
}

async function doSync() {
  busy.value = 'sync';
  try {
    shipment.value = await store.syncShipment(shipment.value.id);
  } catch {
    /* notified */
  } finally {
    busy.value = null;
  }
}

async function doCancel() {
  busy.value = 'cancel';
  try {
    shipment.value = await store.cancelShipment(shipment.value.id);
  } catch {
    /* notified */
  } finally {
    busy.value = null;
  }
}

async function doPrintLabel() {
  busy.value = 'label';
  try {
    const url = await store.fetchLabel(shipment.value.id);
    if (url) window.open(url, '_blank', 'noopener');
  } catch {
    /* notified */
  } finally {
    busy.value = null;
  }
}

async function copyTracking() {
  try {
    await navigator.clipboard.writeText(shipment.value.trackingNumber);
    notify.success('تم نسخ كود التتبّع');
  } catch {
    notify.error('تعذّر النسخ');
  }
}

onMounted(load);
</script>

<style scoped>
.oc-val {
  font-weight: 600;
}
</style>
