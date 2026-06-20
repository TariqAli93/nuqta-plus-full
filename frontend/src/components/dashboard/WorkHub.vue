<template>
  <div>
    <!-- شنو تريد تسوي اليوم؟ -->
    <div class="text-h5 font-weight-bold mb-1">شنو تريد تسوي اليوم؟</div>
    <div class="text-body-2 text-medium-emphasis mb-4">اختر العملية مباشرة، والباقي يتسجّل تلقائياً.</div>

    <!-- Big action buttons -->
    <div class="action-grid mb-6">
      <v-card
        v-for="action in visibleActions"
        :key="action.key"
        class="action-tile"
        :class="`action-tile--${action.color}`"
        variant="flat"
        link
        @click="runAction(action)"
      >
        <v-icon size="34" class="mb-2">{{ action.icon }}</v-icon>
        <span class="text-body-1 font-weight-bold">{{ action.title }}</span>
      </v-card>
    </div>

    <!-- Info cards -->
    <div class="info-grid">
      <v-card
        v-for="card in visibleCards"
        :key="card.key"
        class="info-card pa-4"
        variant="outlined"
      >
        <div class="d-flex align-center justify-space-between mb-1">
          <span class="text-body-2 text-medium-emphasis">{{ card.title }}</span>
          <v-icon :color="card.color" size="22">{{ card.icon }}</v-icon>
        </div>
        <div class="text-h5 font-weight-bold mb-1" :class="card.valueClass">{{ card.value }}</div>
        <div v-if="card.subtitle" class="text-caption text-medium-emphasis mb-2">{{ card.subtitle }}</div>
        <div class="d-flex gap-2 mt-2">
          <v-btn
            v-if="card.action"
            size="small"
            variant="tonal"
            :color="card.color"
            @click="goTo(card.action.to)"
          >
            {{ card.action.label }}
          </v-btn>
          <v-btn
            v-if="card.action2"
            size="small"
            variant="text"
            @click="goTo(card.action2.to)"
          >
            {{ card.action2.label }}
          </v-btn>
        </div>
      </v-card>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useReportStore } from '@/stores/report';
import { formatCurrency } from '@/utils/formatters';

const router = useRouter();
const authStore = useAuthStore();
const reportStore = useReportStore();

const summary = ref(null);
const loaded = ref(false);

// ── Quick action buttons (gated by permission/feature/capability) ───────────
const actions = computed(() => [
  {
    key: 'sell',
    title: 'بيع جديد',
    icon: 'mdi-cash-register',
    color: 'primary',
    show: authStore.can('canUsePOS'),
    handler: startSale,
  },
  {
    key: 'collect',
    title: 'قبض دين من عميل',
    icon: 'mdi-hand-coin',
    color: 'success',
    show: authStore.hasPermission('view:sales'),
    to: '/collections',
  },
  {
    key: 'buy',
    title: 'شراء بضاعة',
    icon: 'mdi-cart-arrow-down',
    color: 'indigo',
    show: authStore.can('canUsePurchases'),
    to: '/purchases/new',
  },
  {
    key: 'pay-supplier',
    title: 'دفع لمورد',
    icon: 'mdi-cash-minus',
    color: 'deep-purple',
    show: authStore.can('canUseSuppliers') && authStore.hasPermission('vouchers:create_payment'),
    to: '/suppliers',
  },
  {
    key: 'expense',
    title: 'إضافة مصروف',
    icon: 'mdi-cash-remove',
    color: 'orange',
    show: authStore.hasPermission('expenses:create'),
    to: '/expenses?new=1',
  },
  {
    key: 'search',
    title: 'بحث سريع',
    icon: 'mdi-magnify',
    color: 'blue-grey',
    show: true,
    handler: openSearch,
  },
]);

const visibleActions = computed(() => actions.value.filter((a) => a.show));

function startSale() {
  // POS auto-prompts the open-shift dialog when there's no open session.
  router.push('/sales/pos');
}

function openSearch() {
  // The command palette (G4) listens for this global event.
  window.dispatchEvent(new CustomEvent('open-command-palette'));
}

function runAction(action) {
  if (action.handler) return action.handler();
  if (action.to) return router.push(action.to);
}

function goTo(to) {
  if (to) router.push(to);
}

// ── Info cards (computed from the dashboard summary, IQD bucket) ─────────────
const iqd = (obj) => {
  if (!obj) return 0;
  if (typeof obj.IQD === 'number') return obj.IQD;
  // Sum any currency bucket as a fallback.
  return Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
};

const todaySalesValue = computed(() => {
  const s = summary.value?.salesSummary?.byCurrency?.IQD;
  return s ? Number(s.revenue || s.sales || 0) : 0;
});
const todayProfit = computed(() => {
  const p = summary.value?.profitLoss?.byCurrency?.IQD;
  return p && p.netProfit != null ? Number(p.netProfit) : null;
});
const customerDebt = computed(() => iqd(summary.value?.customersDebt?.totalOutstandingDebt));
const unpaidInvoices = computed(() => {
  const s = summary.value?.salesSummary?.byCurrency?.IQD;
  return s ? Number(s.unpaidBalances || 0) : 0;
});
const lowStockCount = computed(() => summary.value?.inventory?.lowStockProducts?.length || 0);

const cards = computed(() => [
  {
    key: 'today-sales',
    title: 'مبيعات اليوم',
    value: formatCurrency(todaySalesValue.value, 'IQD'),
    icon: 'mdi-cash-multiple',
    color: 'primary',
    show: authStore.hasPermission('view:sales'),
    action: { label: 'الفواتير', to: '/sales' },
  },
  {
    key: 'profit',
    title: 'الربح التقريبي اليوم',
    value: todayProfit.value == null ? '—' : formatCurrency(todayProfit.value, 'IQD'),
    icon: 'mdi-trending-up',
    color: 'success',
    show: authStore.hasPermission('reports:read_profit'),
    valueClass: todayProfit.value < 0 ? 'text-error' : '',
    action: { label: 'التقارير', to: '/reports/simple' },
  },
  {
    key: 'customer-debt',
    title: 'ديون إلنا على العملاء',
    value: formatCurrency(customerDebt.value, 'IQD'),
    icon: 'mdi-account-arrow-left',
    color: 'warning',
    show: authStore.hasPermission('view:customers'),
    action: { label: 'عرض العملاء', to: '/customers' },
    action2: authStore.hasPermission('view:sales') ? { label: 'قبض دين', to: '/collections' } : null,
  },
  {
    key: 'unpaid',
    title: 'فواتير غير مدفوعة',
    value: formatCurrency(unpaidInvoices.value, 'IQD'),
    icon: 'mdi-receipt-text-clock',
    color: 'deep-orange',
    show: authStore.hasPermission('view:sales'),
    action: { label: 'الفواتير', to: '/sales' },
  },
  {
    key: 'low-stock',
    title: 'بضاعة قليلة',
    value: `${lowStockCount.value} صنف`,
    icon: 'mdi-alert',
    color: 'red',
    show: authStore.hasPermission('view:inventory') && authStore.hasFeature('inventory'),
    action: { label: 'البضاعة القليلة', to: '/inventory/low-stock' },
  },
]);

const visibleCards = computed(() => cards.value.filter((c) => c.show));

onMounted(async () => {
  // The dashboard summary endpoint requires `sales:read`. Skip the fetch
  // entirely for users without it so the global 403 interceptor never fires.
  if (!authStore.hasPermission('sales:read')) {
    loaded.value = true;
    return;
  }
  try {
    await Promise.all([
      reportStore
        .fetchDashboard()
        .then((d) => {
          summary.value = d?.data || d || null;
        })
        .catch(() => {}),
    ]);
  } finally {
    loaded.value = true;
  }
});
</script>

<style scoped>
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
}
.action-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1.25rem 0.75rem;
  min-height: 116px;
  border-radius: 16px;
  color: #fff;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.action-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}
.action-tile--primary { background: linear-gradient(135deg, #1976d2, #1565c0); }
.action-tile--success { background: linear-gradient(135deg, #2e7d32, #1b5e20); }
.action-tile--indigo { background: linear-gradient(135deg, #3949ab, #283593); }
.action-tile--deep-purple { background: linear-gradient(135deg, #6a3ab2, #4527a0); }
.action-tile--orange { background: linear-gradient(135deg, #ef6c00, #e65100); }
.action-tile--teal { background: linear-gradient(135deg, #00897b, #00695c); }
.action-tile--blue-grey { background: linear-gradient(135deg, #546e7a, #37474f); }

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.info-card {
  border-radius: 14px;
}
</style>
