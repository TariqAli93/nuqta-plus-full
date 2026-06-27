<template>
  <div class="page-shell">
    <PageHeader
      title="المشتريات"
      subtitle="فواتير الشراء الواردة من الموردين"
      icon="mdi-cart-arrow-down"
    >
      <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" to="/purchases/new">
        فاتورة شراء جديدة
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable (client-side): supplier / status / unpaid / date-range
         filters drive a server re-fetch via reload(); rows link to the invoice. -->
    <SmartTable
      data-testid="purchases-table"
      table-key="purchases-table"
      :headers="headers"
      :items="items"
      :loading="loading"
      :page-size="25"
      :filter-chips="filterChips"
      show-export
      show-print
      print-title="قائمة المشتريات"
      export-file-base="purchases"
      empty-title="لا توجد فواتير شراء"
      empty-description="سجّل فاتورة شراء لإدخال البضاعة للمخزون ومتابعة ذمم الموردين."
      empty-icon="mdi-cart-arrow-down"
      @clear-filters="clearFilters"
      @remove-filter="onRemoveFilter"
      @refresh="reload"
    >
      <!-- Page-owned filter controls (server-side filtering on "تطبيق"). -->
      <template #filters>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-select
              v-model="filters.supplierId"
              :items="supplierOptions"
              item-title="name"
              item-value="id"
              label="المورد"
              density="comfortable"
              variant="outlined"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="filters.status"
              :items="statusOptions"
              label="الحالة"
              density="comfortable"
              variant="outlined"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="filters.dateFrom"
              type="date"
              label="من"
              density="comfortable"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="filters.dateTo"
              type="date"
              label="إلى"
              density="comfortable"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12">
            <v-checkbox v-model="filters.unpaidOnly" label="غير مسددة" hide-details density="comfortable" />
          </v-col>
          <v-col cols="12" class="d-flex justify-end ga-2">
            <v-btn variant="text" @click="clearFilters">مسح</v-btn>
            <v-btn color="primary" prepend-icon="mdi-check" @click="reload">تطبيق</v-btn>
          </v-col>
        </v-row>
      </template>

      <!-- Custom cells (links, emphasis, status chips) pass straight through. -->
      <template #[`item.invoiceNumber`]="{ item }">
        <router-link :to="`/purchases/${item.id}`" class="text-primary font-weight-bold">
          {{ item.invoiceNumber }}
        </router-link>
      </template>
      <template #[`item.total`]="{ item }">
        <span class="font-weight-bold">{{ formatCurrency(item.total, item.currency) }}</span>
      </template>
      <template #[`item.remainingAmount`]="{ item }">
        <span :class="item.remainingAmount > 0 ? 'text-error font-weight-bold' : 'text-success'">
          {{ formatCurrency(item.remainingAmount, item.currency) }}
        </span>
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip size="x-small" :color="statusColor(item)" variant="tonal">
          {{ statusLabel(item) }}
        </v-chip>
        <v-chip v-if="item.isOpeningBalance" size="x-small" color="info" variant="tonal" class="ms-1">
          افتتاحي
        </v-chip>
      </template>
    </SmartTable>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from 'vue';
import { usePurchaseStore } from '@/stores/purchase';
import { useSupplierStore } from '@/stores/supplier';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import SmartTable from '@/components/common/SmartTable';
import { formatCurrency } from '@/utils/formatters';

const purchaseStore = usePurchaseStore();
const supplierStore = useSupplierStore();
const authStore = useAuthStore();

const loading = computed(() => purchaseStore.loading);
const items = computed(() => purchaseStore.items);
const supplierOptions = computed(() => supplierStore.items);
const canCreate = computed(() => authStore.hasPermission?.('purchases:create'));

const filters = reactive({
  supplierId: null,
  status: null,
  unpaidOnly: false,
  dateFrom: '',
  dateTo: '',
});

const statusOptions = [
  { value: 'received', title: 'مستلمة' },
  { value: 'cancelled', title: 'ملغاة' },
];

// Status chip: ملغاة (cancelled) / مرتجعة (fully returned) / مستلمة. A full
// return keeps the DB status 'received', so the list flags it via fullyReturned.
function statusLabel(item) {
  if (item.status === 'cancelled') return 'ملغاة';
  if (item.fullyReturned) return 'مرتجعة';
  return 'مستلمة';
}
function statusColor(item) {
  if (item.status === 'cancelled') return 'grey';
  if (item.fullyReturned) return 'warning';
  return 'success';
}

const headers = [
  { title: 'الرقم', key: 'invoiceNumber' },
  { title: 'المورد', key: 'supplierName' },
  { title: 'التاريخ', key: 'invoiceDate', format: 'date' },
  { title: 'الإجمالي', key: 'total', format: 'currency', align: 'end' },
  { title: 'المتبقي', key: 'remainingAmount', format: 'currency', align: 'end' },
  { title: 'الحالة', key: 'status', exportValue: (r) => statusLabel(r) },
  { title: 'بواسطة', key: 'createdByName' },
];

const statusFilterLabel = (v) => statusOptions.find((o) => o.value === v)?.title || v;
const supplierNameOf = (id) => supplierOptions.value.find((s) => s.id === id)?.name ?? id;

const filterChips = computed(() => {
  const chips = [];
  if (filters.supplierId)
    chips.push({ key: 'supplierId', label: `المورد: ${supplierNameOf(filters.supplierId)}` });
  if (filters.status) chips.push({ key: 'status', label: `الحالة: ${statusFilterLabel(filters.status)}` });
  if (filters.unpaidOnly) chips.push({ key: 'unpaidOnly', label: 'غير مسددة' });
  if (filters.dateFrom) chips.push({ key: 'dateFrom', label: `من: ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: 'dateTo', label: `إلى: ${filters.dateTo}` });
  return chips;
});

async function reload() {
  const params = {};
  if (filters.supplierId) params.supplierId = filters.supplierId;
  if (filters.status) params.status = filters.status;
  if (filters.unpaidOnly) params.unpaidOnly = true;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  await purchaseStore.fetch(params);
}

function clearFilters() {
  Object.assign(filters, { supplierId: null, status: null, unpaidOnly: false, dateFrom: '', dateTo: '' });
  reload();
}

function onRemoveFilter(key) {
  if (key === 'unpaidOnly') filters.unpaidOnly = false;
  else if (key === 'supplierId') filters.supplierId = null;
  else if (key === 'status') filters.status = null;
  else if (key === 'dateFrom') filters.dateFrom = '';
  else if (key === 'dateTo') filters.dateTo = '';
  reload();
}

onMounted(async () => {
  await Promise.all([supplierStore.fetch({ limit: 200 }).catch(() => {}), reload()]);
});
</script>
