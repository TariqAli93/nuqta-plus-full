<template>
  <div class="page-shell">
    <PageHeader title="إدارة العملاء" subtitle="عرض وإدارة بيانات عملائك" icon="mdi-account-group">
      <v-btn
        v-if="canCreateCustomers"
        color="primary"
        prepend-icon="mdi-plus"
        size="default"
        to="/customers/new"
        aria-label="إضافة عميل جديد"
      >
        عميل جديد
      </v-btn>
    </PageHeader>

    <v-card ref="filterCardEl" class="page-section filter-toolbar pa-3">
      <div class="search-toolbar">
        <SearchBar
          :model-value="query"
          :loading="isSearching"
          placeholder="ابحث بالاسم، الهاتف، العنوان، الملاحظات..."
          aria-label="البحث عن عميل"
          @update:model-value="onQueryChange"
          @search="runNow"
          @clear="clear"
        />
      </div>

      <AdvancedFilters
        class="mt-3"
        :chips="filterChips"
        @clear="onClearFilters"
        @remove="onRemoveFilter"
      >
        <v-row dense>
          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model="cityFilter"
              label="المدينة"
              clearable
              density="comfortable"
              variant="outlined"
              hide-details
              prepend-inner-icon="mdi-city-variant-outline"
              @update:model-value="onCityChange"
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="6" md="4" class="d-flex align-center">
            <v-switch
              v-model="hasDebtFilter"
              label="عليه دين فقط"
              color="primary"
              density="comfortable"
              hide-details
              @update:model-value="onHasDebtChange"
            ></v-switch>
          </v-col>
        </v-row>
      </AdvancedFilters>
    </v-card>

    <v-card class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="primary">mdi-format-list-bulleted</v-icon>
          قائمة العملاء
        </span>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-download"
          :disabled="!customerStore.customers || customerStore.customers.length === 0"
          aria-label="تصدير البيانات"
          @click="exportCustomers"
        >
          تصدير
        </v-btn>
      </div>

      <!-- Bulk-action bar — appears only when rows are selected (#22) -->
      <DesktopSelectionBar :count="selected.length" class="mx-3 mt-2" @clear="selected = []">
        <v-btn
          v-if="canDeleteCustomers"
          size="small"
          color="error"
          variant="tonal"
          prepend-icon="mdi-delete"
          @click="bulkDeleteDialog = true"
        >
          حذف المحدد
        </v-btn>
      </DesktopSelectionBar>
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        density="comfortable"
        class="mx-3 mt-3"
        closable
        @click:close="dismissError"
      >
        تعذر تنفيذ البحث حالياً، حاول مرة أخرى.
        <template #append>
          <v-btn size="small" variant="text" @click="refresh">إعادة المحاولة</v-btn>
        </template>
      </v-alert>

      <DesktopDataGrid
        v-model="selected"
        :headers="headers"
        :items="customerStore.customers"
        :loading="tableLoading"
        :items-per-page="customerStore.pagination.limit || 10"
        :page="customerStore.pagination.page"
        :items-length="customerStore.pagination.total"
        server-items-length
        hide-default-footer
        show-select
        item-value="id"
        @open="openCustomer"
        @row-menu="onRowMenu"
      >
        <template #no-data>
          <EmptyState
            v-if="hasActiveQuery"
            title="لا توجد نتائج مطابقة"
            description="حاول البحث بالاسم أو الرقم أو الباركود"
            icon="mdi-magnify-close"
            compact
          />
          <EmptyState
            v-else
            title="لا يوجد عملاء"
            description="ابدأ بإضافة عميل جديد"
            icon="mdi-account-group"
            :actions="[
              {
                text: 'إضافة عميل جديد',
                icon: 'mdi-plus',
                to: '/customers/new',
                color: 'primary',
              },
            ]"
            compact
          />
        </template>
        <template #[`item.name`]="{ item }">
          <div class="d-flex flex-column py-1">
            <RouterLink :to="`/customers/${item.id}`" class="text-primary text-decoration-none">
              <template v-for="(seg, i) in highlightOf(item.name)" :key="i">
                <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
                <template v-else>{{ seg.text }}</template>
              </template>
            </RouterLink>
            <MatchBadge
              v-if="item.matchedField"
              :field="item.matchedField"
              :value="item.matchedValue"
              class="mt-1 align-self-start"
            />
          </div>
        </template>
        <template #[`item.phone`]="{ item }">
          <template v-for="(seg, i) in highlightOf(item.phone)" :key="i">
            <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
            <template v-else>{{ seg.text }}</template>
          </template>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            icon="mdi-account-details"
            size="small"
            variant="text"
            :to="`/customers/${item.id}`"
            title="عرض الملف"
            aria-label="عرض ملف العميل"
          >
            <v-icon size="20">mdi-account-details</v-icon>
          </v-btn>
          <v-btn
            v-if="canManageCustomers"
            icon="mdi-pencil"
            size="small"
            variant="text"
            :to="`/customers/${item.id}/edit`"
            title="تعديل"
            aria-label="تعديل العميل"
          >
            <v-icon size="20">mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            v-if="canDeleteCustomers"
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            title="حذف"
            aria-label="حذف العميل"
            @click="confirmDelete(item)"
          >
            <v-icon size="20">mdi-delete</v-icon>
          </v-btn>
        </template>
      </DesktopDataGrid>

      <PaginationControls
        :pagination="customerStore.pagination"
        @update:page="setPage"
        @update:items-per-page="setPageSize"
      />
    </v-card>

    <ConfirmDialog
      v-model="deleteDialog"
      title="تأكيد الحذف"
      message="هل أنت متأكد من حذف العميل؟"
      :details="selectedCustomer ? `العميل: ${selectedCustomer.name}` : ''"
      type="error"
      confirm-text="حذف"
      cancel-text="إلغاء"
      :loading="deleting"
      @confirm="handleDelete"
      @cancel="deleteDialog = false"
    />

    <!-- Bulk delete (#7, #22) -->
    <ConfirmDialog
      v-model="bulkDeleteDialog"
      title="تأكيد الحذف"
      :message="`هل أنت متأكد من حذف ${selected.length} عميل؟`"
      type="error"
      confirm-text="حذف الكل"
      cancel-text="إلغاء"
      :loading="bulkDeleting"
      @confirm="handleBulkDelete"
      @cancel="bulkDeleteDialog = false"
    />

    <!-- Right-click context menu (#3), positioned at the pointer -->
    <v-menu v-model="ctxMenu.open" :target="[ctxMenu.x, ctxMenu.y]" location="end">
      <v-list density="compact" min-width="180">
        <template v-for="(it, i) in ctxItems" :key="i">
          <v-divider v-if="it.divider" class="my-1" />
          <v-list-item v-else :prepend-icon="it.icon" @click="runCtx(it)">
            <v-list-item-title :class="{ 'text-error': it.danger }">{{ it.title }}</v-list-item-title>
          </v-list-item>
        </template>
      </v-list>
    </v-menu>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useCustomerStore } from '@/stores/customer';
import { useAuthStore } from '@/stores/auth';
import { usePermissions } from '@/composables/usePermissions';
import * as uiAccess from '@/auth/uiAccess.js';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import PageHeader from '@/components/PageHeader.vue';
import SearchBar from '@/components/SearchBar.vue';
import AdvancedFilters from '@/components/AdvancedFilters.vue';
import MatchBadge from '@/components/MatchBadge.vue';
import { DesktopDataGrid, DesktopSelectionBar } from '@/ui';
import { useServerSearch } from '@/composables/useServerSearch';
import { highlightSegments } from '@/utils/highlight';
import { useNotificationStore } from '@/stores/notification';
import { usePageShortcuts } from '@/composables/usePageShortcuts';
import { useNativeFile } from '@/composables/useNativeFile';
import { usePageActions } from '@/commands/pageActions';

const router = useRouter();
const customerStore = useCustomerStore();
const authStore = useAuthStore();
const { can } = usePermissions();

// Action-button gates (user_action): hide the add/edit affordances the user
// lacks. Delete keeps the existing uiAccess helper.
const canCreateCustomers = computed(() => can('customers:create'));
const canManageCustomers = computed(() => can('customers:update'));

const userRole = computed(() => authStore.user?.role);
const canDeleteCustomers = computed(() =>
  userRole.value ? uiAccess.canDeleteCustomers(userRole.value) : false
);

const deleteDialog = ref(false);
const selectedCustomer = ref(null);
const deleting = ref(false);

const cityFilter = ref(null);
const hasDebtFilter = ref(false);

const headers = [
  { title: 'الاسم', key: 'name' },
  { title: 'الهاتف', key: 'phone' },
  { title: 'المدينة', key: 'city' },
  { title: 'إجراءات', key: 'actions', sortable: false },
];

const {
  query,
  isSearching,
  error,
  onQueryChange,
  runNow,
  clear,
  setFilters,
  clearFilters,
  setPage,
  setPageSize,
  refresh,
} = useServerSearch({
  limit: customerStore.pagination.limit,
  initialFilters: { city: null, hasDebt: null },
  load: (params, opts) => customerStore.fetch(params, { ...opts, silent: true }),
  apply: (res) => {
    customerStore.customers = res?.data || [];
    if (res?.meta) {
      customerStore.pagination = {
        page: Number(res.meta.page) || 1,
        limit: Number(res.meta.limit) || customerStore.pagination.limit,
        total: Number(res.meta.total) || 0,
        totalPages: Number(res.meta.totalPages) || 0,
      };
    }
  },
});

const tableLoading = computed(() => isSearching.value || customerStore.loading);

const filterChips = computed(() => {
  const chips = [];
  if (cityFilter.value) chips.push({ key: 'city', label: `المدينة: ${cityFilter.value}` });
  if (hasDebtFilter.value) chips.push({ key: 'hasDebt', label: 'عليه دين' });
  return chips;
});

const hasActiveQuery = computed(() => !!query.value.trim() || filterChips.value.length > 0);

const highlightOf = (value) => highlightSegments(value, query.value);

const onCityChange = () => setFilters({ city: cityFilter.value || null });
const onHasDebtChange = () => setFilters({ hasDebt: hasDebtFilter.value ? true : null });

const onRemoveFilter = (key) => {
  if (key === 'city') cityFilter.value = null;
  if (key === 'hasDebt') hasDebtFilter.value = false;
  setFilters({ [key]: null });
};

const onClearFilters = () => {
  cityFilter.value = null;
  hasDebtFilter.value = false;
  clearFilters();
};

const dismissError = () => {
  error.value = null;
};

const confirmDelete = (customer) => {
  selectedCustomer.value = customer;
  deleteDialog.value = true;
};

const notificationStore = useNotificationStore();
const { saveFile } = useNativeFile();

// ── Multi-selection + bulk delete (#22) ──────────────────────────────────
const selected = ref([]);
const bulkDeleteDialog = ref(false);
const bulkDeleting = ref(false);

// ── Open the record / right-click context menu (#3, #4) ──────────────────
const openCustomer = (item) => router.push(`/customers/${item.id}`);
const ctxMenu = ref({ open: false, x: 0, y: 0, item: null });
const onRowMenu = ({ item, event }) => {
  ctxMenu.value = { open: true, x: event.clientX, y: event.clientY, item };
};
const ctxItems = computed(() => {
  const item = ctxMenu.value.item;
  if (!item) return [];
  const list = [{ title: 'عرض الملف', icon: 'mdi-account-details', handler: () => openCustomer(item) }];
  if (canManageCustomers.value)
    list.push({ title: 'تعديل', icon: 'mdi-pencil', handler: () => router.push(`/customers/${item.id}/edit`) });
  if (canDeleteCustomers.value)
    list.push({ divider: true }, { title: 'حذف', icon: 'mdi-delete', danger: true, handler: () => confirmDelete(item) });
  return list;
});
const runCtx = (it) => {
  ctxMenu.value.open = false;
  it.handler?.();
};

// ── Native CSV export via the OS save dialog (#17) ───────────────────────
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const exportCustomers = async () => {
  const rows = customerStore.customers || [];
  if (!rows.length) {
    notificationStore.error('لا توجد بيانات للتصدير');
    return;
  }
  const cols = headers.filter((h) => h.key !== 'actions');
  const csv = [
    cols.map((c) => c.title).join(','),
    ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(',')),
  ].join('\n');
  const res = await saveFile({
    data: '﻿' + csv, // UTF-8 BOM so Excel reads Arabic correctly
    defaultPath: 'customers.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (!res.canceled) notificationStore.success('تم تصدير البيانات بنجاح');
};

// ── Keyboard: Ctrl+F focuses search, Delete removes the selection (#7,#10) ─
const filterCardEl = ref(null);
const focusSearch = () => {
  const root = filterCardEl.value?.$el || filterCardEl.value;
  const input = root?.querySelector?.('input');
  input?.focus();
  input?.select?.();
};
const onDeleteKey = () => {
  if (selected.value.length) bulkDeleteDialog.value = true;
};
usePageShortcuts({ onSearch: focusSearch, onDelete: onDeleteKey });

const handleDelete = async () => {
  deleting.value = true;
  try {
    await customerStore.deleteCustomer(selectedCustomer.value.id);
    deleteDialog.value = false;
    refresh();
  } catch {
    /* presented centrally */
  } finally {
    deleting.value = false;
  }
};

const handleBulkDelete = async () => {
  bulkDeleting.value = true;
  try {
    for (const id of [...selected.value]) {
      try {
        await customerStore.deleteCustomer(id);
      } catch {
        /* keep deleting the rest */
      }
    }
    selected.value = [];
    bulkDeleteDialog.value = false;
    refresh();
  } finally {
    bulkDeleting.value = false;
  }
};

// Expose real page actions to the Command Registry. The `customers.export` /
// `customers.refresh` commands (catalog) navigate here + run these handlers.
usePageActions('customers', {
  export: () => exportCustomers(),
  refresh: () => refresh(),
});

onMounted(() => {
  refresh();
});
</script>

<style scoped lang="scss">
.search-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.search-hl {
  background-color: rgba(var(--v-theme-warning), 0.38);
  color: inherit;
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 700;
}
</style>
