<template>
  <div class="page-shell">
    <PageHeader
      title="إدارة المبيعات"
      subtitle="عرض الفواتير والمسودات وأقساط البيع"
      icon="mdi-receipt-text"
    >
      <!-- Installment shortcut: hidden when the user lacks the capability
           entirely; rendered disabled with a tooltip when the feature flag
           is off so admins still see the entry point. -->
      <v-tooltip
        v-if="installmentsVisible"
        location="bottom"
        :text="installmentsReason"
        :disabled="!installmentsDisabled"
      >
        <template #activator="{ props: tipProps }">
          <span v-bind="tipProps">
            <v-btn
              color="primary"
              prepend-icon="mdi-plus"
              size="default"
              :to="installmentsDisabled ? undefined : '/sales/new'"
              :disabled="installmentsDisabled"
              aria-label="إنشاء فاتورة مبيعات"
            >
              انشاء فاتورة مبيعات
            </v-btn>
          </span>
        </template>
      </v-tooltip>
    </PageHeader>

    <v-card class="page-section filter-toolbar pa-3">
      <div class="search-toolbar">
        <SearchBar
          :model-value="query"
          :loading="isSearching"
          placeholder="ابحث برقم الفاتورة، اسم الزبون، الهاتف، أو منتج داخل الفاتورة..."
          aria-label="البحث عن فاتورة"
          @update:model-value="onQueryChange"
          @search="runNow"
          @clear="clear"
        />
      </div>

      <AdvancedFilters
        class="mt-3"
        :default-open="true"
        :chips="filterChips"
        @clear="onClearFilters"
        @remove="onRemoveFilter"
      >
        <v-row dense>
          <!-- Branch filter — only for users assigned to MORE THAN ONE branch.
               Options are limited to the user's own branches (the backend also
               rejects any out-of-scope branch). -->
          <v-col v-if="showBranchFilter" cols="12" sm="6" md="3">
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

          <v-col cols="12" sm="6" md="3">
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

          <v-col cols="12" sm="6" md="3">
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

          <v-col v-if="canReadCustomers" cols="12" sm="6" md="3">
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

          <v-col cols="6" md="3">
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

          <v-col cols="6" md="3">
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

          <v-col cols="6" md="3">
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

          <v-col cols="6" md="3">
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
      </AdvancedFilters>
    </v-card>

    <v-card class="page-section">
      <div class="section-title">
        <span class="section-title__label">
          <v-icon size="20" color="primary">mdi-format-list-bulleted</v-icon>
          قائمة المبيعات
        </span>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-download"
          :disabled="saleStore.sales.length === 0"
          aria-label="تصدير البيانات"
          @click="handleExport"
        >
          تصدير
        </v-btn>
      </div>
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

      <TableSkeleton v-if="initialLoading" :rows="8" :columns="headers.length" class="pa-3" />
      <v-data-table
        v-else
        :headers="headers"
        :items="saleStore.sales"
        :loading="tableLoading"
        :items-per-page="saleStore.pagination.limit"
        :page="saleStore.pagination.page"
        :items-length="saleStore.pagination.total"
        server-items-length
        hide-default-footer
        class="cursor-pointer"
        density="comfortable"
        @click:row="viewSale"
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
            title="لا توجد مبيعات"
            description="ابدأ بإنشاء بيع جديد"
            icon="mdi-cash-register"
            :actions="emptyStateActions"
            compact
          />
        </template>
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

        <template #[`item.actions`]="{ item }">
          <!-- أزرار المسودات -->
          <template v-if="item.status === 'draft'">
            <v-tooltip
              v-if="draftsVisible"
              location="top"
              :text="draftsReason || 'إكمال المسودة'"
              :disabled="!draftsDisabled"
            >
              <template #activator="{ props: tipProps }">
                <span v-bind="tipProps">
                  <v-btn
                    size="small"
                    variant="text"
                    :color="draftsDisabled ? 'grey' : 'primary'"
                    icon
                    :disabled="draftsDisabled"
                    :title="draftsDisabled ? draftsReason : 'إكمال المسودة'"
                    @click.stop="completeDraft(item.id)"
                  >
                    <v-icon size="20">mdi-check</v-icon>
                  </v-btn>
                </span>
              </template>
            </v-tooltip>
            <v-btn
              size="small"
              variant="text"
              color="error"
              icon
              :disabled="!canDelete"
              title="حذف المسودة"
              @click.stop="deleteSale(item.id)"
            >
              <v-icon size="20">mdi-delete</v-icon>
            </v-btn>
          </template>
        </template>
      </v-data-table>

      <PaginationControls
        :pagination="saleStore.pagination"
        @update:page="setPage"
        @update:items-per-page="setPageSize"
      />
    </v-card>

    <!-- Delete Sale Dialog -->
    <ConfirmDialog
      v-model="deleteSaleDialog"
      :title="selectedSaleForDelete?.status === 'draft' ? 'حذف المسودة' : 'إلغاء البيع'"
      :message="
        selectedSaleForDelete?.status === 'draft'
          ? 'هل أنت متأكد من حذف هذه المسودة؟'
          : 'هل أنت متأكد من رغبتك في إلغاء هذه المبيعات؟'
      "
      :details="selectedSaleForDelete ? `الفاتورة: ${selectedSaleForDelete.invoiceNumber}` : ''"
      type="error"
      confirm-text="نعم، تأكيد"
      cancel-text="إلغاء"
      @confirm="confirmDeleteSale"
      @cancel="deleteSaleDialog = false"
    />

    <!-- Restore Sale Dialog -->
    <ConfirmDialog
      v-model="restoreSaleDialog"
      title="استعادة البيع"
      message="هل أنت متأكد من رغبتك في استعادة هذه المبيعات؟"
      :details="selectedSaleForRestore ? `الفاتورة: ${selectedSaleForRestore.invoiceNumber}` : ''"
      type="info"
      confirm-text="نعم، استعادة"
      cancel-text="إلغاء"
      @confirm="confirmRestoreSale"
      @cancel="restoreSaleDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSaleStore } from '@/stores/sale';
import { useCustomerStore } from '@/stores/customer';
import { useAuthStore } from '../../stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import EmptyState from '@/components/EmptyState.vue';
import TableSkeleton from '@/components/TableSkeleton.vue';
import { priceTierLabel } from '@/utils/productUnits';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import PageHeader from '@/components/PageHeader.vue';
import SearchBar from '@/components/SearchBar.vue';
import AdvancedFilters from '@/components/AdvancedFilters.vue';
import MatchBadge from '@/components/MatchBadge.vue';
import { useServerSearch } from '@/composables/useServerSearch';
import { highlightSegments } from '@/utils/highlight';
import { formatCurrency } from '@/utils/formatters';
import { useExport } from '@/composables/useExport';
import { useFeatureGate } from '@/composables/useFeatureGate';
import { usePermissions } from '@/composables/usePermissions';
import { useNotificationStore } from '@/stores/notification';

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
const initialLoading = computed(() => tableLoading.value && saleStore.sales.length === 0);

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

const dismissError = () => {
  error.value = null;
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

// Installment-sale shortcut: same disabled-with-tooltip pattern.
const installmentsGate = useFeatureGate('installments', 'canUseInstallments');
const canUseInstallments = computed(() => installmentsGate.enabled.value);
const installmentsVisible = installmentsGate.visible;
const installmentsDisabled = installmentsGate.disabled;
const installmentsReason = installmentsGate.reason;

// "New sale" empty-state action is the installment-sale entry point — only
// surface it when installments are enabled AND the user can use them.
const emptyStateActions = computed(() => {
  if (!canUseInstallments.value) return [];
  return [{ text: 'بيع جديد', icon: 'mdi-plus', to: '/sales/new', color: 'primary' }];
});

const deleteSaleDialog = ref(false);
const restoreSaleDialog = ref(false);
const selectedSaleForDelete = ref(null);
const selectedSaleForRestore = ref(null);

const { exportToCSV } = useExport();
const notificationStore = useNotificationStore();

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

const hasActiveQuery = computed(() => !!query.value.trim() || filterChips.value.length > 0);

const headers = computed(() => [
  { title: 'رقم الفاتورة', key: 'invoiceNumber' },
  { title: 'العميل', key: 'customer' },
  { title: 'رقم الهاتف', key: 'customerPhone' },
  { title: 'المبلغ الإجمالي', key: 'total' },
  { title: 'نوع الدفع', key: 'paymentType' },
  // Price tier used on the invoice — only when the agentPricing feature is on.
  ...(agentPricingOn.value ? [{ title: 'نوع السعر', key: 'priceType', sortable: false }] : []),
  { title: 'الحالة', key: 'status' },
  { title: 'التاريخ', key: 'createdAt' },
  { title: 'بواسطة', key: 'createdBy', sortable: false },
  { title: 'الفرع', key: 'branch', sortable: false },
  { title: 'الاجرائات', key: 'actions', sortable: false },
]);

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

const viewSale = (_event, { item }) => {
  if (item.status === 'draft') {
    router.push(draftRouteFor(item));
  } else {
    router.push({ name: 'SaleDetails', params: { id: item.id } });
  }
};

const deleteSale = async (id) => {
  // التحقق من نوع العملية (مسودة أو بيع عادي)
  const sale = saleStore.sales.find((s) => s.id === id);

  selectedSaleForDelete.value = sale;
  deleteSaleDialog.value = true;
};

const confirmDeleteSale = async () => {
  const sale = selectedSaleForDelete.value;
  if (!sale) return;

  const isDraft = sale.status === 'draft';

  if (isDraft) {
    // حذف المسودة مباشرة
    try {
      await saleStore.removeSale(sale.id);
      refresh();
      deleteSaleDialog.value = false;
    } catch {
      // Error handled by store
    }
  } else {
    // إلغاء البيع العادي
    try {
      await saleStore.cancelSale(sale.id);
      refresh();
      deleteSaleDialog.value = false;
    } catch {
      // Error handled by store
    }
  }
};

const restoreSale = async (id) => {
  const sale = saleStore.sales.find((s) => s.id === id);
  selectedSaleForRestore.value = sale;
  restoreSaleDialog.value = true;
};

const confirmRestoreSale = async () => {
  const sale = selectedSaleForRestore.value;
  if (!sale) return;

  try {
    await saleStore.restoreSale(sale.id);
    refresh();
    restoreSaleDialog.value = false;
  } catch {
    // Error handled by store
  }
};

const completeDraft = async (id) => {
  const sale = saleStore.sales.find((s) => s.id === id);
  if (!sale) return;
  router.push(draftRouteFor(sale));
};

const handleExport = () => {
  try {
    const exportHeaders = headers.value.map((h) => ({
      title: h.title,
      key: h.key,
      value: (item) => {
        if (h.key === 'total') return formatCurrency(item.total, item.currency);
        if (h.key === 'status') return getStatusText(item.status);
        if (h.key === 'paymentType') return getPaymentTypeText(item.paymentType);
        if (h.key === 'priceType') return priceTierLabel(item.priceType);
        if (h.key === 'createdAt') return toYmd(item.createdAt);
        return item[h.key] || '';
      },
    }));
    exportToCSV(saleStore.sales, exportHeaders, 'sales.csv');
    notificationStore.success('تم تصدير البيانات بنجاح');
  } catch {
    notificationStore.error('فشل تصدير البيانات');
  }
};

// دالة البحث المخصصة: البحث بالاسم أو رقم الهاتف
const customFilter = (itemText, queryText, item) => {
  const query = queryText.toLowerCase();
  const name = item.raw.name?.toLowerCase() || '';
  const phone = item.raw.phone?.toLowerCase() || '';
  return name.includes(query) || phone.includes(query);
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
