<template>
  <v-container class="fill-height d-flex align-center justify-center" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="9" md="7" lg="5">
        <v-card class="text-center pa-8 rounded-xl" elevation="10">
          <v-icon icon="mdi-lock-alert" size="110" color="error" class="mb-4" />

          <h1 class="text-h2 font-weight-bold mb-2">403</h1>

          <h2 class="text-h5 mb-3 font-weight-medium">
            {{ isDisabledFeature ? 'ميزة غير مفعّلة' : 'غير مسموح بالوصول' }}
          </h2>

          <p class="text-body-1 text-medium-emphasis mb-2">
            {{
              isDisabledFeature
                ? disabledFeatureMessage
                : 'ليس لديك الصلاحية للوصول إلى هذه الصفحة.'
            }}
          </p>

          <!-- Structured details (when the guard passed them) -->
          <v-alert
            v-if="detailRows.length"
            type="warning"
            variant="tonal"
            class="text-start my-5"
            border="start"
          >
            <div v-for="row in detailRows" :key="row.label" class="mb-1">
              <strong>{{ row.label }}:</strong>
              <span class="ms-1">{{ row.value }}</span>
            </div>
          </v-alert>

          <p v-else class="text-body-2 text-medium-emphasis mb-2">
            إذا كنت تعتقد أن هذا خطأ، الرجاء التواصل مع المسؤول عن النظام.
          </p>

          <v-divider class="my-6" />

          <div class="d-flex flex-column flex-sm-row gap-3 justify-center">
            <v-btn color="primary" variant="flat" prepend-icon="mdi-arrow-right" @click="goBack">
              العودة للخلف
            </v-btn>

            <v-btn color="primary" variant="outlined" prepend-icon="mdi-home" @click="goHome">
              الذهاب للوحة التحكم
            </v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNavigationMenu } from '@/composables/useNavigationMenu';
import { featureLabels } from '@/auth/featureFlags';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const { getPageTitle } = useNavigationMenu();
const authStore = useAuthStore();

// A disabled OPTIONAL MODULE (feature flag off) is distinct from a missing
// permission: the page exists but the whole module is turned off in system
// settings. The guard forwards the offending flag(s) as `disabledFeature`.
const disabledFeatures = computed(() =>
  route.query.disabledFeature
    ? String(route.query.disabledFeature).split(',').filter(Boolean)
    : []
);
const isDisabledFeature = computed(() => disabledFeatures.value.length > 0);
const disabledFeatureMessage = computed(() => {
  const labels = featureLabels(disabledFeatures.value);
  return `ميزة "${labels}" غير مفعّلة من إعدادات النظام.`;
});

// The router guard forwards the denial context via query params:
//   permission           — required permission key(s), comma-separated
//   capability            — required capability (feature/role gate)
//   requiresGlobalAdmin   — '1' when the page is global-admin only
//   from                  — the path the user was trying to open
const fromPath = computed(() => route.query.from || '');
const requiredPermissions = computed(() =>
  route.query.permission ? String(route.query.permission).split(',').filter(Boolean) : []
);
const requiredCapability = computed(() => route.query.capability || '');
const requiresGlobalAdmin = computed(() => route.query.requiresGlobalAdmin === '1');

const pageName = computed(() => (fromPath.value ? getPageTitle(fromPath.value) : ''));

/** Labeled rows rendered inside the details alert — only the ones we know. */
const detailRows = computed(() => {
  const rows = [];
  if (pageName.value) rows.push({ label: 'الصفحة', value: pageName.value });

  // Disabled optional module: explain it's off and how to turn it on.
  if (isDisabledFeature.value) {
    rows.push({ label: 'الميزة', value: featureLabels(disabledFeatures.value) });
    rows.push({ label: 'السبب', value: 'هذه الميزة معطّلة من إعدادات الميزات والنمط.' });
    rows.push({
      label: 'الحل',
      value: authStore.isGlobalAdmin
        ? 'فعّلها من: الإعدادات ← إعدادات الميزات والنمط.'
        : 'اطلب من المدير تفعيلها من إعدادات الميزات والنمط.',
    });
    return rows;
  }

  if (requiresGlobalAdmin.value) {
    rows.push({ label: 'الصلاحية المطلوبة', value: 'صلاحية المدير العام' });
    rows.push({ label: 'السبب', value: 'هذه الصفحة متاحة للمدير العام فقط.' });
    rows.push({ label: 'الحل', value: 'تواصل مع المدير العام لتنفيذ هذه العملية.' });
    return rows;
  }

  if (requiredPermissions.value.length) {
    rows.push({ label: 'الصلاحية المطلوبة', value: requiredPermissions.value.join('، ') });
  } else if (requiredCapability.value) {
    rows.push({ label: 'الميزة المطلوبة', value: requiredCapability.value });
  }

  if (rows.length) {
    rows.push({ label: 'السبب', value: 'حسابك لا يملك الصلاحية المطلوبة للوصول إلى هذه الصفحة.' });
    rows.push({
      label: 'الحل',
      value: 'تواصل مع المدير العام أو مدير النظام لمنحك الصلاحية المناسبة.',
    });
  }
  return rows;
});

const goBack = () => {
  // Avoid bouncing straight back to the forbidden page; fall back to home.
  if (window.history.length > 1) router.go(-1);
  else router.push('/');
};
const goHome = () => router.push('/');
</script>

<style scoped>
.fill-height {
  min-height: 100vh;
}

.gap-3 {
  gap: 12px;
}

/* لمسة جمالية للبطاقة */
.v-card {
  backdrop-filter: blur(10px);
}
</style>
