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

    <!-- Filters -->
    <v-card class="page-section filter-toolbar pa-3">
      <v-row dense>
        <v-col cols="12" sm="6" md="3">
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
        <v-col cols="12" sm="6" md="3">
          <v-select
            v-model="filters.status"
            :items="[
              { value: 'received', title: 'مستلمة' },
              { value: 'cancelled', title: 'ملغاة' },
            ]"
            label="الحالة"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
          />
        </v-col>
        <v-col cols="12" sm="6" md="2">
          <v-checkbox v-model="filters.unpaidOnly" label="غير مسددة" hide-details density="comfortable" />
        </v-col>
        <v-col cols="12" sm="6" md="2">
          <v-text-field
            v-model="filters.dateFrom"
            type="date"
            label="من"
            density="comfortable"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6" md="2">
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
          <v-btn variant="text" class="ml-2" @click="clearFilters">مسح</v-btn>
          <v-btn color="primary" prepend-icon="mdi-check" @click="reload">تطبيق</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Table -->
    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="items"
        :loading="loading"
        density="comfortable"
        items-per-page="25"
      >
        <template #loading>
          <TableSkeleton :rows="5" :columns="headers.length" />
        </template>
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
        <template #no-data>
          <EmptyState
            title="لا توجد فواتير شراء"
            description="سجّل فاتورة شراء لإدخال البضاعة للمخزون ومتابعة ذمم الموردين."
            icon="mdi-cart-arrow-down"
            compact
          />
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from 'vue';
import { usePurchaseStore } from '@/stores/purchase';
import { useSupplierStore } from '@/stores/supplier';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
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

const headers = [
  { title: 'الرقم', key: 'invoiceNumber' },
  { title: 'المورد', key: 'supplierName' },
  { title: 'التاريخ', key: 'invoiceDate' },
  { title: 'الإجمالي', key: 'total' },
  { title: 'المتبقي', key: 'remainingAmount' },
  { title: 'الحالة', key: 'status' },
  { title: 'بواسطة', key: 'createdByName' },
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

onMounted(async () => {
  await Promise.all([supplierStore.fetch({ limit: 200 }).catch(() => {}), reload()]);
});
</script>
