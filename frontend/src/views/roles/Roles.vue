<template>
  <div class="page-shell">
    <PageHeader
      title="الأدوار والصلاحيات"
      subtitle="إدارة أدوار المستخدمين والصلاحيات الممنوحة لكل دور"
      icon="mdi-shield-account-outline"
    >
      <v-btn
        v-if="can('roles:manage')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        @click="openCreate"
      >
        دور جديد
      </v-btn>
    </PageHeader>

    <v-row>
      <!-- ── Roles list ── -->
      <v-col cols="12" md="4">
        <v-card class="page-section">
          <v-list :lines="false" density="comfortable">
            <v-list-subheader>الأدوار</v-list-subheader>
            <v-list-item
              v-for="r in store.roles"
              :key="r.id"
              :active="selectedId === r.id"
              rounded="lg"
              class="mb-1"
              @click="selectRole(r)"
            >
              <template #prepend>
                <v-icon
                  :icon="r.allPermissions ? 'mdi-shield-crown-outline' : 'mdi-shield-outline'"
                />
              </template>
              <v-list-item-title>{{ r.nameAr }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ r.userCount }} مستخدم ·
                {{ r.allPermissions ? 'كل الصلاحيات' : r.permissionCount + ' صلاحية' }}
              </v-list-item-subtitle>
              <template #append>
                <v-chip v-if="r.isSystem" size="x-small" variant="tonal" color="blue-grey"
                  >نظامي</v-chip
                >
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <!-- ── Selected role + permissions ── -->
      <v-col cols="12" md="8">
        <v-card v-if="store.currentRole" class="page-section">
          <v-card-title class="d-flex align-center gap-2 flex-wrap">
            <v-icon color="primary">mdi-shield-account-outline</v-icon>
            <span>{{ store.currentRole.nameAr }}</span>
            <v-chip
              size="small"
              variant="tonal"
              :color="store.currentRole.scope === 'global' ? 'deep-purple' : 'teal'"
            >
              {{ store.currentRole.scope === 'global' ? 'كل الفروع' : 'فرع واحد' }}
            </v-chip>
            <v-chip v-if="store.currentRole.isSystem" size="small" variant="tonal" color="blue-grey"
              >دور نظامي</v-chip
            >
            <v-spacer />
            <v-btn
              v-if="can('roles:manage')"
              variant="text"
              size="small"
              prepend-icon="mdi-pencil"
              @click="openRename"
              >إعادة تسمية</v-btn
            >
            <v-btn
              v-if="can('roles:manage') && !store.currentRole.isSystem"
              variant="text"
              size="small"
              color="error"
              prepend-icon="mdi-delete"
              @click="confirmDelete"
            >
              حذف الدور
            </v-btn>
          </v-card-title>
          <v-divider />

          <v-card-text>
            <v-alert
              v-if="store.currentRole.allPermissions"
              type="info"
              variant="tonal"
              density="comfortable"
            >
              المدير العام يملك جميع الصلاحيات تلقائياً (بما فيها أي صلاحية تُضاف مستقبلاً) ولا يمكن
              تعديلها.
            </v-alert>

            <template v-else>
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="text-caption text-medium-emphasis">
                  المحدد: {{ selectedKeys.size }} من {{ totalKeys }} صلاحية
                </span>
                <div v-if="can('roles:manage')">
                  <v-btn size="x-small" variant="text" @click="selectAll(true)">تحديد الكل</v-btn>
                  <v-btn size="x-small" variant="text" @click="selectAll(false)">إلغاء الكل</v-btn>
                </div>
              </div>

              <v-expansion-panels v-model="openGroups" variant="accordion" multiple>
                <v-expansion-panel v-for="grp in store.catalog" :key="grp.group" :value="grp.group">
                  <v-expansion-panel-title>
                    <span class="font-weight-medium">{{ grp.group }}</span>
                    <span class="text-caption text-medium-emphasis ms-2">
                      ({{ countSelectedInGroup(grp) }}/{{ grp.permissions.length }})
                    </span>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <v-row dense>
                      <v-col v-for="p in grp.permissions" :key="p.key" cols="12" sm="6">
                        <v-checkbox
                          :model-value="selectedKeys.has(p.key)"
                          :label="p.nameAr"
                          color="primary"
                          density="compact"
                          hide-details
                          :readonly="!can('roles:manage')"
                          @update:model-value="(v) => toggle(p.key, v)"
                        />
                      </v-col>
                    </v-row>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>

              <div v-if="can('roles:manage')" class="d-flex justify-end mt-4">
                <v-btn
                  color="primary"
                  variant="elevated"
                  :loading="store.saving"
                  prepend-icon="mdi-content-save"
                  @click="savePermissions"
                >
                  حفظ الصلاحيات
                </v-btn>
              </div>
            </template>
          </v-card-text>
        </v-card>

        <v-card
          v-else
          class="page-section d-flex align-center justify-center"
          style="min-height: 200px"
        >
          <span class="text-medium-emphasis">اختر دوراً لعرض صلاحياته</span>
        </v-card>
      </v-col>
    </v-row>

    <!-- Create role dialog -->
    <v-dialog v-model="createDialog" max-width="520">
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-shield-plus-outline</v-icon><span>دور جديد</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4 space-y-4">
          <v-text-field
            v-model="form.nameAr"
            label="اسم الدور *"
            variant="outlined"
            density="comfortable"
            :rules="[(v) => !!v || 'الاسم مطلوب']"
          />
          <v-select
            v-model="form.scope"
            :items="scopeItems"
            label="النطاق"
            variant="outlined"
            density="comfortable"
            hint="فرع واحد: يرى بيانات فرعه فقط"
            persistent-hint
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="elevated" :loading="store.saving" @click="doCreate"
            >إنشاء</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Rename dialog -->
    <v-dialog v-model="renameDialog" max-width="460">
      <v-card>
        <v-card-title>إعادة تسمية الدور</v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-text-field
            v-model="renameValue"
            label="اسم الدور"
            variant="outlined"
            density="comfortable"
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="renameDialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="elevated" :loading="store.saving" @click="doRename"
            >حفظ</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      v-model="deleteDialog"
      title="حذف الدور"
      message="هل أنت متأكد من حذف هذا الدور؟"
      :details="store.currentRole ? `الدور: ${store.currentRole.nameAr}` : ''"
      type="error"
      confirm-text="حذف"
      cancel-text="إلغاء"
      @confirm="doDelete"
      @cancel="deleteDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRbacStore } from '@/stores/rbac';
import { useAuthStore } from '@/stores/auth';
import { usePermissions } from '@/composables/usePermissions';
import PageHeader from '@/components/PageHeader.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const store = useRbacStore();
const authStore = useAuthStore();
const { can } = usePermissions();

const selectedId = ref(null);
const selectedKeys = ref(new Set());
const openGroups = ref([]);

const createDialog = ref(false);
const renameDialog = ref(false);
const renameValue = ref('');
const deleteDialog = ref(false);
const form = reactive({ nameAr: '', scope: 'branch' });
const scopeItems = [
  { title: 'فرع واحد', value: 'branch' },
  { title: 'كل الفروع', value: 'global' },
];

const totalKeys = computed(() => store.catalog.reduce((n, g) => n + g.permissions.length, 0));
const countSelectedInGroup = (grp) =>
  grp.permissions.filter((p) => selectedKeys.value.has(p.key)).length;

const selectRole = async (r) => {
  selectedId.value = r.id;
  await store.fetchRole(r.id);
  selectedKeys.value = new Set(store.currentRole?.permissionKeys || []);
  openGroups.value = store.catalog.map((g) => g.group); // expand all
};

const toggle = (key, val) => {
  const next = new Set(selectedKeys.value);
  if (val) next.add(key);
  else next.delete(key);
  selectedKeys.value = next;
};

const selectAll = (on) => {
  if (!on) {
    selectedKeys.value = new Set();
    return;
  }
  const all = new Set();
  store.catalog.forEach((g) => g.permissions.forEach((p) => all.add(p.key)));
  selectedKeys.value = all;
};

const savePermissions = async () => {
  if (!store.currentRole) return;
  const role = store.currentRole;
  await store.setRolePermissions(role.id, [...selectedKeys.value]);
  // If the edited role is the current user's role, refresh the session so the
  // UI (menus/buttons) reflects the new permissions immediately.
  if (role.code && role.code === authStore.user?.role) {
    await authStore.refreshSession?.();
  }
};

const openCreate = () => {
  form.nameAr = '';
  form.scope = 'branch';
  createDialog.value = true;
};
const doCreate = async () => {
  if (!form.nameAr.trim()) return;
  const created = await store.createRole({ nameAr: form.nameAr.trim(), scope: form.scope });
  createDialog.value = false;
  if (created) await selectRole(created);
};

const openRename = () => {
  renameValue.value = store.currentRole?.nameAr || '';
  renameDialog.value = true;
};
const doRename = async () => {
  if (!store.currentRole || !renameValue.value.trim()) return;
  await store.updateRole(store.currentRole.id, { nameAr: renameValue.value.trim() });
  store.currentRole.nameAr = renameValue.value.trim();
  renameDialog.value = false;
};

const confirmDelete = () => {
  deleteDialog.value = true;
};
const doDelete = async () => {
  if (!store.currentRole) return;
  try {
    await store.deleteRole(store.currentRole.id);
    selectedId.value = null;
    deleteDialog.value = false;
  } catch {
    deleteDialog.value = false;
  }
};

onMounted(async () => {
  await Promise.all([store.fetchCatalog(), store.fetchRoles()]);
});
</script>
