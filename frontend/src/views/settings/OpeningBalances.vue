<template>
  <div class="page-shell">
    <PageHeader
      title="الأرصدة الافتتاحية"
      subtitle="أدخل أرصدة العملاء والموردين والنقد والمخزون قبل بدء استخدام النظام المحاسبي، ثم أنشئ القيد الافتتاحي."
      icon="mdi-clipboard-list-outline"
    />

    <v-alert
      v-if="status?.hasOpeningEntry"
      type="success"
      variant="tonal"
      class="page-section mb-4"
      text="تم إنشاء القيد الافتتاحي مسبقاً. الأرصدة الافتتاحية مُرحّلة إلى الدفاتر."
    />

    <v-row class="page-section" dense>
      <!-- ديون العملاء الافتتاحية -->
      <v-col cols="12" md="6">
        <v-card class="h-full">
          <v-card-title class="dialog-title">
            <v-icon color="primary">mdi-account-arrow-left</v-icon>
            <span>أرصدة العملاء (مدينون)</span>
          </v-card-title>
          <v-divider />
          <v-card-text>
            <CustomerSelector v-model="cust.customerId" :required="false" />
            <v-text-field
              v-model.number="cust.amount"
              type="number"
              label="مبلغ الدين الافتتاحي"
              variant="outlined"
              density="comfortable"
              class="mt-2 mb-2"
            />
            <v-btn
              color="primary"
              :loading="cust.saving"
              :disabled="!cust.customerId || !(cust.amount > 0)"
              block
              @click="saveCustomer"
            >
              إضافة رصيد العميل
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- أرصدة الموردين الافتتاحية -->
      <v-col cols="12" md="6">
        <v-card class="h-full">
          <v-card-title class="dialog-title">
            <v-icon color="deep-purple">mdi-truck-outline</v-icon>
            <span>أرصدة الموردين (دائنون)</span>
          </v-card-title>
          <v-divider />
          <v-card-text>
            <v-autocomplete
              v-model="sup.supplierId"
              :items="suppliers"
              :item-title="(s) => s.name"
              item-value="id"
              label="المورد"
              variant="outlined"
              density="comfortable"
            />
            <v-text-field
              v-model.number="sup.amount"
              type="number"
              label="مبلغ الرصيد الافتتاحي"
              variant="outlined"
              density="comfortable"
              class="mt-2 mb-2"
            />
            <v-btn
              color="deep-purple"
              :loading="sup.saving"
              :disabled="!sup.supplierId || !(sup.amount > 0)"
              block
              @click="saveSupplier"
            >
              إضافة رصيد المورد
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- ملخص + توليد القيد -->
    <v-card class="page-section">
      <v-card-title class="dialog-title">
        <v-icon color="success">mdi-book-plus-outline</v-icon>
        <span>القيد الافتتاحي</span>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <v-row dense>
          <v-col cols="6" md="3">
            <div class="text-medium-emphasis text-caption">ذمم العملاء (مدينة)</div>
            <div class="text-h6 font-mono">{{ fmt(status?.openingAR) }}</div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="text-medium-emphasis text-caption">ذمم الموردين (دائنة)</div>
            <div class="text-h6 font-mono">{{ fmt(status?.openingAP) }}</div>
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field
              v-model.number="entry.cashAmount"
              type="number"
              label="رصيد النقد/الصناديق"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field
              v-model.number="entry.inventoryAmount"
              type="number"
              label="قيمة المخزون الافتتاحي"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>

        <v-alert type="info" variant="tonal" density="compact" class="mt-3">
          سيُنشأ قيد متوازن: مدين (نقد + مخزون + ذمم العملاء) / دائن (ذمم الموردين)، والفرق يُرحَّل
          إلى حساب «حقوق الأرصدة الافتتاحية».
        </v-alert>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn
          color="success"
          prepend-icon="mdi-check"
          :loading="entry.saving"
          :disabled="status?.hasOpeningEntry"
          @click="generate"
        >
          إنشاء القيد الافتتاحي
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '@/plugins/axios';
import { useNotificationStore } from '@/stores/notification';
import PageHeader from '@/components/PageHeader.vue';
import CustomerSelector from '@/components/CustomerSelector.vue';
import { formatCurrency } from '@/utils/formatters';

const notify = useNotificationStore();

const status = ref(null);
const suppliers = ref([]);
const cust = reactive({ customerId: null, amount: null, saving: false });
const sup = reactive({ supplierId: null, amount: null, saving: false });
const entry = reactive({ cashAmount: null, inventoryAmount: null, saving: false });

const fmt = (v) => formatCurrency(v || 0, 'IQD');

async function loadStatus() {
  try {
    const res = await api.get('/opening-balances/status');
    status.value = res?.data || null;
  } catch {
    /* handled globally */
  }
}

async function loadSuppliers() {
  try {
    const res = await api.get('/suppliers', { params: { limit: 500 } });
    suppliers.value = res?.data || res?.data?.data || [];
    if (!Array.isArray(suppliers.value)) suppliers.value = res?.data?.data || [];
  } catch {
    suppliers.value = [];
  }
}

async function saveCustomer() {
  cust.saving = true;
  try {
    await api.post('/opening-balances/customer', {
      customerId: cust.customerId,
      amount: cust.amount,
    });
    notify.success('تم تسجيل رصيد العميل');
    cust.customerId = null;
    cust.amount = null;
    await loadStatus();
  } catch {
    /* handled globally */
  } finally {
    cust.saving = false;
  }
}

async function saveSupplier() {
  sup.saving = true;
  try {
    await api.post('/opening-balances/supplier', {
      supplierId: sup.supplierId,
      amount: sup.amount,
    });
    notify.success('تم تسجيل رصيد المورد');
    sup.supplierId = null;
    sup.amount = null;
    await loadStatus();
  } catch {
    /* handled globally */
  } finally {
    sup.saving = false;
  }
}

async function generate() {
  entry.saving = true;
  try {
    await api.post('/opening-balances/generate-entry', {
      cashAmount: entry.cashAmount || 0,
      inventoryAmount: entry.inventoryAmount || 0,
    });
    notify.success('تم إنشاء القيد الافتتاحي');
    await loadStatus();
  } catch {
    /* handled globally */
  } finally {
    entry.saving = false;
  }
}

onMounted(async () => {
  await Promise.all([loadStatus(), loadSuppliers()]);
});
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
