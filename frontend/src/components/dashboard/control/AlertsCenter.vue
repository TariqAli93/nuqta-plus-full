<template>
  <v-card class="cc-panel alerts-center" flat tag="section">
    <header class="cc-panel__head">
      <div class="cc-panel__title">
        <v-icon icon="mdi-bell-ring-outline" size="20" color="warning" />
        <span>مركز التنبيهات</span>
        <v-chip v-if="alerts.length" size="x-small" color="warning" variant="flat" class="ms-1">
          {{ alerts.length }}
        </v-chip>
      </div>
      <v-btn
        icon="mdi-refresh"
        size="x-small"
        variant="text"
        :loading="alertStore.loading"
        aria-label="تحديث التنبيهات"
        @click="reload"
      />
    </header>

    <div class="cc-scroll alerts-center__body">
      <div v-if="!alerts.length" class="cc-empty">
        <v-icon icon="mdi-check-circle-outline" size="40" color="success" />
        <div class="text-body-2">كل شيء على ما يرام — لا توجد تنبيهات</div>
      </div>

      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="alert-item"
        :style="{ '--alert-accent': alert.accent }"
      >
        <span class="alert-item__icon"><v-icon :icon="alert.icon" size="20" /></span>
        <div class="alert-item__body">
          <div class="alert-item__title">
            {{ alert.title }}
            <span v-if="alert.count" class="alert-item__count">{{ alert.count }}</span>
          </div>
          <div v-if="alert.detail" class="alert-item__detail">{{ alert.detail }}</div>
        </div>
        <v-btn
          class="alert-item__action"
          :color="alert.btnColor"
          size="small"
          variant="tonal"
          @click="act(alert)"
        >
          {{ alert.actionLabel }}
        </v-btn>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAlertStore } from '@/stores/alert';
import { useLicenseStore } from '@/stores/license';
import { useAuthStore } from '@/stores/auth';
import { useUpdater } from '@/hooks/useUpdater';
import api from '@/plugins/axios';
import { formatCurrency } from '@/utils/formatters';

const router = useRouter();
const alertStore = useAlertStore();
const licenseStore = useLicenseStore();
const authStore = useAuthStore();
const { isAvailable: updateAvailable, isReady: updateReady } = useUpdater();

const ACCENTS = { error: '#DC2626', warning: '#D97706', info: '#0EA5E9', primary: '#0078D4' };

// مصدر تنبيه النسخ الاحتياطي (للمدير العام فقط): يظهر عندما لا توجد أي نسخة.
const noBackup = ref(false);

const stockTarget = computed(() =>
  authStore.hasFeature('inventory') ? '/inventory/low-stock' : '/products'
);

const alerts = computed(() => {
  const list = [];

  // ١) الترخيص (خامل حالياً — ينشط تلقائياً عند تفعيل نظام التراخيص).
  if (licenseStore.isExpired) {
    list.push({
      id: 'license-expired',
      priority: 100,
      accent: ACCENTS.error,
      btnColor: 'error',
      icon: 'mdi-shield-alert-outline',
      title: 'انتهى الترخيص',
      detail: 'يلزم تجديد الترخيص لمتابعة العمل.',
      actionLabel: 'تجديد',
      to: '/about',
    });
  } else if (licenseStore.daysRemaining > 0 && licenseStore.daysRemaining <= 14) {
    list.push({
      id: 'license-expiring',
      priority: 80,
      accent: ACCENTS.warning,
      btnColor: 'warning',
      icon: 'mdi-shield-clock-outline',
      title: 'الترخيص قارب على الانتهاء',
      detail: `متبقٍ ${licenseStore.daysRemaining} يوم.`,
      actionLabel: 'تفاصيل',
      to: '/about',
    });
  }

  // ٢) منتجات نافدة.
  if (alertStore.outOfStockCount > 0) {
    list.push({
      id: 'out-of-stock',
      priority: 90,
      accent: ACCENTS.error,
      btnColor: 'error',
      icon: 'mdi-package-variant-remove',
      title: 'منتجات نافدة',
      count: alertStore.outOfStockCount,
      detail: namesPreview(alertStore.outOfStockProducts),
      actionLabel: 'معالجة',
      to: stockTarget.value,
    });
  }

  // ٣) ديون/أقساط متأخرة.
  if (alertStore.overdueCount > 0) {
    list.push({
      id: 'overdue',
      priority: 85,
      accent: ACCENTS.error,
      btnColor: 'error',
      icon: 'mdi-calendar-alert',
      title: 'ديون متأخرة',
      count: alertStore.overdueCount,
      detail: alertStore.totalOverdueAmount
        ? `بقيمة ${formatCurrency(alertStore.totalOverdueAmount, 'IQD')}`
        : 'أقساط تجاوزت تاريخ استحقاقها.',
      actionLabel: 'قبض',
      to: '/collections',
    });
  }

  // ٤) منتجات قاربت على النفاد.
  if (alertStore.lowStockCount > 0) {
    list.push({
      id: 'low-stock',
      priority: 70,
      accent: ACCENTS.warning,
      btnColor: 'warning',
      icon: 'mdi-alert-outline',
      title: 'بضاعة قاربت على النفاد',
      count: alertStore.lowStockCount,
      detail: namesPreview(alertStore.lowStockProducts),
      actionLabel: 'مراجعة',
      to: stockTarget.value,
    });
  }

  // ٥) نسخة احتياطية مطلوبة.
  if (noBackup.value) {
    list.push({
      id: 'backup',
      priority: 40,
      accent: ACCENTS.info,
      btnColor: 'info',
      icon: 'mdi-cloud-upload-outline',
      title: 'لم يتم أخذ نسخة احتياطية',
      detail: 'احفظ نسخة احتياطية لبياناتك لحمايتها.',
      actionLabel: 'نسخ احتياطي',
      to: '/settings',
    });
  }

  // ٦) تحديث جديد.
  if (updateReady.value || updateAvailable.value) {
    list.push({
      id: 'update',
      priority: 35,
      accent: ACCENTS.primary,
      btnColor: 'primary',
      icon: 'mdi-download-circle-outline',
      title: updateReady.value ? 'تحديث جاهز للتثبيت' : 'يتوفر تحديث جديد',
      detail: updateReady.value
        ? 'أعد تشغيل البرنامج لتثبيت التحديث.'
        : 'إصدار أحدث متاح للتنزيل.',
      actionLabel: 'تفاصيل',
      to: '/about',
    });
  }

  return list.sort((a, b) => b.priority - a.priority);
});

function namesPreview(items = []) {
  const names = items.slice(0, 3).map((p) => p.name).filter(Boolean);
  if (!names.length) return '';
  const more = items.length > 3 ? ` و${items.length - 3} غيرها` : '';
  return names.join('، ') + more;
}

function act(alert) {
  if (alert.handler) return alert.handler();
  if (alert.to) return router.push(alert.to);
}

// The alerts endpoint requires `sales:read`. Guard so users without it never
// trigger a 403 (the store also surfaces its own error toast on failure).
const canReadAlerts = computed(() => authStore.hasPermission('sales:read'));

async function reload() {
  if (!canReadAlerts.value) return;
  try {
    await alertStore.fetchAlerts();
  } catch {
    /* الأخطاء تُعرض عبر المعترض العام */
  }
}

async function checkBackup() {
  if (!authStore.isGlobalAdmin) return;
  try {
    const res = await api.get('/settings/backups');
    const items = res?.data || res || [];
    noBackup.value = Array.isArray(items) && items.length === 0;
  } catch {
    noBackup.value = false; // لا نُظهر تنبيهاً عند تعذّر التحقق
  }
}

onMounted(() => {
  if (!alertStore.hasInitialSnapshot) reload();
  checkBackup();
});
</script>

<style scoped>
.alerts-center__body {
  flex: 1;
  min-height: 0;
  max-height: 340px;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.65rem;
  border-radius: 11px;
  transition: background 0.14s ease;
}

.alert-item:hover {
  background: color-mix(in srgb, var(--alert-accent) 7%, transparent);
}

.alert-item + .alert-item {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}

.alert-item__icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--alert-accent);
  background: color-mix(in srgb, var(--alert-accent) 14%, transparent);
}

.alert-item__body {
  flex: 1 1 auto;
  min-width: 0;
}

.alert-item__title {
  font-size: 0.88rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.alert-item__count {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--alert-accent);
  background: color-mix(in srgb, var(--alert-accent) 16%, transparent);
  border-radius: 999px;
  padding: 0 7px;
  line-height: 1.5;
}

.alert-item__detail {
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-item__action {
  flex: 0 0 auto;
}
</style>
