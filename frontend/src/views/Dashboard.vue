<template>
  <div class="control-center control-center--fixed">
    <!-- ===== شريط الأوامر العلوي ===== -->
    <div class="cc-command">
      <div class="cc-command__greet">
        <div class="cc-command__hello">{{ greeting }}، {{ userName }}</div>
        <div class="cc-command__date">
          <v-icon icon="mdi-calendar-blank-outline" size="14" /> {{ todayLabel }}
        </div>
      </div>

      <v-spacer />

      <div class="cc-command__tools">
        <!-- حالة الوردية -->
        <v-btn
          v-if="canSeeShift"
          :color="hasOpenShift ? 'success' : 'medium-emphasis'"
          :variant="hasOpenShift ? 'tonal' : 'outlined'"
          size="small"
          :to="hasOpenShift ? '/sales/shifts' : '/sales/pos'"
          class="cc-shift"
        >
          <v-icon start :icon="hasOpenShift ? 'mdi-cash-register' : 'mdi-clock-start'" size="16" />
          <template v-if="hasOpenShift">
            الوردية مفتوحة<span v-if="cashInBox != null"> • {{ fmt(cashInBox) }}</span>
          </template>
          <template v-else>فتح وردية</template>
        </v-btn>

        <CustomizeMenu />

        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
          aria-label="تحديث البيانات"
          @click="refresh"
        />
      </div>
    </div>

    <!-- ===== شريط المؤشرات ===== -->
    <KpiStrip v-if="anyKpiVisible" />

    <!-- ===== منطقة العمل ===== -->
    <div class="cc-grid">
      <div class="cc-col">
        <QuickQuestionsPanel />
        <QuickActionsBar v-if="prefs.sections.quickActions" />
        <PerformancePanel v-if="prefs.sections.performance && showPerformance" />
      </div>

      <div class="cc-col">
        <AlertsCenter v-if="prefs.sections.alerts" />
        <RecentActivity v-if="prefs.sections.activity && showActivity" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useCurrency } from '@/composables/useCurrency';
import { useDashboardData } from '@/composables/useDashboardData';
import { useDashboardPrefs } from '@/composables/useDashboardPrefs';
import KpiStrip from '@/components/dashboard/control/KpiStrip.vue';
import QuickActionsBar from '@/components/dashboard/control/QuickActionsBar.vue';
import QuickQuestionsPanel from '@/components/dashboard/control/QuickQuestionsPanel.vue';
import PerformancePanel from '@/components/dashboard/control/PerformancePanel.vue';
import AlertsCenter from '@/components/dashboard/control/AlertsCenter.vue';
import RecentActivity from '@/components/dashboard/control/RecentActivity.vue';
import CustomizeMenu from '@/components/dashboard/control/CustomizeMenu.vue';
import '@/components/dashboard/control/control-center.scss';

const authStore = useAuthStore();
const { formatCurrency } = useCurrency();
const { prefs, anyKpiVisible } = useDashboardPrefs();
const { refresh, loading, hasOpenShift, cashInBox } = useDashboardData();

const perm = (p) => authStore.hasPermission(p);

const userName = computed(() => authStore.user?.fullName || authStore.user?.username || 'مرحباً');

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'طاب يومك';
  return 'مساء الخير';
});

const todayLabel = computed(() =>
  new Date().toLocaleDateString('ar-IQ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    numberingSystem: 'latn',
  })
);

const fmt = (v) => formatCurrency(Number(v) || 0);

const canSeeShift = computed(() => perm('view:sales'));
const showPerformance = computed(
  () => perm('view:sales') || perm('view:products') || perm('view:customers')
);
const showActivity = computed(
  () =>
    perm('view:sales') ||
    perm('view:customers') ||
    perm('view:products') ||
    (perm('view:inventory') && authStore.hasFeature('inventory'))
);

onMounted(() => {
  refresh();
});
</script>

<style scoped lang="scss">
.cc-command {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.cc-command__greet {
  min-width: 0;
}

.cc-command__hello {
  font-size: 1.18rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.cc-command__date {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 2px;
}

.cc-command__tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
}

.cc-shift {
  font-weight: 600;
}
</style>
