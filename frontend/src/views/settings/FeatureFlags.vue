<template>
  <div class="page-shell">
    <PageHeader
      title="إعدادات الميزات"
      subtitle="فعّل الوحدات التي تحتاجها فقط. الميزات المعطّلة تختفي من الواجهة."
      icon="mdi-toggle-switch"
    >
      <v-btn color="primary" prepend-icon="mdi-wizard-hat" :to="{ name: 'SetupWizard' }">
        معالج الإعداد
      </v-btn>
    </PageHeader>

    <!-- نمط العمل الحالي + الترقية -->
    <v-card class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="primary">{{ isFullMode ? 'mdi-domain' : 'mdi-storefront' }}</v-icon>
          <span>نمط العمل</span>
        </span>
      </div>
      <v-card-text class="flex items-center justify-space-between flex-wrap gap-3">
        <div>
          <div class="text-subtitle-1 font-weight-bold">
            {{ isFullMode ? 'النمط الكامل' : 'النمط السهل' }}
          </div>
          <div class="text-body-2 text-medium-emphasis">
            {{ isFullMode
              ? 'كل وحدات النظام المحاسبي متاحة، ويمكن إيقاف أي وحدة لا تحتاجها أو الرجوع للنمط السهل في أي وقت دون فقدان أي بيانات.'
              : 'الوحدات المحاسبية المتقدمة (الموردون، المشتريات، القيود، التقارير المالية) مقفلة. الترقية للنمط الكامل تفتحها دون فقدان أي بيانات.' }}
          </div>
        </div>
        <v-btn
          v-if="!isFullMode && canSwitchMode"
          color="success"
          prepend-icon="mdi-arrow-up-bold-circle"
          :loading="switching"
          @click="upgradeDialog = true"
        >
          الترقية للنمط الكامل
        </v-btn>
        <v-btn
          v-if="isFullMode && canSwitchMode"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-arrow-down-bold-circle"
          :loading="switching"
          @click="downgradeDialog = true"
        >
          الرجوع للنمط السهل
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card v-for="group in groups" :key="group.title" class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" :color="group.color">{{ group.icon }}</v-icon>
          <span>{{ group.title }}</span>
        </span>
      </div>
      <v-list lines="two">
        <v-list-item v-for="item in group.items" :key="item.key">
          <template #prepend>
            <v-icon :color="flags[item.key] ? 'success' : 'grey'">{{ item.icon }}</v-icon>
          </template>
          <v-list-item-title>
            {{ item.title }}
            <v-chip
              v-if="item.fullOnly && !isFullMode"
              size="x-small"
              color="warning"
              variant="tonal"
              prepend-icon="mdi-lock"
              class="ms-2"
            >
              يتطلب النمط الكامل
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>{{ item.description }}</v-list-item-subtitle>
          <template #append>
            <v-switch
              :model-value="flags[item.key]"
              color="primary"
              hide-details
              inset
              :disabled="!canManage || saving || (item.fullOnly && !isFullMode)"
              @update:model-value="(val) => toggle(item.key, val)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-alert
      v-if="!canManage"
      type="info"
      variant="tonal"
      density="compact"
      class="mt-4"
      text="للتغيير تحتاج صلاحية المدير العام."
    />

    <!-- تأكيد الترقية -->
    <v-dialog v-model="upgradeDialog" max-width="520">
      <v-card>
        <v-card-title class="text-h6">الترقية للنمط الكامل</v-card-title>
        <v-card-text>
          <p class="mb-2">
            سيتم فتح الوحدات المتقدمة (الموردون، المشتريات، المحاسبة المتقدمة، الحسابات المصرفية،
            الربح والخسارة والوضع المالي) لتفعيلها من هذه الشاشة.
          </p>
          <p class="text-medium-emphasis text-body-2 mb-0">
            لا تُفقد أي بيانات، ويمكنك الرجوع للنمط السهل في أي وقت — أو إيقاف أي وحدة لا
            تحتاجها.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="upgradeDialog = false">إلغاء</v-btn>
          <v-btn color="success" :loading="switching" @click="upgradeMode">تأكيد الترقية</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- تأكيد الرجوع للنمط السهل -->
    <v-dialog v-model="downgradeDialog" max-width="520">
      <v-card>
        <v-card-title class="text-h6">الرجوع للنمط السهل</v-card-title>
        <v-card-text>
          <p class="mb-0">
            سيتم إخفاء الميزات المتقدمة فقط، ولن يتم حذف أي بيانات. هل تريد المتابعة؟
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="downgradeDialog = false">إلغاء</v-btn>
          <v-btn color="primary" :loading="switching" @click="downgradeMode">تأكيد الرجوع</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '@/plugins/axios';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notification';
import PageHeader from '@/components/PageHeader.vue';

const authStore = useAuthStore();
const notify = useNotificationStore();

const flags = reactive({ ...(authStore.featureFlags || {}) });
const saving = ref(false);
const switching = ref(false);
const upgradeDialog = ref(false);
const downgradeDialog = ref(false);
const appMode = ref(authStore.appMode || 'simple');

const canManage = computed(() => authStore.hasPermission('manage_feature_toggles'));
// Switching the whole operating mode (simple⇄full) is a distinct backend action
// gated by `app_mode:upgrade`, separate from the per-flag `manage_feature_toggles`.
const canSwitchMode = computed(() => authStore.hasPermission('app_mode:upgrade'));
const isFullMode = computed(() => appMode.value === 'full');

// Grouped so the page reads like a product settings screen, not a developer flag list.
const groups = [
  {
    title: 'المبيعات',
    icon: 'mdi-cash-register',
    color: 'primary',
    items: [
      {
        key: 'pos',
        title: 'نقطة البيع (POS)',
        description: 'شاشة البيع السريع للكاشير.',
        icon: 'mdi-point-of-sale',
      },
      {
        key: 'installments',
        title: 'بيع بالأقساط',
        description: 'تفعيل الدفعات المؤجلة وجدولة الأقساط.',
        icon: 'mdi-calendar-clock',
      },
      {
        key: 'draftInvoices',
        title: 'الفواتير المسودة',
        description: 'حفظ فاتورة كمسودة وإكمالها لاحقًا.',
        icon: 'mdi-content-save-outline',
      },
      {
        key: 'creditScore',
        title: 'تقييم العملاء',
        description: 'نظام السكور الائتماني وتوصية السقف المالي.',
        icon: 'mdi-chart-line',
      },
      {
        key: 'agentPricing',
        title: 'تسعير الوكلاء والجملة',
        description: 'تصنيف العملاء (مفرد، جملة، وكيل) مع أسعار خاصة وسقف دين لكل عميل.',
        icon: 'mdi-account-star',
      },
    ],
  },
  {
    title: 'المخزون',
    icon: 'mdi-warehouse',
    color: 'secondary',
    items: [
      {
        key: 'inventory',
        title: 'إدارة المخزون',
        description: 'تتبع المخزون لكل منتج، التعديلات اليدوية، والحركات.',
        icon: 'mdi-package-variant',
      },
      {
        key: 'multiBranch',
        title: 'تعدد الفروع',
        description: 'دعم أكثر من فرع وربط المستخدمين بفروع.',
        icon: 'mdi-store',
      },
      {
        key: 'multiWarehouse',
        title: 'تعدد المخازن',
        description: 'أكثر من مخزن لكل فرع مع رصيد مستقل.',
        icon: 'mdi-warehouse',
      },
      {
        key: 'warehouseTransfers',
        title: 'نقل بين المخازن',
        description: 'إنشاء طلبات نقل ومراجعتها قبل تنفيذها.',
        icon: 'mdi-transfer',
      },
    ],
  },
  {
    title: 'المشتريات والموردون',
    icon: 'mdi-truck-delivery',
    color: 'deep-purple',
    items: [
      {
        key: 'suppliers',
        title: 'الموردون',
        description: 'سجل الموردين مع أرصدتهم وديونهم (الذمم الدائنة).',
        icon: 'mdi-account-group',
        fullOnly: true,
      },
      {
        key: 'purchases',
        title: 'فواتير الشراء',
        description: 'فواتير شراء نقدية وآجلة تُدخل البضاعة للمخزون بدفعات وكلَف وتواريخ صلاحية.',
        icon: 'mdi-cart-arrow-down',
        fullOnly: true,
      },
    ],
  },
  {
    title: 'الخزينة',
    icon: 'mdi-safe-square-outline',
    color: 'teal',
    items: [
      {
        key: 'treasury',
        title: 'الصناديق والسندات',
        description: 'صناديق نقدية متعددة مع سندات قبض وصرف وتحويلات بين الصناديق.',
        icon: 'mdi-safe-square-outline',
      },
      {
        key: 'bankAccounts',
        title: 'الحسابات المصرفية',
        description: 'حسابات بنكية بجانب الصناديق النقدية مع تحويلات بينها.',
        icon: 'mdi-bank',
        fullOnly: true,
      },
    ],
  },
  {
    title: 'المحاسبة',
    icon: 'mdi-book-clock-outline',
    color: 'info',
    items: [
      {
        key: 'accountingPeriods',
        title: 'القيد المحاسبي (الفترات)',
        description:
          'فترات مالية تُفتح وتُغلق. عند التفعيل: يلزم فتح قيد ووردية قبل البيع، وتُجمَّد التقارير عند الإغلاق. عند الإيقاف: يعمل البيع كالمعتاد بدون قيد.',
        icon: 'mdi-book-clock-outline',
      },
      {
        key: 'generalLedger',
        title: 'المحاسبة المتقدمة (تلقائية)',
        description:
          'كل فاتورة ووصل ومصروف يُسجَّل محاسبياً بشكل متوازن تلقائياً بالخلفية (نظام القيد المزدوج للمحاسب).',
        icon: 'mdi-file-tree',
        fullOnly: true,
      },
      {
        key: 'manualJournal',
        title: 'التسجيلات اليدوية',
        description: 'إضافة تسجيلات مالية يدوية متوازنة (قيود يومية للمحاسب — تتطلب المحاسبة المتقدمة).',
        icon: 'mdi-pencil-ruler',
        fullOnly: true,
      },
      {
        key: 'financialReports',
        title: 'الربح والخسارة والوضع المالي',
        description: 'فحص توازن الحسابات، حركة الحسابات بالتفصيل، كشوف الحركة، الربح والخسارة، والوضع المالي.',
        icon: 'mdi-finance',
        fullOnly: true,
      },
    ],
  },
  {
    title: 'التجارة الأونلاين',
    icon: 'mdi-shopping-outline',
    color: 'blue',
    items: [
      {
        key: 'onlineOrders',
        title: 'الطلبات الأونلاين',
        description:
          'استقبال طلبات قنوات البيع (فيسبوك، إنستغرام، واتساب…)، إدارتها، وتحويلها إلى فواتير، مع تقارير الطلبات الأونلاين.',
        icon: 'mdi-cart-outline',
      },
      {
        key: 'shipping',
        title: 'الشحن',
        description:
          'إدارة الشحنات وتتبعها، شركات النقل، وتقارير الشحن.',
        icon: 'mdi-truck-fast-outline',
      },
    ],
  },
  {
    title: 'التنبيهات والمتابعة',
    icon: 'mdi-bell',
    color: 'warning',
    items: [
      {
        key: 'alerts',
        title: 'التنبيهات',
        description: 'تنبيهات نظامية لحظية (مبيعات، مخزون، أقساط).',
        icon: 'mdi-bell',
      },
      {
        key: 'liveOperations',
        title: 'العمليات الحيّة',
        description: 'متابعة العمليات الحالية في الوقت الفعلي.',
        icon: 'mdi-pulse',
      },
    ],
  },
];

const load = async () => {
  try {
    const response = await api.get('/feature-flags');
    const data = response.data || {};
    const remote = data.flags || data; // tolerate both shapes
    Object.assign(flags, remote);
    if (data.appMode) appMode.value = data.appMode;
    authStore.setFeatureFlags({ ...flags });
  } catch {
    /* handled globally */
  }
};

const toggle = async (key, value) => {
  if (!canManage.value || saving.value) return;
  const previous = flags[key];
  flags[key] = value;
  saving.value = true;
  try {
    const response = await api.put('/feature-flags', { [key]: value });
    Object.assign(flags, response.data || {});
    // setFeatureFlags re-fetches /auth/session so capabilities + scope
    // (and therefore every menu/button that uses `can()` or `hasFeature()`)
    // update immediately — no full page reload needed.
    await authStore.setFeatureFlags({ ...flags });
    notify.success('تم حفظ التغيير');
  } catch {
    flags[key] = previous;
  } finally {
    saving.value = false;
  }
};

// Switch the operating mode in either direction, then reload settings from the
// backend so flags + appMode + capabilities (menus/routes/buttons) update live.
const switchMode = async (mode) => {
  switching.value = true;
  try {
    await api.put('/feature-flags/app-mode', { mode });
    upgradeDialog.value = false;
    downgradeDialog.value = false;
    // Re-read the canonical settings (the backend may have toggled full-only
    // flags off on downgrade) and refresh the session for capabilities/scope.
    await load();
    return true;
  } catch {
    return false; // handled globally
  } finally {
    switching.value = false;
  }
};

const upgradeMode = async () => {
  if (await switchMode('full')) {
    notify.success('تمت الترقية للنمط الكامل — فعّل الوحدات التي تحتاجها من هذه الشاشة');
  }
};

const downgradeMode = async () => {
  if (await switchMode('simple')) {
    notify.success('تم الرجوع للنمط السهل — أُخفيت الميزات المتقدمة فقط، وبياناتك محفوظة');
  }
};

onMounted(load);
</script>
