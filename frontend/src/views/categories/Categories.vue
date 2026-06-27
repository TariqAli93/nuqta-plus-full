<template>
  <div class="page-shell">
    <PageHeader
      title="إدارة التصنيفات"
      subtitle="تنظيم منتجاتك ضمن تصنيفات"
      icon="mdi-shape"
    >
      <v-btn
        v-if="canCreate"
        data-testid="category-new-btn"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        @click="openDialog()"
        >تصنيف جديد
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable (Recipe A: SmartTable owns search + pagination and
         drives fetching via @update:options). The create/edit dialog stays
         page-owned; delete uses the row action's built-in confirm. -->
    <SmartTable
      data-testid="categories-table"
      table-key="categories-table"
      :headers="headers"
      :items="categoryStore.categories"
      :loading="categoryStore.loading"
      :total-items="categoryStore.pagination.total"
      server-side
      :page="categoryStore.pagination.page"
      :page-size="categoryStore.pagination.limit"
      :row-actions="rowActions"
      show-export
      show-print
      print-title="قائمة التصنيفات"
      export-file-base="categories"
      :export-fetcher="fetchAllForExport"
      search-placeholder="ابحث باسم التصنيف..."
      empty-title="لا توجد تصنيفات"
      empty-description="ابدأ بإضافة تصنيف جديد لتنظيم منتجاتك"
      empty-icon="mdi-shape"
      :empty-actions="canCreate ? [{ text: 'تصنيف جديد', icon: 'mdi-plus', onClick: () => openDialog() }] : []"
      @update:options="loadCategories"
      @refresh="onRefresh"
    />

    <v-dialog v-model="dialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">{{ isEdit ? 'mdi-pencil' : 'mdi-shape-plus' }}</v-icon>
          <span>{{ isEdit ? 'تعديل تصنيف' : 'تصنيف جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form">
            <v-text-field
              v-model="formData.name"
              label="اسم التصنيف"
              variant="outlined"
              density="comfortable"
            ></v-text-field>
            <v-textarea
              v-model="formData.description"
              variant="outlined"
              density="comfortable"
              label="الوصف"
              rows="2"
              auto-grow
            ></v-textarea>
          </v-form>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="elevated" :loading="saving" @click="handleSubmit">
            حفظ
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useCategoryStore } from '@/stores/category';
import { usePermissions } from '@/composables/usePermissions';
import api from '@/plugins/axios';
import SmartTable from '@/components/common/SmartTable';
import PageHeader from '@/components/PageHeader.vue';

const categoryStore = useCategoryStore();
const { can } = usePermissions();

// Action-button gates (user_action behavior): hide write affordances the
// signed-in user lacks. Backend authorize() remains the real gate. Edit/delete
// are gated inside SmartTable via each row action's `permission`.
const canCreate = computed(() => can('categories:create'));

const dialog = ref(false);
const form = ref(null);
const saving = ref(false);
const selectedCategory = ref(null);
const formData = ref({
  name: '',
  description: '',
});

const headers = [
  { title: 'الاسم', key: 'name', minWidth: 200 },
  { title: 'الوصف', key: 'description', format: 'text' },
];

const rowActions = [
  {
    key: 'edit',
    icon: 'mdi-pencil',
    title: 'تعديل',
    primary: true,
    permission: 'categories:update',
    handler: (item) => openDialog(item),
  },
  {
    key: 'delete',
    icon: 'mdi-delete',
    title: 'حذف',
    color: 'error',
    danger: true,
    permission: 'categories:delete',
    handler: (item) => handleDelete(item),
    confirm: (item) => ({
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف التصنيف؟',
      details: `التصنيف: ${item.name}`,
      type: 'error',
      confirmText: 'حذف',
    }),
  },
];

const isEdit = computed(() => !!selectedCategory.value);

// Last requested options, so the toolbar refresh button and the export-all
// fetcher reuse the active page/search instead of resetting them.
const lastOptions = ref({
  page: 1,
  itemsPerPage: categoryStore.pagination.limit,
  search: '',
});

const loadCategories = (opts = {}) => {
  lastOptions.value = { ...lastOptions.value, ...opts };
  const { page, itemsPerPage, search } = lastOptions.value;
  const params = {
    page: page || 1,
    limit: itemsPerPage || categoryStore.pagination.limit,
  };
  const term = (search || '').trim();
  if (term) params.search = term;
  return categoryStore.fetchCategories(params);
};

const onRefresh = () => loadCategories();

// Export "all results": fetch the full set without clobbering the visible page
// (the store mutates its own list, so we query the API directly here).
const fetchAllForExport = async () => {
  const params = { page: 1, limit: 10000 };
  const term = (lastOptions.value.search || '').trim();
  if (term) params.search = term;
  // The axios interceptor unwraps to the JSON body, so `res.data` is the array.
  const res = await api.get('/categories', { params });
  return res?.data || [];
};

const openDialog = (category = null) => {
  if (category) {
    selectedCategory.value = category;
    formData.value = { ...category };
  } else {
    selectedCategory.value = null;
    formData.value = { name: '', description: '' };
  }
  dialog.value = true;
};

const handleSubmit = async () => {
  const { valid } = await form.value.validate();
  if (!valid) return;

  saving.value = true;
  try {
    if (isEdit.value) {
      await categoryStore.updateCategory(selectedCategory.value.id, formData.value);
    } else {
      await categoryStore.createCategory(formData.value);
    }
    dialog.value = false;
  } catch {
    // Error handled by notification
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (category) => {
  try {
    await categoryStore.deleteCategory(category.id);
  } catch {
    // Error handled by notification
  }
};
</script>
