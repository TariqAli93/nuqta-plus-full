<template>
  <v-card class="pos__panel pos__cart" :class="{ 'is-open': cartOpen }" flat aria-label="السلة">
    <div v-if="isMobile" class="cart__handle" @click="emit('closeCart')">
      <span class="cart__handle-bar" />
    </div>

    <CartHeader
      :item-count="itemCount"
      :drafts-reason="draftsReason"
      :drafts-disabled="draftsDisabled"
      :drafts-visible="draftsVisible"
      :current-draft-id="currentDraftId"
      :has-items="items.length > 0"
      @open-drafts-list="emit('openDraftsList')"
      @confirm-clear="emit('confirmClear')"
    />

    <v-divider />

    <div class="cart__lines" aria-live="polite">
      <div v-if="continuingDraftId && items.length === 0" class="cart__lines-inner" aria-hidden="true">
        <v-sheet v-for="n in 3" :key="`cart-sk-${n}`" class="line line--skeleton" rounded="lg" />
      </div>

      <div v-else-if="items.length === 0" class="cart__empty">
        <EmptyState
          compact
          icon="mdi-cart-outline"
          :icon-size="44"
          title="السلة فارغة"
          description="اختر منتجاً أو امسح باركود لبدء البيع."
        />
        <div class="cart__hints">
          <v-chip size="small" variant="tonal"><kbd>F2</kbd>&nbsp;بحث</v-chip>
          <v-chip size="small" variant="tonal"><kbd>F9</kbd>&nbsp;دفع</v-chip>
        </div>
      </div>

      <TransitionGroup v-else name="line-anim" tag="div" class="cart__lines-inner">
        <CartLine
          v-for="item in items"
          :key="item.id"
          :item="item"
          :flash="flashItemId === item.id"
          :currency="currency"
          :can-edit-price="canEditPrice"
          :line-discount-capped="isLineDiscountCapped(item)"
          :applied-line-discount-amount="appliedLineDiscount(item)"
          :line-subtotal-amount="lineSubtotal(item)"
          :expiry-warning="cartExpiryWarning(item)"
          :is-service-line="isService(item)"
          @open-line-edit="emit('openLineEdit', $event)"
          @remove-item="emit('removeItem', $event)"
          @update-line-unit="(itemId, unitId) => emit('updateLineUnit', itemId, unitId)"
          @update-price="(itemId, value) => emit('updatePrice', itemId, value)"
          @dec-qty="emit('decQty', $event)"
          @commit-qty="(itemId, value) => emit('commitQty', itemId, value)"
          @inc-qty="emit('incQty', $event)"
        />
      </TransitionGroup>
    </div>

    <CartPayPanel
      :currency="currency"
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
      :drafts-visible="draftsVisible"
      :drafts-disabled="draftsDisabled"
      :items-length="items.length"
      :submitting="submitting"
      :has-active-period="hasActivePeriod"
      :can-submit="canSubmit"
      :item-discount-capped="itemDiscountCapped"
      @method-change="emit('methodChange', $event)"
      @update-payment-reference="emit('updatePaymentReference', $event)"
      @update-sale-discount-value="emit('updateSaleDiscountValue', $event)"
      @update-sale-discount-type="emit('updateSaleDiscountType', $event)"
      @update-tax-value="emit('updateTaxValue', $event)"
      @update-tax-enabled="emit('updateTaxEnabled', $event)"
      @update-sale-notes="emit('updateSaleNotes', $event)"
      @add-to-paid="emit('addToPaid', $event)"
      @numpad="emit('numpad', $event)"
      @hold="emit('hold')"
      @checkout="emit('checkout')"
    />
  </v-card>
</template>

<script setup>
import EmptyState from '@/components/EmptyState.vue';
import CartHeader from './CartHeader.vue';
import CartLine from './CartLine.vue';
import CartPayPanel from './CartPayPanel.vue';

defineProps({
  cartOpen: { type: Boolean, default: false },
  isMobile: { type: Boolean, default: false },
  itemCount: { type: Number, default: 0 },
  draftsReason: { type: String, default: '' },
  draftsDisabled: { type: Boolean, default: false },
  draftsVisible: { type: Boolean, default: false },
  currentDraftId: { type: [Number, String], default: null },
  continuingDraftId: { type: [Number, String], default: null },
  items: { type: Array, default: () => [] },
  flashItemId: { type: [Number, String], default: null },
  currency: { type: String, required: true },
  canEditPrice: { type: Boolean, default: false },
  isLineDiscountCapped: { type: Function, required: true },
  appliedLineDiscount: { type: Function, required: true },
  lineSubtotal: { type: Function, required: true },
  cartExpiryWarning: { type: Function, required: true },
  isService: { type: Function, required: true },
  total: { type: Number, required: true },
  subtotal: { type: Number, required: true },
  appliedDiscount: { type: Number, required: true },
  taxValue: { type: Number, required: true },
  discountCapped: { type: Boolean, default: false },
  payment: { type: Object, required: true },
  paymentMethods: { type: Array, default: () => [] },
  changeStateClass: { type: String, default: '' },
  changeLabel: { type: String, required: true },
  changeAmount: { type: Number, required: true },
  saleDiscount: { type: Object, required: true },
  tax: { type: Object, required: true },
  saleNotes: { type: String, default: '' },
  quickAmounts: { type: Array, default: () => [] },
  numpadKeys: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false },
  hasActivePeriod: { type: Boolean, default: true },
  canSubmit: { type: Boolean, default: false },
  itemDiscountCapped: { type: Boolean, default: false },
});

const emit = defineEmits([
  'closeCart',
  'openDraftsList',
  'confirmClear',
  'openLineEdit',
  'removeItem',
  'updateLineUnit',
  'updatePrice',
  'decQty',
  'commitQty',
  'incQty',
  'methodChange',
  'updatePaymentReference',
  'updateSaleDiscountValue',
  'updateSaleDiscountType',
  'updateTaxValue',
  'updateTaxEnabled',
  'updateSaleNotes',
  'addToPaid',
  'numpad',
  'hold',
  'checkout',
]);
</script>
