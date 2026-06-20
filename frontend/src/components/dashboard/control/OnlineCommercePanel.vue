<template>
  <v-card v-if="canView" class="cc-panel" flat tag="section">
    <header class="cc-panel__head">
      <div class="cc-panel__title">
        <v-icon icon="mdi-storefront-outline" size="20" color="primary" />
        <span>التجارة الأونلاين</span>
      </div>
      <RouterLink to="/reports/online-commerce" class="cc-panel__hint">التقارير ←</RouterLink>
    </header>

    <div class="oc-widgets">
      <div class="oc-tile">
        <div class="oc-tile__label">
          <v-icon icon="mdi-bullhorn-variant" size="15" color="primary" /> القناة الأنشط
        </div>
        <div class="oc-tile__value">{{ w?.topChannel?.channelName || '—' }}</div>
        <div v-if="w?.topChannel" class="oc-tile__sub">{{ fmt(w.topChannel.ordersCount) }} طلب</div>
      </div>

      <div class="oc-tile">
        <div class="oc-tile__label">
          <v-icon icon="mdi-cash-multiple" size="15" color="success" /> الأعلى إيراداً
        </div>
        <div class="oc-tile__value">{{ w?.topRevenueChannel?.channelName || '—' }}</div>
        <div v-if="w?.topRevenueChannel" class="oc-tile__sub">
          {{ fmt(w.topRevenueChannel.netRevenue) }} {{ w.topRevenueChannel.currency }}
        </div>
      </div>

      <div v-if="w?.profitVisible" class="oc-tile">
        <div class="oc-tile__label">
          <v-icon icon="mdi-chart-line" size="15" color="teal" /> الأعلى ربحاً
        </div>
        <div class="oc-tile__value">{{ w?.topProfitChannel?.channelName || '—' }}</div>
        <div v-if="w?.topProfitChannel" class="oc-tile__sub">
          {{ fmt(w.topProfitChannel.grossProfit) }} {{ w.topProfitChannel.currency }}
        </div>
      </div>

      <div class="oc-tile">
        <div class="oc-tile__label">
          <v-icon icon="mdi-truck-check-outline" size="15" color="success" /> نجاح التوصيل
        </div>
        <div class="oc-tile__value oc-tile__value--num">{{ w?.deliverySuccessRate ?? 0 }}%</div>
        <v-progress-linear
          :model-value="w?.deliverySuccessRate || 0"
          color="success"
          bg-color="on-surface"
          :bg-opacity="0.07"
          height="6"
          rounded
        />
      </div>

      <div class="oc-tile">
        <div class="oc-tile__label">
          <v-icon icon="mdi-keyboard-return" size="15" color="orange-darken-3" /> نسبة الإرجاع
        </div>
        <div class="oc-tile__value oc-tile__value--num">{{ w?.returnRate ?? 0 }}%</div>
        <v-progress-linear
          :model-value="w?.returnRate || 0"
          color="orange-darken-3"
          bg-color="on-surface"
          :bg-opacity="0.07"
          height="6"
          rounded
        />
      </div>
    </div>

    <div v-if="!store.widgetsLoading && !hasData" class="oc-empty">لا توجد بيانات تجارة أونلاين بعد</div>
  </v-card>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useOnlineCommerceReportStore } from '@/stores/onlineCommerceReport';
import { usePermissions } from '@/composables/usePermissions';

const store = useOnlineCommerceReportStore();
const { canFeature } = usePermissions();

// Optional dashboard widget: only render (and only fetch) when the user may
// read online-commerce reports. No permission → the panel is hidden silently
// and its API is never called.
const canView = computed(() => canFeature('onlineCommerceWidgets'));

const w = computed(() => store.widgets);
const hasData = computed(
  () => !!(w.value && (w.value.topChannel || w.value.totals?.totalOrders))
);

const fmt = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

onMounted(() => {
  if (canView.value && !store.widgets) store.fetchWidgets();
});
</script>

<style scoped>
.oc-widgets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  padding: 4px 2px 2px;
}
.oc-tile {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.oc-tile__label {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  display: flex;
  align-items: center;
  gap: 4px;
}
.oc-tile__value {
  font-weight: 700;
  font-size: 0.98rem;
}
.oc-tile__value--num {
  font-size: 1.3rem;
}
.oc-tile__sub {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.oc-empty {
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.5);
  padding: 12px;
  font-size: 0.85rem;
}
</style>
