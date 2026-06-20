<template>
  <div class="page-shell">
    <PageHeader
      :title="`الشحنة ${s?.shipmentNumber || ''}`"
      subtitle="تفاصيل الشحنة"
      icon="mdi-truck-fast"
    >
      <template v-if="s">
        <v-btn
          variant="tonal"
          color="primary"
          prepend-icon="mdi-cloud-sync-outline"
          :loading="busy === 'sync'"
          :disabled="isTerminalStatus(s.status) || !!busy"
          @click="doSync"
        >
          مزامنة من Boxy
        </v-btn>
        <v-btn
          v-if="!isTerminalStatus(s.status)"
          variant="text"
          color="error"
          prepend-icon="mdi-close-circle-outline"
          :disabled="!!busy"
          @click="cancelDialog = true"
        >
          إلغاء الشحنة
        </v-btn>
        <v-btn variant="text" prepend-icon="mdi-content-copy" :disabled="!!busy" @click="copyIdentifiers">
          نسخ المعرّفات
        </v-btn>
        <v-btn
          v-if="s.labelSupported"
          variant="text"
          prepend-icon="mdi-printer-outline"
          :loading="busy === 'label'"
          :disabled="!!busy"
          @click="printLabel"
        >
          طباعة الملصق
        </v-btn>
      </template>
      <v-btn variant="text" prepend-icon="mdi-arrow-right" @click="router.go(-1)">رجوع</v-btn>
    </PageHeader>

    <div v-if="loading" class="text-center py-10"><v-progress-circular indeterminate color="primary" /></div>

    <template v-else-if="s">
      <!-- 1. Summary -->
      <v-card class="page-section mb-3">
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-information-outline</v-icon>
          <span>ملخّص الشحنة</span>
          <v-spacer />
          <v-chip :color="statusMeta(s.status).color" variant="flat">
            <v-icon start size="16">{{ statusMeta(s.status).icon }}</v-icon>{{ statusMeta(s.status).label }}
          </v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text>
          <v-alert v-if="s.status === 'FAILED' && lastError" type="error" variant="tonal" class="mb-3">
            {{ lastError }}
          </v-alert>
          <v-row dense>
            <v-col v-for="f in summaryFields" :key="f.label" cols="12" sm="6" md="4">
              <div class="text-caption text-medium-emphasis">{{ f.label }}</div>
              <div class="font-weight-medium">{{ f.value || '—' }}</div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-row>
        <v-col cols="12" md="6">
          <!-- 2. Customer / contact -->
          <v-card class="page-section mb-3">
            <v-card-title><v-icon color="primary" class="me-2">mdi-account-outline</v-icon>العميل والتواصل</v-card-title>
            <v-divider />
            <v-card-text>
              <v-row dense>
                <v-col v-for="f in contactFields" :key="f.label" cols="12" sm="6">
                  <div class="text-caption text-medium-emphasis">{{ f.label }}</div>
                  <div class="font-weight-medium">{{ f.value || '—' }}</div>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <!-- 7 + 8. Related order / sale -->
          <v-card class="page-section mb-3">
            <v-card-title><v-icon color="primary" class="me-2">mdi-link-variant</v-icon>المرتبطات</v-card-title>
            <v-divider />
            <v-card-text>
              <div class="mb-3">
                <div class="text-caption text-medium-emphasis">الطلب الأونلاين</div>
                <div v-if="s.orderNumber" class="d-flex align-center gap-2">
                  <span class="font-weight-medium">{{ s.orderNumber }}</span>
                  <v-chip v-if="s.orderStatus" size="x-small" variant="tonal">{{ s.orderStatus }}</v-chip>
                </div>
                <div v-else class="text-disabled">—</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">الفاتورة</div>
                <div v-if="s.invoiceNumber" class="d-flex align-center gap-2">
                  <RouterLink :to="`/sales/${s.saleId}`" class="font-weight-medium">{{ s.invoiceNumber }}</RouterLink>
                  <v-chip v-if="s.saleStatus" size="x-small" variant="tonal">{{ s.saleStatus }}</v-chip>
                  <span v-if="s.saleTotal" class="text-caption text-medium-emphasis">{{ fmtMoney(s.saleTotal, s.currency) }}</span>
                </div>
                <div v-else class="text-disabled">—</div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <!-- 3. Products -->
          <v-card class="page-section mb-3">
            <v-card-title><v-icon color="primary" class="me-2">mdi-package-variant</v-icon>المنتجات</v-card-title>
            <v-divider />
            <v-table v-if="s.products?.length" density="compact">
              <thead><tr><th class="text-right">المنتج</th><th>الكمية</th><th>السعر</th></tr></thead>
              <tbody>
                <tr v-for="(p, i) in s.products" :key="i">
                  <td>{{ p.productName }}</td><td>{{ p.quantity }}</td><td>{{ fmtMoney(p.unitPrice) }}</td>
                </tr>
              </tbody>
            </v-table>
            <v-card-text v-else class="text-medium-emphasis">لا توجد منتجات مرتبطة.</v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- 4. Boxy response data -->
      <v-card class="page-section mb-3">
        <v-card-title><v-icon color="primary" class="me-2">mdi-code-json</v-icon>بيانات استجابة Boxy</v-card-title>
        <v-divider />
        <v-card-text>
          <pre v-if="s.responsePayload" class="payload">{{ pretty(s.responsePayload) }}</pre>
          <div v-else class="text-medium-emphasis">لا توجد بيانات استجابة بعد.</div>
        </v-card-text>
      </v-card>

      <v-row>
        <v-col cols="12" md="6">
          <!-- 5. Status timeline -->
          <v-card class="page-section mb-3">
            <v-card-title><v-icon color="primary" class="me-2">mdi-timeline-clock-outline</v-icon>مسار الحالة</v-card-title>
            <v-divider />
            <v-card-text>
              <v-timeline v-if="s.events?.length" side="end" align="start" density="compact">
                <v-timeline-item
                  v-for="ev in s.events"
                  :key="ev.id"
                  :dot-color="ev.status ? statusMeta(ev.status).color : 'grey'"
                  :icon="ev.status ? statusMeta(ev.status).icon : eventMeta(ev.eventType).icon"
                  size="small"
                >
                  <div class="d-flex justify-space-between align-center gap-2">
                    <strong>{{ ev.status ? statusMeta(ev.status).label : eventMeta(ev.eventType).label }}</strong>
                    <span class="text-caption text-medium-emphasis">{{ fmtDate(ev.occurredAt || ev.createdAt) }}</span>
                  </div>
                  <div v-if="ev.message" class="text-caption mt-1">{{ ev.message }}</div>
                </v-timeline-item>
              </v-timeline>
              <div v-else class="text-medium-emphasis">لا يوجد مسار بعد</div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <!-- 6. Webhook events -->
          <v-card class="page-section mb-3">
            <v-card-title><v-icon color="primary" class="me-2">mdi-webhook</v-icon>أحداث Webhook</v-card-title>
            <v-divider />
            <v-table v-if="webhookEvents.length" density="compact">
              <thead><tr><th class="text-right">الوقت</th><th>الحالة</th><th>حالة المزوّد</th></tr></thead>
              <tbody>
                <tr v-for="ev in webhookEvents" :key="ev.id">
                  <td class="text-caption">{{ fmtDate(ev.occurredAt || ev.createdAt) }}</td>
                  <td>{{ ev.status ? statusMeta(ev.status).label : '—' }}</td>
                  <td class="text-caption">{{ ev.providerStatus || '—' }}</td>
                </tr>
              </tbody>
            </v-table>
            <v-card-text v-else class="text-medium-emphasis">لا توجد أحداث Webhook.</v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <ConfirmDialog
      v-model="cancelDialog"
      title="إلغاء الشحنة"
      message="هل أنت متأكد من إلغاء هذه الشحنة لدى شركة التوصيل؟"
      :details="s ? `الشحنة: ${s.shipmentNumber}` : ''"
      type="error"
      confirm-text="إلغاء الشحنة"
      cancel-text="تراجع"
      :loading="busy === 'cancel'"
      @confirm="doCancel"
      @cancel="cancelDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useDeliveryShipmentStore } from '@/stores/deliveryShipment';
import { useNotificationStore } from '@/stores/notification';
import { statusMeta, eventMeta, isTerminalStatus } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const store = useDeliveryShipmentStore();
const notify = useNotificationStore();

const s = ref(null);
const loading = ref(true);
const busy = ref(null); // 'sync' | 'cancel' | 'label'
const cancelDialog = ref(false);

const id = computed(() => route.params.id);

const fmtMoney = (v, cur) =>
  v == null ? '' : `${new Intl.NumberFormat('en-US').format(Number(v) || 0)}${cur ? ' ' + cur : ''}`;
const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { hour12: false });
};
const pretty = (o) => {
  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return String(o);
  }
};

const webhookEvents = computed(() => (s.value?.events || []).filter((e) => e.eventType === 'WEBHOOK'));
const lastError = computed(() => (s.value?.events || []).find((e) => e.eventType === 'ERROR')?.message || null);

const sizeLabel = (v) => v || '—';
const ynLabel = (v) => (v ? 'نعم' : 'لا');

const summaryFields = computed(() => {
  const x = s.value || {};
  return [
    { label: 'المزوّد', value: x.providerName || 'Boxy' },
    { label: 'معرّف Boxy (UID)', value: x.providerShipmentId },
    { label: 'كود المنصّة', value: x.platformCode },
    { label: 'كود التتبّع', value: x.trackingNumber },
    { label: 'حالة المزوّد', value: x.providerStatus },
    { label: 'الحالة الداخلية', value: statusMeta(x.status).label },
    { label: 'الحجم', value: sizeLabel(x.size) },
    { label: 'نوع الدفع', value: x.paymentType },
    { label: 'الرسوم على', value: x.feeType },
    { label: 'قابل للكسر', value: ynLabel(x.fragile) },
    { label: 'جاهز للاستلام', value: ynLabel(x.readyToPickup) },
    { label: 'الدفع عند الاستلام', value: fmtMoney(x.codAmount, x.currency) },
    { label: 'رسوم التوصيل', value: fmtMoney(x.deliveryFee, x.currency) },
    { label: 'آخر مزامنة', value: fmtDate(x.lastSyncedAt) },
    { label: 'تاريخ الإنشاء', value: fmtDate(x.createdAt) },
  ];
});

const contactFields = computed(() => {
  const x = s.value || {};
  return [
    { label: 'الاسم', value: x.recipientName },
    { label: 'الهاتف', value: x.recipientPhone },
    { label: 'هاتف ثانوي', value: x.secondaryPhone },
    { label: 'المحافظة', value: x.province },
    { label: 'المنطقة', value: x.region },
    { label: 'العنوان', value: x.recipientAddress },
  ];
});

async function load() {
  loading.value = true;
  try {
    s.value = await store.fetchShipment(id.value);
  } catch {
    s.value = null;
  } finally {
    loading.value = false;
  }
}

async function doSync() {
  busy.value = 'sync';
  try {
    s.value = await store.syncShipment(id.value);
  } catch {
    /* notified */
  } finally {
    busy.value = null;
  }
}

async function doCancel() {
  busy.value = 'cancel';
  try {
    s.value = await store.cancelShipment(id.value);
    cancelDialog.value = false;
  } catch {
    /* notified */
  } finally {
    busy.value = null;
  }
}

async function printLabel() {
  busy.value = 'label';
  try {
    const url = await store.fetchLabel(id.value);
    if (url) window.open(url, '_blank', 'noopener');
  } catch {
    /* notified */
  } finally {
    busy.value = null;
  }
}

async function copyIdentifiers() {
  const x = s.value || {};
  const text = [
    `Boxy UID: ${x.providerShipmentId || '—'}`,
    `Platform code: ${x.platformCode || '—'}`,
    `Tracking code: ${x.trackingNumber || '—'}`,
    `Shipment #: ${x.shipmentNumber || '—'}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    notify.success('تم نسخ المعرّفات');
  } catch {
    notify.error('تعذّر النسخ');
  }
}

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
