import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  productCreateSchema,
  saleItemSchema,
} from '../src/utils/validation.js';

/**
 * Schema contract for SERVICE products + service sale lines (نظام الخدمات).
 *
 * Pure Zod tests — no DB — so they run standalone:
 *   node --test test/serviceProductValidation.test.js
 *
 * Pins three guarantees:
 *   1. A SERVICE product may be created WITHOUT a fixed selling price (the price
 *      is captured at sale time as السعر المستلم).
 *   2. An INVENTORY product still REQUIRES a positive selling price (and cost) —
 *      the existing behaviour must not regress.
 *   3. A sale line carries an optional `serviceReceivedAmount`, and `unitPrice`
 *      is no longer forced positive at the schema layer (per-type positivity is
 *      enforced in the sale service so each kind gets a clear Arabic message).
 */

const baseProduct = (over = {}) => ({
  name: 'تصليح شاشة',
  currency: 'IQD',
  productType: 'service',
  ...over,
});

test('a SERVICE product is valid with NO selling price', () => {
  const parsed = productCreateSchema.parse(baseProduct());
  assert.equal(parsed.productType, 'service');
  // sellingPrice was omitted entirely — it stays undefined, not rejected.
  assert.equal(parsed.sellingPrice, undefined);
});

test('a SERVICE product is valid with selling price 0', () => {
  const parsed = productCreateSchema.parse(baseProduct({ sellingPrice: 0 }));
  assert.equal(parsed.sellingPrice, 0);
});

test('a SERVICE product may still carry an optional fixed price', () => {
  const parsed = productCreateSchema.parse(baseProduct({ sellingPrice: 25000 }));
  assert.equal(parsed.sellingPrice, 25000);
});

test('an INVENTORY product is REJECTED without a positive selling price', () => {
  const result = productCreateSchema.safeParse({
    name: 'لابتوب',
    currency: 'IQD',
    productType: 'inventory',
    costPrice: 100,
    // no sellingPrice
  });
  assert.equal(result.success, false);
  const paths = result.error.issues.map((i) => i.path.join('.'));
  assert.ok(paths.includes('sellingPrice'), `expected a sellingPrice issue, got: ${paths.join(', ')}`);
});

test('an INVENTORY product is REJECTED with selling price 0', () => {
  const result = productCreateSchema.safeParse({
    name: 'لابتوب',
    currency: 'IQD',
    productType: 'inventory',
    costPrice: 100,
    sellingPrice: 0,
  });
  assert.equal(result.success, false);
});

test('a default (no productType) product behaves as inventory and requires a price', () => {
  const result = productCreateSchema.safeParse({
    name: 'سلعة',
    currency: 'IQD',
    costPrice: 5,
    // no sellingPrice, no productType → inventory
  });
  assert.equal(result.success, false);
});

test('a sale line accepts serviceReceivedAmount and an omitted unitPrice', () => {
  const parsed = saleItemSchema.parse({
    productId: 7,
    quantity: 1,
    serviceReceivedAmount: 50000,
  });
  assert.equal(parsed.serviceReceivedAmount, 50000);
  assert.equal(parsed.unitPrice, undefined);
});

test('a sale line still accepts a plain physical line with a unit price', () => {
  const parsed = saleItemSchema.parse({ productId: 7, quantity: 2, unitPrice: 1500 });
  assert.equal(parsed.unitPrice, 1500);
  assert.equal(parsed.serviceReceivedAmount, undefined);
});
