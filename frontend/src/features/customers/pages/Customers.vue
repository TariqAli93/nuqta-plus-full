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

    <!-- Unified SmartTable: search + advanced filters + columns + selection +
         bulk actions + export + print + saved views, backed by the existing
         useServerSearch data engine (Recipe B). -->
    <SmartTable
      ref="tableRef"
      data-testid="customers-table"
      table-key="customers-table"
      :headers="headers"
      :items="customerStore.customers"
      :loading="tableLoading"
      :error="error"
      :total-items="customerStore.pagination.total"
      server-side
      :initial-load="false"
      :page="customerStore.pagination.page"
      :page-size="customerStore.pagination.limit"
      :search="query"
      search-placeholder="ابحث بالاسم، الهاتف، العنوان، الملاحظات..."
      :filter-chips="filterChips"
      :row-actions="rowActions"
      selectable
      :bulk-actions="bulkActions"
      show-export
      show-print
      show-saved-views
      print-title="قائمة العملاء"
      export-file-base="customers"
      empty-title="لا يوجد عملاء"
      empty-description="ابدأ بإضافة عميل جديد"
      empty-icon="mdi-account-group"
      :empty-actions="[{ text: 'إضافة عميل جديد', icon: 'mdi-plus', to: '/customers/new', color: 'primary' }]"
      @update:search="onQueryChange"
      @search-now="runNow"
      @clear-search="clear"
      @update:page="setPage"
      @update:page-size="setPageSize"
      @clear-filters="onClearFilters"
      @remove-filter="onRemoveFilter"
      @refresh="refresh"
      @row-dblclick="openCustomer"
      @row-open="openCustomer"
    >
      <!-- Advanced filters live in the toolbar popover (page-owned controls). -->
      <template #filters>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="cityFilter"
              label="المدينة"
              clearable
              density="comfortable"
              variant="outlined"
              hide-details
              prepend-inner-icon="mdi-city-variant-outline"
              @update:model-value="onCityChange"
            />
          </v-col>
          <v-col cols="12" sm="6" class="d-flex align-center">
            <v-switch
              v-model="hasDebtFilter"
              label="عليه دين فقط"
              color="primary"
              density="comfortable"
              hide-details
              @update:model-value="onHasDebtChange"
            />
          </v-col>
        </v-row>
      </template>

      <!-- Custom cells (profile link, search highlighting, match badge) pass straight through. -->
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
    </SmartTable>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useCustomerStore } from '@/stores/customer';
import { useAuthStore } from '@/stores/auth';
import { usePermissions } from '@/composables/usePermissions';
import * as uiAccess from '@/auth/uiAccess.js';
import PageHeader from '@/components/PageHeader.vue';
import MatchBadge from '@/components/MatchBadge.vue';
import SmartTable from '@/components/common/SmartTable';
import { useServerSearch } from '@/composables/useServerSearch';
import { highlightSegments } from '@/utils/highlight';
import { usePageShortcuts } from '@/composables/usePageShortcuts';
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

const tableRef = ref(null);

const cityFilter = ref(null);
const hasDebtFilter = ref(false);

const headers = [
  { title: 'الاسم', key: 'name' },
  { title: 'الهاتف', key: 'phone' },
  { title: 'المدينة', key: 'city' },
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

// Open the customer profile on row double-click / Enter (desktop convention).
const openCustomer = (item) => router.push(`/customers/${item.id}`);

// Per-row delete — folded into the SmartTable row-action confirm (replaces the
// page's own ConfirmDialog). The store toasts success/error centrally.
const handleDeleteRow = async (customer) => {
  try {
    await customerStore.deleteCustomer(customer.id);
    refresh();
  } catch {
    /* presented centrally by the store */
  }
};

// Row actions: view (always) + edit (customers:update) + delete (uiAccess gate).
// All marked primary so the three icons stay inline as before; SmartTable also
// builds the right-click context menu from this same list.
const rowActions = computed(() => {
  const list = [
    {
      key: 'view',
      icon: 'mdi-account-details',
      title: 'عرض الملف',
      to: (item) => `/customers/${item.id}`,
      primary: true,
    },
  ];
  if (canManageCustomers.value) {
    list.push({
      key: 'edit',
      icon: 'mdi-pencil',
      title: 'تعديل',
      to: (item) => `/customers/${item.id}/edit`,
      primary: true,
    });
  }
  if (canDeleteCustomers.value) {
    list.push({
      key: 'delete',
      icon: 'mdi-delete',
      title: 'حذف',
      color: 'error',
      danger: true,
      primary: true,
      handler: (item) => handleDeleteRow(item),
      confirm: (item) => ({
        title: 'تأكيد الحذف',
        message: 'هل أنت متأكد من حذف العميل؟',
        details: `العميل: ${item.name}`,
        type: 'error',
        confirmText: 'حذف',
      }),
    });
  }
  return list;
});

// Bulk delete — preserved via SmartTable's selectable + bulk-actions. The handler
// receives the selected row objects (and an { allResults } hint). There is no
// bulk-delete endpoint, so we delete the received rows one-by-one (the original
// behavior); the server "select all results" escalation acts on the loaded page.
const handleBulkDelete = async (rows) => {
  for (const row of rows) {
    try {
      await customerStore.deleteCustomer(row.id);
    } catch {
      /* keep deleting the rest */
    }
  }
  tableRef.value?.clearSelection();
  refresh();
};

const bulkActions = computed(() => {
  if (!canDeleteCustomers.value) return [];
  return [
    {
      key: 'delete',
      icon: 'mdi-delete',
      title: 'حذف المحدد',
      danger: true,
      confirm: {
        title: 'تأكيد الحذف',
        message: 'هل أنت متأكد من حذف العملاء المحددين؟',
        type: 'error',
        confirmText: 'حذف الكل',
      },
      handler: (rows) => handleBulkDelete(rows),
    },
  ];
});

// Command Registry: customers.export / customers.refresh run THESE handlers from
// the command bar / palette / shortcuts.
usePageActions('customers', {
  export: () => tableRef.value?.exportData('excel', { scope: 'all' }),
  refresh: () => refresh(),
});

// Preserve the global Ctrl+F → focus the table search. Delete now maps to
// SmartTable's own keyboard model (delete the active row).
usePageShortcuts({ onSearch: () => tableRef.value?.focusSearch() });

onMounted(() => {
  refresh();
});
</script>

<style scoped lang="scss">
.search-hl {
  background-color: rgba(var(--v-theme-warning), 0.38);
  color: inherit;
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 700;
}
</style>
