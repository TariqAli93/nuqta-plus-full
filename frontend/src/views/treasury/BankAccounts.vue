<template>
  <div class="page-shell">
    <PageHeader
      title="الحسابات المصرفية"
      subtitle="حسابات البنوك وأرصدتها"
      icon="mdi-bank"
    >
      <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" @click="openCreate">
        حساب جديد
      </v-btn>
    </PageHeader>

    <v-row class="page-section" dense>
      <v-col v-for="acc in bankAccounts" :key="acc.id" cols="12" sm="6" lg="4">
        <v-card class="h-full">
          <v-card-title class="flex items-center gap-2">
            <v-icon color="primary">mdi-bank</v-icon>
            <span>{{ acc.name }}</span>
          </v-card-title>
          <v-card-subtitle>
            {{ acc.bankName || '—' }}
            <span v-if="acc.accountNumber"> · {{ acc.accountNumber }}</span>
          </v-card-subtitle>
          <v-card-text>
            <div class="flex items-center justify-space-between py-1">
              <span class="text-medium-emphasis">الرصيد</span>
              <span class="text-h6 font-weight-bold" :class="acc.balance < 0 ? 'text-error' : ''">
                {{ formatCurrency(acc.balance, acc.currency) }}
              </span>
            </div>
          </v-card-text>
          <v-divider />
          <v-card-actions>
            <v-spacer />
            <v-btn
              v-if="canManage"
              variant="text"
              size="small"
              icon="mdi-pencil"
              title="تعديل"
              @click="openEdit(acc)"
            />
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col v-if="!loading && bankAccounts.length === 0" cols="12">
        <EmptyState
          title="لا توجد حسابات مصرفية"
          description="أضف حساباً مصرفياً لتتبع الأموال خارج الصناديق النقدية."
          icon="mdi-bank"
        />
      </v-col>
    </v-row>

    <!-- Create/Edit dialog -->
    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>{{ editingId ? 'mdi-pencil' : 'mdi-bank-plus' }}</v-icon>
          <span>{{ editingId ? 'تعديل الحساب' : 'حساب مصرفي جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form" @submit.prevent="save">
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.name"
                  label="اسم الحساب *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'اسم الحساب مطلوب']"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.bankName"
                  label="اسم المصرف"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.accountNumber"
                  label="رقم الحساب"
                  variant="outlined"
                  density="comfortable"
                  dir="ltr"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.iban"
                  label="IBAN"
                  variant="outlined"
                  density="comfortable"
                  dir="ltr"
                />
              </v-col>
              <template v-if="!editingId">
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="formData.currency"
                    :items="['IQD', 'USD']"
                    label="العملة"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="formData.openingBalance"
                    type="number"
                    label="الرصيد الافتتاحي"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
              </template>
              <v-col cols="12">
                <v-textarea
                  v-model="formData.notes"
                  label="ملاحظات"
                  variant="outlined"
                  density="comfortable"
                  rows="2"
                  auto-grow
                />
              </v-col>
              <v-col v-if="editingId" cols="12">
                <v-switch
                  v-model="formData.isActive"
                  color="primary"
                  hide-details
                  label="الحساب نشط"
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useTreasuryStore } from '@/stores/treasury';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatCurrency } from '@/utils/formatters';

const treasuryStore = useTreasuryStore();
const authStore = useAuthStore();

const loading = computed(() => treasuryStore.loading);
const bankAccounts = computed(() => treasuryStore.bankAccounts);
const canManage = computed(() => authStore.hasPermission?.('treasury:manage'));

const dialog = ref(false);
const saving = ref(false);
const editingId = ref(null);
const form = ref(null);
const formData = reactive({
  name: '',
  bankName: '',
  accountNumber: '',
  iban: '',
  currency: 'IQD',
  openingBalance: 0,
  notes: '',
  isActive: true,
});

function openCreate() {
  editingId.value = null;
  Object.assign(formData, {
    name: '',
    bankName: '',
    accountNumber: '',
    iban: '',
    currency: 'IQD',
    openingBalance: 0,
    notes: '',
    isActive: true,
  });
  dialog.value = true;
}

function openEdit(acc) {
  editingId.value = acc.id;
  Object.assign(formData, {
    name: acc.name,
    bankName: acc.bankName || '',
    accountNumber: acc.accountNumber || '',
    iban: acc.iban || '',
    currency: acc.currency,
    openingBalance: Number(acc.openingBalance) || 0,
    notes: acc.notes || '',
    isActive: acc.isActive !== false,
  });
  dialog.value = true;
}

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await treasuryStore.updateBankAccount(editingId.value, {
        name: formData.name,
        bankName: formData.bankName || null,
        accountNumber: formData.accountNumber || null,
        iban: formData.iban || null,
        notes: formData.notes || null,
        isActive: formData.isActive,
      });
    } else {
      await treasuryStore.createBankAccount({
        name: formData.name,
        bankName: formData.bankName || null,
        accountNumber: formData.accountNumber || null,
        iban: formData.iban || null,
        currency: formData.currency,
        openingBalance: formData.openingBalance || 0,
        notes: formData.notes || null,
      });
    }
    dialog.value = false;
    await treasuryStore.fetchBankAccounts();
  } catch (err) {
    console.error('Failed to save bank account', err);
  } finally {
    saving.value = false;
  }
}

onMounted(() => treasuryStore.fetchBankAccounts());
</script>
