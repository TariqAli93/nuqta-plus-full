<template>
  <div class="page-shell">
    <PageHeader
      title="تقارير التجارة الأونلاين"
      subtitle="تحليل المبيعات والطلبات حسب القناة"
      icon="mdi-chart-box-outline"
    >
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="store.loading" @click="load">
        تحديث
      </v-btn>
    </PageHeader>

    <!-- Filters -->
    <v-card class="page-section mb-3">
      <v-card-text>
        <div class="d-flex flex-wrap gap-3">
          <v-text-field
            v-model="store.filters.dateFrom"
            type="date"
            label="من تاريخ"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 180px"
            @update:model-value="load"
          />
          <v-text-field
            v-model="store.filters.dateTo"
            type="date"
            label="إلى تاريخ"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 180px"
            @update:model-value="load"
          />
          <v-select
            v-model="store.filters.channelId"
            :items="channels"
            item-title="name"
            item-value="id"
            label="القناة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            style="max-width: 220px"
            @update:model-value="load"
          />
        </div>
      </v-card-text>
    </v-card>

    <!-- KPI cards: delivered / returned / return % (reports 3, 4, 5) -->
    <v-row class="mb-1">
      <v-col cols="12" sm="4">
        <v-card class="pa-4" variant="tonal" color="success">
          <div class="text-caption">الطلبات المسلّمة</div>
          <div class="text-h4">{{ summary.delivered }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card class="pa-4" variant="tonal" color="orange-darken-3">
          <div class="text-caption">الطلبات المرتجعة</div>
          <div class="text-h4">{{ summary.returned }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card class="pa-4" variant="tonal" color="error">
          <div class="text-caption">نسبة الإرجاع</div>
          <div class="text-h4">{{ summary.returnPercentage }}%</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Orders by channel (reports 2–5) -->
    <section class="page-section mb-3">
      <div class="d-flex align-center gap-2 mb-2 px-1">
        <v-icon>mdi-cart-outline</v-icon>
        <span class="text-subtitle-1 font-weight-medium">الطلبات حسب القناة</span>
      </div>
      <v-card>
        <v-data-table
          :headers="orderHeaders"
          :items="overview?.ordersByChannel || []"
          :loading="store.loading"
          density="comfortable"
          hide-default-footer
          :items-per-page="-1"
        >
          <template #[`item.totalOrderValue`]="{ item }">{{ fmt(item.totalOrderValue) }}</template>
          <template #[`item.returnPercentage`]="{ item }">{{ item.returnPercentage }}%</template>
        </v-data-table>
      </v-card>
    </section>

    <!-- Sales by channel (report 1) -->
    <section class="page-section mb-3">
      <div class="d-flex align-center gap-2 mb-2 px-1">
        <v-icon>mdi-receipt-text-outline</v-icon>
        <span class="text-subtitle-1 font-weight-medium">المبيعات حسب القناة</span>
      </div>
      <v-card>
        <v-data-table
          :headers="salesHeaders"
          :items="overview?.salesByChannel || []"
          :loading="store.loading"
          density="comfortable"
          hide-default-footer
          :items-per-page="-1"
        >
          <template #[`item.grossSales`]="{ item }">{{ fmt(item.grossSales) }}</template>
        </v-data-table>
      </v-card>
    </section>

    <!-- Revenue by channel (report 6) -->
    <section class="page-section mb-3">
      <div class="d-flex align-center gap-2 mb-2 px-1">
        <v-icon>mdi-cash-multiple</v-icon>
        <span class="text-subtitle-1 font-weight-medium">الإيرادات حسب القناة</span>
      </div>
      <v-card>
        <v-data-table
          :headers="revenueHeaders"
          :items="overview?.revenueByChannel || []"
          :loading="store.loading"
          density="comfortable"
          hide-default-footer
          :items-per-page="-1"
        >
          <template #[`item.grossSales`]="{ item }">{{ fmt(item.grossSales) }}</template>
          <template #[`item.returns`]="{ item }">{{ fmt(item.returns) }}</template>
          <template #[`item.netRevenue`]="{ item }">{{ fmt(item.netRevenue) }}</template>
        </v-data-table>
      </v-card>
    </section>

    <!-- Profit by channel (report 7) — hidden without permission -->
    <section v-if="!store.profitDenied" class="page-section mb-3">
      <div class="d-flex align-center gap-2 mb-2 px-1">
        <v-icon>mdi-chart-line</v-icon>
        <span class="text-subtitle-1 font-weight-medium">الأرباح حسب القناة</span>
      </div>
      <v-card>
        <v-data-table
          :headers="profitHeaders"
          :items="store.profit"
          :loading="store.loading"
          density="comfortable"
          hide-default-footer
          :items-per-page="-1"
        >
          <template #[`item.netRevenue`]="{ item }">{{ fmt(item.netRevenue) }}</template>
          <template #[`item.cogs`]="{ item }">{{ fmt(item.cogs) }}</template>
          <template #[`item.grossProfit`]="{ item }">
            <span :class="item.grossProfit >= 0 ? 'text-success' : 'text-error'">
              {{ fmt(item.grossProfit) }}
            </span>
          </template>
          <template #[`item.margin`]="{ item }">{{ item.margin }}%</template>
        </v-data-table>
      </v-card>
    </section>
    <v-alert v-else type="info" variant="tonal" class="page-section">
      تقرير الأرباح غير متاح لصلاحيتك.
    </v-alert>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useOnlineCommerceReportStore } from '@/stores/onlineCommerceReport';
import { useSalesChannelStore } from '@/stores/salesChannel';
import PageHeader from '@/components/PageHeader.vue';

const store = useOnlineCommerceReportStore();
const channelStore = useSalesChannelStore();

const overview = computed(() => store.overview);
const channels = computed(() => channelStore.channels);
const summary = computed(
  () => store.overview?.ordersSummary || { delivered: 0, returned: 0, returnPercentage: 0 }
);

const fmt = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

const orderHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'عدد الطلبات', key: 'ordersCount' },
  { title: 'قيمة الطلبات', key: 'totalOrderValue' },
  { title: 'مسلّمة', key: 'delivered' },
  { title: 'مرتجعة', key: 'returned' },
  { title: 'ملغاة', key: 'cancelled' },
  { title: 'نسبة الإرجاع', key: 'returnPercentage' },
];
const salesHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'العملة', key: 'currency' },
  { title: 'عدد الفواتير', key: 'salesCount' },
  { title: 'إجمالي المبيعات', key: 'grossSales' },
];
const revenueHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'العملة', key: 'currency' },
  { title: 'المبيعات', key: 'grossSales' },
  { title: 'المرتجعات', key: 'returns' },
  { title: 'صافي الإيراد', key: 'netRevenue' },
];
const profitHeaders = [
  { title: 'القناة', key: 'channelName' },
  { title: 'العملة', key: 'currency' },
  { title: 'صافي الإيراد', key: 'netRevenue' },
  { title: 'الكلفة', key: 'cogs' },
  { title: 'الربح', key: 'grossProfit' },
  { title: 'الهامش', key: 'margin' },
];

const load = () => store.fetchAll();

onMounted(() => {
  load();
  if (!channelStore.channels.length) channelStore.fetchChannels({ page: 1, limit: 100 });
});
</script>
