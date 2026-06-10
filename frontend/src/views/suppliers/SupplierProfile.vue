<template>
  <div class="page-shell">
    <PageHeader
      :title="supplier?.name || 'ملف المورد'"
      :subtitle="supplier?.phone || ''"
      icon="mdi-truck-delivery"
    >
      <v-btn variant="text" prepend-icon="mdi-arrow-right" to="/suppliers">رجوع للموردين</v-btn>
    </PageHeader>

    <!-- Summary -->
    <div class="summary-grid page-section">
      <StatCard
        label="إجمالي المشتريات"
        :value="formatCurrency(supplier?.totalPurchases || 0)"
        icon="mdi-cart-arrow-down"
        icon-color="primary"
      />
      <StatCard
        label="الذمة الحالية"
        :value="formatCurrency(supplier?.totalDebt || 0)"
        icon="mdi-cash-clock"
        :icon-color="(supplier?.totalDebt || 0) > 0 ? 'error' : 'success'"
      />
      <StatCard
        v-for="(amount, currency) in debts?.totalsByCurrency || {}"
        :key="currency"
        :label="`ديون مفتوحة (${getCurrencySymbol(currency)})`"
        :value="formatCurrency(amount, currency)"
        icon="mdi-file-document-alert"
        icon-color="warning"
      />
    </div>

    <v-card class="page-section">
      <v-tabs v-model="tab" color="primary">
        <v-tab value="debts">الفواتير المفتوحة</v-tab>
        <v-tab value="statement">كشف الحساب</v-tab>
        <v-tab value="products">المنتجات</v-tab>
      </v-tabs>
      <v-divider />

      <v-window v-model="tab">
        <!-- Open invoices -->
        <v-window-item value="debts">
          <v-data-table
            :headers="debtHeaders"
            :items="debts?.invoices || []"
            density="comfortable"
            items-per-page="25"
          >
            <template #[`item.invoiceNumber`]="{ item }">
              <router-link :to="`/purchases/${item.id}`" class="text-primary">
                {{ item.invoiceNumber }}
              </router-link>
            </template>
            <template #[`item.total`]="{ item }">
              {{ formatCurrency(item.total, item.currency) }}
            </template>
            <template #[`item.remainingAmount`]="{ item }">
              <span class="text-error font-weight-bold">
                {{ formatCurrency(item.remainingAmount, item.currency) }}
              </span>
            </template>
            <template #no-data>
              <EmptyState title="لا توجد ديون مفتوحة" icon="mdi-check-circle" compact />
            </template>
          </v-data-table>
        </v-window-item>

        <!-- Statement -->
        <v-window-item value="statement">
          <v-data-table
            :headers="statementHeaders"
            :items="statement?.entries || []"
            density="comfortable"
            items-per-page="50"
          >
            <template #[`item.credit`]="{ item }">
              <span v-if="item.credit" class="text-error">{{ formatCurrency(item.credit, item.currency) }}</span>
              <span v-else>-</span>
            </template>
            <template #[`item.debit`]="{ item }">
              <span v-if="item.debit" class="text-success">{{ formatCurrency(item.debit, item.currency) }}</span>
              <span v-else>-</span>
            </template>
            <template #[`item.runningBalance`]="{ item }">
              <span class="font-weight-bold">{{ formatCurrency(item.runningBalance, item.currency) }}</span>
            </template>
            <template #no-data>
              <EmptyState title="لا توجد حركات" icon="mdi-file-document" compact />
            </template>
          </v-data-table>
        </v-window-item>

        <!-- Products -->
        <v-window-item value="products">
          <v-data-table
            :headers="productHeaders"
            :items="products"
            density="comfortable"
            items-per-page="25"
          >
            <template #[`item.costPrice`]="{ item }">
              {{ formatCurrency(item.costPrice, item.currency) }}
            </template>
            <template #no-data>
              <EmptyState title="لا توجد منتجات مرتبطة" icon="mdi-package-variant" compact />
            </template>
          </v-data-table>
        </v-window-item>
      </v-window>
    </v-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/plugins/axios';
import { useSupplierStore } from '@/stores/supplier';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatCard from '@/components/StatCard.vue';
import { formatCurrency, getCurrencySymbol } from '@/utils/formatters';

const route = useRoute();
const supplierStore = useSupplierStore();

const tab = ref('debts');
const supplier = ref(null);
const debts = ref(null);
const statement = ref(null);
const products = ref([]);

const debtHeaders = [
  { title: 'رقم الفاتورة', key: 'invoiceNumber' },
  { title: 'التاريخ', key: 'invoiceDate' },
  { title: 'الإجمالي', key: 'total' },
  { title: 'المتبقي', key: 'remainingAmount' },
];

const statementHeaders = [
  { title: 'التاريخ', key: 'date' },
  { title: 'الرقم', key: 'number' },
  { title: 'البيان', key: 'description' },
  { title: 'علينا له', key: 'credit' },
  { title: 'دفعنا له', key: 'debit' },
  { title: 'الرصيد', key: 'runningBalance' },
];

const productHeaders = [
  { title: 'المنتج', key: 'name' },
  { title: 'SKU', key: 'sku' },
  { title: 'الكلفة', key: 'costPrice' },
  { title: 'المخزون', key: 'stock' },
];

onMounted(async () => {
  const id = route.params.id;
  supplier.value = await supplierStore.fetchOne(id);
  debts.value = await supplierStore.fetchDebts(id);
  statement.value = await supplierStore.fetchStatement(id);
  try {
    const res = await api.get(`/suppliers/${id}/products`);
    products.value = res?.data || [];
  } catch {
    /* ignore */
  }
});
</script>
