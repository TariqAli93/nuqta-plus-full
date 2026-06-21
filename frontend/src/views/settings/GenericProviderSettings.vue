<template>
  <div class="page-shell">
    <PageHeader
      :title="`إعدادات ${provider?.name || 'شركة التوصيل'}`"
      subtitle="الإعدادات ← التكاملات ← موفّرو التوصيل"
      icon="mdi-truck-fast-outline"
    >
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-right"
        to="/settings/integrations/delivery-providers"
      >
        رجوع
      </v-btn>
    </PageHeader>

    <v-alert v-if="notFound" type="error" variant="tonal">
      لم يتم العثور على شركة التوصيل المطلوبة.
    </v-alert>

    <v-card v-else class="page-section" :loading="store.loading">
      <v-card-text v-if="provider" class="pt-4">
        <!-- Status + default + implementation chips -->
        <div class="d-flex align-center flex-wrap gap-3 mb-4">
          <v-chip :color="conn.color" variant="flat">
            <v-icon start size="16">{{ conn.icon }}</v-icon
            >{{ conn.label }}
          </v-chip>
          <v-chip v-if="provider.isDefault" color="primary" variant="tonal" size="small">
            <v-icon start size="14">mdi-star</v-icon>الشركة الافتراضية
          </v-chip>
          <v-chip v-if="!provider.isImplemented" color="grey" variant="tonal" size="small">
            التكامل قيد التطوير
          </v-chip>
        </div>

        <v-alert
          v-if="!provider.isImplemented"
          type="info"
          variant="tonal"
          density="comfortable"
          class="mb-4"
        >
          يمكنك حفظ بيانات الربط الآن؛ تفعيل الإرسال الفعلي يتطلب إكمال تكامل هذه الشركة.
        </v-alert>

        <v-form ref="form">
          <v-switch
            v-model="formData.isActive"
            color="success"
            inset
            :label="formData.isActive ? 'الشركة مفعّلة' : 'الشركة معطّلة'"
            hide-details
            class="mb-2"
          />
          <v-switch
            v-model="formData.isDefault"
            color="primary"
            inset
            label="تعيين كشركة افتراضية"
            :disabled="provider.isDefault"
            hide-details
            class="mb-3"
          />

          <v-text-field
            v-model="formData.baseUrl"
            label="عنوان الـ API (Base URL)"
            placeholder="https://api.example.com"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-link-variant"
          />

          <v-text-field
            v-model="formData.apiKey"
            label="مفتاح الـ API (API Key)"
            :placeholder="ph(provider.hasApiKey)"
            type="password"
            autocomplete="new-password"
            variant="outlined"
            density="comfortable"
          />

          <v-text-field
            v-model="formData.accessToken"
            label="رمز الوصول (Access Token)"
            :placeholder="ph(provider.hasCredentials)"
            type="password"
            autocomplete="new-password"
            variant="outlined"
            density="comfortable"
          />

          <v-text-field
            v-model="formData.username"
            label="اسم المستخدم (Username)"
            :placeholder="provider.hasCredentials ? 'محفوظ — اتركه فارغاً للإبقاء عليه' : ''"
            variant="outlined"
            density="comfortable"
            autocomplete="off"
          />

          <v-text-field
            v-model="formData.password"
            label="كلمة المرور / السر (Password)"
            :placeholder="ph(provider.hasApiSecret)"
            type="password"
            autocomplete="new-password"
            variant="outlined"
            density="comfortable"
            hint="لا تُعرض القيم المحفوظة مرة أخرى — تُخزَّن مشفّرة في الخادم."
            persistent-hint
          />

          <v-textarea
            v-model="formData.configJson"
            label="إعدادات إضافية (JSON)"
            placeholder='{ "endpoints": { }, "statusMap": { } }'
            variant="outlined"
            density="comfortable"
            rows="4"
            auto-grow
            class="mt-3"
            :error-messages="jsonError ? ['صيغة JSON غير صالحة'] : []"
            hint="حقول متقدّمة خاصة بالشركة (تُدمج مع الإعدادات الحالية)."
            persistent-hint
          />
        </v-form>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-btn
          v-if="canManage"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-lan-connect"
          :loading="store.testing"
          :disabled="dirty"
          @click="handleTest"
        >
          اختبار الاتصال
        </v-btn>
        <span v-if="dirty" class="text-caption text-medium-emphasis ms-2"
          >احفظ التغييرات أولاً للاختبار</span
        >
        <v-spacer />
        <v-btn
          v-if="canManage"
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
import { useRoute } from 'vue-router';
import { useDeliveryProviderStore } from '@/stores/deliveryProvider';
import { useAuthStore } from '@/stores/auth';
import { connectionMeta } from '@/constants/delivery';
import PageHeader from '@/components/PageHeader.vue';

const route = useRoute();
const store = useDeliveryProviderStore();
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('delivery_providers:manage'));

const code = String(route.params.code || '').toUpperCase();
const provider = ref(null);
const notFound = ref(false);
const jsonError = ref(false);

const formData = reactive({
  isActive: false,
  isDefault: false,
  baseUrl: '',
  apiKey: '',
  accessToken: '',
  username: '',
  password: '',
  configJson: '',
});

const conn = computed(() => connectionMeta(provider.value?.connectionStatus));
const ph = (has) => (has ? '•••••••• (محفوظ — اتركه فارغاً للإبقاء عليه)' : 'أدخل القيمة');

const dirty = computed(() => {
  const p = provider.value;
  if (!p) return false;
  return (
    formData.isActive !== !!p.isActive ||
    formData.isDefault !== !!p.isDefault ||
    (formData.baseUrl || '') !== (p.baseUrl || '') ||
    !!formData.apiKey ||
    !!formData.accessToken ||
    !!formData.username ||
    !!formData.password ||
    !!formData.configJson.trim()
  );
});

// Show only the operator-editable config keys (hide the ones we manage via
// dedicated fields or that the server stamps).
const extraConfigJson = (cfg) => {
  if (!cfg) return '';
  const {
    baseUrl,
    environment,
    lastTestAt,
    lastTestStatus,
    lastTestMessage,
    lastSuccessfulTestAt,
    ...rest
  } = cfg;
  return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
};

const hydrate = (p) => {
  provider.value = p;
  formData.isActive = !!p?.isActive;
  formData.isDefault = !!p?.isDefault;
  formData.baseUrl = p?.baseUrl || '';
  formData.apiKey = '';
  formData.accessToken = '';
  formData.username = '';
  formData.password = '';
  formData.configJson = extraConfigJson(p?.config);
};

const handleSave = async () => {
  if (!provider.value) return;
  jsonError.value = false;
  let config;
  if (formData.configJson.trim()) {
    try {
      config = JSON.parse(formData.configJson);
    } catch {
      jsonError.value = true;
      return;
    }
  }
  const payload = {
    isActive: formData.isActive,
    isDefault: formData.isDefault,
    baseUrl: formData.baseUrl || '',
    // Secrets are write-only — only send a field the user actually typed.
    ...(formData.apiKey ? { apiKey: formData.apiKey } : {}),
    ...(formData.accessToken ? { accessToken: formData.accessToken } : {}),
    ...(formData.username ? { username: formData.username } : {}),
    ...(formData.password ? { password: formData.password } : {}),
    ...(config ? { config } : {}),
  };
  try {
    const updated = await store.updateProvider(provider.value.id, payload);
    if (updated) hydrate(updated);
  } catch {
    /* surfaced via notification store */
  }
};

const handleTest = async () => {
  if (!provider.value) return;
  try {
    const res = await store.testConnection(provider.value.id);
    if (res?.provider) hydrate(res.provider);
  } catch {
    /* surfaced via notification store */
  }
};

onMounted(async () => {
  const p = await store.getByCode(code);
  if (p) hydrate(p);
  else notFound.value = true;
});
</script>
