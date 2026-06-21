<template>
  <div class="page-shell">
    <PageHeader
      title="إعدادات Boxy للتوصيل"
      subtitle="الإعدادات ← التكاملات ← موفّرو التوصيل ← Boxy"
      icon="mdi-truck-fast-outline"
    >
      <v-btn
        v-if="canViewWebhookLogs"
        variant="tonal"
        prepend-icon="mdi-webhook"
        to="/settings/integrations/delivery-providers/boxy/webhook-logs"
      >
        سجل الـ Webhook
      </v-btn>
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-right"
        to="/settings/integrations/delivery-providers"
      >
        رجوع
      </v-btn>
    </PageHeader>

    <v-card class="page-section" :loading="store.loading">
      <v-card-text v-if="boxy" class="pt-4">
        <!-- Connection status + last successful test -->
        <div class="d-flex align-center flex-wrap gap-3 mb-4">
          <v-chip :color="conn.color" variant="flat">
            <v-icon start size="16">{{ conn.icon }}</v-icon
            >{{ conn.label }}
          </v-chip>
          <span class="text-caption text-medium-emphasis">
            آخر اختبار ناجح: {{ formatDateTime(boxy.lastSuccessfulTestAt) }}
          </span>
          <span
            v-if="boxy.lastTestStatus === 'failed' && boxy.lastTestMessage"
            class="text-caption text-error"
          >
            ({{ boxy.lastTestMessage }})
          </span>
        </div>

        <v-form ref="form">
          <!-- 1. Enable / disable -->
          <v-switch
            v-model="formData.isActive"
            color="success"
            inset
            :label="formData.isActive ? 'Boxy مفعّل' : 'Boxy معطّل'"
            hide-details
            class="mb-2"
          />

          <!-- 2. Environment -->
          <v-select
            v-model="formData.environment"
            :items="envItems"
            label="البيئة"
            variant="outlined"
            density="comfortable"
          />

          <!-- 3. Base URL (auto, read-only) -->
          <v-text-field
            :model-value="baseUrl"
            label="عنوان الـ API (يُحدَّد تلقائياً حسب البيئة)"
            variant="outlined"
            density="comfortable"
            readonly
            prepend-inner-icon="mdi-link-variant"
          />

          <!-- 4. API Key -->
          <v-text-field
            v-model="formData.apiKey"
            label="مفتاح الـ API (API Key)"
            :placeholder="
              boxy.hasApiKey ? '•••••••• (محفوظ — اتركه فارغاً للإبقاء عليه)' : 'أدخل المفتاح'
            "
            type="password"
            autocomplete="new-password"
            variant="outlined"
            density="comfortable"
          />

          <!-- 5. API Secret -->
          <v-text-field
            v-model="formData.apiSecret"
            label="السر (API Secret)"
            :placeholder="
              boxy.hasApiSecret ? '•••••••• (محفوظ — اتركه فارغاً للإبقاء عليه)' : 'أدخل السر'
            "
            type="password"
            autocomplete="new-password"
            variant="outlined"
            density="comfortable"
            hint="لا يُعرض السر المحفوظ مرة أخرى — يُخزَّن مشفّراً في الخادم."
            persistent-hint
          />
        </v-form>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <!-- 7. Test connection -->
        <v-btn
          v-if="canManageProviders"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-lan-connect"
          :loading="store.testing"
          :disabled="dirty || !boxy?.hasApiKey || !boxy?.hasApiSecret"
          @click="handleTest"
        >
          اختبار الاتصال
        </v-btn>
        <span v-if="dirty" class="text-caption text-medium-emphasis ms-2"
          >احفظ التغييرات أولاً للاختبار</span
        >
        <v-spacer />
        <!-- 6. Save -->
        <v-btn
          v-if="canManageProviders"
          color="primary"
          variant="elevated"
          :loading="store.saving"
          @click="handleSave"
        >
          حفظ
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useAuthStore } from '@/stores/auth';
import { connectionMeta, BOXY_BASE_URLS } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';

const store = useDeliveryProviderStore();
const authStore = useAuthStore();
const canViewWebhookLogs = computed(() => authStore.hasPermission('delivery_webhooks:view'));
// Saving/testing a provider's credentials hits endpoints gated by
// `delivery_providers:manage`; viewing the page only needs `delivery_providers:read`.
const canManageProviders = computed(() => authStore.hasPermission('delivery_providers:manage'));
const boxy = ref(null);

const envItems = [
  { title: 'تجريبية (Sandbox)', value: 'sandbox' },
  { title: 'إنتاج (Production)', value: 'production' },
];

const formData = reactive({
  isActive: false,
  environment: 'sandbox',
  apiKey: '',
  apiSecret: '',
});

// Base URL follows the selected environment, live (before save).
const baseUrl = computed(() => BOXY_BASE_URLS[formData.environment] || '');
const conn = computed(() => connectionMeta(boxy.value?.connectionStatus));

// Dirty = any toggle/env change, or a credential was entered.
const dirty = computed(() => {
  if (!boxy.value) return false;
  return (
    formData.isActive !== boxy.value.isActive ||
    formData.environment !== (boxy.value.environment || 'sandbox') ||
    !!formData.apiKey ||
    !!formData.apiSecret
  );
});

const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { hour12: false });
};

const hydrate = (p) => {
  boxy.value = p;
  formData.isActive = !!p?.isActive;
  formData.environment = p?.environment || 'sandbox';
  formData.apiKey = '';
  formData.apiSecret = '';
};

const handleSave = async () => {
  if (!boxy.value) return;
  const payload = {
    isActive: formData.isActive,
    environment: formData.environment,
    // Secrets are write-only: only send when the user typed a new value, so a
    // blank field keeps the stored secret untouched (never cleared by accident).
    ...(formData.apiKey ? { apiKey: formData.apiKey } : {}),
    ...(formData.apiSecret ? { apiSecret: formData.apiSecret } : {}),
  };
  try {
    const updated = await store.updateProvider(boxy.value.id, payload);
    if (updated) hydrate(updated);
  } catch {
    // surfaced via notification store
  }
};

const handleTest = async () => {
  if (!boxy.value) return;
  try {
    const res = await store.testConnection(boxy.value.id);
    if (res?.provider) boxy.value = res.provider;
  } catch {
    // surfaced via notification store
  }
};

onMounted(async () => {
  const p = await store.getByCode('BOXY');
  if (p) hydrate(p);
});
</script>
