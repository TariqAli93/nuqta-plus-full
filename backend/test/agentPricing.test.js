import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { resolveTierPrice } from '../src/services/productUnitService.js';
import { enforceCustomerCreditLimit } from '../src/services/saleService.js';

/**
 * Phase E — agent/wholesale pricing (تسعير الوكلاء) + hard credit ceiling.
 *
 * `resolveTierPrice` is a pure function (no DB). The credit-limit enforcement
 * is exercised against real customer + sales rows (currency 'AGP', cleaned in
 * `after`). Override is allowed with the `sales.override_credit_limit`
 * permission (manager+).
 */

const ids = {};

before(async () => {
  const pool = await getPool();
  const c = await pool.query(
    `INSERT INTO customers (name, customer_type, credit_limit, is_active)
     VALUES ($1, 'wholesale', 100000, true) RETURNING id`,
    [`agp-cust-${Date.now()}`]
  );
  ids.customerId = c.rows[0].id;
  // Existing AR: one credit sale leaving 60,000 outstanding.
  await pool.query(
    `INSERT INTO sales (invoice_number, customer_id, subtotal, total, currency, payment_type,
                        status, paid_amount, remaining_amount, issued_at)
     VALUES ($1, $2, 60000, 60000, 'AGP', 'installment', 'pending', 0, 60000, now())`,
    [`AGP-${Date.now()}`, ids.customerId]
  );
});

after(async () => {
  const pool = await getPool();
  const del = async (t, p) => { try { await pool.query(t, p); } catch { /* ignore */ } };
  await del('DELETE FROM sales WHERE customer_id=$1', [ids.customerId]);
  await del('DELETE FROM customers WHERE id=$1', [ids.customerId]);
  await closeDatabase().catch(() => {});
});

// ── Pure price-tier resolution ──────────────────────────────────────────────
test('resolveTierPrice: retail falls to unit salePrice then product sellingPrice', () => {
  assert.equal(
    resolveTierPrice({ customerType: 'retail', unit: { salePrice: 12 }, product: { sellingPrice: 10 } }),
    12
  );
  assert.equal(
    resolveTierPrice({ customerType: 'retail', unit: { salePrice: null }, product: { sellingPrice: 10 } }),
    10
  );
});

test('resolveTierPrice: wholesale prefers unit tier, then product tier', () => {
  // unit tier wins
  assert.equal(
    resolveTierPrice({
      customerType: 'wholesale',
      unit: { wholesalePrice: 8, salePrice: 12 },
      product: { wholesalePrice: 9, sellingPrice: 10 },
    }),
    8
  );
  // no unit tier → product tier
  assert.equal(
    resolveTierPrice({
      customerType: 'wholesale',
      unit: { wholesalePrice: null, salePrice: 12 },
      product: { wholesalePrice: 9, sellingPrice: 10 },
    }),
    9
  );
  // no tier anywhere → unit salePrice
  assert.equal(
    resolveTierPrice({
      customerType: 'wholesale',
      unit: { wholesalePrice: null, salePrice: 12 },
      product: { wholesalePrice: null, sellingPrice: 10 },
    }),
    12
  );
});

test('resolveTierPrice: agent uses agentPrice tier', () => {
  assert.equal(
    resolveTierPrice({
      customerType: 'agent',
      unit: { agentPrice: 7, salePrice: 12 },
      product: { agentPrice: 8, sellingPrice: 10 },
    }),
    7
  );
  assert.equal(
    resolveTierPrice({
      customerType: 'agent',
      unit: null,
      product: { agentPrice: 8, sellingPrice: 10 },
    }),
    8
  );
});

test('resolveTierPrice: no unit, retail → product sellingPrice; missing everything → 0', () => {
  assert.equal(resolveTierPrice({ customerType: 'retail', product: { sellingPrice: 25 } }), 25);
  assert.equal(resolveTierPrice({ customerType: 'agent', product: {} }), 0);
});

// ── Hard credit ceiling ─────────────────────────────────────────────────────
test('credit limit: a sale pushing AR over the ceiling is blocked without override', async () => {
  // Current AR = 60,000; limit = 100,000. New remaining 50,000 → 110,000 > limit.
  await assert.rejects(
    enforceCustomerCreditLimit({
      customerId: ids.customerId,
      newRemaining: 50000,
      user: { id: null, role: 'cashier', username: 'agp' },
    }),
    (err) => {
      assert.equal(err.code, 'CREDIT_LIMIT_EXCEEDED');
      assert.equal(err.statusCode, 422);
      return true;
    }
  );
});

test('credit limit: within the ceiling passes', async () => {
  // 60,000 + 30,000 = 90,000 ≤ 100,000 → ok (no throw).
  await enforceCustomerCreditLimit({
    customerId: ids.customerId,
    newRemaining: 30000,
    user: { id: null, role: 'cashier', username: 'agp' },
  });
});

test('credit limit: manager override is allowed past the ceiling', async () => {
  await enforceCustomerCreditLimit({
    customerId: ids.customerId,
    newRemaining: 50000,
    user: { id: null, role: 'manager', username: 'agp-mgr' },
  });
});

test('credit limit: cash sale with no remaining is never blocked', async () => {
  await enforceCustomerCreditLimit({
    customerId: ids.customerId,
    newRemaining: 0,
    user: { id: null, role: 'cashier', username: 'agp' },
  });
});
