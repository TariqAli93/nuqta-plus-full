<template>
  <div class="page-shell">
    <PageHeader
      title="الصناديق"
      subtitle="الصناديق النقدية وأرصدتها الحالية"
      icon="mdi-safe-square-outline"
    >
      <v-btn
        v-if="canManage"
        color="primary"
        prepend-icon="mdi-plus"
        aria-label="إضافة صندوق جديد"
        @click="openCreate"
      >
        صندوق جديد
      </v-btn>
    </PageHeader>

    <v-row class="page-section" dense>
      <v-col v-for="box in cashboxes" :key="box.id" cols="12" sm="6" lg="4">
        <v-card class="h-full">
          <v-card-title class="flex items-center justify-space-between">
            <span class="flex items-center gap-2">
              <v-icon :color="box.isDefault ? 'primary' : 'grey'">mdi-safe-square-outline</v-icon>
              <span>{{ box.name }}</span>
            </span>
            <v-chip v-if="box.isDefault" size="x-small" color="primary" variant="tonal">
              افتراضي
            </v-chip>
          </v-card-title>
          <v-card-subtitle v-if="box.branchName">{{ box.branchName }}</v-card-subtitle>
          <v-card-text>
            <div v-if="Object.keys(box.balances || {}).length === 0" class="text-medium-emphasis">
              لا توجد حركات بعد
            </div>
            <div
              v-for="(amount, currency) in box.balances"
              :key="currency"
              class="flex items-center justify-space-between py-1"
            >
              <span class="text-medium-emphasis">{{ getCurrencySymbol(currency) }}</span>
              <span class="text-h6 font-weight-bold" :class="amount < 0 ? 'text-error' : ''">
                {{ formatCurrency(amount, currency) }}
              </span>
            </div>
          </v-card-text>
          <v-divider />
          <v-card-actions>
            <v-btn
              variant="text"
              size="small"
              prepend-icon="mdi-format-list-bulleted"
              :to="`/treasury/cashboxes/${box.id}/ledger`"
            >
              كشف الحركة
            </v-btn>
            <v-spacer />
            <v-btn
              v-if="canManage && !box.isDefault"
              variant="text"
              size="small"
              title="تعيين كافتراضي"
              icon="mdi-star-outline"
              @click="makeDefault(box)"
            />
            <v-btn
              v-if="canManage"
              variant="text"
              size="small"
              icon="mdi-pencil"
              title="تعديل"
              @click="openEdit(box)"
            />
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col v-if="!loading && cashboxes.length === 0" cols="12">
        <EmptyState
          title="لا توجد صناديق"
          description="أنشئ صندوقاً نقدياً لتتبع حركة النقد والسندات."
          icon="mdi-safe-square-outline"
        />
      </v-col>
    </v-row>

    <!-- Create/Edit dialog -->
    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>{{ editingId ? 'mdi-pencil' : 'mdi-safe-square-outline' }}</v-icon>
          <span>{{ editingId ? 'تعديل الصندوق' : 'صندوق جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form" @submit.prevent="save">
            <v-row dense>
              <v-col cols="12">
                <v-text-field
                  v-model="formData.name"
                  label="اسم الصندوق *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'اسم الصندوق مطلوب']"
                  required
                />
              </v-col>
              <v-col v-if="isGlobalAdmin && branchOptions.length > 1" cols="12">
                <v-select
                  v-model="formData.branchId"
                  :items="branchOptions"
                  item-title="name"
                  item-value="id"
                  label="الفرع"
                  variant="outlined"
                  density="comfortable"
                  clearable
                />
              </v-col>
              <template v-if="!editingId">
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="formData.openingIQD"
                    type="number"
                    label="رصيد افتتاحي (د.ع)"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="formData.openingUSD"
                    type="number"
                    label="رصيد افتتاحي ($)"
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
              <v-col v-if="editingId && !editingIsDefault" cols="12">
                <v-switch
                  v-model="formData.isActive"
                  color="primary"
                  hide-details
                  label="الصندوق نشط"
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
import { useInventoryStore } from '@/stores/inventory';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatCurrency, getCurrencySymbol } from '@/utils/formatters';

const treasuryStore = useTreasuryStore();
const authStore = useAuthStore();
const inventoryStore = useInventoryStore();

const loading = computed(() => treasuryStore.loading);
const cashboxes = computed(() => treasuryStore.cashboxes);
const isGlobalAdmin = computed(() => authStore.isGlobalAdmin);
const branchOptions = computed(() => inventoryStore.branches || []);
const canManage = computed(() => authStore.hasPermission?.('treasury:manage'));

const dialog = ref(false);
const saving = ref(false);
const editingId = ref(null);
const editingIsDefault = ref(false);
const form = ref(null);
const formData = reactive({
  name: '',
  branchId: null,
  openingIQD: null,
  openingUSD: null,
  notes: '',
  isActive: true,
});

function resetForm() {
  formData.name = '';
  formData.branchId = null;
  formData.openingIQD = null;
  formData.openingUSD = null;
  formData.notes = '';
  formData.isActive = true;
  editingId.value = null;
  editingIsDefault.value = false;
}

function openCreate() {
  resetForm();
  dialog.value = true;
}

function openEdit(box) {
  resetForm();
  editingId.value = box.id;
  editingIsDefault.value = !!box.isDefault;
  formData.name = box.name;
  formData.branchId = box.branchId || null;
  formData.notes = box.notes || '';
  formData.isActive = box.isActive !== false;
  dialog.value = true;
}

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await treasuryStore.updateCashbox(editingId.value, {
        name: formData.name,
        notes: formData.notes || null,
        isActive: formData.isActive,
      });
    } else {
      const openingBalances = {};
      if (Number(formData.openingIQD)) openingBalances.IQD = Number(formData.openingIQD);
      if (Number(formData.openingUSD)) openingBalances.USD = Number(formData.openingUSD);
      await treasuryStore.createCashbox({
        name: formData.name,
        branchId: formData.branchId || undefined,
        openingBalances: Object.keys(openingBalances).length ? openingBalances : undefined,
        notes: formData.notes || null,
      });
    }
    dialog.value = false;
    await treasuryStore.fetchCashboxes();
  } catch (err) {
    console.error('Failed to save cashbox', err);
  } finally {
    saving.value = false;
  }
}

async function makeDefault(box) {
  try {
    await treasuryStore.setDefaultCashbox(box.id);
    await treasuryStore.fetchCashboxes();
  } catch (err) {
    console.error('Failed to set default cashbox', err);
  }
}

onMounted(async () => {
  if (isGlobalAdmin.value) {
    try {
      await inventoryStore.fetchBranches();
    } catch {
      /* ignore */
    }
  }
  await treasuryStore.fetchCashboxes();
});
</script>
