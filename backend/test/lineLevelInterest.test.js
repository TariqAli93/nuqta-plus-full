import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { SaleService } from '../src/services/saleService.js';
import { InventoryService } from '../src/services/inventoryService.js';
import {
  SALE_SOURCE_NEW_SALE,
  SALE_TYPE_CASH,
  SALE_TYPE_INSTALLMENT,
  PAYMENT_METHOD_CASH,
} from '../src/constants/sales.js';

/**
 * Product/line-level installment interest.
 *
 * Interest is now entered per product LINE as a per-unit amount («فائدة الوحدة»)
 * instead of one invoice-level rate. This pins:
 *   1. A line's interest is snapshotted (before/after unit price + amount) and the
 *      base `subtotal` column stays interest-free.
 *   2. The invoice aggregates Σ line interest into sales.interest_amount and folds
 *      it into the total / remaining / installment schedule.
 *   3. Different products in one invoice can carry different interest.
 *   4. Cash invoices ignore interest entirely (no snapshot, no aggregate) — proving
 *      backward compatibility for the non-installment path.
 *   5. completeDraft() persists the same per-line snapshot as create().
 *
 * Isolated by a dedicated branch/warehouse and the reserved `LLI-TEST-%` naming.
 */

const saleService = new SaleService();
const inventoryService = new InventoryService();

const TAG = 'LLI-TEST';
const ids = { saleIds: [] };
let originalFlags = null;
let admin;

async function setFlags(pool, obj) {
  await pool.query(
    `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'test')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(obj)]
  );
}

async function cleanup(pool) {
  const d = async (t) => { try { await pool.query(t); } catch { /* ignore */ } };
  await d(`DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${TAG}-%')`);
  await d(`DELETE FROM product_stock_entries WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${TAG}-%')`);
  await d(`DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE invoice_number LIKE '%${TAG}%')`);
  await d(`DELETE FROM installments WHERE sale_id IN (SELECT id FROM sales WHERE invoice_number LIKE '%${TAG}%')`);
  await d(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE invoice_number LIKE '%${TAG}%')`);
  await d(`DELETE FROM sales WHERE invoice_number LIKE '%${TAG}%'`);
  await d(`DELETE FROM product_units WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${TAG}-%')`);
  await d(`DELETE FROM product_stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${TAG}-%')`);
  await d(`DELETE FROM products WHERE name LIKE '${TAG}-%'`);
  await d(`DELETE FROM customers WHERE name LIKE '${TAG}-%'`);
  await d(`DELETE FROM warehouses WHERE name LIKE '${TAG}-%'`);
  await d(`DELETE FROM branches WHERE name LIKE '${TAG}-%'`);
}

before(async () => {
  const pool = await getPool();
  await cleanup(pool);

  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  const base = JSON.parse(originalFlags || '{}');
  await setFlags(pool, {
    ...base,
    pos: true,
    installments: true,
    accountingPeriods: false,
    treasury: false,
    generalLedger: false,
  });

  const ts = Date.now();
  const br = await pool.query(
    `INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`,
    [`${TAG}-BR-${ts}`]
  );
  ids.branchId = br.rows[0].id;
  const wh = await pool.query(
    `INSERT INTO warehouses (name, branch_id, is_active) VALUES ($1, $2, true) RETURNING id`,
    [`${TAG}-WH-${ts}`, ids.branchId]
  );
  ids.warehouseId = wh.rows[0].id;

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'LLI Admin', 'admin', true) RETURNING id`,
    [`lli-test-admin-${ts}`]
  );
  admin = { id: u.rows[0].id, role: 'admin', username: 'lli-test-admin' };

  const cust = await pool.query(
    `INSERT INTO customers (name, is_active) VALUES ($1, true) RETURNING id`,
    [`${TAG}-عميل-${ts}`]
  );
  ids.customerId = cust.rows[0].id;

  // Two distinct products so we can prove per-line (different) interest.
  const prodA = await pool.query(
    `INSERT INTO products (name, cost_price, selling_price, currency, product_type, stock, is_active)
     VALUES ($1, 1000, 40000, 'IQD', 'inventory', 0, true) RETURNING id`,
    [`${TAG}-سلعة-A-${ts}`]
  );
  ids.productAId = prodA.rows[0].id;
  const prodB = await pool.query(
    `INSERT INTO products (name, cost_price, selling_price, currency, product_type, stock, is_active)
     VALUES ($1, 1000, 30000, 'IQD', 'inventory', 0, true) RETURNING id`,
    [`${TAG}-سلعة-B-${ts}`]
  );
  ids.productBId = prodB.rows[0].id;

  for (const productId of [ids.productAId, ids.productBId]) {
    await inventoryService.adjustStock({
      productId,
      warehouseId: ids.warehouseId,
      quantityChange: 100,
      movementType: 'opening_balance',
      reason: 'seed',
      costPrice: 1000,
      userId: admin.id,
    });
  }
});

after(async () => {
  const pool = await getPool();
  try {
    if (originalFlags !== null) await setFlags(pool, JSON.parse(originalFlags));
    else await pool.query("DELETE FROM settings WHERE key='feature_flags'");
  } catch { /* best effort */ }
  await cleanup(pool);
  await closeDatabase().catch(() => {});
});

const newSale = (over = {}) => ({
  currency: 'IQD',
  saleSource: SALE_SOURCE_NEW_SALE,
  paymentMethod: PAYMENT_METHOD_CASH,
  branchId: ids.branchId,
  warehouseId: ids.warehouseId,
  ...over,
});

async function stockOf(productId, warehouseId) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT quantity FROM product_stock WHERE product_id = $1 AND warehouse_id = $2`,
    [productId, warehouseId]
  );
  return Number(rows[0]?.quantity ?? 0);
}

async function debtOf(customerId) {
  const pool = await getPool();
  const { rows } = await pool.query(`SELECT total_debt FROM customers WHERE id = $1`, [customerId]);
  return Number(rows[0]?.total_debt ?? 0);
}

const itemFor = (sale, productId) => sale.items.find((i) => i.productId === productId);

test('installment line interest: snapshot per line, aggregate on the invoice, base subtotal untouched', async () => {
  const before = await stockOf(ids.productAId, ids.warehouseId);
  const debtBefore = await debtOf(ids.customerId);

  const created = await saleService.create(
    newSale({
      saleType: SALE_TYPE_INSTALLMENT,
      paymentType: 'installment',
      customerId: ids.customerId,
      // qty 2 @ 40000 + 5000 interest/unit → line interest 10000, base 80000.
      items: [{ productId: ids.productAId, quantity: 2, unitPrice: 40000, interestPerUnit: 5000 }],
      paidAmount: 30000,
      installmentCount: 3,
      firstInstallmentDate: '2026-07-01',
      installmentPeriod: 'monthly',
    }),
    admin
  );
  ids.saleIds.push(created.id);

  const sale = await saleService.getById(created.id);

  // Invoice aggregates.
  assert.equal(Number(sale.subtotal), 80000, 'sale.subtotal stays the BASE goods total (no interest)');
  assert.equal(Number(sale.interestAmount), 10000, 'sale.interestAmount = Σ line interest');
  assert.equal(Number(sale.total), 90000, 'total = base subtotal + Σ interest');
  assert.equal(Number(sale.paidAmount), 30000, 'down payment recorded');
  assert.equal(Number(sale.remainingAmount), 60000, 'remaining = total − down payment (interest included)');
  assert.equal(sale.status, 'pending', 'installment sale stays pending');

  // Per-line snapshot.
  const item = itemFor(sale, ids.productAId);
  assert.equal(Number(item.subtotal), 80000, 'line subtotal is the BASE total (interest-free)');
  assert.equal(Number(item.unitPriceBeforeInterest), 40000, 'before-interest unit price snapshot');
  assert.equal(Number(item.interestPerUnit), 5000, 'per-unit interest snapshot');
  assert.equal(Number(item.lineInterestAmount), 10000, 'line interest = qty × interestPerUnit');
  assert.equal(Number(item.unitPriceAfterInterest), 45000, 'after-interest unit price snapshot');

  // Schedule over the 60,000 remaining.
  assert.equal(sale.installments.length, 3, 'three installment rows');
  const sum = sale.installments.reduce((s, i) => s + Number(i.dueAmount), 0);
  assert.equal(sum, 60000, 'installments sum to the remaining balance');

  assert.equal(await debtOf(ids.customerId), debtBefore + 60000, 'customer debt += remaining');
  assert.equal(await stockOf(ids.productAId, ids.warehouseId), before - 2, 'stock deducted exactly once');
});

test('different products in one invoice carry different interest; total reflects the sum', async () => {
  const created = await saleService.create(
    newSale({
      saleType: SALE_TYPE_INSTALLMENT,
      paymentType: 'installment',
      customerId: ids.customerId,
      items: [
        { productId: ids.productAId, quantity: 1, unitPrice: 40000, interestPerUnit: 4000 }, // +4000
        { productId: ids.productBId, quantity: 2, unitPrice: 30000, interestPerUnit: 1000 }, // +2000
      ],
      paidAmount: 0,
      installmentCount: 2,
      firstInstallmentDate: '2026-07-01',
      installmentPeriod: 'monthly',
    }),
    admin
  );
  ids.saleIds.push(created.id);

  const sale = await saleService.getById(created.id);
  assert.equal(Number(sale.subtotal), 100000, 'base goods = 40000 + 60000');
  assert.equal(Number(sale.interestAmount), 6000, 'Σ interest = 4000 + 2000');
  assert.equal(Number(sale.total), 106000, 'total includes the summed interest');

  const a = itemFor(sale, ids.productAId);
  const b = itemFor(sale, ids.productBId);
  assert.equal(Number(a.unitPriceAfterInterest), 44000, 'product A after-interest unit price');
  assert.equal(Number(a.lineInterestAmount), 4000, 'product A line interest');
  assert.equal(Number(b.unitPriceAfterInterest), 31000, 'product B after-interest unit price');
  assert.equal(Number(b.lineInterestAmount), 2000, 'product B line interest (per-unit × 2)');
});

test('cash invoice ignores any line interest (backward compatible)', async () => {
  const created = await saleService.create(
    newSale({
      saleType: SALE_TYPE_CASH,
      paymentType: 'cash',
      customerId: ids.customerId,
      // A stray interestPerUnit on a CASH line must be a no-op.
      items: [{ productId: ids.productAId, quantity: 1, unitPrice: 5000, interestPerUnit: 999 }],
      paidAmount: 5000,
    }),
    admin
  );
  ids.saleIds.push(created.id);

  const sale = await saleService.getById(created.id);
  assert.equal(Number(sale.total), 5000, 'cash total = qty × unitPrice (no interest)');
  assert.equal(Number(sale.interestAmount), 0, 'no interest aggregated for a cash invoice');

  const item = itemFor(sale, ids.productAId);
  assert.equal(Number(item.interestPerUnit), 0, 'cash line stores zero interest');
  assert.equal(Number(item.lineInterestAmount), 0, 'cash line interest amount is zero');
  assert.equal(item.unitPriceAfterInterest, null, 'no after-interest snapshot → renders as legacy/old-style');
  assert.equal(item.unitPriceBeforeInterest, null, 'no before-interest snapshot on a cash line');
});

test('completeDraft persists the same per-line interest snapshot as create()', async () => {
  const draft = await saleService.createDraft(
    newSale({
      saleType: SALE_TYPE_INSTALLMENT,
      paymentType: 'installment',
      customerId: ids.customerId,
      items: [{ productId: ids.productBId, quantity: 2, unitPrice: 30000, interestPerUnit: 2500 }],
    }),
    admin.id
  );

  const completed = await saleService.completeDraft(
    draft.id,
    newSale({
      saleType: SALE_TYPE_INSTALLMENT,
      paymentType: 'installment',
      customerId: ids.customerId,
      items: [{ productId: ids.productBId, quantity: 2, unitPrice: 30000, interestPerUnit: 2500 }],
      paidAmount: 10000,
      installmentCount: 2,
      firstInstallmentDate: '2026-08-01',
      installmentPeriod: 'monthly',
    }),
    admin
  );
  ids.saleIds.push(completed.id);

  const sale = await saleService.getById(completed.id);
  assert.equal(Number(sale.subtotal), 60000, 'completed draft base subtotal');
  assert.equal(Number(sale.interestAmount), 5000, 'completed draft Σ interest = 2 × 2500');
  assert.equal(Number(sale.total), 65000, 'completed draft total includes interest');

  const item = itemFor(sale, ids.productBId);
  assert.equal(Number(item.unitPriceBeforeInterest), 30000, 'draft completion before-interest snapshot');
  assert.equal(Number(item.interestPerUnit), 2500, 'draft completion per-unit interest snapshot');
  assert.equal(Number(item.lineInterestAmount), 5000, 'draft completion line interest');
  assert.equal(Number(item.unitPriceAfterInterest), 32500, 'draft completion after-interest snapshot');
});
