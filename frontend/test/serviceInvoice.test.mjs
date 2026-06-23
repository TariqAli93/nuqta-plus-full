import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isServiceProduct,
  isServiceLine,
  cartHasService,
  cartHasPhysical,
  isServiceInvoice,
  wouldMixTypes,
  isFullAmountDisabled,
  serviceBlockingReason,
  MIX_TYPES_ERROR,
  SERVICE_PRICE_REQUIRED_ERROR,
} from '../src/utils/serviceInvoice.js';

/**
 * Pure rules behind the POS service/physical UX (نظام الخدمات). No Vue/Pinia, so
 * it runs standalone:
 *   node --test test/serviceInvoice.test.mjs
 *
 * Covers the cart-side guarantees the UI binds to:
 *   - the "المبلغ كامل" button is disabled the moment a service is in the cart,
 *   - a service and a physical product can't be mixed,
 *   - a service invoice blocks checkout until a received price is entered.
 */

const service = (over = {}) => ({ productId: 1, productType: 'service', price: 0, ...over });
const physical = (over = {}) => ({ productId: 2, productType: 'inventory', price: 1500, ...over });

test('isServiceProduct / isServiceLine detect the service kind', () => {
  assert.equal(isServiceProduct({ productType: 'service' }), true);
  assert.equal(isServiceProduct({ productType: 'inventory' }), false);
  assert.equal(isServiceLine(service()), true);
  assert.equal(isServiceLine(physical()), false);
});

test('cartHasService / cartHasPhysical / isServiceInvoice', () => {
  assert.equal(cartHasService([physical(), service()]), true);
  assert.equal(cartHasPhysical([physical(), service()]), true);
  assert.equal(isServiceInvoice([service(), service({ productId: 3 })]), true);
  assert.equal(isServiceInvoice([service(), physical()]), false);
  assert.equal(isServiceInvoice([]), false);
});

test('the full-amount button is DISABLED as soon as a service is in the cart', () => {
  assert.equal(isFullAmountDisabled([service({ price: 50000 })]), true);
  assert.equal(isFullAmountDisabled([physical()]), false);
  assert.equal(isFullAmountDisabled([]), false);
});

test('adding a physical product to a service cart is flagged as mixing', () => {
  assert.equal(wouldMixTypes([service()], physical()), true);
  assert.equal(wouldMixTypes([physical()], { productType: 'service' }), true);
  // Same kind never mixes; an empty cart never mixes.
  assert.equal(wouldMixTypes([service()], { productType: 'service' }), false);
  assert.equal(wouldMixTypes([physical()], physical()), false);
  assert.equal(wouldMixTypes([], physical()), false);
});

test('a service invoice blocks checkout until every service line has a price', () => {
  assert.equal(serviceBlockingReason([service({ price: 0 })]), SERVICE_PRICE_REQUIRED_ERROR);
  assert.equal(serviceBlockingReason([service({ price: 50000 })]), null);
  // A physical-only invoice is never blocked by the service rule.
  assert.equal(serviceBlockingReason([physical()]), null);
});

test('the shared error messages are the expected Arabic strings', () => {
  assert.match(MIX_TYPES_ERROR, /لا يمكن دمج خدمة مع منتجات فعلية/);
  assert.match(SERVICE_PRICE_REQUIRED_ERROR, /السعر المستلم/);
});
