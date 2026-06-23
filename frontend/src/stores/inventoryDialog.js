import { defineStore } from 'pinia';

/**
 * Standalone store for the "add / adjust stock" dialog.
 *
 * The dialog state lives OUTSIDE the Inventory page component on purpose: it must
 * survive the page's lifecycle (reload of stock/expiry, the selectedWarehouseId
 * watcher, route-query cleanup, and even a full remount of the page). When the
 * state was a local `ref` inside Inventory.vue, anything that remounted the page
 * (e.g. a keyed <router-view> reacting to a query change) wiped it and snapped
 * the dialog shut. Holding it in a Pinia store decouples it completely.
 *
 * HARD RULE: reload() / fetchWarehouseStock() / fetchExpiryAlerts() must NEVER
 * touch this store. Only explicit user intent (open / cancel / successful save)
 * changes it.
 */

const emptyForm = () => ({
  productId: null,
  warehouseId: null,
  unitId: null,
  quantity: 1,
  movementType: 'opening_balance',
  reason: '',
  expiryDate: '',
  costPrice: null,
});

export const useInventoryDialogStore = defineStore('inventoryDialog', {
  state: () => ({
    isAdjustDialogOpen: false,
    // Snapshot of the preselected product ({ productId, name, sku, tracksExpiry })
    // — drives the locked product field and the expiry/cost logic.
    preselectedProduct: null,
    adjustForm: emptyForm(),
  }),
  actions: {
    /**
     * Open the adjust dialog, preselecting a product and warehouse.
     * @param {object} opts
     * @param {object|null} opts.product  product snapshot (null = manual pick)
     * @param {number|null} opts.warehouseId  target warehouse
     * @param {number|null} opts.unitId  resolved base unit id (caller resolves it)
     */
    openAdjustDialog({ product = null, warehouseId = null, unitId = null } = {}) {
      this.preselectedProduct = product || null;
      this.adjustForm = {
        ...emptyForm(),
        productId: product ? Number(product.productId) : null,
        warehouseId: warehouseId ?? null,
        unitId: unitId ?? null,
      };
      this.isAdjustDialogOpen = true;
    },

    closeAdjustDialog() {
      this.isAdjustDialogOpen = false;
      this.preselectedProduct = null;
      this.resetAdjustForm();
    },

    resetAdjustForm() {
      this.adjustForm = emptyForm();
    },
  },
});
