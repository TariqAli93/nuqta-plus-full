import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { SaleService } from '../src/services/saleService.js';
import { InventoryService } from '../src/services/inventoryService.js';
import {
  SALE_SOURCE_NEW_SALE,
  SALE_SOURCE_POS,
  SALE_TYPE_CASH,
  SALE_TYPE_INSTALLMENT,
  PAYMENT_METHOD_CASH,
} from '../src/constants/sales.js';

/**
 * «فاتورة بيع جديدة» — the unified New-Sale invoice (cash OR installment),
 * driven through the real SaleService.create().
 *
 * Pins the acceptance criteria that motivated the rename + cash support:
 *   1. A cash invoice saves with NO installment data (the old "Validation Error").
 *   2. A cash invoice is paid in full → remaining = 0, status completed.
 *   3. A cash invoice creates NO installment rows and adds NO customer debt.
 *   4. An installment invoice without a customer is rejected.
 *   5. An installment invoice builds the correct schedule (count, dates, sum) and
 *      records the deferred balance as customer debt.
 *   6. Stock is deducted exactly once for either payment type.
 *
 * Isolated by a dedicated branch/warehouse and the reserved `NSI-TEST-%` naming.
 * Feature flags forced to a minimal set (pos + installments on; periods/treasury/
 * GL off so the payment path is a pure no-op) and restored afterwards.
 */

const saleService = new SaleService();
const inventoryService = new InventoryService();

const TAG = 'NSI-TEST';
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
     VALUES ($1, 'x', 'NSI Admin', 'admin', true) RETURNING id`,
    [`nsi-test-admin-${ts}`]
  );
  admin = { id: u.rows[0].id, role: 'admin', username: 'nsi-test-admin' };

  const cust = await pool.query(
    `INSERT INTO customers (name, is_active) VALUES ($1, true) RETURNING id`,
    [`${TAG}-عميل-${ts}`]
  );
  ids.customerId = cust.rows[0].id;

  const prod = await pool.query(
    `INSERT INTO products (name, cost_price, selling_price, currency, product_type, stock, is_active)
     VALUES ($1, 1000, 5000, 'IQD', 'inventory', 0, true) RETURNING id`,
    [`${TAG}-سلعة-${ts}`]
  );
  ids.productId = prod.rows[0].id;

  // Seed plenty of sellable stock through the real inventory path (FIFO entries).
  await inventoryService.adjustStock({
    productId: ids.productId,
    warehouseId: ids.warehouseId,
    quantityChange: 100,
    movementType: 'opening_balance',
    reason: 'seed',
    costPrice: 1000,
    userId: admin.id,
  });
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

test('cash invoice paid in full: remaining 0, completed, no installments, no debt, stock −once', async () => {
  const before = await stockOf(ids.productId, ids.warehouseId);
  const debtBefore = await debtOf(ids.customerId);

  // A fully-paid cash invoice now sends paidAmount = total (the service no
  // longer force-fills it — see the partial/deferred tests below).
  const sale = await saleService.create(
    newSale({
      saleType: SALE_TYPE_CASH,
      paymentType: 'cash',
      customerId: ids.customerId,
      items: [{ productId: ids.productId, quantity: 2, unitPrice: 5000 }],
      paidAmount: 10000,
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  assert.equal(sale.total, 10000, 'invoice total = 2 × 5000');
  assert.equal(sale.paidAmount, 10000, 'a fully-paid cash invoice records the full amount');
  assert.equal(sale.remainingAmount, 0, 'nothing remaining on a fully-paid invoice');
  assert.equal(sale.status, 'completed', 'a fully paid sale is completed');
  assert.equal(sale.installments.length, 0, 'cash invoice creates NO installment rows');

  // A cash payment is recorded and linked to the invoice (feeds the cashbox/
  // reports the same way POS cash does).
  assert.equal(sale.payments.length, 1, 'one cash payment recorded');
  assert.equal(Number(sale.payments[0].amount), 10000, 'payment equals the invoice total');

  assert.equal(await debtOf(ids.customerId), debtBefore, 'a fully-paid invoice adds NO customer debt');
  assert.equal(await stockOf(ids.productId, ids.warehouseId), before - 2, 'stock deducted exactly once');
});

test('installment invoice without a customer is rejected (Arabic message)', async () => {
  await assert.rejects(
    () =>
      saleService.create(
        newSale({
          saleType: SALE_TYPE_INSTALLMENT,
          paymentType: 'installment',
          items: [{ productId: ids.productId, quantity: 1, unitPrice: 5000 }],
          installmentCount: 3,
          firstInstallmentDate: '2026-07-01',
          installmentPeriod: 'monthly',
          paidAmount: 0,
        }),
        admin
      ),
    (err) => {
      assert.match(err.message, /العميل/, 'rejects with an Arabic customer-required message');
      return true;
    }
  );
});

test('installment invoice: builds the correct schedule + dates and records the debt', async () => {
  const before = await stockOf(ids.productId, ids.warehouseId);
  const debtBefore = await debtOf(ids.customerId);

  const sale = await saleService.create(
    newSale({
      saleType: SALE_TYPE_INSTALLMENT,
      paymentType: 'installment',
      customerId: ids.customerId,
      items: [{ productId: ids.productId, quantity: 1, unitPrice: 90000 }],
      paidAmount: 30000, // الدفعة المقدمة
      installmentCount: 3,
      firstInstallmentDate: '2026-07-01',
      installmentPeriod: 'monthly',
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  assert.equal(sale.total, 90000, 'invoice total');
  assert.equal(sale.paidAmount, 30000, 'down payment recorded');
  assert.equal(sale.remainingAmount, 60000, 'remaining = total − down payment');
  assert.equal(sale.status, 'pending', 'an installment sale stays pending');

  // 3 installments over the 60,000 remaining, summing exactly to it.
  assert.equal(sale.installments.length, 3, 'three installment rows');
  const sum = sale.installments.reduce((s, i) => s + Number(i.dueAmount), 0);
  assert.equal(sum, 60000, 'installments sum to the remaining balance');

  const byNo = [...sale.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  assert.equal(byNo[0].dueDate, '2026-07-01', 'first due date honours firstInstallmentDate (no TZ shift)');
  assert.equal(byNo[1].dueDate, '2026-08-01', 'monthly step');
  assert.equal(byNo[2].dueDate, '2026-09-01', 'monthly step');

  assert.equal(await debtOf(ids.customerId), debtBefore + 60000, 'customer debt += remaining');
  assert.equal(await stockOf(ids.productId, ids.warehouseId), before - 1, 'stock deducted exactly once');
});

test('installment invoice: weekly periodicity steps the due dates by 7 days', async () => {
  const sale = await saleService.create(
    newSale({
      saleType: SALE_TYPE_INSTALLMENT,
      paymentType: 'installment',
      customerId: ids.customerId,
      items: [{ productId: ids.productId, quantity: 1, unitPrice: 40000 }],
      paidAmount: 0,
      installmentCount: 4,
      firstInstallmentDate: '2026-07-01',
      installmentPeriod: 'weekly',
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  const dates = [...sale.installments]
    .sort((a, b) => a.installmentNumber - b.installmentNumber)
    .map((i) => i.dueDate);
  assert.deepEqual(dates, ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22'], 'weekly cadence');
});

// ── Partial / deferred CASH invoices (NewSale.vue partial-payment support) ────

test('cash invoice partially paid: remaining booked as debt, payment = received only', async () => {
  const before = await stockOf(ids.productId, ids.warehouseId);
  const debtBefore = await debtOf(ids.customerId);

  const sale = await saleService.create(
    newSale({
      saleType: SALE_TYPE_CASH,
      paymentType: 'cash',
      customerId: ids.customerId,
      items: [{ productId: ids.productId, quantity: 2, unitPrice: 5000 }], // total 10000
      paidAmount: 4000,
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  assert.equal(sale.total, 10000, 'invoice total');
  assert.equal(sale.paidAmount, 4000, 'records only what was received');
  assert.equal(sale.remainingAmount, 6000, 'remaining = total − received');
  assert.equal(sale.status, 'pending', 'a partially-paid sale stays pending');
  assert.equal(sale.installments.length, 0, 'a partial CASH sale creates NO installments');
  assert.equal(sale.payments.length, 1, 'exactly one payment row');
  assert.equal(Number(sale.payments[0].amount), 4000, 'payment = received amount, not the total');
  assert.equal(await debtOf(ids.customerId), debtBefore + 6000, 'customer debt += remaining');
  assert.equal(await stockOf(ids.productId, ids.warehouseId), before - 2, 'stock deducted once');
});

test('cash invoice fully deferred (received 0): full debt, NO payment row, status pending', async () => {
  const debtBefore = await debtOf(ids.customerId);

  const sale = await saleService.create(
    newSale({
      saleType: SALE_TYPE_CASH,
      paymentType: 'cash',
      customerId: ids.customerId,
      items: [{ productId: ids.productId, quantity: 1, unitPrice: 7000 }],
      paidAmount: 0,
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  assert.equal(sale.paidAmount, 0, 'nothing collected');
  assert.equal(sale.remainingAmount, 7000, 'the whole invoice is outstanding');
  assert.equal(sale.status, 'pending', 'an unpaid sale stays pending');
  assert.equal(sale.payments.length, 0, 'NO phantom cash payment when received = 0');
  assert.equal(await debtOf(ids.customerId), debtBefore + 7000, 'customer debt += full total');
});

test('cash invoice that leaves a balance WITHOUT a customer is rejected (Arabic)', async () => {
  await assert.rejects(
    () =>
      saleService.create(
        newSale({
          saleType: SALE_TYPE_CASH,
          paymentType: 'cash',
          items: [{ productId: ids.productId, quantity: 1, unitPrice: 5000 }],
          paidAmount: 1000, // leaves a balance, no customer
        }),
        admin
      ),
    (err) => {
      assert.match(err.message, /العميل/, 'customer required when a balance remains');
      return true;
    }
  );
});

test('cash invoice overpayment is capped at the total (no negative remaining)', async () => {
  const sale = await saleService.create(
    newSale({
      saleType: SALE_TYPE_CASH,
      paymentType: 'cash',
      customerId: ids.customerId,
      items: [{ productId: ids.productId, quantity: 1, unitPrice: 5000 }],
      paidAmount: 9000, // more than the 5000 total
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  assert.equal(sale.paidAmount, 5000, 'paid is capped at the invoice total');
  assert.equal(sale.remainingAmount, 0, 'no negative remaining');
  assert.equal(sale.status, 'completed', 'fully paid');
  assert.equal(Number(sale.payments[0].amount), 5000, 'payment row is the capped amount');
});

// ── POS stays cash-only: backend enforces full payment (PosScreen unchanged) ──

test('POS sale must be paid in full — a short POS payment is rejected', async () => {
  await assert.rejects(
    () =>
      saleService.create(
        newSale({
          saleSource: SALE_SOURCE_POS,
          saleType: SALE_TYPE_CASH,
          paymentType: 'cash',
          items: [{ productId: ids.productId, quantity: 1, unitPrice: 5000 }],
          paidAmount: 2000, // short
        }),
        admin
      ),
    (err) => {
      assert.match(err.message, /نقطة البيع/, 'a POS sale may not leave a balance');
      return true;
    }
  );
});

test('POS sale paid in full succeeds with no remaining', async () => {
  const sale = await saleService.create(
    newSale({
      saleSource: SALE_SOURCE_POS,
      saleType: SALE_TYPE_CASH,
      paymentType: 'cash',
      items: [{ productId: ids.productId, quantity: 1, unitPrice: 5000 }],
      paidAmount: 5000,
    }),
    admin
  );
  ids.saleIds.push(sale.id);
  assert.equal(sale.remainingAmount, 0, 'POS leaves no balance');
  assert.equal(sale.status, 'completed', 'POS sale completed');
});

// ── Settling the debt later via the single addPayment service ────────────────

test('later payments settle a partial cash invoice; debt + status track the payments', async () => {
  const debtBefore = await debtOf(ids.customerId);

  const sale = await saleService.create(
    newSale({
      saleType: SALE_TYPE_CASH,
      paymentType: 'cash',
      customerId: ids.customerId,
      items: [{ productId: ids.productId, quantity: 2, unitPrice: 5000 }], // total 10000
      paidAmount: 3000,
    }),
    admin
  );
  ids.saleIds.push(sale.id);
  assert.equal(sale.remainingAmount, 7000, 'starts with 7000 outstanding');
  assert.equal(await debtOf(ids.customerId), debtBefore + 7000, 'debt booked on creation');

  // A payment above the remaining is rejected with a clear message.
  await assert.rejects(
    () => saleService.addPayment(sale.id, { amount: 9000, paymentMethod: 'cash' }, admin.id),
    (err) => {
      assert.match(err.message, /يتجاوز المبلغ المتبقي/, 'rejects a payment above the remaining');
      return true;
    }
  );

  // Partial settlement adds a NEW payment row (the first one is untouched).
  await saleService.addPayment(sale.id, { amount: 4000, paymentMethod: 'cash' }, admin.id);
  let after = await saleService.getById(sale.id);
  assert.equal(Number(after.paidAmount), 7000, 'paid = 3000 + 4000');
  assert.equal(Number(after.remainingAmount), 3000, 'remaining drops to 3000');
  assert.equal(after.status, 'pending', 'still pending');
  assert.equal(await debtOf(ids.customerId), debtBefore + 3000, 'debt reduced by the payment');
  assert.equal(after.payments.length, 2, 'a new payment row is appended');

  // Final settlement → completed, debt back to baseline.
  await saleService.addPayment(sale.id, { amount: 3000, paymentMethod: 'cash' }, admin.id);
  after = await saleService.getById(sale.id);
  assert.equal(Number(after.remainingAmount), 0, 'fully settled');
  assert.equal(after.status, 'completed', 'status flips to completed');
  assert.equal(await debtOf(ids.customerId), debtBefore, 'customer debt back to baseline');
  assert.equal(after.payments.length, 3, 'three independent payment rows');

  // Reports read collected = SUM(payments) — equals the total once settled.
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount::numeric),0) AS s FROM payments WHERE sale_id = $1`,
    [sale.id]
  );
  assert.equal(Number(rows[0].s), 10000, 'sum of payment rows equals the invoice total');
});
