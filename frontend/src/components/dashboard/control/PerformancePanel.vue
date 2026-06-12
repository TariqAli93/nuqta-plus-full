<template>
  <v-card class="cc-panel perf" flat tag="section">
    <header class="cc-panel__head">
      <div class="cc-panel__title">
        <v-icon icon="mdi-chart-areaspline" size="20" color="primary" />
        <span>مؤشرات الأداء</span>
      </div>
      <span class="cc-panel__hint">آخر ٧ أيام</span>
    </header>

    <div class="perf__body">
      <!-- اتجاه المبيعات (والأرباح) -->
      <div v-if="canSales" class="perf__chart">
        <apexchart
          type="area"
          height="190"
          width="100%"
          :options="trendOptions"
          :series="trendSeries"
        />
      </div>

      <div class="perf__lists">
        <!-- أفضل المنتجات مبيعاً -->
        <div v-if="canProducts" class="perf__list">
          <div class="perf__list-title">
            <v-icon icon="mdi-trophy-outline" size="16" color="amber-darken-2" /> الأكثر مبيعاً
          </div>
          <div v-if="topProducts.length" class="perf__bars">
            <div v-for="(p, i) in topProducts" :key="`tp-${i}`" class="perf__bar-row">
              <span class="perf__bar-name">{{ p.productName }}</span>
              <v-progress-linear
                :model-value="pct(p.totalQuantity, maxQty)"
                color="#6366F1"
                bg-color="on-surface"
                :bg-opacity="0.07"
                height="8"
                rounded
              />
              <span class="perf__bar-val">{{ num(p.totalQuantity) }}</span>
            </div>
          </div>
          <div v-else class="perf__none">لا توجد بيانات</div>
        </div>

        <!-- أكثر العملاء تعاملاً -->
        <div v-if="canCustomers" class="perf__list">
          <div class="perf__list-title">
            <v-icon icon="mdi-account-star-outline" size="16" color="teal" /> أكثر العملاء تعاملاً
          </div>
          <div v-if="topCustomers.length" class="perf__bars">
            <div v-for="(c, i) in topCustomers" :key="`tc-${i}`" class="perf__bar-row">
              <span class="perf__bar-name">{{ c.name }}</span>
              <v-progress-linear
                :model-value="pct(c.value, maxCustomer)"
                color="#0D9488"
                bg-color="on-surface"
                :bg-opacity="0.07"
                height="8"
                rounded
              />
              <span class="perf__bar-val">{{ money(c.value) }}</span>
            </div>
          </div>
          <div v-else class="perf__none">لا توجد بيانات</div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useDashboardData } from '@/composables/useDashboardData';

const theme = useTheme();
const authStore = useAuthStore();
const { formatMoney, trendDays, hasProfitTrend, topProducts, topCustomers } = useDashboardData();

const perm = (p) => authStore.hasPermission(p);
const canSales = computed(() => perm('view:sales'));
const canProducts = computed(() => perm('view:products') || perm('view:sales'));
const canCustomers = computed(() => perm('view:customers'));

const num = (v) => new Intl.NumberFormat('ar-IQ', { numberingSystem: 'latn' }).format(Number(v) || 0);
const money = (v) => formatMoney(v);
const pct = (v, max) => (max > 0 ? Math.max(4, Math.round((Number(v) / max) * 100)) : 0);

const maxQty = computed(() => Math.max(1, ...topProducts.value.map((p) => Number(p.totalQuantity) || 0)));
const maxCustomer = computed(() => Math.max(1, ...topCustomers.value.map((c) => Number(c.value) || 0)));

const trendSeries = computed(() => {
  const series = [{ name: 'المبيعات', data: trendDays.value.map((d) => Math.round(d.sales)) }];
  if (hasProfitTrend.value) {
    series.push({
      name: 'الأرباح',
      data: trendDays.value.map((d) => (d.profit == null ? 0 : Math.round(d.profit))),
    });
  }
  return series;
});

const compact = (val) => {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}م`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}ألف`;
  return String(n);
};

const trendOptions = computed(() => ({
  chart: { type: 'area', fontFamily: 'inherit', toolbar: { show: false }, sparkline: { enabled: false }, parentHeightOffset: 0 },
  colors: ['#0078D4', '#16A34A'],
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.04, stops: [0, 100] },
  },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2.5 },
  legend: { show: hasProfitTrend.value, position: 'top', horizontalAlign: 'left', fontFamily: 'inherit', markers: { radius: 12 } },
  xaxis: {
    categories: trendDays.value.map((d) => d.label),
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { style: { colors: '#9ca3af', fontFamily: 'inherit', fontSize: '11px' } },
  },
  yaxis: {
    labels: {
      style: { colors: '#9ca3af', fontFamily: 'inherit', fontSize: '11px' },
      formatter: (v) => compact(v),
    },
  },
  grid: { borderColor: 'rgba(127,127,127,0.15)', strokeDashArray: 4, padding: { left: 4, right: 4, top: 0 } },
  theme: { mode: theme.global.current.value.dark ? 'dark' : 'light' },
  tooltip: {
    theme: theme.global.current.value.dark ? 'dark' : 'light',
    y: { formatter: (v) => money(v) },
  },
}));
</script>

<style scoped>
.perf__body {
  padding: 0.6rem 0.75rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.perf__chart {
  min-height: 190px;
}

.perf__lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.85rem;
}

.perf__list {
  min-width: 0;
}

.perf__list-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.perf__bars {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.perf__bar-row {
  display: grid;
  grid-template-columns: minmax(60px, 38%) 1fr auto;
  align-items: center;
  gap: 0.5rem;
}

.perf__bar-name {
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.perf__bar-val {
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.perf__none {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  padding: 0.5rem 0;
}
</style>
