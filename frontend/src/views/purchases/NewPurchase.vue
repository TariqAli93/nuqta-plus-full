<template>
  <div class="page-shell">
    <PageHeader
      title="فاتورة شراء جديدة"
      subtitle="استلام بضاعة من مورد وإدخالها للمخزون"
      icon="mdi-cart-plus"
    >
      <v-btn variant="text" prepend-icon="mdi-arrow-right" to="/purchases">رجوع</v-btn>
    </PageHeader>

    <OnboardingTip
      id="purchase-intro"
      text="شراء البضاعة يزيد المخزون تلقائياً. الشراء النقدي ينقص الصندوق، والشراء الآجل يظهر كمبلغ علينا للمورد."
    />

    <v-form ref="form" @submit.prevent="save">
      <v-card class="page-section pa-4">
        <v-row dense>
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="formData.supplierId"
              :items="supplierOptions"
              item-title="name"
              item-value="id"
              label="المورد *"
              variant="outlined"
              density="comfortable"
              :rules="[(v) => !!v || 'المورد مطلوب']"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="formData.supplierInvoiceNumber"
              label="رقم فاتورة المورد (الورقية)"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-text-field
              v-model="formData.invoiceDate"
              type="date"
              label="التاريخ"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="formData.currency"
              :items="['IQD', 'USD']"
              label="العملة"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
        </v-row>
      </v-card>

      <!-- Items -->
      <v-card class="page-section">
        <div class="section-title">
          <span class="section-title__label">
            <v-icon size="20" color="primary">mdi-package-variant</v-icon>
            الأصناف
          </span>
          <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="addLine">
            إضافة صنف
          </v-btn>
        </div>
        <v-table density="comfortable">
          <thead>
            <tr>
              <th style="min-width: 220px">المنتج</th>
              <th style="min-width: 140px">الوحدة</th>
              <th style="width: 110px">الكمية</th>
              <th style="width: 140px">كلفة الوحدة</th>
              <th style="width: 150px">تاريخ الصلاحية</th>
              <th style="width: 130px">الإجمالي</th>
              <th style="width: 50px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, idx) in lines" :key="idx">
              <td>
                <v-autocomplete
                  v-model="line.productId"
                  :items="productOptions"
                  item-title="name"
                  item-value="id"
                  density="compact"
                  variant="outlined"
                  hide-details
                  placeholder="ابحث عن المنتج"
                  @update:model-value="(v) => onProductChange(line, v)"
                />
              </td>
              <td>
                <v-select
                  v-model="line.unitId"
                  :items="line.units"
                  item-title="name"
                  item-value="id"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :disabled="!line.units.length"
                />
              </td>
              <td>
                <v-text-field
                  v-model.number="line.quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </td>
              <td>
                <v-text-field
                  v-model.number="line.unitCost"
                  type="number"
                  min="0"
                  step="0.01"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </td>
              <td>
                <v-text-field
                  v-model="line.expiryDate"
                  type="date"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </td>
              <td class="font-weight-bold">
                {{ formatCurrency((line.quantity || 0) * (line.unitCost || 0), formData.currency) }}
              </td>
              <td>
                <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="removeLine(idx)" />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Totals + payment -->
      <v-card class="page-section pa-4">
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model.number="formData.discount"
              type="number"
              min="0"
              label="خصم على الفاتورة"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="formData.paymentType"
              :items="[
                { value: 'cash', title: 'نقدي' },
                { value: 'credit', title: 'آجل (دين)' },
              ]"
              label="نوع الدفع"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model.number="formData.paidAmount"
              type="number"
              min="0"
              :label="formData.paymentType === 'cash' ? 'المدفوع (فارغ = الكل)' : 'دفعة مقدمة'"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col v-if="treasuryOn && treasuryTargets.length" cols="12" sm="6" md="3">
            <v-select
              v-model="treasuryTarget"
              :items="treasuryTargets"
              item-title="title"
              item-value="key"
              label="الدفع من (صندوق/حساب)"
              variant="outlined"
              density="comfortable"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="formData.updateCostPrices"
              color="primary"
              hide-details
              label="تحديث كلفة المنتجات لآخر شراء"
            />
          </v-col>
          <v-col cols="12">
            <v-textarea
              v-model="formData.notes"
              label="ملاحظات"
              variant="outlined"
              density="comfortable"
              rows="2"
              auto-grow
            />
          </v-col>
        </v-row>

        <v-divider class="my-3" />
        <div class="flex items-center justify-space-between flex-wrap gap-3">
          <div class="text-h6">
            الإجمالي:
            <span class="font-weight-bold text-primary">{{ formatCurrency(total, formData.currency) }}</span>
          </div>
          <v-btn color="primary" size="large" :loading="saving" :disabled="!lines.length" @click="save">
            استلام وتسجيل الفاتورة
          </v-btn>
        </div>
      </v-card>
    </v-form>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/plugins/axios';
import { usePurchaseStore } from '@/stores/purchase';
import { useSupplierStore } from '@/stores/supplier';
import { useTreasuryStore } from '@/stores/treasury';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import OnboardingTip from '@/components/OnboardingTip.vue';
import { formatCurrency } from '@/utils/formatters';

const router = useRouter();
const purchaseStore = usePurchaseStore();
const supplierStore = useSupplierStore();
const treasuryStore = useTreasuryStore();
const authStore = useAuthStore();

const form = ref(null);
const saving = ref(false);
const productOptions = ref([]);
const lines = reactive([]);
const treasuryTarget = ref(null);

const supplierOptions = computed(() => supplierStore.items);
const treasuryOn = computed(() => authStore.hasFeature('treasury'));
const treasuryTargets = computed(() => [
  ...(treasuryStore.cashboxes || []).map((c) => ({ key: `cashbox:${c.id}`, title: `صندوق: ${c.name}` })),
  ...(treasuryStore.bankAccounts || []).map((b) => ({ key: `bank:${b.id}`, title: `حساب: ${b.name}` })),
]);

const formData = reactive({
  supplierId: null,
  supplierInvoiceNumber: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  currency: 'IQD',
  discount: 0,
  paymentType: 'cash',
  paidAmount: null,
  updateCostPrices: false,
  notes: '',
});

const total = computed(() => {
  const sub = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  return Math.max(0, sub - (Number(formData.discount) || 0));
});

function addLine() {
  lines.push({
    productId: null,
    unitId: null,
    units: [],
    quantity: 1,
    unitCost: 0,
    expiryDate: '',
  });
}

function removeLine(idx) {
  lines.splice(idx, 1);
}

function onProductChange(line, productId) {
  line.unitId = null;
  line.units = [];
  if (!productId) return;
  const product = productOptions.value.find((p) => p.id === productId);
  if (!product) return;
  line.unitCost = Number(product.costPrice) || 0;
  // Units come embedded on the product row (see utils/productUnits.js) —
  // no extra API round-trip needed.
  const units = Array.isArray(product.units) ? product.units.filter((u) => u.isActive !== false) : [];
  line.units = units;
  const def = units.find((u) => u.isDefaultPurchase) || units.find((u) => u.isBase) || units[0];
  if (def) {
    line.unitId = def.id;
    line.unitCost =
      def.costPrice != null
        ? Number(def.costPrice)
        : (Number(product.costPrice) || 0) * (Number(def.conversionFactor) || 1);
  }
}

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  const items = lines
    .filter((l) => l.productId && Number(l.quantity) > 0)
    .map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost) || 0,
      unitId: l.unitId || undefined,
      expiryDate: l.expiryDate || undefined,
    }));
  if (!items.length) return;

  saving.value = true;
  try {
    const payload = {
      supplierId: formData.supplierId,
      supplierInvoiceNumber: formData.supplierInvoiceNumber || null,
      invoiceDate: formData.invoiceDate || undefined,
      currency: formData.currency,
      discount: Number(formData.discount) || 0,
      paymentType: formData.paymentType,
      items,
      updateCostPrices: formData.updateCostPrices,
      notes: formData.notes || null,
    };
    if (formData.paidAmount != null && formData.paidAmount !== '') {
      payload.paidAmount = Number(formData.paidAmount);
    }
    if (treasuryTarget.value) {
      const [kind, id] = String(treasuryTarget.value).split(':');
      if (kind === 'cashbox') payload.cashboxId = Number(id);
      if (kind === 'bank') payload.bankAccountId = Number(id);
    }
    const created = await purchaseStore.create(payload);
    router.push(`/purchases/${created.id}`);
  } catch (err) {
    console.error('Failed to create purchase', err);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  addLine();
  await Promise.all([
    supplierStore.fetch({ limit: 200 }).catch(() => {}),
    api
      .get('/products', { params: { limit: 500 }, meta: { silent: true } })
      .then((res) => {
        productOptions.value = res?.data || [];
      })
      .catch(() => {}),
    treasuryOn.value ? treasuryStore.fetchCashboxes().catch(() => {}) : Promise.resolve(),
    treasuryOn.value && authStore.hasFeature('bankAccounts')
      ? treasuryStore.fetchBankAccounts().catch(() => {})
      : Promise.resolve(),
  ]);
});
</script>
