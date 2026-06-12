<template>
  <v-container max-width="860" class="py-8">
    <div class="text-center mb-8">
      <div class="text-h4 font-weight-bold mb-2">مرحباً في نقطة بلس 👋</div>
      <div class="text-body-1 text-medium-emphasis">
        {{ step === 1
          ? 'اختر نمط العمل المناسب لنشاطك وسيقوم البرنامج بتهيئة نفسه تلقائياً.'
          : mode === 'simple'
            ? 'اختر طريقة استخدامك للنظام. يمكن تغيير أي شيء لاحقاً من الإعدادات.'
            : 'اختر طريقة إنشاء شجرة الحسابات: قالب جاهز أو إنشاء يدوي. يمكن تعديل الحسابات لاحقاً.' }}
      </div>
    </div>

    <!-- ── الخطوة 1: اختيار النمط ─────────────────────────────────────── -->
    <template v-if="step === 1">
      <v-row justify="center">
        <v-col v-for="m in modes" :key="m.id" cols="12" md="5">
          <v-card
            :variant="mode === m.id ? 'tonal' : 'outlined'"
            :color="mode === m.id ? 'primary' : undefined"
            class="preset-card h-full pa-4 cursor-pointer"
            @click="mode = m.id"
          >
            <div class="flex items-center gap-3 mb-2">
              <v-avatar :color="m.color" size="44">
                <v-icon color="white">{{ m.icon }}</v-icon>
              </v-avatar>
              <div>
                <div class="text-h6 font-weight-bold">{{ m.title }}</div>
                <div class="text-caption text-medium-emphasis">{{ m.subtitle }}</div>
              </div>
            </div>
            <div class="text-body-2 text-medium-emphasis mb-3">{{ m.description }}</div>
            <v-list density="compact" lines="one" class="pa-0 bg-transparent">
              <v-list-item
                v-for="f in m.features"
                :key="f.label"
                class="px-0"
                :prepend-icon="f.on ? 'mdi-check-circle' : 'mdi-minus-circle-outline'"
              >
                <v-list-item-title :class="f.on ? 'text-success' : 'text-medium-emphasis'">
                  {{ f.label }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </v-row>

      <div class="flex justify-center mt-6 gap-2">
        <v-btn variant="text" @click="skip">تخطي الآن</v-btn>
        <v-btn color="primary" size="large" :disabled="!mode" @click="step = 2">
          متابعة
        </v-btn>
      </div>
    </template>

    <!-- ── الخطوة 2 (السهل): بطاقات الاستخدام ─────────────────────────── -->
    <template v-else-if="mode === 'simple'">
      <v-row>
        <v-col v-for="preset in simplePresets" :key="preset.id" cols="12" md="6" lg="3">
          <v-card
            :variant="selected === preset.id ? 'tonal' : 'outlined'"
            :color="selected === preset.id ? 'primary' : undefined"
            class="preset-card h-full pa-3 cursor-pointer"
            @click="selected = preset.id"
          >
            <div class="flex items-center gap-3 mb-2">
              <v-avatar :color="preset.color" size="40">
                <v-icon color="white">{{ preset.icon }}</v-icon>
              </v-avatar>
              <div class="text-h6 font-weight-bold">{{ preset.title }}</div>
            </div>
            <div class="text-body-2 text-medium-emphasis mb-3">{{ preset.description }}</div>
            <v-list density="compact" lines="one" class="pa-0 bg-transparent">
              <v-list-item
                v-for="f in preset.features"
                :key="f.label"
                class="px-0"
                :prepend-icon="f.on ? 'mdi-check-circle' : 'mdi-minus-circle-outline'"
              >
                <v-list-item-title :class="f.on ? 'text-success' : 'text-medium-emphasis'">
                  {{ f.label }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </v-row>

      <div class="flex justify-center mt-6 gap-2">
        <v-btn variant="text" @click="step = 1">رجوع</v-btn>
        <v-btn color="primary" size="large" :loading="saving" :disabled="!selected" @click="apply">
          بدء الاستخدام
        </v-btn>
      </div>
    </template>

    <!-- ── الخطوة 2 (الكامل): قالب الشجرة + الفروع ────────────────────── -->
    <template v-else>
      <v-row justify="center">
        <v-col v-for="t in coaTemplates" :key="t.id" cols="12" md="4">
          <v-card
            :variant="coaTemplate === t.id ? 'tonal' : 'outlined'"
            :color="coaTemplate === t.id ? 'primary' : undefined"
            class="preset-card h-full pa-4 cursor-pointer"
            @click="coaTemplate = t.id"
          >
            <div class="flex items-center gap-3 mb-2">
              <v-avatar :color="t.color" size="40">
                <v-icon color="white">{{ t.icon }}</v-icon>
              </v-avatar>
              <div class="text-h6 font-weight-bold">{{ t.title }}</div>
            </div>
            <div class="text-body-2 text-medium-emphasis">{{ t.description }}</div>
          </v-card>
        </v-col>
      </v-row>

      <v-card variant="outlined" class="pa-4 mt-4 mx-auto" max-width="700">
        <v-switch
          v-model="multiBranchEnabled"
          color="primary"
          hide-details
          label="تفعيل تعدد الفروع والمخازن (يمكن تفعيله لاحقاً من شاشة الميزات)"
        />
      </v-card>

      <div class="flex justify-center mt-6 gap-2">
        <v-btn variant="text" @click="step = 1">رجوع</v-btn>
        <v-btn color="primary" size="large" :loading="saving" :disabled="!coaTemplate" @click="apply">
          بدء الاستخدام
        </v-btn>
      </div>
    </template>
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/plugins/axios';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notification';

const router = useRouter();
const authStore = useAuthStore();
const notify = useNotificationStore();

const step = ref(1);
const mode = ref('simple');
const selected = ref('simple');
const coaTemplate = ref('simple_tree');
const multiBranchEnabled = ref(true);
const saving = ref(false);

const modes = [
  {
    id: 'simple',
    title: 'النمط السهل',
    subtitle: 'للمحال والمتاجر الصغيرة',
    icon: 'mdi-storefront',
    color: 'primary',
    description: 'بيع سريع وديون وأقساط وصندوق — بدون تعقيد محاسبي.',
    features: [
      { label: 'نقطة بيع وفواتير', on: true },
      { label: 'عملاء وديون وأقساط', on: true },
      { label: 'صندوق وسندات قبض وصرف', on: true },
      { label: 'شجرة حسابات وقيود محاسبية', on: false },
      { label: 'موردون ومشتريات وتقارير مالية', on: false },
    ],
  },
  {
    id: 'full',
    title: 'النمط الكامل',
    subtitle: 'للشركات والأعمال الكبيرة',
    icon: 'mdi-domain',
    color: 'success',
    description: 'نظام محاسبي متكامل يسجّل كل شيء تلقائياً مع كل الوحدات.',
    features: [
      { label: 'كل ميزات النمط السهل', on: true },
      { label: 'الموردون والمشتريات', on: true },
      { label: 'المحاسبة المتقدمة (تسجيل تلقائي)', on: true },
      { label: 'الصناديق والحسابات المصرفية', on: true },
      { label: 'الربح والخسارة والوضع المالي', on: true },
    ],
  },
];

const simplePresets = [
  {
    id: 'simple',
    title: 'بيع بسيط',
    icon: 'mdi-cash-register',
    color: 'primary',
    description: 'متجر واحد، بيع نقدي فقط، إدارة مخزون بسيطة.',
    features: [
      { label: 'إدارة المخزون', on: true },
      { label: 'أقساط', on: false },
      { label: 'صندوق وسندات', on: false },
      { label: 'تعدد الفروع', on: false },
    ],
  },
  {
    id: 'installments',
    title: 'بيع + أقساط',
    icon: 'mdi-calendar-clock',
    color: 'secondary',
    description: 'مع دفعات مؤجلة، متابعة عملاء، وتقييم ائتماني.',
    features: [
      { label: 'إدارة المخزون', on: true },
      { label: 'أقساط', on: true },
      { label: 'تقييم العملاء', on: true },
      { label: 'صندوق وسندات', on: false },
    ],
  },
  {
    id: 'simple_plus',
    title: 'بيع + صندوق',
    icon: 'mdi-safe-square-outline',
    color: 'warning',
    description: 'بيع وأقساط مع صناديق نقدية وسندات قبض وصرف.',
    features: [
      { label: 'إدارة المخزون', on: true },
      { label: 'أقساط', on: true },
      { label: 'صندوق وسندات قبض/صرف', on: true },
      { label: 'تعدد الفروع', on: false },
    ],
  },
  {
    id: 'multi_branch',
    title: 'أعمال بفروع متعددة',
    icon: 'mdi-store',
    color: 'success',
    description: 'فروع متعددة، مخازن، ونقل مع موافقات.',
    features: [
      { label: 'إدارة المخزون', on: true },
      { label: 'أقساط', on: true },
      { label: 'تعدد الفروع والمخازن', on: true },
      { label: 'نقل بين المخازن', on: true },
    ],
  },
];

const coaTemplates = [
  {
    id: 'simple_tree',
    title: 'شجرة مبسطة',
    icon: 'mdi-file-tree',
    color: 'primary',
    description:
      'شجرة جاهزة (أصول، خصوم، حقوق ملكية، إيرادات، مصروفات) بترقيم هرمي قابل للتعديل والإضافة بحرية. الخيار الأنسب لمعظم الأعمال.',
  },
  {
    id: 'iraqi_unified',
    title: 'النظام المحاسبي الموحد العراقي',
    icon: 'mdi-bank',
    color: 'success',
    description:
      'قالب يتبع ترقيم وتصنيفات النظام المحاسبي الموحد المعتمد في العراق — مناسب للشركات الخاضعة للرقابة والتدقيق.',
  },
  {
    id: 'manual',
    title: 'إنشاء يدوي',
    icon: 'mdi-pencil-plus-outline',
    color: 'grey',
    description:
      'لا يتم إنشاء أي حسابات الآن. بعد الإعداد ستنتقل إلى صفحة شجرة الحسابات لإضافة حساباتك بنفسك.',
  },
];

const apply = async () => {
  if (saving.value) return; // prevent double submits while accounts are being created
  saving.value = true;
  try {
    const isFull = mode.value === 'full';
    const wantsManualCoa = isFull && coaTemplate.value === 'manual';
    const payload = isFull
      ? { preset: 'full', coaTemplate: coaTemplate.value }
      : { preset: selected.value };
    // The backend applies the preset AND seeds the chosen COA template
    // (idempotent) in one call — so this resolves only after the accounts exist.
    const response = await api.post('/feature-flags/setup', payload);
    let flags = response.data?.flags || {};

    // النمط الكامل يفعّل الفروع افتراضياً — أطفئها إن لم يرغب المستخدم.
    if (isFull && !multiBranchEnabled.value) {
      const updated = await api.put('/feature-flags', {
        multiBranch: false,
        multiWarehouse: false,
        warehouseTransfers: false,
      });
      flags = updated.data || flags;
    }

    // setFeatureFlags re-fetches the session, so appMode/capabilities refresh too.
    await authStore.setFeatureFlags(flags);
    authStore.setupMode = 'done';
    localStorage.setItem('setupMode', 'done');

    if (wantsManualCoa) {
      // Manual choice: nothing was seeded — guide the user to build the tree.
      notify.success('تم تهيئة النظام — أضف حساباتك من شجرة الحسابات');
      router.replace({ name: 'ChartOfAccounts' });
    } else {
      const created = response.data?.coaSeed?.created;
      notify.success(
        created ? `تم تهيئة النظام وإنشاء ${created} حساباً` : 'تم تهيئة النظام بنجاح'
      );
      router.replace({ name: 'Dashboard' });
    }
  } catch (err) {
    // Surface a clear, actionable error instead of leaving the button spinning.
    const msg =
      err?.response?.data?.message || err?.message || 'تعذّر إنشاء شجرة الحسابات، حاول مرة أخرى';
    notify.error(msg);
  } finally {
    saving.value = false;
  }
};

const skip = () => {
  // Mark done locally so the wizard doesn't loop, but keep the flags as-is.
  authStore.setupMode = 'done';
  localStorage.setItem('setupMode', 'done');
  router.replace({ name: 'Dashboard' });
};
</script>

<style scoped>
.preset-card {
  transition: all 0.15s ease;
}
.preset-card:hover {
  transform: translateY(-2px);
}
</style>
