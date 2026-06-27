<template>
  <div class="page-shell">
    <PageHeader
      title="إدارة المبيعات"
      subtitle="عرض الفواتير والمسودات وأقساط البيع"
      icon="mdi-receipt-text"
    >
      <!-- General sales-invoice shortcut. Opens the unified «فاتورة بيع جديدة»
           (cash OR installment). Gated ONLY by the sales-create permission —
           never by the installments feature, which governs the installment
           OPTION inside the page, not invoice creation itself. -->
      <v-btn
        v-if="canCreateSale"
        color="primary"
        prepend-icon="mdi-plus"
        size="default"
        to="/sales/new"
        aria-label="إنشاء فاتورة مبيعات"
      >
        انشاء فاتورة مبيعات
      </v-btn>
    </PageHeader>

    <!-- Unified SmartTable: search + advanced filters + columns + export + print
         + saved views, backed by the existing useServerSearch data engine. -->
    <SmartTable
      data-testid="sales-table"
      table-key="sales-table"
      :headers="headers"
      :items="saleStore.sales"
      :loading="tableLoading"
      :error="error"
      :total-items="saleStore.pagination.total"
      server-side
      :initial-load="false"
      :page="saleStore.pagination.page"
      :page-size="saleStore.pagination.limit"
      :search="query"
      :search-placeholder="'ابحث برقم الفاتورة، اسم الزبون، الهاتف، أو منتج داخل الفاتورة...'"
      :filter-chips="filterChips"
      :row-actions="rowActions"
      show-export
      show-print
      show-saved-views
      print-title="قائمة المبيعات"
      export-file-base="sales"
      :empty-title="'لا توجد مبيعات'"
      :empty-description="'ابدأ بإنشاء بيع جديد'"
      empty-icon="mdi-cash-register"
      :empty-actions="emptyStateActions"
      @row-click="openSale"
      @update:search="onQueryChange"
      @search-now="runNow"
      @clear-search="clear"
      @update:page="setPage"
      @update:page-size="setPageSize"
      @clear-filters="onClearFilters"
      @remove-filter="onRemoveFilter"
      @refresh="refresh"
    >
      <!-- Advanced filters live in the toolbar popover (page-owned controls). -->
      <template #filters>
        <v-row dense>
          <!-- Branch filter — only for users assigned to MORE THAN ONE branch.
               Options are limited to the user's own branches (the backend also
               rejects any out-of-scope branch). -->
          <v-col v-if="showBranchFilter" cols="12" sm="6" md="4">
            <v-select
              v-model="filters.branchId"
              :items="allowedBranchOptions"
              item-title="name"
              item-value="id"
              label="الفرع"
              prepend-inner-icon="mdi-source-branch"
              clearable
              hide-details
              density="comfortable"
              variant="outlined"
              @update:model-value="applyFilters"
            ></v-select>
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="filters.status"
              :items="statusOptions"
              label="الحالة"
              prepend-inner-icon="mdi-filter-variant"
              clearable
              hide-details
              density="comfortable"
              variant="outlined"
              @update:model-value="applyFilters"
            ></v-select>
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="filters.paymentType"
              :items="paymentTypeOptions"
              label="نوع الدفع"
              prepend-inner-icon="mdi-cash-multiple"
              clearable
              hide-details
              density="comfortable"
              variant="outlined"
              @update:model-value="applyFilters"
            ></v-select>
          </v-col>

          <v-col v-if="canReadCustomers" cols="12" sm="6" md="4">
            <v-autocomplete
              v-model="filters.customer"
              :items="customers"
              item-title="name"
              item-value="id"
              label="العميل"
              prepend-inner-icon="mdi-account"
              hide-details
              density="comfortable"
              clearable
              variant="outlined"
              :custom-filter="customFilter"
              @update:model-value="applyFilters"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props">
                  <template #title>
                    {{ item.raw.name }}
                  </template>
                  <template #subtitle>
                    {{ item.raw.phone }}
                  </template>
                </v-list-item>
              </template>
              <template #selection="{ item }">
                {{ item.raw.name }} - {{ item.raw.phone }}
              </template>
            </v-autocomplete>
          </v-col>

          <v-col cols="6" sm="6" md="4">
            <v-text-field
              v-model="filters.startDate"
              label="من تاريخ"
              type="date"
              prepend-inner-icon="mdi-calendar-start"
              hide-details
              density="comfortable"
              variant="outlined"
              @update:model-value="applyFilters"
            ></v-text-field>
          </v-col>

          <v-col cols="6" sm="6" md="4">
            <v-text-field
              v-model="filters.endDate"
              label="إلى تاريخ"
              type="date"
              prepend-inner-icon="mdi-calendar-end"
              hide-details
              density="comfortable"
              variant="outlined"
              @update:model-value="applyFilters"
            ></v-text-field>
          </v-col>

          <v-col cols="6" sm="6" md="4">
            <v-text-field
              v-model.number="filters.minTotal"
              type="number"
              label="المبلغ من"
              prepend-inner-icon="mdi-cash"
              hide-details
              density="comfortable"
              variant="outlined"
              min="0"
              @update:model-value="applyFilters"
            ></v-text-field>
          </v-col>

          <v-col cols="6" sm="6" md="4">
            <v-text-field
              v-model.number="filters.maxTotal"
              type="number"
              label="المبلغ إلى"
              prepend-inner-icon="mdi-cash"
              hide-details
              density="comfortable"
              variant="outlined"
              min="0"
              @update:model-value="applyFilters"
            ></v-text-field>
          </v-col>
        </v-row>
      </template>

      <!-- Custom cells (search highlighting, chips, badges) pass straight through. -->
      <template #[`item.invoiceNumber`]="{ item }">
        <div class="d-flex flex-column py-1">
          <span class="font-weight-medium">
            <template v-for="(seg, i) in highlightOf(item.invoiceNumber)" :key="i">
              <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
              <template v-else>{{ seg.text }}</template>
            </template>
          </span>
          <MatchBadge
            v-if="item.matchedField"
            :field="item.matchedField"
            :value="item.matchedValue"
            class="mt-1 align-self-start"
          />
        </div>
      </template>
      <template #[`item.customer`]="{ item }">
        <template v-for="(seg, i) in highlightOf(item.customer)" :key="i">
          <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
          <template v-else>{{ seg.text }}</template>
        </template>
      </template>
      <template #[`item.customerPhone`]="{ item }">
        <template v-for="(seg, i) in highlightOf(item.customerPhone)" :key="i">
          <mark v-if="seg.match" class="search-hl">{{ seg.text }}</mark>
          <template v-else>{{ seg.text }}</template>
        </template>
      </template>
      <template #[`item.total`]="{ item }">
        <div>
          <div
            :class="
              Number(item.returnedTotal) > 0
                ? 'text-decoration-line-through text-grey text-caption'
                : ''
            "
          >
            {{ formatCurrency(item.total, item.currency) }}
          </div>
          <div v-if="Number(item.returnedTotal) > 0" class="text-success font-weight-bold">
            {{
              formatCurrency(
                Math.max(0, Number(item.total) - Number(item.returnedTotal)),
                item.currency
              )
            }}
          </div>
        </div>
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip
          v-if="getReturnState(item) === 'full'"
          color="warning"
          size="small"
          prepend-icon="mdi-keyboard-return"
          :title="`قيمة الإرجاع: ${formatCurrency(item.returnedTotal, item.currency)}`"
        >
          مُرجع كلياً
        </v-chip>
        <v-chip
          v-else-if="getReturnState(item) === 'partial'"
          color="warning"
          size="small"
          variant="tonal"
          prepend-icon="mdi-keyboard-return"
          :title="`قيمة الإرجاع: ${formatCurrency(item.returnedTotal, item.currency)}`"
        >
          مُرجع جزئياً
        </v-chip>
        <v-chip v-else :color="getStatusColor(item.status)" size="small">
          {{ getStatusText(item.status) }}
        </v-chip>
      </template>
      <template #[`item.createdAt`]="{ item }">
        {{ toYmd(item.createdAt) }}
      </template>

      <template #[`item.paymentType`]="{ item }">
        {{ getPaymentTypeText(item.paymentType) }}
      </template>

      <template #[`item.priceType`]="{ item }">
        <v-chip size="x-small" variant="tonal" color="indigo">
          {{ priceTierLabel(item.priceType) }}
        </v-chip>
      </template>

      <template #[`item.branch`]="{ item }">
        {{ item?.branchName ?? item?.branch?.name ?? 'غير محدد' }}
      </template>
    </SmartTable>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSaleStore } from '@/stores/sale';
import { useCustomerStore } from '@/stores/customer';
import { useAuthStore } from '../../stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { priceTierLabel } from '@/utils/productUnits';
import PageHeader from '@/components/PageHeader.vue';
import MatchBadge from '@/components/MatchBadge.vue';
import SmartTable from '@/components/common/SmartTable';
import { useServerSearch } from '@/composables/useServerSearch';
import { highlightSegments } from '@/utils/highlight';
import { formatCurrency } from '@/utils/formatters';
import { useFeatureGate } from '@/composables/useFeatureGate';
import { usePermissions } from '@/composables/usePermissions';

const router = useRouter();
const saleStore = useSaleStore();
const customerStore = useCustomerStore();
const authStore = useAuthStore();
const inventoryStore = useInventoryStore();
const { can } = usePermissions();

const customers = ref([]);

// optional_feature: the customer filter dropdown reads from a DIFFERENT
// permission (customers:read) than this page (sales:read). Gate both the
// options fetch and the control so a sales-only user never triggers a 403.
const canReadCustomers = computed(() => can('customers:read'));

// Branch filter is only meaningful for a user assigned to more than one branch.
// `inventoryStore.branches` is already scoped to the user's branches by the
// backend, so it doubles as the allowed-options source.
const allowedBranchOptions = computed(() => inventoryStore.branches || []);
const showBranchFilter = computed(
  () => (authStore.allowedBranchIds?.length || 0) > 1 && allowedBranchOptions.value.length > 1
);

// Centralized debounced/cancelable/cached search. `filters` is the reactive
// filter state the advanced-filter controls bind to directly.
const {
  query,
  filters,
  isSearching,
  error,
  onQueryChange,
  runNow,
  clear,
  setFilters,
  setPage,
  setPageSize,
  refresh,
} = useServerSearch({
  limit: 10,
  initialFilters: {
    branchId: null,
    status: null,
    paymentType: null,
    customer: null,
    startDate: null,
    endDate: null,
    minTotal: null,
    maxTotal: null,
  },
  load: (params, opts) => saleStore.fetch(params, { ...opts, silent: true }),
  apply: (res) => {
    saleStore.sales = res?.data || [];
    if (res?.meta) {
      saleStore.pagination = {
        page: Number(res.meta.page) || 1,
        limit: Number(res.meta.limit) || saleStore.pagination.limit,
        total: Number(res.meta.total) || 0,
        totalPages: Number(res.meta.totalPages) || 0,
      };
    }
  },
});

const tableLoading = computed(() => isSearching.value || saleStore.loading);

const paymentTypeOptions = [
  { title: 'نقدي', value: 'cash' },
  { title: 'تقسيط', value: 'installment' },
  { title: 'مختلط', value: 'mixed' },
];

const highlightOf = (value) => highlightSegments(value, query.value);

// Re-run search with the current (v-model-mutated) filter state; resets page 1.
const applyFilters = () => setFilters({});

const onRemoveFilter = (key) => {
  filters[key] = null;
  setFilters({});
};

const onClearFilters = () => {
  ['status', 'paymentType', 'customer', 'startDate', 'endDate', 'minTotal', 'maxTotal'].forEach(
    (k) => {
      filters[k] = null;
    }
  );
  setFilters({});
};

const isAdmin = computed(() => authStore.hasPermission(['sales:delete', 'manage:sales']));
const canDelete = computed(() => isAdmin.value);
// Wholesale/agent price tiers (تسعير الوكلاء) — adds a "نوع السعر" column.
const agentPricingOn = computed(() => authStore.hasFeature?.('agentPricing') === true);

// Draft-related actions: visible when the user holds the capability; the
// button renders disabled with an explanation tooltip when the feature flag
// is off, so admins can see the entry point exists.
const draftsGate = useFeatureGate('draftInvoices', 'canUseDraftInvoices');
const canUseDrafts = computed(() => draftsGate.enabled.value);
const draftsVisible = draftsGate.visible;
const draftsDisabled = draftsGate.disabled;
const draftsReason = draftsGate.reason;

// New-sale shortcut visibility depends ONLY on the sales-create permission —
// the unified «فاتورة بيع جديدة» works for cash invoices regardless of the
// installments feature flag.
const canCreateSale = computed(() => authStore.hasPermission('sales:create'));

// "New sale" empty-state action opens the unified invoice page; surface it
// whenever the user can create sales (not tied to installments).
const emptyStateActions = computed(() => {
  if (!canCreateSale.value) return [];
  return [{ text: 'بيع جديد', icon: 'mdi-plus', to: '/sales/new', color: 'primary' }];
});

// Drop the "draft" filter chip when draftInvoices is disabled — there are no
// draft sales to filter for, and showing the chip is misleading.
const statusOptions = computed(() => {
  const options = [
    { title: 'مكتمل', value: 'completed' },
    { title: 'قيد الانتظار', value: 'pending' },
    { title: 'ملغي', value: 'cancelled' },
  ];
  if (canUseDrafts.value) {
    options.push({ title: 'مسودة', value: 'draft' });
  }
  return options;
});

const filterChips = computed(() => {
  const chips = [];
  if (filters.branchId) {
    const br = allowedBranchOptions.value.find((b) => b.id === filters.branchId);
    chips.push({ key: 'branchId', label: `الفرع: ${br?.name ?? filters.branchId}` });
  }
  if (filters.status)
    chips.push({ key: 'status', label: `الحالة: ${getStatusText(filters.status)}` });
  if (filters.paymentType)
    chips.push({ key: 'paymentType', label: `الدفع: ${getPaymentTypeText(filters.paymentType)}` });
  if (filters.customer) {
    const cust = customers.value.find((c) => c.id === filters.customer);
    chips.push({ key: 'customer', label: `العميل: ${cust?.name ?? filters.customer}` });
  }
  if (filters.startDate) chips.push({ key: 'startDate', label: `من: ${filters.startDate}` });
  if (filters.endDate) chips.push({ key: 'endDate', label: `إلى: ${filters.endDate}` });
  if (filters.minTotal) chips.push({ key: 'minTotal', label: `المبلغ من: ${filters.minTotal}` });
  if (filters.maxTotal) chips.push({ key: 'maxTotal', label: `المبلغ إلى: ${filters.maxTotal}` });
  return chips;
});

const headers = computed(() => [
  { title: 'رقم الفاتورة', key: 'invoiceNumber' },
  { title: 'العميل', key: 'customer' },
  { title: 'رقم الهاتف', key: 'customerPhone' },
  { title: 'المبلغ الإجمالي', key: 'total', format: 'currency', align: 'end' },
  { title: 'نوع الدفع', key: 'paymentType', exportValue: (r) => getPaymentTypeText(r.paymentType) },
  // Price tier used on the invoice — only when the agentPricing feature is on.
  ...(agentPricingOn.value
    ? [{ title: 'نوع السعر', key: 'priceType', exportValue: (r) => priceTierLabel(r.priceType) }]
    : []),
  { title: 'الحالة', key: 'status', exportValue: (r) => getStatusText(r.status) },
  { title: 'التاريخ', key: 'createdAt', exportValue: (r) => toYmd(r.createdAt) },
  { title: 'بواسطة', key: 'createdBy' },
  {
    title: 'الفرع',
    key: 'branch',
    exportValue: (r) => r.branchName ?? r.branch?.name ?? 'غير محدد',
  },
]);

// Row actions replace the old per-row buttons + the standalone cancel/restore
// ConfirmDialogs. Each is gated by its existing permission AND the row's state
// (mirroring the prior v-if conditions): view for non-drafts, complete/delete
// for drafts, cancel for live sales, restore for cancelled ones. SmartTable's
// built-in confirm runs before the destructive handlers.
const rowActions = computed(() => {
  const canDel = canDelete.value;
  const dVisible = draftsVisible.value;
  const dDisabled = draftsDisabled.value;
  const dReason = draftsReason.value;
  return [
    {
      key: 'view',
      icon: 'mdi-eye-outline',
      title: 'عرض الفاتورة',
      hidden: (item) => item.status === 'draft',
      handler: (item) => openSale(item),
    },
    {
      key: 'complete',
      icon: 'mdi-check',
      color: 'primary',
      title: dDisabled ? dReason || 'إكمال المسودة' : 'إكمال المسودة',
      hidden: (item) => item.status !== 'draft' || !dVisible,
      disabled: () => dDisabled,
      handler: (item) => completeDraft(item),
    },
    {
      key: 'cancel',
      icon: 'mdi-cancel',
      color: 'error',
      danger: true,
      title: 'إلغاء البيع',
      hidden: (item) => !canDel || item.status === 'draft' || item.status === 'cancelled',
      handler: (item) => cancelSaleNow(item),
      confirm: (item) => ({
        title: 'إلغاء البيع',
        message: 'هل أنت متأكد من رغبتك في إلغاء هذه المبيعات؟',
        details: `الفاتورة: ${item.invoiceNumber}`,
        type: 'error',
        confirmText: 'نعم، تأكيد',
      }),
    },
    {
      key: 'delete',
      icon: 'mdi-delete',
      color: 'error',
      danger: true,
      title: 'حذف المسودة',
      hidden: (item) => item.status !== 'draft',
      disabled: () => !canDel,
      handler: (item) => removeDraft(item),
      confirm: (item) => ({
        title: 'حذف المسودة',
        message: 'هل أنت متأكد من حذف هذه المسودة؟',
        details: `الفاتورة: ${item.invoiceNumber}`,
        type: 'error',
        confirmText: 'نعم، تأكيد',
      }),
    },
    {
      key: 'restore',
      icon: 'mdi-restore',
      color: 'info',
      title: 'استعادة البيع',
      hidden: (item) => !canDel || item.status !== 'cancelled',
      handler: (item) => restoreSaleNow(item),
      confirm: (item) => ({
        title: 'استعادة البيع',
        message: 'هل أنت متأكد من رغبتك في استعادة هذه المبيعات؟',
        details: `الفاتورة: ${item.invoiceNumber}`,
        type: 'info',
        confirmText: 'نعم، استعادة',
      }),
    },
  ];
});

const toYmd = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPaymentTypeText = (type) => {
  const types = { cash: 'نقدي', installment: 'تقسيط', mixed: 'مختلط' };
  return types[type] || type;
};

const getStatusColor = (status) => {
  const colors = {
    completed: 'success',
    pending: 'warning',
    cancelled: 'error',
    draft: 'info',
  };
  return colors[status] || 'grey';
};

// Returns 'full' | 'partial' | 'none'. The list endpoint exposes
// `returnedTotal` (sum of all sale_returns.returnedValue), so a sale is fully
// returned when that aggregate covers the original total within the
// currency's rounding bucket.
const getReturnState = (item) => {
  const returned = Number(item.returnedTotal) || 0;
  if (returned <= 0) return 'none';
  const total = Number(item.total) || 0;
  const tolerance = item.currency === 'IQD' ? 250 : 0.01;
  return returned + tolerance >= total ? 'full' : 'partial';
};

const getStatusText = (status) => {
  const texts = {
    completed: 'مكتمل',
    pending: 'قيد الانتظار',
    cancelled: 'ملغي',
    draft: 'مسودة',
  };
  return texts[status] || status;
};

const draftRouteFor = (sale) => {
  // Installment drafts open the full installment form; everything else
  // (cash/card/etc.) resumes in the quick-pay POS screen.
  const target = sale?.paymentType === 'installment' ? 'NewSale' : 'PosScreen';
  return { name: target, query: { draftId: sale.id } };
};

// Row click + the "view" action: drafts resume in their editor, everything
// else opens the read-only invoice details.
const openSale = (item) => {
  if (!item) return;
  if (item.status === 'draft') {
    router.push(draftRouteFor(item));
  } else {
    router.push({ name: 'SaleDetails', params: { id: item.id } });
  }
};

const completeDraft = (item) => {
  if (!item) return;
  router.push(draftRouteFor(item));
};

const removeDraft = async (item) => {
  try {
    await saleStore.removeSale(item.id);
    refresh();
  } catch {
    // Error handled by store
  }
};

const cancelSaleNow = async (item) => {
  try {
    await saleStore.cancelSale(item.id);
    refresh();
  } catch {
    // Error handled by store
  }
};

const restoreSaleNow = async (item) => {
  try {
    await saleStore.restoreSale(item.id);
    refresh();
  } catch {
    // Error handled by store
  }
};

// دالة البحث المخصصة: البحث بالاسم أو رقم الهاتف
const customFilter = (itemText, queryText, item) => {
  const queryStr = queryText.toLowerCase();
  const name = item.raw.name?.toLowerCase() || '';
  const phone = item.raw.phone?.toLowerCase() || '';
  return name.includes(queryStr) || phone.includes(queryStr);
};

onMounted(async () => {
  // Initial list load goes through the search composable.
  refresh();
  // Populate the customer filter options (separate from the search results).
  // OPTIONAL — needs customers:read, not the page's sales:read. Skip the call
  // entirely (no 403, no toast) when the user can't read customers.
  if (canReadCustomers.value) {
    await customerStore.fetch({ limit: 200 });
    customers.value = customerStore.customers;
  }
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
