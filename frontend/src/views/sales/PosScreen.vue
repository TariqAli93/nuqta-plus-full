<template>
  <!--
    ╔══════════════════════════════════════════════════════════════════════╗
    ║  POS — نقطة البيع                                                      ║
    ║  Two responsive zones: المنتجات (left/main) + السلة (right/drawer).    ║
    ║  Desktop/tablet → side-by-side grid. Mobile → cart slides in as an     ║
    ║  off-canvas drawer with a sticky checkout bar.                         ║
    ║  Business logic (pricing, discounts, tax, units, drafts, period gate,  ║
    ║  permissions) is untouched — this is a presentation rebuild only.      ║
    ╚══════════════════════════════════════════════════════════════════════╝
  -->
  <v-alert
    v-if="!hasActivePeriod"
    type="warning"
    variant="tonal"
    density="comfortable"
    border="start"
    class="mb-3"
  >
    <div class="d-flex align-center justify-space-between flex-wrap ga-3">
      <div>
        <div class="text-subtitle-2 font-weight-bold">{{ periodDialogTitle }}</div>
        <div class="text-body-2">{{ shiftBlockReason }}</div>
      </div>
      <v-btn color="warning" variant="flat" size="small" :to="shiftBlockAction.to">
        {{ shiftBlockAction.label }}
      </v-btn>
    </div>
  </v-alert>
  <div class="pos" :class="{ 'pos--drawer': isMobile, 'pos--cart-open': cartOpen }" dir="rtl">
    <!-- Products zone -->
    <v-card class="pos__panel pos__products" flat aria-label="المنتجات">
      <PosToolbar
        v-model:search-input="searchInput"
        v-model:selected-category="selectedCategory"
        v-model:hide-expired="hideExpired"
        v-model:hide-not-available="hideNotAvailable"
        :category-options="categoryOptions"
        :agent-pricing-on="agentPricingOn"
        :price-type="priceType"
        :price-tiers="PRICE_TIERS"
        :focus-request="searchFocusRequest"
        @search-enter="onSearchEnter"
        @focus-first-card="focusFirstCard"
        @set-price-type="setPriceType"
      />

      <ProductGrid
        v-model:products-per-page="productsPerPage"
        v-model:product-page="productPage"
        :loading-products="loadingProducts"
        :filtered-products="filteredProducts"
        :paginated-products="paginatedProducts"
        :debounced-search="debouncedSearch"
        :selected-category="selectedCategory"
        :per-page-options="PER_PAGE_OPTIONS"
        :page-range-start="pageRangeStart"
        :page-range-end="pageRangeEnd"
        :total-product-pages="totalProductPages"
        :is-mobile="isMobile"
        :available-of="availableOf"
        :is-service="isService"
        :is-sellable="isSellable"
        :stock-status-of="stockStatusOf"
        :expiry-status-of="expiryStatusOf"
        :expiry-color="expiryColor"
        :placeholder-style="placeholderStyle"
        :focus-request="gridFocusRequest"
        @add-product="addProduct"
      />
    </v-card>

    <!-- Cart zone -->
    <CartPanel
      :cart-open="cartOpen"
      :is-mobile="isMobile"
      :item-count="itemCount"
      :drafts-reason="draftsReason"
      :drafts-disabled="draftsDisabled"
      :drafts-visible="draftsVisible"
      :current-draft-id="currentDraftId"
      :continuing-draft-id="continuingDraftId"
      :items="items"
      :flash-item-id="flashItemId"
      :currency="currency"
      :can-edit-price="canEditPrice"
      :is-line-discount-capped="isLineDiscountCapped"
      :applied-line-discount="appliedLineDiscount"
      :line-subtotal="lineSubtotal"
      :cart-expiry-warning="cartExpiryWarning"
      :is-service="isService"
      :total="total"
      :subtotal="subtotal"
      :applied-discount="appliedDiscount"
      :tax-value="taxValue"
      :discount-capped="discountCapped"
      :payment="payment"
      :payment-methods="paymentMethods"
      :change-state-class="changeStateClass"
      :change-label="changeLabel"
      :change-amount="changeAmount"
      :sale-discount="saleDiscount"
      :tax="tax"
      :sale-notes="saleNotes"
      :quick-amounts="quickAmounts"
      :numpad-keys="numpadKeys"
      :submitting="submitting"
      :has-active-period="hasActivePeriod"
      :can-submit="canSubmit"
      :item-discount-capped="itemDiscountCapped"
      @close-cart="cartOpen = false"
      @open-drafts-list="openDraftsList"
      @confirm-clear="confirmClear"
      @open-line-edit="openLineEdit"
      @remove-item="removeItem"
      @update-line-unit="updateLineUnit"
      @update-price="updatePrice"
      @dec-qty="decQty"
      @commit-qty="commitQty"
      @inc-qty="incQty"
      @method-change="onMethodChange"
      @update-payment-reference="payment.reference = $event"
      @update-sale-discount-value="saleDiscount.value = Number($event) || 0"
      @update-sale-discount-type="saleDiscount.type = $event"
      @update-tax-value="tax.value = Number($event) || 0"
      @update-tax-enabled="tax.enabled = $event"
      @update-sale-notes="saleNotes = $event"
      @add-to-paid="addToPaid"
      @numpad="onNumpad"
      @hold="onHold"
      @checkout="checkout"
    />

    <!-- ═══════════════════ Mobile bits ═══════════════════ -->
    <!-- Backdrop behind the drawer -->
    <v-fade-transition>
      <div v-if="isMobile && cartOpen" class="pos__backdrop" @click="cartOpen = false" />
    </v-fade-transition>

    <!-- Sticky bottom bar (mobile, cart closed): live count + total, opens the
         cart where payment is completed. The catalogue stays visible while the
         cashier keeps scanning/tapping — the bar just reflects the running cart. -->
    <div v-if="isMobile && !cartOpen" class="pos__bottombar">
      <v-btn
        class="pos__bottombar-cart"
        color="primary"
        variant="flat"
        size="large"
        block
        append-icon="mdi-chevron-up"
        @click="cartOpen = true"
      >
        <v-badge :content="itemCount" :model-value="itemCount > 0" color="error" class="me-3">
          <v-icon size="22">mdi-cart-variant</v-icon>
        </v-badge>
        <span>عرض السلة</span>
        <v-spacer />
        <span class="font-weight-bold">{{ formatMoney(total, currency) }}</span>
      </v-btn>
    </div>

    <!-- ═══════════════════ Overlays / dialogs ═══════════════════ -->
    <LineEditDialog
      v-model="lineEditOpen"
      :item="lineEditItem"
      :draft="lineEditDraft"
      :currency="currency"
      @update-draft-discount="lineEditDraft.discount = Number($event) || 0"
      @update-draft-note="lineEditDraft.note = $event"
      @save="saveLineEdit"
    />

    <ConfirmDialog
      v-model="clearDialog"
      title="تفريغ السلة"
      message="هل تريد إزالة كل المنتجات من السلة؟"
      type="warning"
      confirm-text="تفريغ"
      cancel-text="إلغاء"
      @confirm="clear"
    />

    <DraftsDialog
      v-model="draftsOpen"
      v-model:drafts-search="draftsSearch"
      :drafts-loading="draftsLoading"
      :draft-list="draftList"
      :drafts-error="draftsError"
      :filtered-drafts="filteredDrafts"
      :continuing-draft-id="continuingDraftId"
      :deleting-draft-id="deletingDraftId"
      :format-draft-date="formatDraftDate"
      @load-drafts="loadDrafts"
      @continue-draft="continueDraft"
      @ask-delete-draft="askDeleteDraft"
    />

    <ConfirmDialog
      v-model="draftDeleteDialog"
      title="حذف المسودة"
      :message="
        draftPendingDelete
          ? `هل تريد حذف المسودة ${draftPendingDelete.invoiceNumber || '#' + draftPendingDelete.id}؟`
          : ''
      "
      type="warning"
      confirm-text="حذف"
      cancel-text="إلغاء"
      @confirm="confirmDeleteDraft"
    />

    <ConfirmDialog
      v-model="draftReplaceDialog"
      title="استبدال السلة الحالية"
      message="السلة الحالية تحتوي عناصر. هل تريد تفريغها وتحميل المسودة؟"
      type="warning"
      confirm-text="استبدال"
      cancel-text="إلغاء"
      @confirm="confirmReplaceWithDraft"
    />

    <!-- Blocking dialog: period-gated action attempted without an open period. -->
    <v-dialog v-model="mustOpenPeriodDialog" max-width="460">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="warning">mdi-book-alert-outline</v-icon>
          <span>{{ periodDialogTitle }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <p class="text-body-1 mb-2">لا يمكن إتمام عمليات البيع قبل فتح قيد محاسبي.</p>
          <p class="text-body-2 text-medium-emphasis mb-0">{{ shiftBlockReason }}</p>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="mustOpenPeriodDialog = false">إغلاق</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            prepend-icon="mdi-book-plus-outline"
            @click="goToPeriodFix"
          >
            {{ shiftBlockAction.label }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter, useRoute, isNavigationFailure } from 'vue-router';
import { useDisplay } from 'vuetify';
import {
  useProductStore,
  useCategoryStore,
  useInventoryStore,
  useSettingsStore,
  useNotificationStore,
  useSaleStore,
} from '@/stores';
import { useAccountingPeriodStore } from '@/stores/accountingPeriod';
import { useAuthStore } from '@/stores/auth';
import { usePosCart } from '@/composables/usePosCart';
import { useFeatureGate } from '@/composables/useFeatureGate';
import { usePermissions } from '@/composables/usePermissions';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import PosToolbar from '@/components/pos/PosToolbar.vue';
import ProductGrid from '@/components/pos/ProductGrid.vue';
import CartPanel from '@/components/pos/CartPanel.vue';
import DraftsDialog from '@/components/pos/DraftsDialog.vue';
import LineEditDialog from '@/components/pos/LineEditDialog.vue';
import api from '@/plugins/axios';
import { formatCurrency as formatMoney } from '@/utils/formatters';
import { PRICE_TIERS } from '@/utils/productUnits';
import '@/components/pos/pos.scss';

// ── Stores ──────────────────────────────────────────────────────────────────
const productStore = useProductStore();
const categoryStore = useCategoryStore();
const inventoryStore = useInventoryStore();
const settingsStore = useSettingsStore();
const notify = useNotificationStore();
const saleStore = useSaleStore();
const accountingPeriodStore = useAccountingPeriodStore();
const authStore = useAuthStore();

// Capability-driven UI: the "save as draft" button is only meaningful when
// the draftInvoices module is enabled AND the user has the capability.
// We split the check so that users who hold the capability still see the
// button — disabled with a tooltip — when only the feature flag is off.
const draftsGate = useFeatureGate('draftInvoices', 'canUseDraftInvoices');
const canUseDrafts = computed(() => draftsGate.enabled.value);
const draftsVisible = draftsGate.visible;
const draftsDisabled = draftsGate.disabled;
const draftsReason = draftsGate.reason;
const router = useRouter();
const route = useRoute();

// Tracks the draft id we resumed from, so checkout can complete it instead of
// creating a brand-new sale (and leaving the draft orphaned in the DB).
const currentDraftId = ref(null);

// Selling is gated by the accounting period only (shifts were removed).
const accountingPeriodsEnabled = computed(
  () => authStore.hasFeature?.('accountingPeriods') === true
);
const multiBranchEnabled = computed(() => authStore.hasFeature?.('multiBranch') === true);
// Wholesale/agent price tiers (تسعير الوكلاء) — gates the price-type selector.
const agentPricingOn = computed(() => authStore.hasFeature?.('agentPricing') === true);
const currentBranchId = computed(
  () => inventoryStore.selectedBranchId || authStore.assignedBranchId || null
);
const activeAccountingPeriod = computed(() => accountingPeriodStore.current);

// In branch mode the open period must belong to the selected branch; in single
// mode any open (global) period suffices.
const hasOpenPeriodForBranch = computed(() => {
  const p = activeAccountingPeriod.value;
  if (!p) return false;
  if (multiBranchEnabled.value) {
    return Number(p.branchId) === Number(currentBranchId.value);
  }
  return true;
});

// "POS may proceed (period-wise)." The accounting-period requirement is GATED
// by the feature flag (matches the backend):
//   - feature OFF → legacy POS: no period needed, nothing is blocked.
//   - feature ON  → a usable OPEN period for this scope is required to open a
//     shift or sell (the period is the root container).
const hasActivePeriod = computed(
  () => !accountingPeriodsEnabled.value || hasOpenPeriodForBranch.value
);

// The specific Arabic reason selling is blocked ('' when it can proceed).
const shiftBlockReason = computed(() => {
  if (!accountingPeriodsEnabled.value) return 'نظام القيد المحاسبي غير مفعّل.';
  if (!activeAccountingPeriod.value) return 'لا يوجد قيد محاسبي مفتوح — افتح قيداً أولاً.';
  if (
    multiBranchEnabled.value &&
    Number(activeAccountingPeriod.value.branchId) !== Number(currentBranchId.value)
  ) {
    return 'لا يوجد قيد محاسبي مفتوح لهذا الفرع.';
  }
  return '';
});

// Where the banner / dialog call-to-action points: enable the system (settings)
// vs open a new period (المالية → القيود المحاسبية → فتح قيد جديد).
const shiftBlockAction = computed(() =>
  !accountingPeriodsEnabled.value
    ? { label: 'الانتقال إلى الإعدادات', to: { name: 'Settings' } }
    : { label: 'فتح قيد جديد', to: { name: 'AccountingPeriods' } }
);
const periodDialogTitle = computed(() =>
  !accountingPeriodsEnabled.value ? 'نظام القيد المحاسبي غير مفعل' : 'يجب فتح قيد محاسبي'
);

// The blocking dialog. Opened whenever a period-gated action is attempted
// without a usable open period; its action navigates to the fix.
const mustOpenPeriodDialog = ref(false);
const ensureActivePeriodOrWarn = () => {
  if (hasActivePeriod.value) return true;
  mustOpenPeriodDialog.value = true;
  return false;
};
const goToPeriodFix = () => {
  mustOpenPeriodDialog.value = false;
  router.push(shiftBlockAction.value.to);
};

// Timer handle for the open-period poll (cleared on unmount).
let periodPollTimer = null;
const refreshCurrentAccountingPeriod = async () => {
  if (!accountingPeriodsEnabled.value) {
    accountingPeriodStore.current = null; // drop stale state when the system is off
    return;
  }
  await accountingPeriodStore.fetchCurrent(currentBranchId.value || undefined).catch(() => {});
};

// Drawer mode (cart slides over content) for small screens; md+ is side-by-side.
const { smAndDown: isMobile } = useDisplay();

// ── Cart composable ────────────────────────────────────────────────────────
// Day-to-day POS: no customer, no instalments — anonymous cash/card sales.
const {
  currency,
  items,
  saleDiscount,
  tax,
  payment,
  submitting,

  subtotal,
  appliedDiscount,
  discountCapped,
  isLineDiscountCapped,
  appliedLineDiscount,
  itemDiscountCapped,
  taxValue,
  total,
  change,
  remaining,
  itemCount,
  canSubmit,
  lineSubtotal,
  priceType,
  // Invoice-level note (ملاحظة الفاتورة) — bound to the field in the cart footer
  // and sent inside the checkout payload by buildPayload().
  notes: saleNotes,

  addItem,
  removeItem,
  updateQty,
  incQty,
  decQty,
  updatePrice,
  updateLineDiscount,
  updateLineNote,
  updateLineUnit,
  setPriceType,
  clear,
  applyExact,
  addToPaid,
  setPaid,
  submit,
  holdAsDraft,
  loadDraft,
} = usePosCart();

// Manual per-line price editing is gated by the same permission NewSale uses,
// so a cashier without it sees read-only prices and can't undercharge.
const { can } = usePermissions();
const canEditPrice = computed(() => can('sales:edit_price'));

// ── Local UI state ─────────────────────────────────────────────────────────
const searchInput = ref('');
const debouncedSearch = ref('');
const selectedCategory = ref(null);
const products = ref([]);
const expiryAlerts = ref([]);
const categories = ref([]);
const loadingProducts = ref(false);
const cartOpen = ref(false);
const clearDialog = ref(false);
const hideExpired = ref(false);

// Numpad: a free-typed string we own as the source of truth for the readout.
// Sync to/from payment.paidAmount so applyExact / addToPaid still drive it.
const paidInput = ref('');

watch(
  () => payment.paidAmount,
  (v) => {
    const cur = parseFloat(paidInput.value);
    if (Number.isFinite(cur) && cur === Number(v)) return;
    paidInput.value = Number(v) > 0 ? String(v) : '';
  }
);

// Per-line edit dialog state
const lineEditOpen = ref(false);
const lineEditItem = ref(null);
const lineEditDraft = reactive({ discount: 0, note: '' });

// ── Drafts list dialog state ─────────────────────────────────────────────
// Listing is restricted to POS-compatible (cash) drafts; installment drafts
// stay handled by NewSale.vue and never appear here.
const draftsOpen = ref(false);
const draftsLoading = ref(false);
const draftsError = ref('');
const draftList = ref([]);
const draftsSearch = ref('');
const continuingDraftId = ref(null);
const deletingDraftId = ref(null);
const draftDeleteDialog = ref(false);
const draftPendingDelete = ref(null);
const draftReplaceDialog = ref(false);
const draftPendingLoad = ref(null);

// Flash effect: highlights a cart line when it's newly added or its qty grew —
// gives the cashier positive confirmation that their click/scan landed.
const flashItemId = ref(null);
const lastLineQty = new Map();
let flashTimer = null;

watch(
  items,
  (curr) => {
    let flashId = null;
    for (const it of curr) {
      const prevQty = lastLineQty.get(it.id);
      if (prevQty === undefined || it.qty > prevQty) flashId = it.id;
    }
    lastLineQty.clear();
    for (const it of curr) lastLineQty.set(it.id, it.qty);

    if (flashId) {
      flashItemId.value = flashId;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        if (flashItemId.value === flashId) flashItemId.value = null;
      }, 900);
    }
  },
  { deep: true, flush: 'post' }
);

const searchFocusRequest = ref(0);
const gridFocusRequest = ref(0);

let searchTimer = null;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    debouncedSearch.value = (v || '').trim().toLowerCase();
  }, 120);
});

// ── Payment UI config ──────────────────────────────────────────────────────
const paymentMethods = [
  { value: 'cash', label: 'نقداً', icon: 'mdi-cash' },
  { value: 'card', label: 'بطاقة', icon: 'mdi-credit-card-outline' },
];

const quickAmounts = computed(() =>
  currency.value === 'USD' ? [1, 5, 10, 20, 50, 100] : [1000, 5000, 10000, 25000, 50000]
);

// Numpad keys depend on currency: IQD gets "00" instead of "."
const numpadKeys = computed(() => {
  const digits = ['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((v) => ({
    value: v,
    label: v,
  }));
  const last =
    currency.value === 'USD'
      ? [
          { value: '.', label: '.' },
          { value: '0', label: '0' },
          { value: 'back', icon: 'mdi-backspace-outline', aria: 'مسح حرف' },
        ]
      : [
          { value: '00', label: '00' },
          { value: '0', label: '0' },
          { value: 'back', icon: 'mdi-backspace-outline', aria: 'مسح حرف' },
        ];
  return [...digits, ...last];
});

const onNumpad = (key) => {
  if (key === 'clear') {
    paidInput.value = '';
    setPaid(0);
    return;
  }
  if (key === 'back') {
    paidInput.value = paidInput.value.slice(0, -1);
    setPaid(parseFloat(paidInput.value) || 0);
    return;
  }
  if (key === '.') {
    if (paidInput.value.includes('.')) return;
    paidInput.value = paidInput.value ? paidInput.value + '.' : '0.';
    return; // no setPaid yet — trailing dot doesn't change numeric value
  }
  if (key === '00') {
    if (!paidInput.value) return; // skip leading zeros
    paidInput.value += '00';
    setPaid(parseFloat(paidInput.value) || 0);
    return;
  }
  // Digit
  paidInput.value = (paidInput.value || '') + key;
  setPaid(parseFloat(paidInput.value) || 0);
};

// Card sales are normally paid in full at point of swipe — auto-fill exact
// when the cashier switches to card so they don't have to re-type.
const onMethodChange = (m) => {
  if (!m) return; // mandatory toggle never emits null, but guard anyway
  payment.method = m;
  if (m === 'card' && total.value > 0 && payment.paidAmount !== total.value) {
    applyExact();
  }
};

// ── Derived product helpers ────────────────────────────────────────────────
const availableOf = (p) => Number(p?.warehouseStock ?? p?.totalStock ?? p?.stock ?? 0) || 0;

// Service products are never stocked — they are always sellable and never
// blocked by an availability check.
const isService = (p) => p?.productType === 'service';
// A product is sellable when it's a service (no stock gate) or has stock.
const hideNotAvailable = ref(false);
const isSellable = (p) => isService(p) || availableOf(p) > 0;

// Stock-status badge: a label + color + icon for the product card.
//   service → خدمة, out → نفذ, at/below threshold → منخفض, else → متوفر.
const stockStatusOf = (p) => {
  if (isService(p)) return { label: 'خدمة', color: 'secondary', icon: 'mdi-wrench-outline' };
  const q = availableOf(p);
  if (q <= 0) return { label: 'نفذ', color: 'error', icon: 'mdi-close-circle-outline' };
  const threshold =
    p.lowStockThreshold && p.lowStockThreshold > 0 ? p.lowStockThreshold : p.minStock || 0;
  if (q <= threshold) return { label: 'منخفض', color: 'warning', icon: 'mdi-alert-outline' };
  return { label: 'متوفر', color: 'success', icon: 'mdi-check-circle-outline' };
};

// Deterministic two-tone gradient per product so placeholders look varied but
// stay stable across renders (seeded by id, falling back to the name length).
const placeholderStyle = (p) => {
  const seed = Number(p?.id) || String(p?.name || '').length || 1;
  const hue = (seed * 47) % 360;
  return {
    '--ph-from': `hsl(${hue}, 52%, 50%)`,
    '--ph-to': `hsl(${(hue + 38) % 360}, 56%, 38%)`,
  };
};

// Shared search predicate — reused by the live grid filter and Enter handler so
// both stay perfectly in sync (barcode / SKU / name, case-insensitive).
const productMatchesTerm = (p, q) =>
  (p.name || '').toLowerCase().includes(q) ||
  (p.sku || '').toLowerCase().includes(q) ||
  (p.barcode || '').toLowerCase().includes(q);

const filteredProducts = computed(() => {
  const q = debouncedSearch.value;
  const catId = selectedCategory.value;

  return products.value.filter((p) => {
    // إخفاء المنتهي
    if (hideExpired.value && expiryStatusOf(p) === 'منتهي') {
      return false;
    }

    // إخفاء غير المتوفر (الخدمات لا تُخفى)
    if (hideNotAvailable.value && !isService(p) && availableOf(p) <= 0) {
      return false;
    }

    // التصنيف
    if (catId != null && p.categoryId !== catId) {
      return false;
    }

    // البحث
    if (q && !productMatchesTerm(p, q)) {
      return false;
    }

    return true;
  });
});

// ── Pagination (products area only) ────────────────────────────────────────
// The full catalogue is filtered client-side above (filteredProducts); we then
// page that result so the grid only ever mounts ONE page of cards no matter how
// large the catalogue is. The business/filter logic is untouched — this just
// slices the already-computed list for display.
const PER_PAGE_OPTIONS = [20, 40, 60, 100];
const productPage = ref(1);
const productsPerPage = ref(40);

const totalProductPages = computed(() =>
  Math.max(1, Math.ceil(filteredProducts.value.length / productsPerPage.value))
);
const paginatedProducts = computed(() => {
  const start = (productPage.value - 1) * productsPerPage.value;
  return filteredProducts.value.slice(start, start + productsPerPage.value);
});

// 1-based "X–Y من Z" range for the footer (0 when there are no matches).
const pageRangeStart = computed(() =>
  filteredProducts.value.length ? (productPage.value - 1) * productsPerPage.value + 1 : 0
);
const pageRangeEnd = computed(() =>
  Math.min(productPage.value * productsPerPage.value, filteredProducts.value.length)
);

// A new search term, category, or page size always returns to page 1. Adding a
// product to the cart does NOT touch any of these, so the current page (and the
// search field's focus) stay put — exactly what a cashier scanning expects.
watch([debouncedSearch, selectedCategory, productsPerPage], () => {
  productPage.value = 1;
});
// Defensive clamp: if the filtered set shrinks below the current page (e.g.
// toggling "إخفاء المنتهي"), snap back into range instead of showing a blank page.
watch(totalProductPages, (pages) => {
  if (productPage.value > pages) productPage.value = pages;
});
const expiryByProductWarehouse = computed(() => {
  const map = new Map();
  for (const row of expiryAlerts.value || []) {
    const key = `${row.productId}:${row.warehouseId}`;
    const cur = map.get(key);
    if (!cur || (row.expiryDate && (!cur.nearestExpiry || row.expiryDate < cur.nearestExpiry))) {
      map.set(key, row);
    }
  }
  return map;
});

const expiryInfoOf = (p) =>
  expiryByProductWarehouse.value.get(`${p.id}:${inventoryStore.selectedWarehouseId || ''}`) || null;
const expiryStatusOf = (p) => {
  if (!p?.tracksExpiry) return 'بدون تاريخ انتهاء';
  const status = expiryInfoOf(p)?.status;
  if (!status) return 'صالح';
  if (
    status === 'ينتهي خلال 7 أيام' ||
    status === 'ينتهي خلال 30 يوم' ||
    status === 'ينتهي خلال 60 يوم'
  )
    return 'ينتهي قريباً';
  if (status === 'منتهي') return 'منتهي';
  return 'صالح';
};
const expiryColor = (status) => {
  if (status === 'منتهي') return 'error';
  if (status === 'ينتهي قريباً') return 'warning';
  if (status === 'بدون تاريخ انتهاء') return 'grey';
  return 'success';
};

const categoriesWithCounts = computed(() => {
  const counts = new Map();
  for (const p of products.value) {
    if (p.categoryId == null) continue;
    counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
  }
  return categories.value
    .map((c) => ({ ...c, count: counts.get(c.id) || 0 }))
    .filter((c) => c.count > 0);
});

// Category select options: an explicit "الكل" entry (value null) plus every
// non-empty category with its live product count.
const categoryOptions = computed(() => [
  { title: 'كل التصنيفات', value: null },
  ...categoriesWithCounts.value.map((c) => ({ title: `${c.name} (${c.count})`, value: c.id })),
]);

// ── Payment derivations ────────────────────────────────────────────────────
const changeAmount = computed(() => (change.value > 0 ? change.value : remaining.value));
const changeLabel = computed(() => {
  if (change.value > 0) return 'الباقي';
  if (remaining.value > 0) return 'المستحق';
  return 'التعادل';
});
const changeStateClass = computed(() => {
  if (change.value > 0) return 'is-success';
  if (remaining.value > 0) return 'is-error';
  if (payment.paidAmount > 0) return 'is-neutral';
  return '';
});

// ── Formatting ─────────────────────────────────────────────────────────────
// Currency formatting is centralized in '@/utils/formatters' (imported above
// as formatMoney). All call sites pass the relevant currency explicitly.

// ── Data load ──────────────────────────────────────────────────────────────
const loadProducts = async () => {
  loadingProducts.value = true;
  try {
    const response = await productStore.fetch({
      limit: 1000,
      warehouseId: inventoryStore.selectedWarehouseId || undefined,
    });
    products.value = response?.data || [];
    try {
      expiryAlerts.value =
        (await inventoryStore.fetchExpiryAlerts({
          warehouseId: inventoryStore.selectedWarehouseId || undefined,
        })) || [];
    } catch {
      expiryAlerts.value = [];
    }
  } finally {
    loadingProducts.value = false;
  }
};

const loadCategories = async () => {
  try {
    const response = await categoryStore.fetchCategories();
    categories.value = response?.data || [];
  } catch {
    categories.value = [];
  }
};

watch(() => inventoryStore.selectedWarehouseId, loadProducts);

// ── Cart interactions ──────────────────────────────────────────────────────
const addProduct = (product) => {
  // Services bypass every stock/expiry gate — they have no inventory.
  if (isService(product)) {
    addItem(product);
    return;
  }
  if (expiryStatusOf(product) === 'منتهي') {
    notify.warning('لا توجد كمية صالحة للبيع لهذا المنتج');
    return;
  }
  if (availableOf(product) <= 0) return;
  addItem(product);
};

const cartExpiryWarning = (item) => {
  const p = products.value.find((x) => x.id === item.id || x.id === item.productId);
  if (!p) return '';
  const status = expiryStatusOf(p);
  if (status === 'ينتهي قريباً') return 'ينتهي قريباً — تحقق من الصلاحية قبل البيع';
  if (status === 'منتهي') return 'الكمية الصالحة للبيع غير كافية';
  return '';
};

const commitQty = (id, raw) => {
  updateQty(id, raw);
};

// Reset the unified field and re-focus it, ready for the next scan/search.
const resetSearch = () => {
  searchInput.value = '';
  debouncedSearch.value = '';
  clearTimeout(searchTimer);
  searchFocusRequest.value += 1;
};

// Unified search + barcode entry (one field). Pressing Enter:
//   1) resolves an exact barcode / SKU — including per-unit barcodes so that
//      scanning a carton auto-selects the carton unit (legacy barcode flow);
//   2) otherwise, if the live filter narrowed to a single product, adds it;
//   3) otherwise, if nothing matched at all, tells the cashier the code is
//      unknown. A term that matches many products simply stays as a filter.
const onSearchEnter = () => {
  const code = (searchInput.value || '').trim();
  if (!code) return;

  // 1) Exact barcode / SKU (product- or unit-level). Reads `products` directly
  //    so a fast scanner never waits on the debounced text filter.
  let unitMatch = null;
  const productByUnitBarcode = products.value.find((p) => {
    const unit = (p.units || []).find((u) => u.barcode && u.barcode === code);
    if (unit) {
      unitMatch = unit;
      return true;
    }
    return false;
  });
  const exact =
    productByUnitBarcode || products.value.find((p) => p.barcode === code || p.sku === code);
  if (exact) {
    addItem(exact, 1, unitMatch || null);
    resetSearch();
    return;
  }

  // 2) Live text match — recomputed here (not via the debounced computed) so
  //    Enter is correct even immediately after the last keystroke.
  const q = code.toLowerCase();
  const base = hideExpired.value
    ? products.value.filter((p) => expiryStatusOf(p) !== 'منتهي')
    : products.value;
  const matches = base.filter((p) => {
    if (selectedCategory.value != null && p.categoryId !== selectedCategory.value) return false;
    return productMatchesTerm(p, q);
  });

  if (matches.length === 1) {
    addProduct(matches[0]);
    resetSearch();
    return;
  }

  // 3) Unknown code with no matches — most likely a scan of an absent product.
  if (matches.length === 0) {
    notify.error('لا يوجد منتج بهذا الرمز');
  }
};

const openLineEdit = (item) => {
  lineEditItem.value = item;
  lineEditDraft.discount = Number(item.discount) || 0;
  lineEditDraft.note = String(item.note || '');
  lineEditOpen.value = true;
};

const saveLineEdit = () => {
  const item = lineEditItem.value;
  if (!item) return;
  updateLineDiscount(item.id, lineEditDraft.discount);
  updateLineNote(item.id, lineEditDraft.note);
  lineEditOpen.value = false;
};

// Resolve the new sale's id from whatever shape the API/store hands back so a
// renamed field (id / saleId / invoiceId, or an extra {sale|data} wrapper) can
// never silently break the redirect.
const resolveSaleId = (sale) =>
  sale?.id ?? sale?.saleId ?? sale?.invoiceId ?? sale?.sale?.id ?? sale?.data?.id ?? null;

// Navigate without ever leaking an unhandled rejection: a redundant/aborted
// navigation (NavigationFailure) is benign, anything else is logged + toasted
// while the app stays interactive (no silent freeze on the way to the invoice).
const safePushToSale = async (saleId) => {
  try {
    console.log('[POS] navigating to SaleDetails with id:', saleId);
    await router.push({ name: 'SaleDetails', params: { id: String(saleId) } });
  } catch (err) {
    if (isNavigationFailure(err)) return; // duplicated / aborted — not a real error
    console.error('[POS] navigation to SaleDetails failed:', err);
    notify.error('تم حفظ البيع، لكن تعذّر فتح صفحة الفاتورة');
  }
};

const checkout = async () => {
  // Re-entrancy guard: a double click / repeated F9 must not fire two sales.
  if (submitting.value) return;
  if (!canSubmit.value) return;
  // No usable open accounting period → block the sale (backend rejects too) and
  // point the cashier at opening a period. This is the root container check.
  if (!ensureActivePeriodOrWarn()) return;

  // 1) Persist the sale. `submit()` owns the `submitting` flag (set true here,
  //    reset in its own finally), so the button never stays stuck on failure.
  let sale = null;
  try {
    console.log('[POS] checkout → submitting sale');
    sale = await submit();
    console.log('[POS] checkout → sale API response:', sale);
  } catch (err) {
    // Hard failure (network / validation / server) — nothing was created. Keep
    // the cart intact so the cashier can retry, and stay on the POS screen.
    console.error('[POS] checkout → submit failed:', err);
    notify.error(err?.message || 'فشل إتمام البيع');
    return;
  }

  // `submit()` returns null when it bailed client-side (e.g. blocked) — no sale
  // was created, so leave POS state untouched.
  if (!sale) return;

  // 2) The sale SUCCEEDED. From here every step is isolated so a failure in one
  //    (draft cleanup, navigation) can't abort the others or wedge the screen.
  if (currentDraftId.value) {
    try {
      await saleStore.removeSale(currentDraftId.value);
    } catch (e) {
      console.error('[POS] failed to clean up resumed draft (non-fatal):', e);
    }
    currentDraftId.value = null;
  }

  const saleId = resolveSaleId(sale);
  console.log('[POS] checkout → resolved saleId:', saleId);

  // 3) Reset sensitive POS state ONLY now that the sale is confirmed saved.
  notify.success('تم حفظ البيع بنجاح');
  clear(); // cart + customer + notes + discount + tax + payment method/amount
  paidInput.value = '';
  cartOpen.value = false;

  // 4) Navigate only with a valid id. If none came back, the sale is still
  //    safe (it's in the list) — keep the app usable instead of pushing to a
  //    broken /sales/undefined route.
  if (saleId == null) {
    console.warn('[POS] sale saved but no id resolved — staying on POS');
    return;
  }
  console.log('[POS] checkout → navigating to SaleDetails', saleId);
  await safePushToSale(saleId);
};

const onHold = async () => {
  if (submitting.value) return; // don't fork a second draft on a double click
  // Holding an invoice is a write inside the period — gate it the same way.
  if (!ensureActivePeriodOrWarn()) return;
  try {
    // Resuming an existing draft? Drop the old row first so we don't fork it
    // into two competing drafts when the cashier saves again.
    if (currentDraftId.value) {
      try {
        await saleStore.removeSale(currentDraftId.value);
      } catch (e) {
        console.error('Failed to remove previous draft:', e);
      }
      currentDraftId.value = null;
    }
    const draft = await holdAsDraft();
    if (draft) {
      notify.success('تم حفظ المسودة');
      clear();
      paidInput.value = '';
      cartOpen.value = false;
    }
  } catch (err) {
    notify.error(err?.message || 'فشل حفظ المسودة');
  }
};

const confirmClear = () => {
  clearDialog.value = true;
};

// ── Drafts list ──────────────────────────────────────────────────────────
// Display only cash/POS drafts. Installment drafts stay in NewSale.vue.
// Listing endpoint already enforces branch scope server-side, so we do not
// need to refilter by branch in the client.
const isPosCompatibleDraft = (d) => {
  if (!d || d.status !== 'draft') return false;
  const pt = String(d.paymentType || '').toLowerCase();
  return pt === '' || pt === 'cash';
};

const loadDrafts = async () => {
  if (!canUseDrafts.value) return;
  draftsLoading.value = true;
  draftsError.value = '';
  try {
    // Hit the API directly — the saleStore.fetch helper would clobber the
    // shared `sales` cache and surface a toast that we already render inline.
    const response = await api.get('/sales', {
      params: { status: 'draft', paymentType: 'cash', limit: 100 },
    });
    const rows = response?.data || [];
    // Defensive: re-filter client-side in case the backend returns
    // mixed/installment drafts (older data, race with API change, etc.).
    draftList.value = rows.filter(isPosCompatibleDraft);
  } catch (err) {
    // The axios interceptor rejects with either the response body or the
    // original error, so check both shapes for a usable message.
    console.error('Failed to load drafts:', err);
    draftsError.value = err?.message || err?.response?.data?.message || 'فشل تحميل المسودات';
    draftList.value = [];
  } finally {
    draftsLoading.value = false;
  }
};

const openDraftsList = () => {
  draftsOpen.value = true;
  loadDrafts();
};

const filteredDrafts = computed(() => {
  const q = (draftsSearch.value || '').trim().toLowerCase();
  if (!q) return draftList.value;
  return draftList.value.filter((d) => {
    const inv = String(d.invoiceNumber || '').toLowerCase();
    const cus = String(d.customer || '').toLowerCase();
    return inv.includes(q) || cus.includes(q);
  });
});

const formatDraftDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Hydrate the cart from a draft already loaded in the list. Mirrors the
// route-driven `hydrateFromDraft`, but works in-place from the modal so the
// cashier can switch drafts without leaving the screen.
const applyDraftToCart = async (draftRow) => {
  continuingDraftId.value = draftRow.id;
  try {
    const response = await saleStore.fetchSale(draftRow.id);
    const draft = response?.data?.data || response?.data || response || null;
    if (!draft || draft.status !== 'draft') {
      notify.error('المسودة غير صالحة');
      return;
    }
    if (!isPosCompatibleDraft(draft)) {
      // Installment / non-cash drafts must be edited in NewSale.
      notify.warning('هذه المسودة بالأقساط — تابعها من شاشة بيع جديد');
      return;
    }
    // Restore payment method/reference if available on the draft items list
    // record (paymentMethod is not on the sale row itself but the composable
    // restores cart-level fields; method defaults to 'cash' which matches POS).
    const ok = loadDraft(draft, products.value);
    if (!ok) {
      notify.error('تعذر تحميل المسودة');
      return;
    }
    currentDraftId.value = draft.id;
    paidInput.value = '';
    notify.success('تم تحميل المسودة');
    draftsOpen.value = false;
  } catch (err) {
    console.error('Failed to continue draft:', err);
    notify.error(err?.response?.data?.message || 'فشل تحميل المسودة');
  } finally {
    continuingDraftId.value = null;
  }
};

const continueDraft = (draftRow) => {
  if (!isPosCompatibleDraft(draftRow)) {
    notify.warning('مسودة غير متوافقة مع الـ POS');
    return;
  }
  if (items.length > 0) {
    // Don't silently clobber an in-progress cart — confirm first.
    draftPendingLoad.value = draftRow;
    draftReplaceDialog.value = true;
    return;
  }
  applyDraftToCart(draftRow);
};

const confirmReplaceWithDraft = async () => {
  const target = draftPendingLoad.value;
  draftPendingLoad.value = null;
  if (!target) return;
  // Reset cart state first so loadDraft (which bails on non-empty cart) runs.
  clear();
  paidInput.value = '';
  await applyDraftToCart(target);
};

const askDeleteDraft = (draftRow) => {
  draftPendingDelete.value = draftRow;
  draftDeleteDialog.value = true;
};

const confirmDeleteDraft = async () => {
  const target = draftPendingDelete.value;
  draftPendingDelete.value = null;
  if (!target) return;
  deletingDraftId.value = target.id;
  try {
    await saleStore.removeSale(target.id);
    draftList.value = draftList.value.filter((d) => d.id !== target.id);
    if (currentDraftId.value === target.id) currentDraftId.value = null;
  } catch (err) {
    console.error('Failed to delete draft:', err);
    // saleStore already surfaces a notification for delete failures.
  } finally {
    deletingDraftId.value = null;
  }
};

// ── Keyboard: global shortcuts ─────────────────────────────────────────────
const isEditable = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

const onKeydown = (e) => {
  // F2 / F4 both focus the unified search/barcode field.
  if (e.key === 'F2' || e.key === 'F4') {
    e.preventDefault();
    searchFocusRequest.value += 1;
    return;
  }
  if (e.key === 'F9' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
    e.preventDefault();
    checkout();
    return;
  }
  if (isEditable(e.target)) return;
};

// ── Keyboard: grid roving focus ────────────────────────────────────────────
const focusFirstCard = () => {
  gridFocusRequest.value += 1;
};

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  if (inventoryStore.branches.length === 0) await inventoryStore.fetchBranches();
  if (inventoryStore.warehouses.length === 0) await inventoryStore.fetchWarehouses();

  await Promise.all([loadProducts(), loadCategories()]);

  try {
    const settings = await settingsStore.fetchCurrencySettings();
    if (settings?.defaultCurrency) currency.value = settings.defaultCurrency;
  } catch {
    /* keep default */
  }

  await hydrateFromDraft();

  // Selling only needs a usable open accounting period (no shifts).
  await refreshCurrentAccountingPeriod();

  // Poll the open period so that when it auto-closes (its time elapses) the POS
  // blocks selling within ~30s without a reload — the backend reports no open
  // period the instant it expires, and a sale attempt is rejected server-side
  // regardless, so this just keeps the banner/gating in sync.
  if (accountingPeriodsEnabled.value) {
    periodPollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshCurrentAccountingPeriod();
    }, 30000);
  }

  window.addEventListener('keydown', onKeydown);
  searchFocusRequest.value += 1;
});

// Resume a cash/card draft into the POS cart. Installment drafts are routed
// to NewSale, so anything that lands here should be a cash-style draft —
// we still validate to be defensive against stale links.
const hydrateFromDraft = async () => {
  const draftId = route.query.draftId ? Number(route.query.draftId) : null;
  if (!draftId) return;
  if (items.length > 0) return; // never clobber an in-progress cart

  try {
    const response = await saleStore.fetchSale(draftId);
    const draft = response?.data?.data || response?.data || response || null;
    if (!draft || draft.status !== 'draft') {
      notify.error('المسودة غير صالحة');
      return;
    }
    if (draft.paymentType === 'installment') {
      // Wrong screen for this draft — bounce to NewSale instead of mangling it.
      router.replace({ name: 'NewSale', query: { draftId } });
      return;
    }
    const ok = loadDraft(draft, products.value);
    if (ok) {
      currentDraftId.value = draft.id;
      notify.info('تم تحميل المسودة');
    }
  } catch (err) {
    console.error('Failed to load POS draft:', err);
    notify.error('فشل تحميل المسودة');
  }
};

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(searchTimer);
  clearTimeout(flashTimer);
  if (periodPollTimer) clearInterval(periodPollTimer);
});
</script>
