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
    <KpiStrip v-if="showKpis" />

    <!-- ===== منطقة العمل ===== -->
    <!-- The grid shows when ANY column has a visible panel (not all of them) so a
         user missing e.g. online-commerce still sees the rest. Each panel keeps
         its own permission + preference gate. -->
    <div v-if="showGrid" class="cc-grid">
      <div class="cc-col">
        <QuickQuestionsPanel v-if="prefs.sections.performance && showPerformance" />
        <QuickActionsBar v-if="prefs.sections.quickActions && showQuickActions" />
        <PerformancePanel v-if="prefs.sections.performance && showPerformance" />
        <OnlineCommercePanel v-if="prefs.sections.onlineCommerce && showOnlineCommerce" />
      </div>

      <div class="cc-col">
        <AlertsCenter v-if="prefs.sections.alerts && showAlerts" />
        <RecentActivity v-if="prefs.sections.activity && showActivity" />
      </div>
    </div>

    <!-- The user can OPEN the dashboard (view:dashboard) but holds none of the
         data permissions → show a clear empty state instead of zero cards. -->
    <PermissionEmptyState
      v-if="!hasAnyContent"
      page-title="الرئيسية"
      :missing-permissions="missingContentPerms"
      suggestion="تواصل مع المدير العام لمنحك صلاحيات عرض بيانات الشاشة الرئيسية."
    />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDashboardData } from '@/composables/useDashboardData';
import { useDashboardPrefs } from '@/composables/useDashboardPrefs';
import KpiStrip from '@/components/dashboard/control/KpiStrip.vue';
import QuickActionsBar from '@/components/dashboard/control/QuickActionsBar.vue';
import QuickQuestionsPanel from '@/components/dashboard/control/QuickQuestionsPanel.vue';
import PerformancePanel from '@/components/dashboard/control/PerformancePanel.vue';
import OnlineCommercePanel from '@/components/dashboard/control/OnlineCommercePanel.vue';
import AlertsCenter from '@/components/dashboard/control/AlertsCenter.vue';
import RecentActivity from '@/components/dashboard/control/RecentActivity.vue';
import CustomizeMenu from '@/components/dashboard/control/CustomizeMenu.vue';
import PermissionEmptyState from '@/components/PermissionEmptyState.vue';
import '@/components/dashboard/control/control-center.scss';

const authStore = useAuthStore();
const { prefs, anyKpiVisible } = useDashboardPrefs();
const { refresh, loading } = useDashboardData();

const perm = (p) => authStore.hasPermission(p);
const feat = (f) => authStore.hasFeature(f);

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

// ── Permission-aware visibility (dynamic; never role-name based) ──────────────
const canSales = computed(() => perm(['view:sales', 'sales:read']));
const canCustomers = computed(() => perm(['view:customers', 'customers:read']));
const canProducts = computed(() => perm(['view:products', 'products:read']));
const canInventory = computed(() => perm('view:inventory') && feat('inventory'));
const canProfit = computed(() => perm('reports:read_profit'));
const canOnlineCommerce = computed(() => perm('online_commerce_reports:read'));

// KPI strip shows only when the user can see at least one KPI AND hasn't hidden
// them all via preferences. (KpiStrip itself filters individual tiles by perm.)
const kpiAllowed = computed(
  () => canSales.value || canProfit.value || canCustomers.value || canInventory.value
);
const showKpis = computed(() => kpiAllowed.value && anyKpiVisible.value);

const showPerformance = computed(() => canSales.value || canProducts.value || canCustomers.value);
const showActivity = computed(
  () => canSales.value || canCustomers.value || canProducts.value || canInventory.value
);
const showOnlineCommerce = computed(() => canOnlineCommerce.value);
const showAlerts = computed(() => canSales.value || canInventory.value);
const showQuickActions = computed(
  () => canSales.value || canProducts.value || canCustomers.value || canInventory.value
);

// Grid appears when ANY column has a visible panel.
const showGrid = computed(
  () =>
    (prefs.sections.performance && showPerformance.value) ||
    (prefs.sections.quickActions && showQuickActions.value) ||
    (prefs.sections.onlineCommerce && showOnlineCommerce.value) ||
    (prefs.sections.alerts && showAlerts.value) ||
    (prefs.sections.activity && showActivity.value)
);

// PURE permission signal (independent of customize prefs): when false the user
// has no data permission at all → render the empty state, not zero cards.
const hasAnyContent = computed(
  () =>
    kpiAllowed.value ||
    showPerformance.value ||
    showOnlineCommerce.value ||
    showActivity.value ||
    showAlerts.value
);

const missingContentPerms = [
  { label: 'عرض مبيعات وفواتير اليوم', permission: 'sales:read' },
  { label: 'عرض العملاء والمستحقات', permission: 'customers:read' },
  { label: 'عرض البضاعة وقيمتها', permission: 'inventory:read' },
  { label: 'عرض الأرباح', permission: 'reports:read_profit' },
];

onMounted(() => {
  // Skip the data fetch entirely when the user has no readable content (avoids
  // pointless requests; the empty state renders instead).
  if (hasAnyContent.value) refresh();
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
