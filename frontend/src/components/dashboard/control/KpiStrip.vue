<template>
  <div class="kpi-strip">
    <component
      :is="kpi.to ? 'router-link' : 'div'"
      v-for="kpi in visibleKpis"
      :key="kpi.key"
      :to="kpi.to"
      class="kpi-tile"
      :class="{ 'kpi-tile--link': kpi.to }"
      :style="{ '--kpi-accent': kpi.accent }"
    >
      <div class="kpi-tile__icon">
        <v-icon :icon="kpi.icon" size="22" />
      </div>
      <div class="kpi-tile__body">
        <div class="kpi-tile__label">{{ kpi.label }}</div>
        <div v-if="!loaded" class="kpi-tile__value kpi-tile__value--loading">···</div>
        <div v-else class="kpi-tile__value" :class="kpi.valueClass">{{ kpi.value }}</div>
        <div v-if="kpi.sub && loaded" class="kpi-tile__sub">{{ kpi.sub }}</div>
      </div>
    </component>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDashboardData } from '@/composables/useDashboardData';
import { useDashboardPrefs } from '@/composables/useDashboardPrefs';

const authStore = useAuthStore();
const { prefs } = useDashboardPrefs();
const {
  loaded,
  formatMoney,
  todaySales,
  todayProfit,
  profitAvailable,
  invoicesToday,
  totalCustomers,
  inventoryValue,
  customerDebt,
  unpaidToday,
} = useDashboardData();

const num = (v) =>
  new Intl.NumberFormat('ar-IQ', { numberingSystem: 'latn' }).format(Number(v) || 0);

const perm = (p) => authStore.hasPermission(p);
const feat = (f) => authStore.hasFeature(f);

const allKpis = computed(() => [
  {
    key: 'sales',
    pref: 'sales',
    allowed: perm('view:sales'),
    label: 'مبيعات اليوم',
    icon: 'mdi-cash-multiple',
    accent: '#0078D4',
    value: formatMoney(todaySales.value),
    to: '/sales',
  },
  {
    key: 'profit',
    pref: 'profit',
    allowed: perm('reports:read_profit'),
    label: 'أرباح اليوم',
    icon: 'mdi-trending-up',
    accent: '#16A34A',
    value: profitAvailable.value ? formatMoney(todayProfit.value) : '—',
    valueClass: profitAvailable.value && todayProfit.value < 0 ? 'text-error' : '',
    to: '/reports',
  },
  {
    key: 'invoices',
    pref: 'invoices',
    allowed: perm('view:sales'),
    label: 'فواتير اليوم',
    icon: 'mdi-receipt-text-outline',
    accent: '#0EA5E9',
    value: num(invoicesToday.value),
    to: '/sales',
  },
  {
    key: 'customers',
    pref: 'customers',
    allowed: perm('view:customers'),
    label: 'العملاء',
    icon: 'mdi-account-group-outline',
    accent: '#0D9488',
    value: num(totalCustomers.value),
    to: '/customers',
  },
  {
    key: 'inventory',
    pref: 'inventory',
    allowed: perm('view:inventory') && feat('inventory'),
    label: 'قيمة البضاعة',
    icon: 'mdi-warehouse',
    accent: '#6366F1',
    value: formatMoney(inventoryValue.value),
    to: '/reports/inventory-valuation',
  },
  {
    key: 'dues',
    pref: 'dues',
    allowed: perm('view:customers'),
    label: 'مستحقات على العملاء',
    icon: 'mdi-account-arrow-left-outline',
    accent: '#D97706',
    value: formatMoney(customerDebt.value),
    sub: unpaidToday.value > 0 ? `غير مدفوع اليوم: ${formatMoney(unpaidToday.value)}` : null,
    to: '/collections',
  },
]);

const visibleKpis = computed(() =>
  allKpis.value.filter((k) => k.allowed && prefs.kpis[k.pref] !== false)
);
</script>

<style scoped lang="scss">
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 0.75rem;
}

.kpi-tile {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;
  min-width: 0;
}

.kpi-tile--link {
  cursor: pointer;
}

.kpi-tile--link:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--kpi-accent) 45%, transparent);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.kpi-tile__icon {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--kpi-accent);
  background: color-mix(in srgb, var(--kpi-accent) 14%, transparent);
}

.kpi-tile__body {
  min-width: 0;
}

.kpi-tile__label {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-tile__value {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-tile__value--loading {
  opacity: 0.4;
  letter-spacing: 0.15em;
}

.kpi-tile__sub {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-warning), 1);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
