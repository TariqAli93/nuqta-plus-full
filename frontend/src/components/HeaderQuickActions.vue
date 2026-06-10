<template>
  <v-menu v-if="visibleActions.length" location="bottom end" transition="slide-y-transition">
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        color="primary"
        class="me-2 d-none d-sm-flex"
        prepend-icon="mdi-plus"
        variant="flat"
        size="small"
        aria-label="إجراء سريع"
      >
        إجراء سريع
      </v-btn>
      <v-btn
        v-bind="props"
        icon
        color="primary"
        variant="flat"
        size="small"
        class="me-2 d-flex d-sm-none"
        aria-label="إجراء سريع"
      >
        <v-icon>mdi-plus</v-icon>
      </v-btn>
    </template>
    <v-list density="comfortable" min-width="220">
      <v-list-item
        v-for="action in visibleActions"
        :key="action.key"
        :prepend-icon="action.icon"
        @click="run(action)"
      >
        <v-list-item-title>{{ action.title }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCashSessionStore } from '@/stores/cashSession';

const router = useRouter();
const authStore = useAuthStore();
const cashSession = useCashSessionStore();

const hasOpenShift = computed(() => cashSession.hasOpenSession);

const actions = computed(() => [
  {
    key: 'sell',
    title: 'بيع جديد',
    icon: 'mdi-cash-register',
    show: authStore.can('canUsePOS'),
    to: '/sales/pos',
  },
  {
    key: 'collect',
    title: 'قبض دين',
    icon: 'mdi-hand-coin',
    show: authStore.hasPermission('view:sales'),
    to: '/collections',
  },
  {
    key: 'buy',
    title: 'شراء بضاعة',
    icon: 'mdi-cart-arrow-down',
    show: authStore.can('canUsePurchases'),
    to: '/purchases/new',
  },
  {
    key: 'pay-supplier',
    title: 'دفع لمورد',
    icon: 'mdi-cash-minus',
    show: authStore.can('canUseSuppliers') && authStore.hasPermission('vouchers:create_payment'),
    to: '/suppliers',
  },
  {
    key: 'expense',
    title: 'إضافة مصروف',
    icon: 'mdi-cash-remove',
    show: authStore.hasPermission('expenses:create'),
    to: '/expenses?new=1',
  },
  {
    key: 'shift',
    title: hasOpenShift.value ? 'غلق الوردية' : 'فتح الوردية',
    icon: hasOpenShift.value ? 'mdi-lock-clock' : 'mdi-clock-start',
    show: authStore.hasPermission('cash_sessions:open'),
    to: '/sales/pos',
  },
  {
    key: 'search',
    title: 'بحث سريع',
    icon: 'mdi-magnify',
    show: true,
    handler: () => window.dispatchEvent(new CustomEvent('open-quick-search')),
  },
]);

const visibleActions = computed(() => actions.value.filter((a) => a.show));

function run(action) {
  if (action.handler) return action.handler();
  if (action.to) router.push(action.to);
}
</script>
