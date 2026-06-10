<template>
  <div class="page-shell">
    <PageHeader
      title="الموردون"
      subtitle="سجل الموردين وأرصدتهم (الذمم الدائنة)"
      icon="mdi-truck-delivery"
    >
      <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" @click="openCreate">
        مورد جديد
      </v-btn>
    </PageHeader>

    <!-- Filters -->
    <v-card class="page-section filter-toolbar pa-3">
      <v-row dense>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model="filters.search"
            label="بحث بالاسم أو الهاتف"
            density="comfortable"
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            @keyup.enter="reload"
          />
        </v-col>
        <v-col cols="12" sm="3" class="flex items-center">
          <v-checkbox v-model="filters.hasDebt" label="عليهم ديون فقط" hide-details density="comfortable" />
        </v-col>
        <v-col cols="12" sm="3" class="flex items-center">
          <v-btn color="primary" block @click="reload">تطبيق</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Table -->
    <v-card class="page-section">
      <v-data-table
        :headers="headers"
        :items="items"
        :loading="loading"
        density="comfortable"
        items-per-page="25"
      >
        <template #loading>
          <TableSkeleton :rows="5" :columns="headers.length" />
        </template>
        <template #[`item.name`]="{ item }">
          <router-link :to="`/suppliers/${item.id}`" class="text-primary font-weight-bold">
            {{ item.name }}
          </router-link>
        </template>
        <template #[`item.totalDebt`]="{ item }">
          <span class="font-weight-bold" :class="item.totalDebt > 0 ? 'text-error' : 'text-success'">
            {{ formatCurrency(item.totalDebt) }}
          </span>
        </template>
        <template #[`item.totalPurchases`]="{ item }">
          {{ formatCurrency(item.totalPurchases) }}
        </template>
        <template #[`item.isActive`]="{ item }">
          <v-chip size="x-small" :color="item.isActive ? 'success' : 'grey'" variant="tonal">
            {{ item.isActive ? 'نشط' : 'معطل' }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            icon="mdi-eye"
            size="small"
            variant="text"
            title="ملف المورد"
            :to="`/suppliers/${item.id}`"
          />
          <v-btn
            v-if="canUpdate"
            icon="mdi-pencil"
            size="small"
            variant="text"
            title="تعديل"
            @click="openEdit(item)"
          />
          <v-btn
            v-if="canDelete"
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            title="حذف"
            @click="confirmDelete(item)"
          />
        </template>
        <template #no-data>
          <EmptyState
            title="لا يوجد موردون"
            description="أضف مورديك لتسجيل فواتير الشراء ومتابعة ذممهم."
            icon="mdi-truck-delivery"
            compact
          />
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/Edit dialog -->
    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>{{ editingId ? 'mdi-pencil' : 'mdi-account-plus' }}</v-icon>
          <span>{{ editingId ? 'تعديل المورد' : 'مورد جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form" @submit.prevent="save">
            <v-row dense>
              <v-col cols="12">
                <v-text-field
                  v-model="formData.name"
                  label="اسم المورد *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'اسم المورد مطلوب']"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.phone"
                  label="الهاتف"
                  variant="outlined"
                  density="comfortable"
                  dir="ltr"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="formData.city"
                  label="المدينة"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="formData.address"
                  label="العنوان"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
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
                <v-switch v-model="formData.isActive" color="primary" hide-details label="المورد نشط" />
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
import { useSupplierStore } from '@/stores/supplier';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
import { formatCurrency } from '@/utils/formatters';

const supplierStore = useSupplierStore();
const authStore = useAuthStore();

const loading = computed(() => supplierStore.loading);
const items = computed(() => supplierStore.items);
const canCreate = computed(() => authStore.hasPermission?.('suppliers:create'));
const canUpdate = computed(() => authStore.hasPermission?.('suppliers:update'));
const canDelete = computed(() => authStore.hasPermission?.('suppliers:delete'));

const filters = reactive({ search: '', hasDebt: false });

const headers = [
  { title: 'الاسم', key: 'name' },
  { title: 'الهاتف', key: 'phone' },
  { title: 'المدينة', key: 'city' },
  { title: 'إجمالي المشتريات', key: 'totalPurchases' },
  { title: 'الدين (لنا عليه ذمة)', key: 'totalDebt' },
  { title: 'الحالة', key: 'isActive' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
];

const dialog = ref(false);
const saving = ref(false);
const editingId = ref(null);
const form = ref(null);
const formData = reactive({
  name: '',
  phone: '',
  city: '',
  address: '',
  notes: '',
  isActive: true,
});

async function reload() {
  const params = {};
  if (filters.search) params.search = filters.search;
  if (filters.hasDebt) params.hasDebt = true;
  await supplierStore.fetch(params);
}

function openCreate() {
  editingId.value = null;
  Object.assign(formData, { name: '', phone: '', city: '', address: '', notes: '', isActive: true });
  dialog.value = true;
}

function openEdit(row) {
  editingId.value = row.id;
  Object.assign(formData, {
    name: row.name,
    phone: row.phone || '',
    city: row.city || '',
    address: row.address || '',
    notes: row.notes || '',
    isActive: row.isActive !== false,
  });
  dialog.value = true;
}

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    const payload = {
      name: formData.name,
      phone: formData.phone || null,
      city: formData.city || null,
      address: formData.address || null,
      notes: formData.notes || null,
    };
    if (editingId.value) {
      await supplierStore.update(editingId.value, { ...payload, isActive: formData.isActive });
    } else {
      await supplierStore.create(payload);
    }
    dialog.value = false;
    await reload();
  } catch (err) {
    console.error('Failed to save supplier', err);
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(row) {
  if (!window.confirm(`حذف المورد "${row.name}"؟ (يُعطَّل تلقائياً إن كانت له فواتير)`)) return;
  try {
    await supplierStore.remove(row.id);
    await reload();
  } catch (err) {
    console.error('Failed to delete supplier', err);
  }
}

onMounted(reload);
</script>
