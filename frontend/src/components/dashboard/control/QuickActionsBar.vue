<template>
  <v-card v-if="visibleActions.length" class="cc-panel" flat tag="section">
    <header class="cc-panel__head">
      <div class="cc-panel__title">
        <v-icon icon="mdi-flash" size="20" color="primary" />
        <span>عمليات سريعة</span>
      </div>
      <span class="cc-panel__hint d-none d-md-inline"
        >استخدم مفاتيح <kbd>F2</kbd>–<kbd>F10</kbd></span
      >
    </header>

    <div class="qa-grid">
      <button
        v-for="action in visibleActions"
        :key="action.key"
        type="button"
        class="qa-item"
        :style="{ '--qa-accent': action.accent }"
        @click="run(action)"
      >
        <span class="qa-item__icon"><v-icon :icon="action.icon" size="26" /></span>
        <span class="qa-item__label">{{ action.title }}</span>
        <kbd v-if="action.hotkey" class="qa-item__key">{{ action.hotkey.toUpperCase() }}</kbd>
      </button>
    </div>
  </v-card>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const perm = (p) => authStore.hasPermission(p);
const can = (c) => authStore.can(c);
const feat = (f) => authStore.hasFeature(f);

const allActions = computed(() => [
  {
    key: 'sell',
    title: 'بيع جديد',
    icon: 'mdi-cash-register',
    accent: '#0078D4',
    hotkey: 'f2',
    allowed: can('canUsePOS'),
    to: '/sales/pos',
  },
  {
    key: 'product',
    title: 'إضافة منتج',
    icon: 'mdi-package-variant-plus',
    accent: '#6366F1',
    hotkey: 'f3',
    allowed: perm('products:create'),
    to: '/products/new',
  },
  {
    key: 'customer',
    title: 'إضافة عميل',
    icon: 'mdi-account-plus',
    accent: '#0D9488',
    hotkey: 'f4',
    allowed: perm('customers:create'),
    to: '/customers/new',
  },
  {
    key: 'collect',
    title: 'استلام دفعة',
    icon: 'mdi-hand-coin',
    accent: '#16A34A',
    hotkey: 'f6',
    allowed: perm('view:sales'),
    to: '/collections',
  },
  {
    key: 'return',
    title: 'إرجاع فاتورة',
    icon: 'mdi-receipt-text-arrow-left',
    accent: '#DC2626',
    hotkey: 'f7',
    allowed: perm('view:sales'),
    to: '/sales',
  },
  {
    key: 'stocktake',
    title: 'جرد المخزون',
    icon: 'mdi-clipboard-list-outline',
    accent: '#D97706',
    hotkey: 'f8',
    allowed: feat('inventory') && perm('view:inventory'),
    to: '/inventory',
  },
  {
    key: 'transfer',
    title: 'نقل مخزون',
    icon: 'mdi-transfer',
    accent: '#7C3AED',
    hotkey: 'f9',
    allowed: feat('inventoryTransfers') && can('canTransferStock'),
    to: '/inventory/transfer',
  },
]);

const visibleActions = computed(() => allActions.value.filter((a) => a.allowed));

function run(action) {
  if (action.handler) return action.handler();
  if (action.to) return router.push(action.to);
}

// ── اختصارات لوحة المفاتيح (فعّالة في الشاشة الرئيسية فقط) ──────────────────
function onKey(e) {
  // مفاتيح الوظائف فقط (F2–F10) لتفادي التعارض مع الكتابة في الحقول.
  const code = (e.code || '').toLowerCase();
  if (!/^f([2-9]|10)$/.test(code)) return;
  const action = visibleActions.value.find((a) => a.hotkey === code);
  if (!action) return;
  e.preventDefault();
  run(action);
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped lang="scss">
.qa-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 0.6rem;
  padding: 0.85rem;
}

.qa-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.45rem;
  padding: 1rem 0.6rem;
  min-height: 104px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}

.qa-item:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--qa-accent) 50%, transparent);
  background: color-mix(in srgb, var(--qa-accent) 7%, rgb(var(--v-theme-surface)));
}

.qa-item:focus-visible {
  outline: 2px solid var(--qa-accent);
  outline-offset: 2px;
}

.qa-item__icon {
  width: 48px;
  height: 48px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--qa-accent);
  background: color-mix(in srgb, var(--qa-accent) 14%, transparent);
}

.qa-item__label {
  font-size: 0.86rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.qa-item__key {
  position: absolute;
  top: 6px;
  inset-inline-end: 8px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 5px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-family: var(--ds-font-mono, monospace);
}
</style>
