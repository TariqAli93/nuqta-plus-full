<template>
  <div class="new-sale-page">
    <SaleHeader
      :branch-name="branchName"
      :warehouse-name="warehouseName"
      :item-count="sale.items.length"
    />

    <v-form ref="form" class="sale-workspace">
      <!-- ════════ Main panel: customer + search + items ════════ -->
      <section class="panel sale-main">
        <CustomerSection
          ref="customerSectionRef"
          :model-value="sale.customerId"
          :payment-type="sale.paymentType"
          :agent-pricing-on="agentPricingOn"
          :selected-customer-type="selectedCustomerType"
          :price-tiers="PRICE_TIERS"
          @update:model-value="sale.customerId = $event"
          @customer-selected="onCustomerSelected"
          @update:selected-customer-type="selectedCustomerType = $event"
          @price-type-change="onPriceTypeChange"
        />

        <div class="product-add">
          <ProductSearchBar
            ref="productSearchRef"
            class="product-add__field"
            :products="products"
            :custom-product-filter="customProductFilter"
            :available-stock-of="availableStockOf"
            @add="addProductById"
            @scan="scanCode"
          />
        </div>

        <div class="sale-items-section">
          <div class="sale-items-scroll">
            <SaleItemsTable
              :items="sale.items"
              :currency="sale.currency"
              :unit-options-for="unitOptionsFor"
              :get-quantity-error="getQuantityError"
              :can-edit-price="canEditPrice"
              :show-interest="sale.paymentType === 'installment'"
              @remove="removeItem"
              @unit-change="onItemUnitChange"
            />
          </div>
        </div>
      </section>

      <!-- ════════ Summary panel: payment + totals ════════ -->
      <aside class="panel sale-summary-col">
        <div class="panel__head">
          <span class="panel__title">
            <v-icon size="18" color="primary">mdi-calculator-variant</v-icon>
            ملخص الفاتورة
          </span>
          <v-select
            :model-value="sale.currency"
            :items="availableCurrencies"
            density="compact"
            variant="outlined"
            hide-details
            class="currency-select"
            :rules="[(v) => !!v || 'مطلوب']"
            @update:model-value="sale.currency = $event"
          />
        </div>

        <div ref="paymentColumn" class="panel__scroll">
          <PaymentMethodSelector
            :model-value="sale.paymentType"
            :installments-enabled="installmentsEnabled"
            @update:model-value="sale.paymentType = $event"
          />

          <CashPaymentForm
            v-if="sale.paymentType === 'cash'"
            ref="cashFormRef"
            :currency="sale.currency"
            :total="total"
            :received-amount="sale.receivedAmount"
            :remaining-amount="remainingAmount"
            :payment-status="paymentStatus"
            :has-customer="!!sale.customerId"
            @update:received-amount="setReceivedAmount"
          />

          <template v-else>
            <InstallmentPaymentForm
              :sale="sale"
              :currency="sale.currency"
              :total-with-interest="totalWithInterest"
              :installment-amount="installmentAmount"
              :actual-interest-rate="actualInterestRate"
              :remaining-amount="remainingAmount"
              :schedule="installmentSchedule"
              @update="patchSale"
            />

            <CreditScoreCard
              v-if="sale.customerId && canReadCustomers"
              :customer-id="sale.customerId"
              :sale-total="totalWithInterest"
              :currency="sale.currency"
              class="mt-2"
            />
            <v-alert
              v-if="creditDecision && canReadCustomers"
              :type="decisionAlertType"
              variant="tonal"
              border="start"
              density="compact"
              class="mt-2"
              role="alert"
              aria-live="polite"
            >
              <div class="text-caption font-weight-bold">{{ decisionTitle }}</div>
              <div class="text-caption">{{ creditDecision.reason }}</div>
            </v-alert>
          </template>

          <v-divider />

          <SaleSummaryPanel
            :currency="sale.currency"
            :subtotal="subtotal"
            :items-discount="itemsDiscount"
            :item-discount-unapplied="itemDiscountUnapplied"
            :item-discount-capped="itemDiscountCapped"
            :discount-amount="appliedDiscount"
            :requested-discount="sale.discount"
            :unapplied-discount="unappliedDiscount"
            :discount-capped="discountCapped"
            :total="total"
            :interest-value="interestValue"
            :total-with-interest="totalWithInterest"
            :paid-amount="paidAmount"
            :remaining-amount="remainingAmount"
            :change-amount="changeAmount"
            :payment-status="paymentStatus"
            :payment-type="sale.paymentType"
            :discount-type="sale.discountType"
            :discount-value="sale.discountValue"
            @update:discount-type="sale.discountType = $event"
            @update:discount-value="sale.discountValue = $event"
          />

          <!-- Notes (collapsed by default → zero footprint) -->
          <button type="button" class="notes-toggle" @click="showNotes = !showNotes">
            <v-icon size="16">mdi-note-text-outline</v-icon>
            ملاحظات الفاتورة
            <v-icon size="16" class="ms-auto">
              {{ showNotes ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
            </v-icon>
          </button>
          <v-expand-transition>
            <v-textarea
              v-if="showNotes"
              v-model="sale.notes"
              rows="2"
              auto-grow
              maxlength="1000"
              variant="outlined"
              density="compact"
              hide-details
              placeholder="ملاحظات على الفاتورة…"
              class="mt-2"
            />
          </v-expand-transition>
        </div>
      </aside>
    </v-form>

    <SaleActionBar
      :loading="loading"
      :can-submit="canSubmit"
      :disabled-reasons="disabledReasons"
      :total="grandTotal"
      :currency="sale.currency"
      @cancel="handleCancel"
      @submit="submitSale"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePermissions } from '@/composables/usePermissions';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { PRICE_TIERS } from '@/utils/productUnits';
import api from '@/plugins/axios';

import { useSaleForm } from '@/composables/sales/useSaleForm';
import { useSaleValidation } from '@/composables/sales/useSaleValidation';
import { useSaleSubmission } from '@/composables/sales/useSaleSubmission';

import SaleHeader from '@/components/sales/SaleHeader.vue';
import CustomerSection from '@/components/sales/CustomerSection.vue';
import ProductSearchBar from '@/components/sales/ProductSearchBar.vue';
import SaleItemsTable from '@/components/sales/SaleItemsTable.vue';
import PaymentMethodSelector from '@/components/sales/PaymentMethodSelector.vue';
import CashPaymentForm from '@/components/sales/CashPaymentForm.vue';
import InstallmentPaymentForm from '@/components/sales/InstallmentPaymentForm.vue';
import SaleSummaryPanel from '@/components/sales/SaleSummaryPanel.vue';
import SaleActionBar from '@/components/sales/SaleActionBar.vue';
import CreditScoreCard from '@/components/CreditScoreCard.vue';

const authStore = useAuthStore();
const { can } = usePermissions();

// ── Form state + derived calculations (single source of truth) ──────────────
const form = ref(null);
const showNotes = ref(false);
const saleForm = useSaleForm();
const {
  sale,
  products,
  selectedCustomerType,
  availableCurrencies,
  calc,
  currentDraftId,
  draftSaved,
  isSavingDraft,
  saleCompleted,
  isCancelled,
  availableStockOf,
  unitOptionsFor,
  getQuantityError,
  customProductFilter,
  addProductById,
  scanCode,
  removeItem,
  onItemUnitChange,
  onCustomerSelected,
  onPriceTypeChange,
  setReceivedAmount,
  saveDraft,
  inventoryStore,
} = saleForm;

const {
  subtotal,
  itemsDiscount,
  itemDiscountUnapplied,
  itemDiscountCapped,
  appliedDiscount,
  unappliedDiscount,
  discountCapped,
  total,
  interestValue,
  totalWithInterest,
  actualInterestRate,
  installmentAmount,
  paidAmount,
  remainingAmount,
  paymentStatus,
  changeAmount,
  installmentSchedule,
} = calc;

const grandTotal = computed(() =>
  sale.value.paymentType === 'installment' ? totalWithInterest.value : total.value
);

// ── Permissions & feature flags ─────────────────────────────────────────────
const canReadCustomers = computed(() => can('customers:read'));
const canEditPrice = computed(() => can('sales:edit_price'));
const installmentsEnabled = computed(() => authStore.canUse('installments', 'canUseInstallments'));
const agentPricingOn = computed(() => authStore.hasFeature('agentPricing'));

// Patch installment fields from the child form (avoids mutating its prop).
const patchSale = (patch) => Object.assign(sale.value, patch);

// Belt-and-suspenders guard: installments can only be the ACTIVE payment type
// when the feature is enabled. This watches BOTH the payment type and the flag,
// so it also catches a programmatic / v-model change and a loaded draft whose
// stored paymentType is 'installment'. Coercing to cash re-triggers the form's
// own paymentType watcher, which safely resets the installment fields. Setting
// it to 'cash' re-runs this watcher with a no-op, so there is no loop.
watch(
  () => [sale.value.paymentType, installmentsEnabled.value],
  ([type, enabled]) => {
    if (type === 'installment' && !enabled) sale.value.paymentType = 'cash';
  },
  { immediate: true }
);

// ── Header meta ─────────────────────────────────────────────────────────────
const branchName = computed(() => inventoryStore.selectedBranch?.name || '');
const warehouseName = computed(() => inventoryStore.selectedWarehouse?.name || '');

// ── Smart credit decision (optional, customers:read gated) ───────────────────
const creditDecision = ref(null);
const creditCheckLoading = ref(false);
let creditCheckTimer = null;
let creditCheckSeq = 0;

const decisionAlertType = computed(() => {
  const lvl = creditDecision.value?.riskLevel;
  if (lvl === 'high') return 'error';
  if (lvl === 'medium') return 'warning';
  return 'success';
});
const decisionTitle = computed(() => {
  const lvl = creditDecision.value?.riskLevel;
  if (lvl === 'high') return 'خطر مرتفع — قد يُرفض البيع بالتقسيط';
  if (lvl === 'medium') return 'خطر متوسط — يمكن المتابعة مع توصيات';
  return 'العميل في حالة ائتمانية جيدة';
});

async function refreshCreditDecision() {
  if (!canReadCustomers.value) return (creditDecision.value = null);
  if (!sale.value.customerId || sale.value.paymentType !== 'installment') {
    return (creditDecision.value = null);
  }
  const amount = totalWithInterest.value;
  if (!amount || amount <= 0) return (creditDecision.value = null);

  const seq = ++creditCheckSeq;
  creditCheckLoading.value = true;
  try {
    const res = await api.post(`/customers/${sale.value.customerId}/credit/check-installment`, {
      amount,
    });
    if (seq === creditCheckSeq) creditDecision.value = res?.data || null;
  } catch {
    if (seq === creditCheckSeq) creditDecision.value = null;
  } finally {
    if (seq === creditCheckSeq) creditCheckLoading.value = false;
  }
}

watch(
  () => [sale.value.customerId, sale.value.paymentType, totalWithInterest.value],
  () => {
    if (creditCheckTimer) clearTimeout(creditCheckTimer);
    creditCheckTimer = setTimeout(refreshCreditDecision, 350);
  }
);

// ── Validation + submission ─────────────────────────────────────────────────
const { disabledReasons, canSubmit } = useSaleValidation({ sale, calc, getQuantityError });

const { loading, submitSale, handleCancel } = useSaleSubmission({
  sale,
  calc,
  selectedCustomerType,
  form,
  products,
  availableStockOf,
  currentDraftId,
  saleCompleted,
  isCancelled,
  draftSaved,
  isSavingDraft,
  saveDraft,
  saleStore: saleForm.saleStore,
  notify: saleForm.notify,
  inventoryStore,
  beforeSubmit: () => {
    if (sale.value.paymentType === 'installment' && creditDecision.value?.riskLevel === 'high') {
      return window.confirm(
        `تنبيه ائتماني: ${creditDecision.value.reason}.\n\nهل ترغب بالمتابعة؟ (سيتم رفض البيع إذا لم تكن لديك صلاحية تجاوز).`
      );
    }
    return true;
  },
});

// ── Keyboard shortcuts (desktop) ────────────────────────────────────────────
const customerSectionRef = ref(null);
const productSearchRef = ref(null);
const cashFormRef = ref(null);
const paymentColumn = ref(null);

const focusPayment = () => {
  if (sale.value.paymentType === 'cash') cashFormRef.value?.focus();
  else paymentColumn.value?.querySelector('input')?.focus();
};

useKeyboardShortcuts({
  f2: (e) => {
    e.preventDefault();
    productSearchRef.value?.focus();
  },
  f4: (e) => {
    e.preventDefault();
    customerSectionRef.value?.focus();
  },
  f6: (e) => {
    e.preventDefault();
    focusPayment();
  },
  'ctrl+enter': (e) => {
    e.preventDefault();
    submitSale();
  },
  escape: () => {
    if (!document.querySelector('.v-dialog--active')) handleCancel();
  },
});
</script>

<style scoped lang="scss">
// Full-height desktop layout: header / workspace (fills) / action bar.
.new-sale-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
}

.sale-workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
}

// Shared panel chrome (one panel for main, one for summary).
.panel {
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 10px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// ── Main panel ───────────────────────────────────────────────────────────────
.sale-main {
  min-width: 0;
}

.product-add {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}

.sale-items-section {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sale-items-scroll {
  flex: 1 1 auto;
  min-height: 180px;
  overflow: auto;
  padding: 4px 12px 12px;
}

// ── Summary panel ────────────────────────────────────────────────────────────
.sale-summary-col {
  min-height: 0;
}

.panel__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}

.panel__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
  font-weight: 600;
}

.currency-select {
  max-width: 116px;
}

.panel__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notes-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 4px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  background: transparent;
  border: none;
  cursor: pointer;
}

// ── Responsive desktop ───────────────────────────────────────────────────────
@media (max-width: 1100px) {
  .sale-workspace {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}

@media (max-width: 900px) {
  .new-sale-page {
    height: auto;
    overflow: visible;
  }
  .sale-workspace {
    grid-template-columns: 1fr;
  }
  .sale-items-scroll {
    overflow: visible;
  }
  .panel__scroll {
    overflow: visible;
  }
}
</style>
