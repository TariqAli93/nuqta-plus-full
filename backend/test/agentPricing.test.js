import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { resolveTierPrice } from '../src/services/productUnitService.js';
import { SaleService, enforceCustomerCreditLimit } from '../src/services/saleService.js';
import reportService from '../src/services/reportService.js';
import { saleSchema } from '../src/utils/validation.js';

const saleService = new SaleService();

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

// Inventory-valuation + price_type persistence fixtures. A product WITHOUT
// wholesale/agent prices proves the COALESCE fallback to retail (سعر المفرد).
before(async () => {
  const pool = await getPool();
  const stamp = Date.now();
  const p = await pool.query(
    `INSERT INTO products (name, sku, cost_price, selling_price, currency, product_type, is_active)
     VALUES ($1, $2, 1000, 1500, 'IQD', 'inventory', true) RETURNING id`,
    [`agp-prod-${stamp}`, `AGPSKU-${stamp}`]
  );
  ids.productId = p.rows[0].id;
  const w = await pool.query(
    `INSERT INTO warehouses (name, is_active) VALUES ($1, true) RETURNING id`,
    [`agp-wh-${stamp}`]
  );
  ids.warehouseId = w.rows[0].id;
  ids.stockQty = 10;
  await pool.query(
    `INSERT INTO product_stock (product_id, warehouse_id, quantity) VALUES ($1, $2, $3)`,
    [ids.productId, ids.warehouseId, ids.stockQty]
  );
});

after(async () => {
  const pool = await getPool();
  const del = async (t, p) => { try { await pool.query(t, p); } catch { /* ignore */ } };
  await del('DELETE FROM sales WHERE customer_id=$1', [ids.customerId]);
  await del('DELETE FROM customers WHERE id=$1', [ids.customerId]);
  // Inventory-valuation fixtures (draft sale cascades its sale_items).
  if (ids.draftId) await del('DELETE FROM sales WHERE id=$1', [ids.draftId]);
  await del('DELETE FROM product_stock WHERE product_id=$1', [ids.productId]);
  await del('DELETE FROM product_units WHERE product_id=$1', [ids.productId]);
  await del('DELETE FROM products WHERE id=$1', [ids.productId]);
  await del('DELETE FROM warehouses WHERE id=$1', [ids.warehouseId]);
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

// ── price_type plumbing ─────────────────────────────────────────────────────
test('saleSchema preserves a valid priceType and drops an invalid one', () => {
  const base = {
    currency: 'IQD',
    saleSource: 'POS',
    saleType: 'CASH',
    items: [{ productId: 1, quantity: 1, unitPrice: 100 }],
  };
  // Valid tier survives validation and reaches the service.
  assert.equal(saleSchema.parse({ ...base, priceType: 'wholesale' }).priceType, 'wholesale');
  // Omitted → undefined (the service then defaults to 'retail').
  assert.equal(saleSchema.parse({ ...base }).priceType, undefined);
  // Unknown tier is rejected by the enum.
  assert.throws(() => saleSchema.parse({ ...base, priceType: 'vip' }));
});

// ── Inventory valuation (قيمة المخزون حسب التسعيرة) ──────────────────────────
test('getInventoryValuation: missing wholesale/agent fall back to retail (COALESCE)', async () => {
  const report = await reportService.getInventoryValuation({}, { id: null, role: 'admin', username: 'agp' });
  const row = report.rows.find((r) => r.productId === ids.productId);
  assert.ok(row, 'the test product should appear in the valuation rows');
  assert.equal(row.quantity, ids.stockQty);
  // value = quantity × tier price; retail = selling_price (1500).
  assert.equal(row.retailValue, ids.stockQty * 1500);
  // No wholesale/agent price set → both tiers COALESCE to the retail value.
  assert.equal(row.wholesaleValue, row.retailValue);
  assert.equal(row.agentValue, row.retailValue);
  assert.equal(row.costValue, ids.stockQty * 1000);
  // Per-currency totals include this product's currency.
  assert.ok(report.totalsByCurrency.IQD, 'IQD totals should be present');
});

// ── price_type is persisted on the sale + its line items ─────────────────────
test('createDraft stamps price_type on the sale and its items', async () => {
  const draft = await saleService.createDraft(
    {
      currency: 'IQD',
      priceType: 'agent',
      items: [{ productId: ids.productId, quantity: 2, unitPrice: 1200 }],
    },
    null
  );
  ids.draftId = draft.id;
  // getById exposes the stamped tier on the header and each line.
  assert.equal(draft.priceType, 'agent');
  assert.ok(Array.isArray(draft.items) && draft.items.length >= 1);
  assert.equal(draft.items[0].priceType, 'agent');
});
