<template>
  <div class="page-shell">
    <PageHeader
      :title="isEdit ? 'تعديل عميل' : 'عميل جديد'"
      :subtitle="isEdit ? 'تحديث معلومات العميل' : 'إضافة عميل جديد إلى النظام'"
      :icon="isEdit ? 'mdi-account-edit' : 'mdi-account-plus'"
    >
      <v-btn variant="text" prepend-icon="mdi-arrow-right" @click="router.back()">
        رجوع
      </v-btn>
    </PageHeader>

    <v-card class="page-section">
      <v-card-text>
        <v-form ref="form" @submit.prevent="handleSubmit">
          <div class="form-section">
            <div class="form-section__title">
              <v-icon size="20" color="primary">mdi-account-circle-outline</v-icon>
              <span>المعلومات الأساسية</span>
            </div>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.name"
                  label="اسم العميل *"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-account"
                  :rules="[rules.required]"
                  :error-messages="formErrors.messagesFor('name')"
                  required
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.phone"
                  label="رقم الهاتف"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-phone"
                  :hint="phoneHint"
                  :error-messages="[...(phoneError ? [phoneError] : []), ...formErrors.messagesFor('phone')]"
                  persistent-hint
                ></v-text-field>
              </v-col>
            </v-row>
          </div>

          <v-divider v-if="agentPricingOn" class="my-4" />

          <div v-if="agentPricingOn" class="form-section">
            <div class="form-section__title">
              <v-icon size="20" color="primary">mdi-account-star-outline</v-icon>
              <span>التصنيف والتسعير</span>
            </div>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-select
                  v-model="formData.customerType"
                  :items="customerTypeOptions"
                  item-title="label"
                  item-value="value"
                  label="فئة العميل"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-account-star"
                  hint="تحدد فئة السعر المطبّقة تلقائياً عند البيع"
                  persistent-hint
                />
              </v-col>
              <v-col v-if="canSetCreditLimit" cols="12" md="6">
                <v-text-field
                  v-model.number="formData.creditLimit"
                  type="number"
                  label="سقف الدين"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-credit-card-lock-outline"
                  hint="الحد الأقصى لإجمالي دين العميل. اتركه فارغاً = بدون حد"
                  persistent-hint
                  clearable
                />
              </v-col>
            </v-row>
          </div>

          <v-divider class="my-4" />

          <div class="form-section">
            <div class="form-section__title">
              <v-icon size="20" color="primary">mdi-map-marker-outline</v-icon>
              <span>العنوان والملاحظات</span>
            </div>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.city"
                  label="المدينة"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-city"
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.address"
                  label="العنوان"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-map-marker"
                ></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model="formData.notes"
                  label="ملاحظات"
                  variant="outlined"
                  density="comfortable"
                  rows="2"
                  auto-grow
                  prepend-inner-icon="mdi-note-text-outline"
                ></v-textarea>
              </v-col>
            </v-row>
          </div>

          <v-divider class="my-4"></v-divider>

          <div class="d-flex justify-end gap-2 flex-wrap">
            <v-btn variant="text" @click="$router.back()">إلغاء</v-btn>
            <v-btn type="submit" color="primary" prepend-icon="mdi-content-save" :loading="loading">
              حفظ
            </v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>

    <!-- Duplicate-phone confirmation. The backend rejects a duplicate by
         default; this dialog lets the user explicitly opt in to a shared
         number (e.g. a family that uses one phone for multiple accounts). -->
    <v-dialog v-model="duplicateDialog" max-width="480" persistent>
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="warning">mdi-alert-circle</v-icon>
          <span class="text-warning">رقم الهاتف مستخدم بالفعل</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <p class="mb-2">
            هذا الرقم مسجّل لدى عميل آخر:
            <strong v-if="duplicateExisting">
              {{ duplicateExisting.name }}
              <span v-if="duplicateExisting.phone" class="text-grey">({{ duplicateExisting.phone }})</span>
            </strong>
          </p>
          <p class="text-body-2 text-medium-emphasis">
            لن يتم دمج العميلين. هل تريد المتابعة وإنشاء/تعديل هذا العميل بنفس الرقم
            (مثلاً لأفراد العائلة الذين يشتركون برقم واحد)؟
          </p>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="duplicateDialog = false">إلغاء</v-btn>
          <v-btn color="warning" :loading="loading" @click="confirmDuplicateSave">
            متابعة الحفظ
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCustomerStore } from '@/stores/customer';
import { useAuthStore } from '@/stores/auth';
import { normalizeIraqPhone } from '@/utils/phone';
import PageHeader from '@/components/PageHeader.vue';
import { useCustomersData } from '../composables/useCustomersData.js';
import { customerRules, emptyCustomer, customerTypeOptions } from '../schemas/customer.schema.js';
import { useFormErrors } from '@/composables/useFormErrors';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { usePageShortcuts } from '@/composables/usePageShortcuts';

const router = useRouter();
const route = useRoute();
const customerStore = useCustomerStore();
const authStore = useAuthStore();
const { loadCustomer } = useCustomersData();

// Binds server-side per-field validation errors (AppError.fieldErrors) to inputs.
const formErrors = useFormErrors();

const agentPricingOn = computed(() => authStore.hasFeature('agentPricing'));
const canSetCreditLimit = computed(() => authStore.hasPermission?.('customers:set_credit_limit'));

const form = ref(null);
const loading = ref(false);
const duplicateDialog = ref(false);
const duplicateExisting = ref(null);

const formData = ref(emptyCustomer());

const isEdit = computed(() => !!route.params.id);

// Shared create/edit validators (features/customers/schemas/customer.schema.js).
const rules = customerRules;

// Unsaved-changes protection (#19): dirty = form differs from the last saved
// baseline. Ctrl+S saves (#9).
const baseline = ref(JSON.stringify(formData.value));
const isDirty = computed(() => JSON.stringify(formData.value) !== baseline.value);
useUnsavedChanges(isDirty);
usePageShortcuts({ onSave: () => handleSubmit() });

// Live preview of how the API will store the phone for lookup. Empty input
// → no hint. Un-normalisable input → soft warning (we don't block save —
// the API still accepts it as a free-form string).
const phoneNormalised = computed(() => normalizeIraqPhone(formData.value.phone));
const phoneHint = computed(() => {
  const raw = (formData.value.phone || '').trim();
  if (!raw) return '';
  if (phoneNormalised.value && phoneNormalised.value !== raw.replace(/\D/g, '')) {
    return `سيتم البحث وحفظ هذا الرقم بصيغة موحّدة: ${phoneNormalised.value}`;
  }
  return '';
});
const phoneError = computed(() => {
  const raw = (formData.value.phone || '').trim();
  if (!raw) return '';
  if (!phoneNormalised.value) {
    return 'تنسيق رقم الهاتف غير مفهوم — تأكّد من الأرقام (يُقبل +964 أو 0…)';
  }
  return '';
});

async function performSave({ allowDuplicatePhone = false } = {}) {
  loading.value = true;
  formErrors.clear();
  try {
    const payload = { ...formData.value };
    if (allowDuplicatePhone) payload.allowDuplicatePhone = true;
    if (isEdit.value) {
      await customerStore.updateCustomer(route.params.id, payload);
    } else {
      await customerStore.createCustomer(payload);
    }
    duplicateDialog.value = false;
    baseline.value = JSON.stringify(formData.value); // clean → unsaved guard passes
    router.push({ name: 'Customers' });
  } catch (error) {
    // `error` is a normalized AppError (from the central interceptor).
    if (error?.code === 'CUSTOMER_PHONE_DUPLICATE') {
      // Hand off to the confirmation dialog (phone preserved verbatim). The
      // existing-customer hint lives on the original payload's details.
      duplicateExisting.value =
        error.originalError?.response?.data?.details?.existingCustomer || null;
      duplicateDialog.value = true;
      return;
    }
    // The store already presented the toast (it owns customer-write
    // presentation); here we only bind any per-field validation errors.
    formErrors.setFromError(error);
  } finally {
    loading.value = false;
  }
}

const handleSubmit = async () => {
  const { valid } = await form.value.validate();
  if (!valid) return;
  await performSave();
};

const confirmDuplicateSave = () => performSave({ allowDuplicatePhone: true });

onMounted(async () => {
  if (isEdit.value) {
    loading.value = true;
    try {
      // Fetch just this record (via the feature service) instead of loading the
      // whole list and finding it client-side.
      const current = await loadCustomer(route.params.id);
      formData.value = {
        name: current?.name,
        phone: current?.phone,
        city: current?.city,
        address: current?.address,
        notes: current?.notes,
        customerType: current?.customerType || 'retail',
        creditLimit: current?.creditLimit == null ? null : Number(current.creditLimit),
      };
      baseline.value = JSON.stringify(formData.value); // loaded data is the clean baseline
    } catch {
      // Error handled centrally by the axios interceptor.
    } finally {
      loading.value = false;
    }
  }
});
</script>

<style scoped lang="scss">
.form-section {
  &__title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.85);
    margin-bottom: 0.75rem;
    font-size: 0.95rem;
  }
}
</style>
