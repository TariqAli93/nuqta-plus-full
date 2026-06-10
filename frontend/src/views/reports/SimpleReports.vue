<template>
  <div class="page-shell">
    <PageHeader
      title="التقارير"
      subtitle="اختر السؤال الذي يهمك وسيفتح لك التقرير المناسب"
      icon="mdi-chart-box"
    />

    <!-- التقارير السهلة — أسئلة يفهمها صاحب العمل -->
    <div class="section-title mt-2">
      <span class="section-title__label">
        <v-icon size="20" color="primary">mdi-help-circle-outline</v-icon>
        <span>أسئلة سريعة</span>
      </span>
    </div>
    <div class="q-grid mb-6">
      <v-card
        v-for="q in visibleQuestions"
        :key="q.key"
        class="q-card pa-4"
        variant="outlined"
        link
        @click="go(q.to)"
      >
        <v-icon :color="q.color" size="30" class="mb-2">{{ q.icon }}</v-icon>
        <div class="text-subtitle-1 font-weight-bold">{{ q.title }}</div>
        <div class="text-caption text-medium-emphasis">{{ q.hint }}</div>
      </v-card>
    </div>

    <!-- التقارير المتقدمة (للمدير/المحاسب) -->
    <template v-if="advancedReports.length">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="indigo">mdi-finance</v-icon>
          <span>تقارير متقدمة</span>
        </span>
      </div>
      <div class="q-grid">
        <v-card
          v-for="r in advancedReports"
          :key="r.key"
          class="q-card pa-4"
          variant="outlined"
          link
          @click="go(r.to)"
        >
          <v-icon :color="r.color" size="28" class="mb-2">{{ r.icon }}</v-icon>
          <div class="text-subtitle-1 font-weight-bold">{{ r.title }}</div>
          <div class="text-caption text-medium-emphasis">{{ r.hint }}</div>
        </v-card>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';

const router = useRouter();
const authStore = useAuthStore();

const go = (to) => router.push(to);

// Owner-friendly questions → the matching detailed report/screen.
const questions = computed(() => [
  {
    key: 'sold',
    title: 'شكد بعت؟',
    hint: 'إجمالي مبيعاتك خلال المدة',
    icon: 'mdi-cash-multiple',
    color: 'primary',
    to: '/reports',
    show: authStore.hasPermission('view:reports'),
  },
  {
    key: 'profit',
    title: 'شكد ربحت؟',
    hint: 'الربح بعد خصم الكلفة والمصاريف',
    icon: 'mdi-trending-up',
    color: 'success',
    to: '/reports',
    show: authStore.hasPermission('reports:read_profit'),
  },
  {
    key: 'cash',
    title: 'شكد بالصندوق؟',
    hint: 'النقد الموجود الآن وحركته',
    icon: 'mdi-safe-square-outline',
    color: 'teal',
    to: '/sales/shifts',
    show: authStore.hasPermission('view:sales'),
  },
  {
    key: 'customer-debt',
    title: 'منو عليه دين؟',
    hint: 'العملاء الذين لهم ديون علينا عليهم',
    icon: 'mdi-account-arrow-left',
    color: 'warning',
    to: '/customers?hasDebt=1',
    show: authStore.hasPermission('view:customers'),
  },
  {
    key: 'supplier-debt',
    title: 'إحنا شكد علينا للموردين؟',
    hint: 'المبالغ المطلوب دفعها للموردين',
    icon: 'mdi-truck',
    color: 'deep-purple',
    to: '/suppliers',
    show: authStore.can('canUseSuppliers'),
  },
  {
    key: 'top-products',
    title: 'شنو أكثر بضاعة تنباع؟',
    hint: 'المنتجات الأكثر مبيعاً',
    icon: 'mdi-star',
    color: 'amber-darken-2',
    to: '/reports',
    show: authStore.hasPermission('view:reports'),
  },
  {
    key: 'low-stock',
    title: 'شنو البضاعة القليلة؟',
    hint: 'المنتجات التي قاربت على النفاد',
    icon: 'mdi-alert',
    color: 'red',
    to: '/inventory/low-stock',
    show: authStore.hasPermission('view:inventory') && authStore.hasFeature('inventory'),
  },
  {
    key: 'expenses',
    title: 'شنو المصاريف؟',
    hint: 'مصاريفك خلال المدة',
    icon: 'mdi-cash-minus',
    color: 'orange',
    to: '/expenses',
    show: authStore.hasPermission('expenses:read'),
  },
  {
    key: 'cash-ledger',
    title: 'شنو حركة الصندوق؟',
    hint: 'كل قبض وصرف بالتفصيل',
    icon: 'mdi-swap-horizontal',
    color: 'cyan-darken-1',
    to: '/treasury/cashboxes',
    show: authStore.can('canUseTreasury'),
  },
]);

const visibleQuestions = computed(() => questions.value.filter((q) => q.show));

const advancedReports = computed(() =>
  [
    {
      key: 'trial',
      title: 'فحص توازن الحسابات',
      hint: 'التأكد أن الحسابات متوازنة',
      icon: 'mdi-scale-balance',
      color: 'indigo',
      to: '/reports/financial',
      show: authStore.can('canViewFinancialReports'),
    },
    {
      key: 'pl',
      title: 'الربح والخسارة',
      hint: 'الإيرادات والمصاريف وصافي الربح',
      icon: 'mdi-finance',
      color: 'green-darken-2',
      to: '/reports/financial',
      show: authStore.can('canViewFinancialReports'),
    },
    {
      key: 'balance',
      title: 'الوضع المالي',
      hint: 'ما تملكه وما عليك ورأس مالك',
      icon: 'mdi-bank',
      color: 'blue-grey-darken-1',
      to: '/reports/financial',
      show: authStore.can('canViewFinancialReports'),
    },
    {
      key: 'ledger',
      title: 'حركة الحسابات بالتفصيل',
      hint: 'كل الحركات على كل حساب',
      icon: 'mdi-book-open-variant',
      color: 'brown',
      to: '/reports/financial',
      show: authStore.can('canViewFinancialReports'),
    },
  ].filter((r) => r.show)
);
</script>

<style scoped>
.q-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.q-card {
  border-radius: 14px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.q-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}
</style>
