<template>
  <v-card class="cc-panel activity" flat tag="section">
    <header class="cc-panel__head">
      <div class="cc-panel__title">
        <v-icon icon="mdi-history" size="20" color="primary" />
        <span>النشاط الحديث</span>
      </div>
    </header>

    <v-tabs
      v-model="tab"
      density="compact"
      color="primary"
      align-tabs="start"
      class="activity__tabs"
      show-arrows
    >
      <v-tab v-for="t in visibleTabs" :key="t.key" :value="t.key" class="text-caption">
        <v-icon :icon="t.icon" size="16" class="me-1" />{{ t.label }}
      </v-tab>
    </v-tabs>

    <div class="cc-scroll activity__body">
      <!-- المبيعات -->
      <template v-if="tab === 'sales'">
        <router-link
          v-for="s in recent.sales"
          :key="`s-${s.id}`"
          :to="`/sales/${s.id}`"
          class="cc-row cc-row--link"
        >
          <span class="cc-row__icon" style="background: rgba(0, 120, 212, 0.12); color: #0078d4">
            <v-icon icon="mdi-receipt-text-outline" size="18" />
          </span>
          <span class="cc-row__body">
            <span class="cc-row__title">فاتورة {{ s.invoiceNumber }}</span>
            <span class="cc-row__sub">{{ s.customer || 'زبون نقدي' }} • {{ rel(s.createdAt) }}</span>
          </span>
          <span class="cc-row__meta">{{ money(s.total, s.currency) }}</span>
        </router-link>
        <div v-if="!recent.sales.length" class="cc-empty">
          <v-icon icon="mdi-receipt-text-outline" size="32" /><span class="text-caption">لا توجد مبيعات بعد</span>
        </div>
      </template>

      <!-- العملاء -->
      <template v-else-if="tab === 'customers'">
        <router-link
          v-for="c in recent.customers"
          :key="`c-${c.id}`"
          :to="`/customers/${c.id}`"
          class="cc-row cc-row--link"
        >
          <span class="cc-row__icon" style="background: rgba(13, 148, 136, 0.12); color: #0d9488">
            <v-icon icon="mdi-account-outline" size="18" />
          </span>
          <span class="cc-row__body">
            <span class="cc-row__title">{{ c.name }}</span>
            <span class="cc-row__sub">{{ c.phone || 'بدون رقم' }} • {{ rel(c.createdAt) }}</span>
          </span>
          <span v-if="Number(c.totalDebt) > 0" class="cc-row__meta text-warning">{{ money(c.totalDebt, 'IQD') }}</span>
        </router-link>
        <div v-if="!recent.customers.length" class="cc-empty">
          <v-icon icon="mdi-account-outline" size="32" /><span class="text-caption">لا يوجد عملاء جدد</span>
        </div>
      </template>

      <!-- المنتجات -->
      <template v-else-if="tab === 'products'">
        <router-link
          v-for="p in recent.products"
          :key="`p-${p.id}`"
          :to="`/products/${p.id}/edit`"
          class="cc-row cc-row--link"
        >
          <span class="cc-row__icon" style="background: rgba(99, 102, 241, 0.12); color: #6366f1">
            <v-icon icon="mdi-package-variant-closed" size="18" />
          </span>
          <span class="cc-row__body">
            <span class="cc-row__title">{{ p.name }}</span>
            <span class="cc-row__sub">{{ p.sku || 'بدون رمز' }} • {{ rel(p.createdAt) }}</span>
          </span>
          <span class="cc-row__meta">{{ money(p.sellingPrice, p.currency) }}</span>
        </router-link>
        <div v-if="!recent.products.length" class="cc-empty">
          <v-icon icon="mdi-package-variant-closed" size="32" /><span class="text-caption">لا توجد منتجات جديدة</span>
        </div>
      </template>

      <!-- حركات المخزون -->
      <template v-else-if="tab === 'movements'">
        <router-link
          v-for="(m, i) in recent.movements"
          :key="`m-${m.id || i}`"
          to="/inventory/movements"
          class="cc-row cc-row--link"
        >
          <span
            class="cc-row__icon"
            :style="`background:${tint(m.quantityChange)};color:${tone(m.quantityChange)}`"
          >
            <v-icon :icon="m.quantityChange > 0 ? 'mdi-tray-arrow-down' : 'mdi-tray-arrow-up'" size="18" />
          </span>
          <span class="cc-row__body">
            <span class="cc-row__title">{{ m.productName || 'منتج' }}</span>
            <span class="cc-row__sub">{{ moveLabel(m.movementType) }} • {{ rel(m.createdAt) }}</span>
          </span>
          <span class="cc-row__meta" :class="m.quantityChange > 0 ? 'text-success' : 'text-error'">
            {{ m.quantityChange > 0 ? '+' : '' }}{{ m.quantityChange }}
          </span>
        </router-link>
        <div v-if="!recent.movements.length" class="cc-empty">
          <v-icon icon="mdi-swap-vertical" size="32" /><span class="text-caption">لا توجد حركات مخزنية</span>
        </div>
      </template>
    </div>
  </v-card>
</template>

<script setup>
import { ref, computed, watchEffect } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useCurrency } from '@/composables/useCurrency';
import { useDashboardData } from '@/composables/useDashboardData';
import { formatRelativeTime } from '@/utils/formatters';
import { getInventoryMovementTypeLabel } from '@/utils/inventoryMovementTypes';

const authStore = useAuthStore();
const { recent } = useDashboardData();
const { formatCurrency, convertAmountSync, defaultCurrency } = useCurrency();

const perm = (p) => authStore.hasPermission(p);

const allTabs = computed(() => [
  { key: 'sales', label: 'مبيعات', icon: 'mdi-receipt-text-outline', allowed: perm('view:sales') },
  { key: 'customers', label: 'عملاء', icon: 'mdi-account-outline', allowed: perm('view:customers') },
  { key: 'products', label: 'منتجات', icon: 'mdi-package-variant-closed', allowed: perm('view:products') },
  {
    key: 'movements',
    label: 'حركات',
    icon: 'mdi-swap-vertical',
    allowed: perm('view:inventory') && authStore.hasFeature('inventory'),
  },
]);

const visibleTabs = computed(() => allTabs.value.filter((t) => t.allowed));
const tab = ref('sales');

// تأكّد أن التبويب النشط مسموح (وإلا اختر أول تبويب متاح).
watchEffect(() => {
  if (!visibleTabs.value.some((t) => t.key === tab.value) && visibleTabs.value.length) {
    tab.value = visibleTabs.value[0].key;
  }
});

const rel = (d) => formatRelativeTime(d);
const moveLabel = (t) => getInventoryMovementTypeLabel(t);

// المبالغ تُعرض بعملتها الأصلية إن وُجدت، وإلا بالعملة الافتراضية بعد التحويل.
const money = (amount, currency) => {
  if (currency) return formatCurrency(amount, currency);
  return formatCurrency(convertAmountSync(Number(amount) || 0, defaultCurrency.value));
};

const tint = (q) => (q > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)');
const tone = (q) => (q > 0 ? '#16a34a' : '#dc2626');
</script>

<style scoped>
.activity__tabs {
  flex: 0 0 auto;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}

.activity__body {
  flex: 1;
  min-height: 0;
  max-height: 360px;
  padding: 0.35rem;
  display: flex;
  flex-direction: column;
}
</style>
