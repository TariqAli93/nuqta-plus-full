<template>
  <div class="company-info-form">
    <!-- 🔹 شريط الأدوات العلوي -->
    <v-card class="mb-4">
      <div class="flex items-center justify-space-between pa-3">
        <div class="font-semibold text-h6 text-primary">
          <v-icon class="me-2" color="primary">mdi-domain</v-icon>
          معلومات الشركة
        </div>
        <v-btn
          color="primary"
          prepend-icon="mdi-content-save"
          class="rounded-lg"
          :loading="settingsStore.isLoading"
          :disabled="!isFormValid"
          @click="saveCompanyInfo"
        >
          حفظ المعلومات
        </v-btn>
      </div>
    </v-card>

    <v-card class="mb-4 pa-4">
      <v-form ref="formRef" v-model="isFormValid">
        <v-row>
          <!-- Company Name -->
          <v-col cols="12" md="6">
            <v-text-field
              v-model="companyData.name"
              label="اسم الشركة *"
              :rules="[rules.required, rules.maxLength(255)]"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-domain"
              required
            />
          </v-col>

          <!-- Tax number -->
          <v-col cols="12" md="6">
            <v-text-field
              v-model="companyData.taxNumber"
              label="الرقم الضريبي (اختياري)"
              :rules="[rules.maxLength(60)]"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-barcode"
            />
          </v-col>

          <!-- Address Section -->
          <v-col cols="12">
            <v-divider class="my-2" />
            <h4 class="mb-3 text-h6 d-flex align-center">
              <v-icon class="me-2" color="info">mdi-map-marker</v-icon>
              العنوان
            </h4>
          </v-col>

          <v-col cols="12" md="4">
            <v-text-field
              v-model="companyData.city"
              label="المدينة"
              :rules="[rules.maxLength(100), rules.required]"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-city"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="companyData.area"
              label="المنطقة"
              :rules="[rules.maxLength(100), rules.required]"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-map-outline"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="companyData.street"
              label="الشارع"
              :rules="[rules.maxLength(200), rules.required]"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-road"
            />
          </v-col>

          <!-- Contact Information -->
          <v-col cols="12">
            <v-divider class="my-2" />
            <h4 class="mb-3 text-h6 d-flex align-center">
              <v-icon class="me-2" color="info">mdi-phone</v-icon>
              معلومات الاتصال
            </h4>
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="companyData.phone"
              :rules="[rules.validPhone, rules.required]"
              variant="outlined"
              prepend-inner-icon="mdi-phone"
              density="comfortable"
              label="رقم الهاتف"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="companyData.phone2"
              :rules="[rules.validPhone]"
              variant="outlined"
              prepend-inner-icon="mdi-phone"
              density="comfortable"
              label="رقم هاتف إضافي"
            />
          </v-col>
        </v-row>
      </v-form>
    </v-card>

    <!-- 🔹 إعدادات الفاتورة والطباعة -->
    <v-card class="mb-4 pa-4">
      <h4 class="mb-4 text-h6 d-flex align-center">
        <v-icon class="me-2" color="primary">mdi-printer-settings</v-icon>
        إعدادات الفاتورة والطباعة
      </h4>

      <v-row>
        <v-col cols="12" md="4">
          <v-select
            v-model="companyData.invoiceType"
            label="نوع الورق الافتراضي"
            :items="paperOptions"
            variant="outlined"
            density="comfortable"
            item-title="label"
            item-value="value"
            prepend-inner-icon="mdi-receipt"
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="companyData.invoiceTheme"
            label="ثيم الفاتورة"
            :items="themeOptions"
            variant="outlined"
            density="comfortable"
            item-title="label"
            item-value="value"
            prepend-inner-icon="mdi-palette"
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="companyData.receiptPrinterName"
            label="الطابعة الافتراضية"
            :items="printerOptions"
            variant="outlined"
            density="comfortable"
            item-title="label"
            item-value="value"
            prepend-inner-icon="mdi-printer"
            clearable
            :loading="loadingPrinters"
            :disabled="!isElectron"
            :hint="isElectron ? '' : 'متاح فقط داخل تطبيق سطح المكتب'"
            persistent-hint
            no-data-text="لا توجد طابعات"
          />
        </v-col>

        <v-col cols="12" md="3">
          <v-text-field
            v-model.number="defaultCopiesNum"
            type="number"
            min="1"
            label="عدد النسخ الافتراضي"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-content-copy"
          />
        </v-col>
        <v-col cols="12" md="5">
          <v-select
            v-model="companyData.invoiceHeaderLayout"
            label="تنسيق ترويسة الفاتورة (الشعار والاسم)"
            :items="headerLayoutOptions"
            variant="outlined"
            density="comfortable"
            item-title="label"
            item-value="value"
            prepend-inner-icon="mdi-view-split-vertical"
          />
        </v-col>
        <v-col cols="12" md="4" class="d-flex align-center">
          <v-switch
            v-model="silentPrintBool"
            color="primary"
            label="تفعيل الطباعة الصامتة (بدون نافذة الطابعة)"
            hide-details
            :disabled="!isElectron"
          />
        </v-col>
      </v-row>

      <v-divider class="my-4" />

      <!-- Company logo -->
      <h5 class="mb-3 text-subtitle-1 d-flex align-center">
        <v-icon class="me-2" color="info">mdi-image</v-icon>
        شعار الشركة
        <span class="text-caption text-medium-emphasis ms-2">
          (يُحفظ مسار الصورة فقط — لا تُخزَّن الصورة داخل قاعدة البيانات)
        </span>
      </h5>

      <div class="logo-row">
        <div class="logo-preview">
          <img v-if="logoPreview" :src="logoPreview" alt="شعار الشركة" />
          <div v-else class="logo-empty">
            <v-icon size="36" color="grey">mdi-image-off-outline</v-icon>
            <span>لا يوجد شعار</span>
          </div>
        </div>

        <div class="logo-actions">
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-upload"
            :disabled="!isElectron"
            :loading="logoBusy"
            @click="chooseLogo"
          >
            {{ companyData.companyLogoPath ? 'تغيير الشعار' : 'إضافة شعار' }}
          </v-btn>
          <v-btn
            v-if="companyData.companyLogoPath"
            color="error"
            variant="text"
            prepend-icon="mdi-delete"
            :disabled="!isElectron"
            :loading="logoBusy"
            @click="removeLogo"
          >
            حذف الشعار
          </v-btn>
          <div v-if="companyData.companyLogoFileName" class="text-caption text-medium-emphasis mt-1">
            الملف: {{ companyData.companyLogoFileName }}
          </div>
          <div v-if="!isElectron" class="text-caption text-warning mt-1">
            إدارة الشعار متاحة فقط داخل تطبيق سطح المكتب.
          </div>
        </div>
      </div>

      <v-divider class="my-4" />

      <!-- Custom invoice texts -->
      <h5 class="mb-3 text-subtitle-1 d-flex align-center">
        <v-icon class="me-2" color="info">mdi-format-text</v-icon>
        النصوص المخصّصة للفاتورة
      </h5>
      <v-row>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="companyData.invoiceHeaderText"
            label="النص العلوي للفاتورة"
            variant="outlined"
            density="comfortable"
            :rules="[rules.maxLength(200)]"
            hint="يظهر أسفل اسم الشركة / الشعار"
            persistent-hint
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="companyData.invoiceSubHeaderText"
            label="النص الفرعي العلوي"
            variant="outlined"
            density="comfortable"
            :rules="[rules.maxLength(200)]"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-textarea
            v-model="companyData.invoiceFooterText"
            label="النص السفلي للفاتورة"
            variant="outlined"
            density="comfortable"
            rows="2"
            auto-grow
            :rules="[rules.maxLength(400)]"
            hint="مثال: شكراً لتعاملكم معنا"
            persistent-hint
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-textarea
            v-model="companyData.invoiceTermsText"
            label="الشروط / الملاحظات الثابتة"
            variant="outlined"
            density="comfortable"
            rows="2"
            auto-grow
            :rules="[rules.maxLength(400)]"
            hint="مثال: البضاعة المباعة لا تُسترجع إلا بموجب الفاتورة"
            persistent-hint
          />
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useNotificationStore } from '../../stores/notification';
import { PAPER_OPTIONS } from '@/printing/paper/paperPresets.js';
import { THEME_OPTIONS, DEFAULT_THEME, coerceTheme } from '@/printing/templates/receipt/receipt.themes.js';

const headerLayoutOptions = [
  { value: 'auto', label: 'تلقائي (حسب الورق)' },
  { value: 'horizontal', label: 'أفقي (شعار بجانب الاسم)' },
  { value: 'centered', label: 'متمركز' },
  { value: 'compact', label: 'مدمج' },
];

const settingsStore = useSettingsStore();
const notificationStore = useNotificationStore();

const formRef = ref();
const isFormValid = ref(false);

const paperOptions = PAPER_OPTIONS;
const themeOptions = THEME_OPTIONS;

const printApi = window.electronAPI?.print || null;
const isElectron = !!printApi;

const printers = ref([]);
const loadingPrinters = ref(false);
const logoPreview = ref('');
const logoBusy = ref(false);

const companyData = ref({
  name: '',
  city: '',
  area: '',
  street: '',
  phone: '',
  phone2: '',
  taxNumber: '',
  logoUrl: '',
  invoiceType: 'roll-80',
  invoiceTheme: DEFAULT_THEME,
  companyLogoFileName: '',
  companyLogoPath: '',
  invoiceHeaderText: '',
  invoiceSubHeaderText: '',
  invoiceFooterText: '',
  invoiceTermsText: '',
  invoiceHeaderLayout: 'auto',
  receiptPrinterName: '',
  silentPrint: 'false',
  defaultCopies: '1',
});

// Bridge string-backed settings ↔ typed UI controls.
const silentPrintBool = computed({
  get: () => companyData.value.silentPrint === 'true',
  set: (v) => {
    companyData.value.silentPrint = v ? 'true' : 'false';
  },
});
const defaultCopiesNum = computed({
  get: () => Number(companyData.value.defaultCopies) || 1,
  set: (v) => {
    companyData.value.defaultCopies = String(Math.max(1, Number(v) || 1));
  },
});

const printerOptions = computed(() =>
  printers.value.map((p) => ({
    value: p.name,
    label: p.isDefault ? `${p.displayName} (افتراضية)` : p.displayName,
  }))
);

const rules = {
  required: (value) => !!value || 'هذا الحقل مطلوب',
  maxLength: (max) => (value) => !value || value.length <= max || `يجب ألا يتجاوز ${max} حرف`,
  validPhone: (value) => !value || /^\d{11}$/.test(value) || 'رقم الهاتف غير صحيح',
};

const saveCompanyInfo = async () => {
  if (!isFormValid.value) return;
  try {
    await settingsStore.saveCompanyInfo({ ...companyData.value });
  } catch {
    // surfaced by notification store
  }
};

// Persist immediately for discrete logo add/remove so the path isn't lost if the
// user navigates away without pressing the main Save button.
const persistLogoFields = async () => {
  try {
    await settingsStore.saveCompanyInfo({
      ...companyData.value,
      companyLogoFileName: companyData.value.companyLogoFileName,
      companyLogoPath: companyData.value.companyLogoPath,
    });
  } catch {
    /* surfaced by notification store */
  }
};

const chooseLogo = async () => {
  if (!printApi) return;
  logoBusy.value = true;
  try {
    const res = await printApi.saveLogo();
    if (res?.canceled) return;
    if (!res?.success) {
      notificationStore.error(res?.error || 'فشل حفظ الشعار');
      return;
    }
    companyData.value.companyLogoFileName = res.fileName || '';
    companyData.value.companyLogoPath = res.path || '';
    logoPreview.value = res.dataUrl || '';
    if (res.warning) notificationStore.warning?.(res.warning);
    await persistLogoFields();
    notificationStore.success('تم تحديث شعار الشركة');
  } finally {
    logoBusy.value = false;
  }
};

const removeLogo = async () => {
  if (!printApi) return;
  logoBusy.value = true;
  try {
    await printApi.deleteLogo(companyData.value.companyLogoPath);
    companyData.value.companyLogoFileName = '';
    companyData.value.companyLogoPath = '';
    logoPreview.value = '';
    await persistLogoFields();
    notificationStore.success('تم حذف شعار الشركة');
  } finally {
    logoBusy.value = false;
  }
};

const loadPrinters = async () => {
  if (!printApi) return;
  loadingPrinters.value = true;
  try {
    printers.value = (await printApi.getPrinters()) || [];
  } finally {
    loadingPrinters.value = false;
  }
};

const loadLogoPreview = async () => {
  if (!printApi || !companyData.value.companyLogoPath) {
    logoPreview.value = '';
    return;
  }
  const res = await printApi.getLogoPreview(companyData.value.companyLogoPath);
  logoPreview.value = res?.dataUrl || '';
};

const populateFromStore = () => {
  const source = settingsStore.companyInfo || {};
  companyData.value = {
    ...companyData.value,
    ...source,
    invoiceType: source.invoiceType || 'roll-80',
    // Map any legacy theme value (classic/modern/professional…) to a valid new one.
    invoiceTheme: coerceTheme(source.invoiceTheme),
    invoiceHeaderLayout: source.invoiceHeaderLayout || 'auto',
    silentPrint: source.silentPrint || 'false',
    defaultCopies: source.defaultCopies || '1',
  };
};

watch(
  () => settingsStore.companyInfo,
  () => {
    populateFromStore();
    loadLogoPreview();
  },
  { deep: true }
);

onMounted(async () => {
  await settingsStore.fetchCompanyInfo();
  populateFromStore();
  await Promise.all([loadPrinters(), loadLogoPreview()]);
});
</script>

<style scoped>
.logo-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.logo-preview {
  width: 140px;
  height: 90px;
  border: 1px dashed rgba(var(--v-border-color), 0.5);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.3);
}
.logo-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.logo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 12px;
}
.logo-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
</style>
