<template>
  <!-- Already shipped (send mode only) → show a status chip with the carrier -->
  <v-chip
    v-if="!resend && activeShipment"
    color="primary"
    size="small"
    variant="tonal"
    prepend-icon="mdi-truck-fast"
    to="/delivery/shipments"
  >
    {{ activeShipment.providerName ? `${activeShipment.providerName}: ` : 'الشحنة: '
    }}{{ shipStatus(activeShipment.status) }}
  </v-chip>

  <template v-else-if="showButton">
    <v-btn
      :color="resend ? 'warning' : 'primary'"
      :icon="resend ? 'mdi-send-clock' : 'mdi-truck-fast-outline'"
      size="small"
      variant="text"
      :title="buttonLabel"
      @click="open"
    />

    <v-dialog v-model="dialog" max-width="760" scrollable persistent>
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-truck-fast-outline</v-icon>
          <span>{{ dialogTitle }}</span>
        </v-card-title>
        <v-divider />

        <v-card-text class="pt-4" style="max-height: 72vh">
          <!-- Success result -->
          <v-alert v-if="result" type="success" variant="tonal" class="mb-2">
            <div class="font-weight-medium mb-1">تم إنشاء الشحنة بنجاح</div>
            <div v-if="result.providerName">
              شركة الشحن: <strong>{{ result.providerName }}</strong>
            </div>
            <div>
              رقم الشحنة المحلي: <strong>{{ result.shipmentNumber }}</strong>
            </div>
            <div v-if="result.providerShipmentId">
              كود المنصّة: <strong>{{ result.providerShipmentId }}</strong>
            </div>
            <div v-if="result.trackingNumber">
              كود التتبّع: <strong>{{ result.trackingNumber }}</strong>
            </div>
            <div v-else class="text-caption text-medium-emphasis">
              سيظهر كود التتبّع بعد قبول شركة الشحن للشحنة.
            </div>
          </v-alert>

          <v-form v-else ref="formRef">
            <v-row dense>
              <!-- Carrier picker (active providers only) -->
              <v-col cols="12">
                <v-select
                  v-model="form.providerId"
                  :items="providers"
                  item-title="name"
                  item-value="id"
                  label="شركة الشحن *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[req]"
                  :hint="selectedProviderHint"
                  persistent-hint
                >
                  <template #item="{ props: itemProps, item }">
                    <v-list-item v-bind="itemProps" :subtitle="item.raw.notes || ''">
                      <template #append>
                        <v-chip size="x-small" color="success" variant="tonal">مفعّلة</v-chip>
                      </template>
                    </v-list-item>
                  </template>
                </v-select>
              </v-col>

              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.recipientName"
                  label="الاسم الكامل للزبون *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[req]"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.recipientPhone"
                  label="هاتف الزبون *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[req]"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.secondaryPhone"
                  label="هاتف ثانوي"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.province"
                  label="المحافظة *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[req]"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.region"
                  label="المنطقة"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.recipientAddress"
                  label="العنوان الكامل *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[req]"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="form.description"
                  label="وصف الطلب"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>

              <v-col cols="12" sm="6" md="3">
                <v-select
                  v-model="form.size"
                  :items="sizes"
                  label="حجم الشحنة"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" sm="6" md="3" class="d-flex align-center">
                <v-checkbox
                  v-model="form.fragile"
                  label="قابل للكسر"
                  hide-details
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" sm="6" md="3" class="d-flex align-center">
                <v-checkbox
                  v-model="form.readyToPickup"
                  label="جاهز للاستلام"
                  hide-details
                  density="comfortable"
                />
              </v-col>

              <v-col cols="12" md="6">
                <v-select
                  v-model="form.paymentType"
                  :items="paymentTypes"
                  label="نوع الدفع"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="form.feeType"
                  :items="feeTypes"
                  label="رسوم التوصيل على"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model.number="form.codAmount"
                  type="number"
                  min="0"
                  label="مبلغ الدفع عند الاستلام (COD)"
                  variant="outlined"
                  density="comfortable"
                  :disabled="form.paymentType === 'PREPAID'"
                  :hint="form.paymentType === 'PREPAID' ? 'مدفوع مسبقاً' : ''"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model="form.notes"
                  label="ملاحظات"
                  variant="outlined"
                  density="comfortable"
                  rows="2"
                  auto-grow
                />
              </v-col>
            </v-row>

            <!-- Products preview -->
            <div class="text-subtitle-2 mt-2 mb-1">المنتجات</div>
            <v-table v-if="products.length" density="compact">
              <thead>
                <tr>
                  <th class="text-right">المنتج</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(p, i) in products" :key="i">
                  <td>{{ p.productName }}</td>
                  <td>{{ p.quantity }}</td>
                  <td>{{ fmt(p.unitPrice) }}</td>
                </tr>
              </tbody>
            </v-table>
            <div v-else class="text-caption text-medium-emphasis">لا توجد منتجات مرتبطة.</div>
          </v-form>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">{{ result ? 'إغلاق' : 'إلغاء' }}</v-btn>
          <v-btn v-if="!result" color="primary" variant="elevated" :loading="sending" @click="send">
            {{ resend ? 'إعادة الإرسال' : 'إرسال' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </template>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useDeliveryShipmentStore } from '@/stores/deliveryShipment';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useOnlineOrderStore } from '@/stores/onlineOrder';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notification';
import {
  SHIPMENT_SIZES,
  SHIPMENT_PAYMENT_TYPES,
  SHIPMENT_FEE_TYPES,
  statusMeta,
  isTerminalStatus,
} from '@/constants/delivery';

const props = defineProps({
  order: { type: Object, default: null },
  sale: { type: Object, default: null },
  // Single-entity pages (sale details) can eagerly check for an existing
  // shipment on mount; list rows leave it lazy (checked on click).
  checkOnMount: { type: Boolean, default: false },
  // Resend mode supersedes the active shipment and lets the user pick the carrier
  // again (gated by online_orders:resend_to_shipping).
  resend: { type: Boolean, default: false },
  label: { type: String, default: null },
});
const emit = defineEmits(['created']);

const shipmentStore = useDeliveryShipmentStore();
const providerStore = useDeliveryProviderStore();
const orderStore = useOnlineOrderStore();
const authStore = useAuthStore();
const notify = useNotificationStore();

const sizes = SHIPMENT_SIZES;
const paymentTypes = SHIPMENT_PAYMENT_TYPES;
const feeTypes = SHIPMENT_FEE_TYPES;

const dialog = ref(false);
const sending = ref(false);
const result = ref(null);
const formRef = ref(null);
const providers = ref([]); // active carriers for the picker
const activeShipment = ref(null);
const fullEntity = ref(null); // full order (with items) when only a summary was passed

const entityId = computed(() => props.order?.id || props.sale?.id || null);
const entity = computed(() => fullEntity.value || props.order || props.sale || {});
const isCancelled = computed(() =>
  props.order ? entity.value.status === 'CANCELLED' : entity.value.status === 'cancelled'
);
// Send needs delivery_shipments:create; resend needs the dedicated permission.
const canAct = computed(() =>
  props.resend
    ? authStore.hasPermission('online_orders:resend_to_shipping')
    : authStore.hasPermission('delivery_shipments:create')
);
// The whole shipment sub-feature is gated by the shipping flag (الشحن). When it
// is off, the button hides and NO delivery API call is made from this page.
const shipOn = computed(() => authStore.hasFeature('shipping'));
const showButton = computed(
  () => shipOn.value && !!entityId.value && canAct.value && !isCancelled.value
);

const buttonLabel = computed(
  () => props.label || (props.resend ? 'إعادة الإرسال' : 'إرسال إلى شركة شحن')
);
const dialogTitle = computed(() =>
  props.resend ? 'إعادة الإرسال إلى شركة شحن' : 'إرسال إلى شركة شحن'
);
const selectedProviderHint = computed(() => {
  const p = providers.value.find((x) => x.id === form.providerId);
  return p?.notes || '';
});

const products = computed(() => entity.value.items || []);

const req = (v) => (!!v && String(v).trim().length > 0) || 'مطلوب';
const fmt = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);
const shipStatus = (s) => statusMeta(s).label;

const form = reactive({
  providerId: null,
  recipientName: '',
  recipientPhone: '',
  secondaryPhone: '',
  province: '',
  region: '',
  recipientAddress: '',
  description: '',
  size: 'M',
  fragile: false,
  readyToPickup: true,
  paymentType: 'COLLECT_ON_DELIVERY',
  feeType: 'BY_MERCHANT',
  codAmount: 0,
  notes: '',
});

function prefill() {
  const e = entity.value;
  if (props.order) {
    form.recipientName = e.customerName || '';
    form.recipientPhone = e.customerPhone || '';
    form.recipientAddress = e.customerAddress || '';
    form.province = e.province || '';
    form.codAmount = Number(e.totalAmount) || 0;
  } else {
    form.recipientName = e.customerName || e.customer?.name || '';
    form.recipientPhone = e.customer?.phone || e.customerPhone || '';
    form.recipientAddress = e.customer?.address || '';
    form.province = e.customer?.city || '';
    form.codAmount = Number(e.remainingAmount ?? e.total) || 0;
  }
  form.description = products.value
    .map((p) => p.productName)
    .filter(Boolean)
    .slice(0, 5)
    .join('، ');
}

async function ensureProviders() {
  if (!providers.value.length) providers.value = await providerStore.fetchActiveProviders();
  return providers.value;
}

async function loadActive() {
  const list = await shipmentStore.fetchForEntity(
    props.order ? { onlineOrderId: entityId.value } : { saleId: entityId.value }
  );
  activeShipment.value = list.find((s) => !isTerminalStatus(s.status)) || null;
  return activeShipment.value;
}

async function open() {
  await ensureProviders();
  if (!providers.value.length) {
    notify.error('لا توجد شركة شحن مفعّلة. يرجى تفعيل شركة شحن من الإعدادات.');
    return;
  }
  const active = await loadActive();
  // Normal send refuses while a live shipment exists; resend supersedes it.
  if (!props.resend && active) {
    notify.error('توجد شحنة نشطة لهذا الطلب/الفاتورة بالفعل.');
    return;
  }
  // For an online order summary, fetch the full order to get its items.
  if (props.order && !props.order.items) {
    try {
      fullEntity.value = await orderStore.fetchOrder(entityId.value);
    } catch {
      /* fall back to summary */
    }
  }
  prefill();
  // Preselect the carrier: on resend keep the current one; else the default.
  const preferred =
    (props.resend && active?.providerId) ||
    providers.value.find((p) => p.isDefault)?.id ||
    providers.value[0]?.id;
  form.providerId = providers.value.some((p) => p.id === preferred)
    ? preferred
    : providers.value[0]?.id;
  result.value = null;
  dialog.value = true;
}

async function send() {
  const { valid } = await formRef.value.validate();
  if (!valid) return;
  sending.value = true;
  try {
    const payload = {
      providerId: form.providerId,
      ...(props.order ? { onlineOrderId: entityId.value } : { saleId: entityId.value }),
      recipientName: form.recipientName.trim(),
      recipientPhone: form.recipientPhone.trim(),
      secondaryPhone: form.secondaryPhone?.trim() || null,
      province: form.province?.trim() || null,
      region: form.region?.trim() || null,
      recipientAddress: form.recipientAddress?.trim() || null,
      description: form.description?.trim() || null,
      size: form.size,
      fragile: form.fragile,
      readyToPickup: form.readyToPickup,
      paymentType: form.paymentType,
      feeType: form.feeType,
      codAmount: form.paymentType === 'PREPAID' ? 0 : Number(form.codAmount) || 0,
      notes: form.notes?.trim() || null,
    };
    const shipment = props.resend
      ? await shipmentStore.resendShipment(payload)
      : await shipmentStore.createShipment(payload);
    if (shipment?.status === 'FAILED') {
      notify.error('رفضت شركة الشحن الشحنة. تحقّق من الإعدادات وحاول مجدداً.');
      activeShipment.value = null; // a failed shipment is terminal; allow retry
    } else {
      result.value = shipment; // saved locally; show platform/tracking codes
      activeShipment.value = shipment;
      notify.success(props.resend ? 'تمت إعادة إرسال الشحنة' : 'تم إنشاء الشحنة');
      emit('created', shipment);
    }
  } catch {
    // surfaced via notification store
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  // Shipping feature off → no probing, no shipment chip, no delivery API calls.
  if (!shipOn.value) return;
  // Eagerly reflect an existing shipment as a chip on single-entity pages.
  if (
    props.checkOnMount &&
    !props.resend &&
    entityId.value &&
    authStore.hasPermission('delivery_shipments:read')
  ) {
    await loadActive();
  }
});
</script>
