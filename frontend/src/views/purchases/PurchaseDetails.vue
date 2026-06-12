<template>
  <div class="page-shell">
    <PageHeader
      :title="`فاتورة شراء ${invoice?.invoiceNumber || ''}`"
      :subtitle="invoice?.supplier?.name || ''"
      icon="mdi-cart-arrow-down"
    >
      <v-btn variant="text" prepend-icon="mdi-arrow-right" to="/purchases">رجوع</v-btn>
    </PageHeader>

    <div v-if="invoice" class="summary-grid page-section">
      <StatCard
        label="الإجمالي"
        :value="formatCurrency(invoice.total, invoice.currency)"
        icon="mdi-sigma"
        icon-color="primary"
      />
      <StatCard
        label="المدفوع"
        :value="formatCurrency(invoice.paidAmount, invoice.currency)"
        icon="mdi-cash-check"
        icon-color="success"
      />
      <StatCard
        label="المتبقي (ذمة)"
        :value="formatCurrency(invoice.remainingAmount, invoice.currency)"
        icon="mdi-cash-clock"
        :icon-color="invoice.remainingAmount > 0 ? 'error' : 'success'"
      />
      <StatCard
        label="الحالة"
        :value="statusLabel"
        icon="mdi-information"
        :icon-color="statusColor"
      />
    </div>

    <v-card v-if="invoice" class="page-section pa-3">
      <div class="flex items-center gap-2 flex-wrap">
        <v-btn
          v-if="invoice.status === 'received' && invoice.remainingAmount > 0 && canPay"
          color="success"
          prepend-icon="mdi-cash-plus"
          @click="paymentDialog = true"
        >
          دفعة للمورد
        </v-btn>
        <v-btn
          v-if="invoice.status === 'received' && canReturn && !fullyReturned"
          color="warning"
          prepend-icon="mdi-undo-variant"
          @click="openReturnDialog"
        >
          مرتجع شراء
        </v-btn>
        <v-btn
          v-if="invoice.status === 'received' && canCancel && !hasReturns"
          color="error"
          variant="tonal"
          prepend-icon="mdi-cancel"
          @click="confirmCancel"
        >
          إلغاء الفاتورة
        </v-btn>
      </div>
      <div
        v-if="invoice.status === 'received' && canCancel && hasReturns"
        class="text-caption text-medium-emphasis mt-2"
      >
        لا يمكن إلغاء فاتورة عليها مرتجعات مباشرةً — عالجها بمرتجع شراء كامل لعكسها.
      </div>
    </v-card>

    <!-- Items -->
    <v-card v-if="invoice" class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="primary">mdi-package-variant</v-icon>
          الأصناف
        </span>
      </div>
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>المنتج</th>
            <th>الوحدة</th>
            <th>الكمية</th>
            <th>كلفة الوحدة</th>
            <th>الإجمالي</th>
            <th>الصلاحية</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in invoice.items" :key="it.id">
            <td>{{ it.productName }}</td>
            <td>{{ it.unitName || '-' }}</td>
            <td>{{ it.quantity }}</td>
            <td>{{ formatCurrency(it.unitCost, invoice.currency) }}</td>
            <td class="font-weight-bold">{{ formatCurrency(it.subtotal, invoice.currency) }}</td>
            <td>{{ it.expiryDate || '-' }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Returns -->
    <v-card v-if="invoice?.returns?.length" class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="warning">mdi-undo-variant</v-icon>
          المرتجعات
        </span>
      </div>
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>الرقم</th>
            <th>القيمة المرتجعة</th>
            <th>خصم من الذمة</th>
            <th>استرداد نقدي</th>
            <th>التاريخ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in invoice.returns" :key="r.id">
            <td>{{ r.returnNumber }}</td>
            <td>{{ formatCurrency(r.returnedValue, r.currency) }}</td>
            <td>{{ formatCurrency(r.debtReduction, r.currency) }}</td>
            <td>{{ formatCurrency(r.refundAmount, r.currency) }}</td>
            <td>{{ formatDate(r.createdAt) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Vouchers -->
    <v-card v-if="invoice?.vouchers?.length" class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="teal">mdi-receipt-text-check-outline</v-icon>
          السندات المرتبطة
        </span>
      </div>
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>الرقم</th>
            <th>النوع</th>
            <th>المبلغ</th>
            <th>التاريخ</th>
            <th>البيان</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in invoice.vouchers" :key="v.id">
            <td>{{ v.voucherNumber }}</td>
            <td>
              <v-chip
                size="x-small"
                :color="v.voucherType === 'receipt' ? 'success' : 'error'"
                variant="tonal"
              >
                {{ v.voucherType === 'receipt' ? 'قبض' : 'صرف' }}
              </v-chip>
            </td>
            <td>{{ formatCurrency(v.amount, v.currency) }}</td>
            <td>{{ v.voucherDate }}</td>
            <td>{{ v.description }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Payment dialog -->
    <v-dialog v-model="paymentDialog" max-width="460">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon color="success">mdi-cash-plus</v-icon>
          <span>دفعة للمورد</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-text-field
            v-model.number="paymentAmount"
            type="number"
            :label="`المبلغ (المتبقي ${formatCurrency(invoice?.remainingAmount || 0, invoice?.currency)})`"
            variant="outlined"
            density="comfortable"
            autofocus
          />
          <v-select
            v-if="treasuryTargets.length"
            v-model="paymentTarget"
            :items="treasuryTargets"
            item-title="title"
            item-value="key"
            label="الدفع من (صندوق/حساب)"
            variant="outlined"
            density="comfortable"
            clearable
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="paymentDialog = false">إلغاء</v-btn>
          <v-btn color="success" :loading="saving" @click="savePayment">تسجيل الدفعة</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Return dialog -->
    <v-dialog v-model="returnDialog" max-width="640">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon color="warning">mdi-undo-variant</v-icon>
          <span>مرتجع شراء</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>المشتراة</th>
                <th style="width: 140px">الكمية المرتجعة</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in returnLines" :key="line.purchaseItemId">
                <td>{{ line.productName }}</td>
                <td>{{ line.maxQuantity }}</td>
                <td>
                  <v-text-field
                    v-model.number="line.quantity"
                    type="number"
                    min="0"
                    :max="line.maxQuantity"
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </td>
              </tr>
            </tbody>
          </v-table>
          <v-textarea
            v-model="returnReason"
            label="السبب"
            variant="outlined"
            density="comfortable"
            rows="2"
            class="mt-3"
            auto-grow
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="returnDialog = false">إلغاء</v-btn>
          <v-btn color="warning" :loading="saving" @click="saveReturn">تسجيل المرتجع</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Cancel-invoice dialog (window.prompt is unsupported in Electron) -->
    <v-dialog v-model="cancelDialog" max-width="460">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon color="error">mdi-cancel</v-icon>
          <span>إلغاء فاتورة الشراء</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-alert
            type="warning"
            variant="tonal"
            density="comfortable"
            class="mb-3"
            text="سيتم عكس أثر هذه الفاتورة على المخزون والذمة. لا يمكن التراجع بعد الإلغاء."
          />
          <v-textarea
            v-model="cancelReason"
            label="سبب الإلغاء (اختياري)"
            variant="outlined"
            density="comfortable"
            rows="2"
            auto-grow
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="cancelDialog = false">تراجع</v-btn>
          <v-btn color="error" :loading="saving" @click="doCancel">تأكيد الإلغاء</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { usePurchaseStore } from '@/stores/purchase';
import { useTreasuryStore } from '@/stores/treasury';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import StatCard from '@/components/StatCard.vue';
import { formatCurrency, formatDate } from '@/utils/formatters';

const route = useRoute();
const purchaseStore = usePurchaseStore();
const treasuryStore = useTreasuryStore();
const authStore = useAuthStore();

const invoice = computed(() => purchaseStore.current);
const canPay = computed(() => authStore.hasPermission?.('vouchers:create_payment'));
const canReturn = computed(() => authStore.hasPermission?.('purchases:return'));
const canCancel = computed(() => authStore.hasPermission?.('purchases:cancel'));
// Backend rule: an invoice that already has returns can't be cancelled directly
// (it must be reversed with a full purchase return). Hide the cancel action then.
const hasReturns = computed(() => (invoice.value?.returns?.length || 0) > 0);

// Returned quantity per purchase line, and the total still returnable.
const returnedByLine = computed(() => {
  const map = {};
  for (const r of invoice.value?.returns || []) {
    for (const ri of r.items || []) {
      map[ri.purchaseItemId] = (map[ri.purchaseItemId] || 0) + ri.quantity;
    }
  }
  return map;
});
const returnableRemaining = computed(() =>
  (invoice.value?.items || []).reduce(
    (sum, it) => sum + (it.quantity - (returnedByLine.value[it.id] || 0)),
    0
  )
);
// Fully returned = it had returns AND nothing is left to return.
const fullyReturned = computed(() => hasReturns.value && returnableRemaining.value <= 0);
const isCancelled = computed(() => invoice.value?.status === 'cancelled');

// Status shown in the summary: ملغاة (cancelled) / مرتجعة (fully returned) / مستلمة.
const statusLabel = computed(() =>
  isCancelled.value ? 'ملغاة' : fullyReturned.value ? 'مرتجعة' : 'مستلمة'
);
const statusColor = computed(() =>
  isCancelled.value ? 'grey' : fullyReturned.value ? 'warning' : 'success'
);

const treasuryTargets = computed(() => [
  ...(treasuryStore.cashboxes || []).map((c) => ({
    key: `cashbox:${c.id}`,
    title: `صندوق: ${c.name}`,
  })),
  ...(treasuryStore.bankAccounts || []).map((b) => ({
    key: `bank:${b.id}`,
    title: `حساب: ${b.name}`,
  })),
]);

const saving = ref(false);
const paymentDialog = ref(false);
const paymentAmount = ref(null);
const paymentTarget = ref(null);
const returnDialog = ref(false);
const returnLines = ref([]);
const returnReason = ref('');
const cancelDialog = ref(false);
const cancelReason = ref('');

async function reload() {
  await purchaseStore.fetchOne(route.params.id);
}

async function savePayment() {
  if (!paymentAmount.value || paymentAmount.value <= 0) return;
  saving.value = true;
  try {
    const payload = { amount: paymentAmount.value };
    if (paymentTarget.value) {
      const [kind, id] = String(paymentTarget.value).split(':');
      if (kind === 'cashbox') payload.cashboxId = Number(id);
      if (kind === 'bank') payload.bankAccountId = Number(id);
    }
    await purchaseStore.addPayment(invoice.value.id, payload);
    paymentDialog.value = false;
    paymentAmount.value = null;
    await reload();
  } catch (err) {
    console.error('Failed to add supplier payment', err);
  } finally {
    saving.value = false;
  }
}

function openReturnDialog() {
  returnLines.value = (invoice.value.items || []).map((it) => ({
    purchaseItemId: it.id,
    productName: it.productName,
    maxQuantity: it.quantity - (returnedByLine.value[it.id] || 0),
    quantity: 0,
  }));
  returnReason.value = '';
  returnDialog.value = true;
}

async function saveReturn() {
  const items = returnLines.value
    .filter((l) => Number(l.quantity) > 0)
    .map((l) => ({ purchaseItemId: l.purchaseItemId, quantity: Number(l.quantity) }));
  if (!items.length) return;
  saving.value = true;
  try {
    await purchaseStore.createReturn(invoice.value.id, {
      items,
      reason: returnReason.value || null,
    });
    returnDialog.value = false;
    await reload();
  } catch (err) {
    console.error('Failed to create purchase return', err);
  } finally {
    saving.value = false;
  }
}

function confirmCancel() {
  cancelReason.value = '';
  cancelDialog.value = true;
}

async function doCancel() {
  saving.value = true;
  try {
    await purchaseStore.cancel(invoice.value.id, cancelReason.value || null);
    cancelDialog.value = false;
    await reload();
  } catch (err) {
    console.error('Failed to cancel purchase', err);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await reload();
  if (authStore.hasFeature('treasury')) {
    treasuryStore.fetchCashboxes().catch(() => {});
    if (authStore.hasFeature('bankAccounts')) treasuryStore.fetchBankAccounts().catch(() => {});
  }
});
</script>
