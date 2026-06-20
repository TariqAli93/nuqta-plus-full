<template>
  <div class="page-shell">
    <PageHeader
      title="إدارة المستخدمين"
      subtitle="إدارة حسابات الموظفين، الصلاحيات والفروع المعيّنة"
      icon="mdi-account-multiple"
    >
      <v-btn
        v-if="can('users:create')"
        color="primary"
        prepend-icon="mdi-plus"
        size="default"
        @click="openForm()"
      >
        مستخدم جديد
      </v-btn>
    </PageHeader>

    <v-card class="page-section filter-toolbar pa-3">
      <v-row dense>
        <v-col cols="12" md="3">
          <v-text-field
            v-model="store.filters.search"
            label="بحث بالاسم"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            @keyup.enter="store.fetch()"
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="store.filters.role"
            :items="roleOptions"
            :loading="rbacStore.loading"
            label="الدور"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            no-data-text="لا توجد أدوار"
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="store.filters.isActive"
            :items="statusOptions"
            label="الحالة"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
          />
        </v-col>

        <v-col cols="12" md="3" class="d-flex align-center justify-end">
          <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="store.fetch()">
            تحديث
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <v-card class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="primary">mdi-format-list-bulleted</v-icon>
          قائمة المستخدمين
        </span>
      </div>
      <v-data-table
        :items="store.list"
        :loading="store.loading"
        :headers="headers"
        :items-per-page="store.limit"
        density="comfortable"
      >
        <template #loading>
          <TableSkeleton :rows="5" :columns="headers.length" />
        </template>
        <template #no-data>
          <EmptyState
            title="لا يوجد مستخدمون"
            description="ابدأ بإضافة مستخدم جديد"
            icon="mdi-account-multiple-outline"
            compact
          />
        </template>
        <template #[`item.role`]="{ item }">
          <v-chip color="primary" variant="tonal" size="small">
            {{ getRoleName(item.role) }}
          </v-chip>
        </template>
        <template #[`item.isActive`]="{ item }">
          <v-chip :color="item.isActive ? 'success' : 'grey'" variant="tonal" size="small">
            {{ item.isActive ? 'نشط' : 'معطل' }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            v-if="can('users:update')"
            icon="mdi-pencil"
            size="small"
            variant="text"
            color="primary"
            title="تعديل"
            @click="openForm(item)"
          >
            <v-icon size="20">mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            v-if="can('users:update')"
            icon="mdi-lock-reset"
            size="small"
            variant="text"
            color="warning"
            title="تغيير كلمة المرور"
            @click="openResetPwDialog(item)"
          >
            <v-icon size="20">mdi-lock-reset</v-icon>
          </v-btn>
          <v-btn
            v-if="can('users:delete')"
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            title="حذف"
            @click="remove(item)"
          >
            <v-icon size="20">mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/edit user dialog -->
    <v-dialog v-model="showForm" max-width="600">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>{{ form.id ? 'mdi-pencil' : 'mdi-account-plus' }}</v-icon>
          <span>{{ form.id ? 'تعديل مستخدم' : 'مستخدم جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="formRef" @submit.prevent="save">
            <v-row dense>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.username"
                  label="اسم المستخدم"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-account"
                  :disabled="!!form.id"
                  required
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.fullName"
                  label="الاسم الكامل"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-card-account-details-outline"
                  required
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="form.phone"
                  label="الهاتف"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-phone"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="form.role"
                  :items="roleOptions"
                  :loading="rbacStore.loading"
                  item-title="title"
                  item-value="value"
                  label="الدور"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-shield-account"
                  required
                  no-data-text="لا توجد أدوار"
                />
              </v-col>
              <v-col v-if="!isGlobalRole(form.role)" cols="12" md="6">
                <v-select
                  v-model="form.branchIds"
                  :items="inventoryStore.branches"
                  item-title="name"
                  item-value="id"
                  label="الفروع المخصصة"
                  hint="يمكن تعيين أكثر من فرع — مثل مدير الفرع"
                  persistent-hint
                  multiple
                  chips
                  closable-chips
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-source-branch"
                  :rules="[rules.atLeastOneBranch]"
                  @update:model-value="onBranchChange"
                />
              </v-col>
              <v-col v-if="!isGlobalRole(form.role) && form.branchIds.length > 1" cols="12" md="6">
                <v-select
                  v-model="form.assignedBranchId"
                  :items="primaryBranchOptions"
                  item-title="name"
                  item-value="id"
                  label="الفرع الرئيسي (الافتراضي)"
                  hint="يُستخدم افتراضياً للعمليات الجديدة"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-star"
                  :rules="[rules.required]"
                  @update:model-value="onPrimaryBranchChange"
                />
              </v-col>
              <v-col v-if="!isGlobalRole(form.role) && form.assignedBranchId" cols="12" md="6">
                <v-select
                  v-model="form.assignedWarehouseId"
                  :items="warehousesForForm"
                  item-title="name"
                  item-value="id"
                  label="المخزن المعيّن (اختياري)"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-warehouse"
                  clearable
                />
              </v-col>
              <v-col v-if="!form.id" cols="12" md="6">
                <v-text-field
                  v-model="form.password"
                  label="كلمة المرور"
                  type="password"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-lock"
                  required
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-switch
                  v-model="form.isActive"
                  color="primary"
                  density="comfortable"
                  hide-details
                  inset
                  :label="form.isActive ? 'نشط' : 'معطل'"
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showForm = false">إلغاء</v-btn>
          <v-btn color="primary" prepend-icon="mdi-content-save" @click="save"> حفظ </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reset password dialog -->
    <v-dialog v-model="resetPwDialog" max-width="520">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>mdi-lock-reset</v-icon>
          <span>تغيير كلمة المرور</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="resetPwRef" lazy-validation @submit.prevent="resetPw">
            <v-text-field
              v-model="resetPwInfo.newPassword"
              label="كلمة المرور الجديدة"
              type="password"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-lock"
              :rules="[rules.required, rules.minLength]"
              class="mb-2"
            />
            <v-text-field
              v-model="resetPwInfo.confirmPassword"
              label="تأكيد كلمة المرور"
              type="password"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-lock-check"
              :rules="[
                rules.required,
                rules.confirmPassword(resetPwInfo.newPassword),
                rules.minLength,
              ]"
            />
          </v-form>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeResetPwDialog">إلغاء</v-btn>
          <v-btn color="primary" prepend-icon="mdi-check" @click="resetPw">
            تغيير كلمة المرور
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      v-model="deleteDialog"
      title="حذف المستخدم"
      :message="`هل أنت متأكد من حذف ${selectedItem?.username}؟`"
      type="error"
      confirm-text="حذف"
      cancel-text="إلغاء"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, computed } from 'vue';
import { useUsersStore } from '@/stores/users';
import { useInventoryStore } from '@/stores/inventory';
import { useNotificationStore } from '@/stores/notification';
import { useRbacStore } from '@/stores/rbac';
import { usePermissions } from '@/composables/usePermissions';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';

const store = useUsersStore();
const inventoryStore = useInventoryStore();
const notification = useNotificationStore();
const rbacStore = useRbacStore();
const { can } = usePermissions();

// Role options come ENTIRELY from the dynamic RBAC system — any role created on
// the Roles & permissions page appears here automatically, no code change. The
// backend binds a user to a role by its string `code` (users.role), so the
// option value is `role.code`. Only active roles are offered.
const roleOptions = computed(() =>
  rbacStore.roles
    .filter((role) => role.isActive)
    .map((role) => ({ title: role.nameAr, value: role.code }))
);

// Whether the selected role spans all branches (no branch assignment needed).
// Derived from the role's RBAC `scope` so a custom global-scoped role works too;
// the legacy `admin`/`global_admin` codes are kept as a fallback for safety
// while roles are still loading or for pre-RBAC accounts.
const isGlobalRole = (code) => {
  const scope = rbacStore.roles.find((r) => r.code === code)?.scope;
  if (scope) return scope === 'global';
  return code === 'admin' || code === 'global_admin';
};

const warehousesForForm = computed(() =>
  inventoryStore.warehouses.filter((w) => w.branchId === form.assignedBranchId)
);

// Primary-branch picker only offers branches that are actually assigned.
const primaryBranchOptions = computed(() =>
  inventoryStore.branches.filter((b) => form.branchIds.includes(b.id))
);

// Keep the primary branch consistent with the assigned set: when the set
// changes, drop a primary that's no longer included and default to the first
// selected branch. Resetting the warehouse on any branch change avoids a stale
// warehouse from a branch that's no longer selected.
const onBranchChange = () => {
  if (!form.branchIds.includes(form.assignedBranchId)) {
    form.assignedBranchId = form.branchIds[0] ?? null;
  }
  form.assignedWarehouseId = null;
};

const onPrimaryBranchChange = () => {
  form.assignedWarehouseId = null;
};

const deleteDialog = ref(false);
const selectedItem = ref(null);

const headers = [
  { title: 'المعرف', key: 'id' },
  { title: 'اسم المستخدم', key: 'username' },
  { title: 'الاسم الكامل', key: 'fullName' },
  { title: 'الهاتف', key: 'phone' },
  { title: 'الدور', key: 'role' },
  { title: 'الحالة', key: 'isActive' },
  { title: 'إجراءات', key: 'actions', sortable: false },
];

const statusOptions = [
  { title: 'نشط', value: true },
  { title: 'معطل', value: false },
];

const showForm = ref(false);
const formRef = ref(null);
const resetPwDialog = ref(false);
const resetPwRef = ref(null);

const rules = {
  required: (value) => !!value || 'هذا الحقل مطلوب.',
  atLeastOneBranch: (value) =>
    (Array.isArray(value) && value.length > 0) || 'يجب تعيين فرع واحد على الأقل.',
  minLength: (value) => value.length >= 6 || 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.',
  confirmPassword: (value) =>
    value === resetPwInfo.confirmPassword || 'كلمتا المرور غير متطابقتين.',
};

const form = reactive({
  id: null,
  username: '',
  fullName: '',
  phone: '',
  role: 'cashier',
  password: '',
  isActive: true,
  assignedBranchId: null,
  branchIds: [],
  assignedWarehouseId: null,
});
const resetPwInfo = reactive({
  newPassword: '',
  confirmPassword: '',
  userId: null,
});

function getRoleName(role) {
  // Resolve the Arabic name from the dynamic RBAC roles; fall back to the raw
  // code (e.g. a legacy role no longer in the list) so the cell is never empty.
  const match = rbacStore.roles.find((r) => r.code === role);
  return match ? match.nameAr : role || '-';
}

async function openForm(user = null) {
  const id = user?.id ?? null;
  const username = user?.username ?? '';

  console.log(`Opening form for user: ${username} (ID: ${id})`);

  if (user) {
    try {
      const fetchedUser = await store.getById(id);

      if (!fetchedUser || typeof fetchedUser !== 'object') {
        notification.error('لم يتم العثور على بيانات المستخدم');
        return;
      }

      const branchIds = Array.isArray(fetchedUser?.branchIds)
        ? fetchedUser.branchIds.filter(Boolean)
        : fetchedUser?.assignedBranchId
          ? [fetchedUser.assignedBranchId]
          : [];

      Object.assign(form, {
        id: fetchedUser?.id ?? null,
        username: fetchedUser?.username ?? '',
        fullName: fetchedUser?.fullName ?? '',
        phone: fetchedUser?.phone ?? '',
        role: fetchedUser?.role ?? 'cashier',
        isActive: fetchedUser?.isActive ?? true,

        assignedBranchId: fetchedUser?.assignedBranchId ?? branchIds?.[0] ?? null,

        branchIds,

        assignedWarehouseId: fetchedUser?.assignedWarehouseId ?? null,

        password: '',
      });
    } catch (error) {
      console.error(error);
      notification.error('فشل جلب بيانات المستخدم. حاول مرة أخرى.');
      return;
    }
  } else {
    Object.assign(form, {
      id: null,
      username: '',
      fullName: '',
      phone: '',
      role: 'cashier',
      password: '',
      isActive: true,
      assignedBranchId: null,
      branchIds: [],
      assignedWarehouseId: null,
    });
  }

  showForm.value = true;
}

function openResetPwDialog(item) {
  resetPwInfo.userId = item.id;
  resetPwDialog.value = true;
}

function closeResetPwDialog() {
  resetPwDialog.value = false;
  resetPwInfo.newPassword = '';
  resetPwInfo.confirmPassword = '';
  resetPwInfo.userId = null;
}

async function save() {
  // The primary branch defaults to the first selected branch when the user
  // didn't explicitly pick one (the primary picker only shows for >1 branch).
  const primaryBranchId = form.assignedBranchId ?? form.branchIds[0] ?? null;
  const assignedPayload = isGlobalRole(form.role)
    ? { assignedBranchId: null, branchIds: [], assignedWarehouseId: null }
    : {
        assignedBranchId: primaryBranchId,
        branchIds: [...form.branchIds],
        assignedWarehouseId: form.assignedWarehouseId || null,
      };

  if (form.id) {
    await store.update(form.id, {
      fullName: form.fullName,
      phone: form.phone,
      role: form.role,
      isActive: form.isActive,
      ...assignedPayload,
    });
  } else {
    try {
      await store.create({
        username: form.username,
        fullName: form.fullName,
        phone: form.phone,
        role: form.role,
        password: form.password,
        ...assignedPayload,
      });
    } catch (error) {
      notification.error(error.message);
    }
  }
  showForm.value = false;
  await store.fetch();
}

async function remove(item) {
  selectedItem.value = item;
  deleteDialog.value = true;
}

async function confirmDelete() {
  if (selectedItem.value) {
    await store.remove(selectedItem.value.id);
    selectedItem.value = null;
  }
}

async function resetPw() {
  const { valid } = await resetPwRef.value.validate();
  if (!valid) return;
  if (resetPwInfo.newPassword !== resetPwInfo.confirmPassword) {
    notification.error('كلمتا المرور غير متطابقتين!');
    return;
  }
  await store.resetPassword(resetPwInfo.userId, resetPwInfo.newPassword);
  closeResetPwDialog();
}

onMounted(async () => {
  await Promise.all([
    store.fetch(),
    inventoryStore.fetchBranches(),
    inventoryStore.fetchWarehouses(),
    // Dynamic role list for the filter + create/edit form is an OPTIONAL secondary
    // load gated by `roles:read` (different from the page's `view:users`). Skip the
    // request entirely without it — the global axios interceptor would otherwise
    // toast the 403 before the store's .catch() could swallow it.
    can('roles:read') ? rbacStore.fetchRoles().catch(() => {}) : Promise.resolve(),
  ]);
});
</script>
