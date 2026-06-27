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

    <!-- Unified SmartTable (client-side): the loaded suppliers array is searched,
         filtered (hasDebt), sorted and paginated in memory. The create/edit
         dialog stays page-owned. -->
    <SmartTable
      v-model:filter-values="filterValues"
      data-testid="suppliers-table"
      table-key="suppliers-table"
      :headers="headers"
      :items="items"
      :loading="loading"
      :filters="filterDefs"
      :row-actions="rowActions"
      search-placeholder="ابحث بالاسم، الهاتف، المدينة..."
      show-export
      show-print
      print-title="قائمة الموردين"
      export-file-base="suppliers"
      empty-title="لا يوجد موردون"
      empty-description="أضف مورديك لتسجيل فواتير الشراء ومتابعة ذممهم."
      empty-icon="mdi-truck-delivery"
      :empty-actions="emptyActions"
      @refresh="reload"
    >
      <!-- Custom cells pass straight through (router-link, colored debt, status). -->
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
    </SmartTable>

    <!-- Create/Edit dialog (kept page-owned) -->
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
import SmartTable from '@/components/common/SmartTable';
import { formatCurrency } from '@/utils/formatters';

const supplierStore = useSupplierStore();
const authStore = useAuthStore();

const loading = computed(() => supplierStore.loading);
const items = computed(() => supplierStore.items);
const canCreate = computed(() => authStore.hasPermission?.('suppliers:create'));
const canUpdate = computed(() => authStore.hasPermission?.('suppliers:update'));
const canDelete = computed(() => authStore.hasPermission?.('suppliers:delete'));

// Client-side filters: SmartTable owns the popover control + chip; the derived
// `hasDebt` filter runs in memory via a predicate (no `hasDebt` field exists).
const filterValues = ref({});
const filterDefs = [
  {
    key: 'hasDebt',
    type: 'boolean',
    label: 'الديون',
    icon: 'mdi-cash-multiple',
    options: [
      { title: 'عليهم ديون فقط', value: true },
      { title: 'بدون ديون', value: false },
    ],
    predicate: (row, val) => {
      const debt = Number(row.totalDebt) || 0;
      return val ? debt > 0 : debt <= 0;
    },
  },
];

const headers = [
  { title: 'الاسم', key: 'name', minWidth: 180 },
  { title: 'الهاتف', key: 'phone' },
  { title: 'المدينة', key: 'city' },
  { title: 'إجمالي المشتريات', key: 'totalPurchases', format: 'currency', align: 'end', searchable: false },
  { title: 'الدين (لنا عليه ذمة)', key: 'totalDebt', format: 'currency', align: 'end', searchable: false },
  {
    title: 'الحالة',
    key: 'isActive',
    searchable: false,
    exportValue: (r) => (r.isActive ? 'نشط' : 'معطل'),
  },
];

// Row actions replace the per-row icon buttons; delete uses the action's
// built-in confirm (no window.confirm). Gated on the existing permissions.
const rowActions = computed(() => {
  const list = [
    {
      key: 'view',
      icon: 'mdi-eye',
      title: 'ملف المورد',
      to: (item) => `/suppliers/${item.id}`,
      primary: true,
    },
  ];
  if (canUpdate.value) {
    list.push({
      key: 'edit',
      icon: 'mdi-pencil',
      title: 'تعديل',
      primary: true,
      handler: (item) => openEdit(item),
    });
  }
  if (canDelete.value) {
    list.push({
      key: 'delete',
      icon: 'mdi-delete',
      title: 'حذف',
      color: 'error',
      danger: true,
      primary: true,
      handler: (item) => handleDelete(item),
      confirm: (item) => ({
        title: 'حذف المورد',
        message: `حذف المورد "${item.name}"؟ (يُعطَّل تلقائياً إن كانت له فواتير)`,
        type: 'error',
        confirmText: 'حذف',
      }),
    });
  }
  return list;
});

const emptyActions = computed(() =>
  canCreate.value
    ? [{ text: 'مورد جديد', icon: 'mdi-plus', color: 'primary', onClick: openCreate }]
    : []
);

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
  await supplierStore.fetch();
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

async function handleDelete(row) {
  try {
    await supplierStore.remove(row.id);
    await reload();
  } catch (err) {
    console.error('Failed to delete supplier', err);
  }
}

onMounted(reload);
</script>
