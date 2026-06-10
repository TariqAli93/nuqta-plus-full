<template>
  <div class="page-shell">
    <PageHeader
      title="ترتيب الحسابات"
      subtitle="قائمة الحسابات التي يُسجَّل عليها المال — لك ولعليك وإيراداتك ومصاريفك (شجرة الحسابات للمحاسب)"
      icon="mdi-file-tree"
    >
      <v-btn
        v-if="canManage"
        color="primary"
        prepend-icon="mdi-plus"
        @click="openCreate(null)"
      >
        حساب جديد
      </v-btn>
    </PageHeader>

    <v-card class="page-section">
      <v-card-text v-if="!loading && accounts.length === 0">
        <EmptyState
          title="لا توجد حسابات بعد"
          description="ابذر قالب شجرة الحسابات من إعدادات النمط الكامل، أو أنشئ الحسابات يدوياً."
          icon="mdi-file-tree-outline"
        />
      </v-card-text>

      <v-table v-else density="comfortable">
        <thead>
          <tr>
            <th class="text-start">الرمز</th>
            <th class="text-start">اسم الحساب</th>
            <th class="text-start">النوع</th>
            <th class="text-end">الرصيد (د.ع)</th>
            <th class="text-end" style="width: 120px">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="acc in flatTree" :key="acc.id" :class="{ 'opacity-60': acc.isActive === false }">
            <td>
              <span :style="{ paddingInlineStart: `${(acc.depth || 0) * 18}px` }" class="font-mono">
                {{ acc.code }}
              </span>
            </td>
            <td>
              <v-icon v-if="!acc.isPostable" size="16" class="me-1" color="grey">mdi-folder-outline</v-icon>
              <v-icon v-else size="16" class="me-1" :color="typeColor(acc.accountType)">mdi-circle-small</v-icon>
              {{ acc.name }}
              <v-chip v-if="acc.isSystem" size="x-small" variant="tonal" color="info" class="ms-2">نظامي</v-chip>
            </td>
            <td>
              <v-chip size="x-small" variant="tonal" :color="typeColor(acc.accountType)">
                {{ typeLabel(acc.accountType) }}
              </v-chip>
            </td>
            <td class="text-end font-mono" :class="acc.balanceBase < 0 ? 'text-error' : ''">
              {{ acc.isPostable ? formatCurrency(acc.balanceBase, 'IQD') : '—' }}
            </td>
            <td class="text-end">
              <v-btn
                v-if="canManage"
                size="x-small"
                variant="text"
                icon="mdi-plus"
                title="حساب فرعي"
                @click="openCreate(acc)"
              />
              <v-btn
                v-if="canManage"
                size="x-small"
                variant="text"
                icon="mdi-pencil"
                title="تعديل"
                @click="openEdit(acc)"
              />
              <v-btn
                v-if="canManage && !acc.isSystem"
                size="x-small"
                variant="text"
                icon="mdi-delete-outline"
                title="حذف"
                color="error"
                @click="remove(acc)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Create / Edit dialog -->
    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title class="dialog-title">
          <v-icon>{{ editingId ? 'mdi-pencil' : 'mdi-file-tree' }}</v-icon>
          <span>{{ editingId ? 'تعديل الحساب' : 'حساب جديد' }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <v-form ref="form" @submit.prevent="save">
            <v-row dense>
              <v-col v-if="parentLabel" cols="12">
                <v-alert type="info" variant="tonal" density="compact" class="mb-2">
                  حساب فرعي تحت: <strong>{{ parentLabel }}</strong>
                </v-alert>
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="formData.code"
                  label="الرمز *"
                  variant="outlined"
                  density="comfortable"
                  :disabled="!!editingId"
                  :rules="[(v) => !!v || 'الرمز مطلوب']"
                />
              </v-col>
              <v-col cols="12" sm="8">
                <v-text-field
                  v-model="formData.name"
                  label="اسم الحساب *"
                  variant="outlined"
                  density="comfortable"
                  :rules="[(v) => !!v || 'الاسم مطلوب']"
                />
              </v-col>
              <v-col cols="12">
                <v-select
                  v-model="formData.accountType"
                  :items="typeOptions"
                  item-title="label"
                  item-value="value"
                  label="نوع الحساب *"
                  variant="outlined"
                  density="comfortable"
                  :disabled="!!editingId && editingHasType"
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
                <v-switch v-model="formData.isActive" color="primary" hide-details label="الحساب نشط" />
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
import { useGlStore } from '@/stores/gl';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatCurrency } from '@/utils/formatters';

const glStore = useGlStore();
const authStore = useAuthStore();

const loading = computed(() => glStore.loading);
const accounts = computed(() => glStore.accounts);
const canManage = computed(() => authStore.hasPermission?.('gl:manage_accounts'));

const TYPE_META = {
  asset: { label: 'أصول', color: 'primary' },
  liability: { label: 'خصوم', color: 'error' },
  equity: { label: 'حقوق ملكية', color: 'purple' },
  revenue: { label: 'إيرادات', color: 'success' },
  expense: { label: 'مصروفات', color: 'warning' },
};
const typeOptions = Object.entries(TYPE_META).map(([value, m]) => ({ value, label: m.label }));
const typeLabel = (t) => TYPE_META[t]?.label || t;
const typeColor = (t) => TYPE_META[t]?.color || 'grey';

// Flat list arrives ordered by code; nest by parentId then flatten with depth
// so we can indent without a recursive component.
const flatTree = computed(() => {
  const byParent = new Map();
  for (const a of accounts.value) {
    const key = a.parentId || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(a);
  }
  const out = [];
  const walk = (parentId, depth) => {
    for (const node of byParent.get(parentId) || []) {
      out.push({ ...node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(0, 0);
  // Fallback: any orphan rows whose parent isn't in the set still render.
  if (out.length !== accounts.value.length) {
    const seen = new Set(out.map((o) => o.id));
    for (const a of accounts.value) if (!seen.has(a.id)) out.push({ ...a, depth: 0 });
  }
  return out;
});

const dialog = ref(false);
const saving = ref(false);
const form = ref(null);
const editingId = ref(null);
const editingHasType = ref(false);
const parentLabel = ref('');
const formData = reactive({
  code: '',
  name: '',
  accountType: 'asset',
  parentId: null,
  notes: '',
  isActive: true,
});

function resetForm() {
  formData.code = '';
  formData.name = '';
  formData.accountType = 'asset';
  formData.parentId = null;
  formData.notes = '';
  formData.isActive = true;
  editingId.value = null;
  editingHasType.value = false;
  parentLabel.value = '';
}

function openCreate(parent) {
  resetForm();
  if (parent) {
    formData.parentId = parent.id;
    formData.accountType = parent.accountType;
    parentLabel.value = `${parent.code} — ${parent.name}`;
  }
  dialog.value = true;
}

function openEdit(acc) {
  resetForm();
  editingId.value = acc.id;
  editingHasType.value = true;
  formData.code = acc.code;
  formData.name = acc.name;
  formData.accountType = acc.accountType;
  formData.notes = acc.notes || '';
  formData.isActive = acc.isActive !== false;
  dialog.value = true;
}

async function save() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await glStore.updateAccount(editingId.value, {
        name: formData.name,
        accountType: formData.accountType,
        notes: formData.notes || null,
        isActive: formData.isActive,
      });
    } else {
      await glStore.createAccount({
        code: formData.code,
        name: formData.name,
        accountType: formData.accountType,
        parentId: formData.parentId || undefined,
        notes: formData.notes || null,
      });
    }
    dialog.value = false;
    await glStore.fetchAccounts({ includeInactive: true });
  } catch (err) {
    console.error('Failed to save account', err);
  } finally {
    saving.value = false;
  }
}

async function remove(acc) {
  if (!confirm(`حذف الحساب «${acc.name}»؟`)) return;
  try {
    await glStore.deleteAccount(acc.id);
    await glStore.fetchAccounts({ includeInactive: true });
  } catch (err) {
    console.error('Failed to delete account', err);
  }
}

onMounted(() => glStore.fetchAccounts({ includeInactive: true }));
</script>

<style scoped>
.font-mono {
  font-family: 'Courier New', monospace;
}
</style>
