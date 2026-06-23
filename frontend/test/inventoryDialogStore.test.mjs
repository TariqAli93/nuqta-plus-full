import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';

import { useInventoryDialogStore } from '../src/stores/inventoryDialog.js';

/**
 * Contract for the standalone add/adjust-stock dialog store. The whole point of
 * this store is that the dialog state is independent of the inventory page's
 * lifecycle — so we pin: open preselects product/warehouse/unit and flips the
 * flag; close resets everything; reset clears the form only.
 *
 * Pure store test (no Vue) — runs standalone:
 *   node --test test/inventoryDialogStore.test.mjs
 */

test('opens with the preselected product, warehouse and base unit', () => {
  setActivePinia(createPinia());
  const store = useInventoryDialogStore();

  assert.equal(store.isAdjustDialogOpen, false);

  store.openAdjustDialog({
    product: { productId: 7, name: 'تصليح', sku: 'S7', tracksExpiry: true },
    warehouseId: 3,
    unitId: 5,
  });

  assert.equal(store.isAdjustDialogOpen, true);
  assert.equal(store.preselectedProduct.productId, 7);
  assert.equal(store.adjustForm.productId, 7);
  assert.equal(store.adjustForm.warehouseId, 3);
  assert.equal(store.adjustForm.unitId, 5);
  assert.equal(store.adjustForm.movementType, 'opening_balance');
  assert.equal(store.adjustForm.quantity, 1);
});

test('opens with no preselection (manual pick)', () => {
  setActivePinia(createPinia());
  const store = useInventoryDialogStore();

  store.openAdjustDialog({ product: null, warehouseId: 2, unitId: null });

  assert.equal(store.isAdjustDialogOpen, true);
  assert.equal(store.preselectedProduct, null);
  assert.equal(store.adjustForm.productId, null);
  assert.equal(store.adjustForm.warehouseId, 2);
});

test('coerces a string productId to a number', () => {
  setActivePinia(createPinia());
  const store = useInventoryDialogStore();

  store.openAdjustDialog({ product: { productId: '42', name: 'X' }, warehouseId: 1 });

  assert.strictEqual(store.adjustForm.productId, 42);
});

test('close resets the dialog, product and form', () => {
  setActivePinia(createPinia());
  const store = useInventoryDialogStore();

  store.openAdjustDialog({ product: { productId: 9, name: 'Y' }, warehouseId: 4, unitId: 1 });
  store.adjustForm.quantity = 12;
  store.adjustForm.reason = 'جرد';

  store.closeAdjustDialog();

  assert.equal(store.isAdjustDialogOpen, false);
  assert.equal(store.preselectedProduct, null);
  assert.equal(store.adjustForm.productId, null);
  assert.equal(store.adjustForm.quantity, 1);
  assert.equal(store.adjustForm.reason, '');
});

test('resetAdjustForm clears the form without closing', () => {
  setActivePinia(createPinia());
  const store = useInventoryDialogStore();

  store.openAdjustDialog({ product: { productId: 5, name: 'Z' }, warehouseId: 1, unitId: 2 });
  store.resetAdjustForm();

  assert.equal(store.isAdjustDialogOpen, true, 'reset does not close the dialog');
  assert.equal(store.adjustForm.productId, null);
  assert.equal(store.adjustForm.unitId, null);
});
