import { test } from 'node:test';
import assert from 'node:assert/strict';

import { saleSchema } from '../src/utils/validation.js';
import {
  SALE_SOURCE_POS,
  SALE_TYPE_CASH,
  PAYMENT_METHOD_CASH,
} from '../src/constants/sales.js';

/**
 * Regression test for the POS "sale notes" bug: an invoice-level note typed at
 * checkout was never persisted. The root cause was on the frontend (no bound
 * field), but the validation layer is the backend gatekeeper — Zod strips
 * unknown keys, so if `notes` were missing from `saleSchema` the field would be
 * dropped before ever reaching the service. These cases pin that contract:
 *   - a note survives validation untouched (minus surrounding whitespace),
 *   - omitting the note stays valid,
 *   - an over-long note is rejected with a clear, length-aware message.
 *
 * Pure schema test — no DB — so it runs standalone:
 *   node --test test/saleNotesValidation.test.js
 */

// Minimal valid POS payload; each case varies only `notes`.
const basePayload = () => ({
  currency: 'IQD',
  items: [{ productId: 1, quantity: 1, unitPrice: 1000 }],
  saleSource: SALE_SOURCE_POS,
  saleType: SALE_TYPE_CASH,
  paymentMethod: PAYMENT_METHOD_CASH,
  paidAmount: 1000,
});

test('saleSchema keeps a sale-level note through validation', () => {
  const note = 'ملاحظة الزبون: التسليم بعد العصر';
  const parsed = saleSchema.parse({ ...basePayload(), notes: note });
  assert.equal(parsed.notes, note);
});

test('saleSchema trims surrounding whitespace on the note', () => {
  const parsed = saleSchema.parse({ ...basePayload(), notes: '   هامش مهم   ' });
  assert.equal(parsed.notes, 'هامش مهم');
});

test('saleSchema accepts a payload with no note', () => {
  const parsed = saleSchema.parse(basePayload());
  assert.equal(parsed.notes, undefined);
});

test('saleSchema accepts a note exactly at the 1000-char limit', () => {
  const atLimit = 'ب'.repeat(1000);
  const parsed = saleSchema.parse({ ...basePayload(), notes: atLimit });
  assert.equal(parsed.notes.length, 1000);
});

test('saleSchema rejects an over-long note with a clear, length-aware message', () => {
  const tooLong = 'ا'.repeat(1001);
  const result = saleSchema.safeParse({ ...basePayload(), notes: tooLong });
  assert.equal(result.success, false);
  const messages = result.error.issues.map((i) => i.message);
  assert.ok(
    messages.some((m) => m.includes('1000')),
    `expected a 1000-char limit message, got: ${messages.join(' | ')}`
  );
});
