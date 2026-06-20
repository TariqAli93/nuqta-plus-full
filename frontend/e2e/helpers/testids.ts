/**
 * data-testid contract (single source of truth).
 *
 * Every selector the suite relies on lives here so specs never hard-code raw
 * strings. The matching attributes are added to the Vue components — see
 * e2e/TESTID-MAP.md for the component ↔ id mapping and wiring status.
 *
 * Convention: ids are kebab-case, grouped by screen. Dynamic ids (per row /
 * per option) are exposed as functions.
 */

export const TID = {
  login: {
    username: 'login-username',
    password: 'login-password',
    submit: 'login-submit',
    error: 'login-error',
  },

  pos: {
    openShift: 'pos-open-shift',
    closeShift: 'pos-close-shift',
    shiftChip: 'pos-shift-chip',
    /** Unified search + barcode field. Enter resolves an exact barcode/SKU scan. */
    search: 'pos-search',
    /** A product tile in the grid. Carries data-product-id / data-product-name. */
    product: 'pos-product',
    cartEmpty: 'pos-cart-empty',
    total: 'pos-total',
    payFull: 'pos-pay-full',
    cardRef: 'pos-card-ref',
    /** Invoice-level note (ملاحظة الفاتورة), inside the cart "خيارات" panel. */
    saleNotes: 'pos-sale-notes',
    checkout: 'pos-checkout',
    /** Payment method radio (cash | card). */
    payMethod: (m: 'cash' | 'card') => `pos-pay-method-${m}`,
  },

  openShift: {
    cash: 'open-shift-cash',
    currency: 'open-shift-currency',
    notes: 'open-shift-notes',
    confirm: 'open-shift-confirm',
    cancel: 'open-shift-cancel',
  },

  closeShift: {
    cash: 'close-shift-cash',
    notes: 'close-shift-notes',
    variance: 'close-shift-variance',
    confirm: 'close-shift-confirm',
    cancel: 'close-shift-cancel',
  },

  periods: {
    openBtn: 'period-open-btn',
    type: 'period-type',
    notes: 'period-notes',
    submitOpen: 'period-submit-open',
    table: 'periods-table',
    /** A period row. Carries data-period-id / data-period-status. */
    row: 'period-row',
    closeBtn: 'period-close-btn',
    confirmClose: 'period-confirm-close',
  },

  products: {
    newBtn: 'product-new-btn',
    search: 'products-search',
    table: 'products-table',
    exportBtn: 'products-export',
    /** A product row. Carries data-product-id / data-product-name. */
    row: 'product-row',
    edit: 'product-edit',
    delete: 'product-delete',
  },

  productForm: {
    name: 'product-name',
    sku: 'product-sku',
    category: 'product-category',
    costPrice: 'product-cost-price',
    sellingPrice: 'product-selling-price',
    currency: 'product-currency',
    unit: 'product-unit',
    status: 'product-status',
    save: 'product-save',
    cancel: 'product-cancel',
    // Post-create "add opening stock" prompt
    openingStockAdd: 'product-opening-stock-add',
    openingStockSkip: 'product-opening-stock-skip',
  },

  inventory: {
    adjustBtn: 'inventory-adjust-btn',
    adjustProduct: 'inventory-adjust-product',
    adjustType: 'inventory-adjust-type',
    adjustQty: 'inventory-adjust-qty',
    adjustReason: 'inventory-adjust-reason',
    adjustSave: 'inventory-adjust-save',
    table: 'inventory-table',
  },

  saleDetails: {
    invoiceNumber: 'sale-invoice-number',
    /** Invoice-level note card (shown only when the sale has a note). */
    notes: 'sale-notes',
    returnBtn: 'sale-return-btn',
    refundAmount: 'sale-refund-amount',
    refundMethod: 'sale-refund-method',
    confirmReturn: 'sale-confirm-return',
    returnsHistory: 'sale-returns-history',
    netAfterReturns: 'sale-net-after-returns',
    /** Per-line return quantity input. Carries data-sale-item-id. */
    returnQty: 'sale-return-qty',
  },
} as const;

/** data-* attribute names used alongside the ids above. */
export const DATA_ATTR = {
  productId: 'data-product-id',
  productName: 'data-product-name',
  periodId: 'data-period-id',
  periodStatus: 'data-period-status',
  saleItemId: 'data-sale-item-id',
} as const;
