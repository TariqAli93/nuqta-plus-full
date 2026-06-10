import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import supplierService from '../src/services/supplierService.js';
import purchaseService from '../src/services/purchaseService.js';
import treasuryService from '../src/services/treasuryService.js';

/**
 * Suppliers + Purchases (الموردون والمشتريات) suite.
 *
 * Covers: purchase → FIFO batch + stock movement; cash/credit AP math; the
 * supplier debt cache vs authoritative Σ remaining; supplier payments via
 * vouchers; purchase returns (batch-preferred deduction + debt/refund split);
 * cancel guard; and the products.supplier backfill idempotency.
 *
 * Isolation: currency 'IQD' but all rows belong to suppliers/products named
 * 'PUR-test%', deleted in after(). Flags saved/restored per convention.
 */

const original = {};
let user;
const ids = { supplierIds: [], productIds: [], invoiceIds: [], cashboxIds: [] };

async function readSetting(pool, key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function writeSetting(pool, key, value) {
  if (value === null) {
    await pool.query('DELETE FROM settings WHERE key = $1', [key]);
  } else {
    await pool.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, $2, 'test')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

async function cleanupPriorTestData(pool) {
  const tryDel = async (text, params) => { try { await pool.query(text, params); } catch { /* ignore */ } };
  await tryDel(`DELETE FROM vouchers WHERE purchase_invoice_id IN (SELECT id FROM purchase_invoices WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'PUR-test%'))`);
  await tryDel(`DELETE FROM purchase_return_items WHERE return_id IN (SELECT id FROM purchase_returns WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'PUR-test%'))`);
  await tryDel(`DELETE FROM purchase_returns WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'PUR-test%')`);
  await tryDel(`DELETE FROM purchase_items WHERE purchase_invoice_id IN (SELECT id FROM purchase_invoices WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'PUR-test%'))`);
  await tryDel(`DELETE FROM purchase_invoices WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'PUR-test%')`);
  await tryDel(`DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'PUR-test%')`);
  await tryDel(`DELETE FROM product_stock_entries WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'PUR-test%')`);
  await tryDel(`DELETE FROM product_stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'PUR-test%')`);
  await tryDel(`DELETE FROM product_units WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'PUR-test%')`);
  await tryDel(`DELETE FROM products WHERE name LIKE 'PUR-test%'`);
  await tryDel(`UPDATE products SET supplier_id = NULL WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'PUR-test%')`);
  await tryDel(`DELETE FROM suppliers WHERE name LIKE 'PUR-test%'`);
  await tryDel(`DELETE FROM cashboxes WHERE name LIKE 'PUR-test%'`);
  await tryDel(`DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'pur-test%')`);
  await tryDel(`DELETE FROM users WHERE username LIKE 'pur-test%'`);
}

async function createProduct(pool, { name, costPrice = 10, sellingPrice = 15 }) {
  const { rows } = await pool.query(
    `INSERT INTO products (name, cost_price, selling_price, currency, product_type, stock, is_active)
     VALUES ($1, $2, $3, 'IQD', 'inventory', 0, true) RETURNING id`,
    [name, costPrice, sellingPrice]
  );
  ids.productIds.push(rows[0].id);
  return rows[0].id;
}

before(async () => {
  const pool = await getPool();
  await cleanupPriorTestData(pool);
  for (const key of ['feature_flags', 'app_mode']) original[key] = await readSetting(pool, key);

  const flags = JSON.parse(original.feature_flags || '{}');
  await writeSetting(pool, 'app_mode', 'full');
  await writeSetting(
    pool,
    'feature_flags',
    JSON.stringify({
      ...flags,
      suppliers: true,
      purchases: true,
      treasury: true,
      accountingPeriods: false,
    })
  );

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'Purchase Test', 'admin', true) RETURNING id`,
    [`pur-test-${Date.now()}`]
  );
  user = { id: u.rows[0].id, role: 'admin', username: 'pur-test' };
});

after(async () => {
  const pool = await getPool();
  await cleanupPriorTestData(pool);
  for (const key of ['feature_flags', 'app_mode']) await writeSetting(pool, key, original[key]);
  await closeDatabase().catch(() => {});
});

test('supplier CRUD + duplicate-name guard', async () => {
  const s = await supplierService.create({ name: 'PUR-test-supplier-A', phone: '07701234567' }, user);
  ids.supplierIds.push(s.id);
  assert.equal(s.totalDebt, 0);

  await assert.rejects(
    supplierService.create({ name: 'PUR-test-supplier-A' }, user),
    /مسبقاً/
  );

  const updated = await supplierService.update(s.id, { city: 'بغداد' }, user);
  assert.equal(updated.city, 'بغداد');
});

test('credit purchase: stock in via FIFO batch, AP debt recorded, caches correct', async () => {
  const pool = await getPool();
  const supplier = await supplierService.create({ name: 'PUR-test-supplier-B' }, user);
  ids.supplierIds.push(supplier.id);
  const productId = await createProduct(pool, { name: 'PUR-test-product-1', costPrice: 10 });

  const invoice = await purchaseService.create(
    {
      supplierId: supplier.id,
      items: [{ productId, quantity: 50, unitCost: 12 }],
      currency: 'IQD',
      paymentType: 'credit',
      paidAmount: 0,
    },
    user
  );
  ids.invoiceIds.push(invoice.id);
  assert.ok(invoice.invoiceNumber.startsWith('PUR'), 'numbered via document_sequences');
  assert.equal(invoice.total, 600);
  assert.equal(invoice.remainingAmount, 600);

  // FIFO batch created with the purchase cost.
  const { rows: entries } = await pool.query(
    `SELECT * FROM product_stock_entries WHERE product_id = $1 AND status = 'active'`,
    [productId]
  );
  assert.equal(entries.length, 1);
  assert.equal(Number(entries[0].remaining_quantity), 50);
  assert.equal(Number(entries[0].cost_price), 12);

  // Canonical per-warehouse quantity bumped + movement row written.
  const { rows: stock } = await pool.query(
    `SELECT quantity FROM product_stock WHERE product_id = $1`,
    [productId]
  );
  assert.equal(Number(stock[0].quantity), 50);
  const { rows: moves } = await pool.query(
    `SELECT movement_type, quantity_change FROM stock_movements WHERE product_id = $1 ORDER BY id DESC LIMIT 1`,
    [productId]
  );
  assert.equal(moves[0].movement_type, 'purchase');
  assert.equal(Number(moves[0].quantity_change), 50);

  // Supplier cache matches authoritative Σ remaining.
  const reloaded = await supplierService.getById(supplier.id);
  assert.equal(reloaded.totalDebt, 600);
  const debts = await supplierService.getDebts(supplier.id);
  assert.equal(debts.totalsByCurrency.IQD, 600);
});

test('supplier payment via voucher reduces AP + cashbox balance', async () => {
  const pool = await getPool();
  const supplier = await supplierService.create({ name: 'PUR-test-supplier-C' }, user);
  ids.supplierIds.push(supplier.id);
  const productId = await createProduct(pool, { name: 'PUR-test-product-2' });

  const box = await treasuryService.createCashbox(
    { name: 'PUR-test-box', openingBalances: { IQD: 100000 } },
    user
  );
  ids.cashboxIds.push(box.id);

  const invoice = await purchaseService.create(
    {
      supplierId: supplier.id,
      items: [{ productId, quantity: 10, unitCost: 1000 }],
      currency: 'IQD',
      paymentType: 'credit',
    },
    user
  );
  ids.invoiceIds.push(invoice.id);
  assert.equal(invoice.remainingAmount, 10000);

  const result = await purchaseService.addPayment(
    invoice.id,
    { amount: 4000, cashboxId: box.id },
    user
  );
  assert.equal(result.remainingAmount, 6000);
  assert.ok(result.voucherId, 'payment voucher minted');

  const boxAfter = await treasuryService.getCashboxById(box.id, user);
  assert.equal(boxAfter.balances.IQD, 96000, 'cashbox reduced by the supplier payment');

  const reloaded = await supplierService.getById(supplier.id);
  assert.equal(reloaded.totalDebt, 6000);
});

test('purchase return: batch-preferred stock-out + debt reduction first', async () => {
  const pool = await getPool();
  const supplier = await supplierService.create({ name: 'PUR-test-supplier-D' }, user);
  ids.supplierIds.push(supplier.id);
  const productId = await createProduct(pool, { name: 'PUR-test-product-3' });

  const invoice = await purchaseService.create(
    {
      supplierId: supplier.id,
      items: [{ productId, quantity: 20, unitCost: 500 }],
      currency: 'IQD',
      paymentType: 'credit',
    },
    user
  );
  ids.invoiceIds.push(invoice.id);
  // total 10000, all on credit.

  const full = await purchaseService.getById(invoice.id, user);
  const line = full.items[0];

  const ret = await purchaseService.createReturn(
    invoice.id,
    { items: [{ purchaseItemId: line.id, quantity: 5 }] },
    user
  );
  assert.equal(ret.returnedValue, 2500);
  assert.equal(ret.debtReduction, 2500, 'debt reduced first — no cash involved');
  assert.equal(ret.refundAmount, 0);

  // Stock left from the SAME batch.
  const { rows: entries } = await pool.query(
    `SELECT remaining_quantity FROM product_stock_entries WHERE id = $1`,
    [line.productStockEntryId]
  );
  assert.equal(Number(entries[0].remaining_quantity), 15);

  const { rows: stock } = await pool.query(
    `SELECT quantity FROM product_stock WHERE product_id = $1`,
    [productId]
  );
  assert.equal(Number(stock[0].quantity), 15);

  // Over-return guard.
  await assert.rejects(
    purchaseService.createReturn(
      invoice.id,
      { items: [{ purchaseItemId: line.id, quantity: 16 }] },
      user
    ),
    /تتجاوز/
  );

  const reloaded = await supplierService.getById(supplier.id);
  assert.equal(reloaded.totalDebt, 7500);
});

test('cash purchase return refunds cash via receipt voucher', async () => {
  const pool = await getPool();
  const supplier = await supplierService.create({ name: 'PUR-test-supplier-E' }, user);
  ids.supplierIds.push(supplier.id);
  const productId = await createProduct(pool, { name: 'PUR-test-product-4' });
  const box = await treasuryService.createCashbox(
    { name: 'PUR-test-box-2', openingBalances: { IQD: 50000 } },
    user
  );
  ids.cashboxIds.push(box.id);

  // Fully paid cash purchase: 10 × 1000 = 10000 (cash leaves the box).
  const invoice = await purchaseService.create(
    {
      supplierId: supplier.id,
      items: [{ productId, quantity: 10, unitCost: 1000 }],
      currency: 'IQD',
      paymentType: 'cash',
      cashboxId: box.id,
    },
    user
  );
  ids.invoiceIds.push(invoice.id);
  assert.equal(invoice.remainingAmount, 0);

  let boxState = await treasuryService.getCashboxById(box.id, user);
  assert.equal(boxState.balances.IQD, 40000, 'cash purchase paid from the box');

  const full = await purchaseService.getById(invoice.id, user);
  const ret = await purchaseService.createReturn(
    invoice.id,
    { items: [{ purchaseItemId: full.items[0].id, quantity: 4 }], cashboxId: box.id },
    user
  );
  assert.equal(ret.debtReduction, 0, 'no remaining debt → all cash');
  assert.equal(ret.refundAmount, 4000);

  boxState = await treasuryService.getCashboxById(box.id, user);
  assert.equal(boxState.balances.IQD, 44000, 'supplier refund came back into the box');
});

test('cancel purchase reverses stock and caches; blocked after consumption', async () => {
  const pool = await getPool();
  const supplier = await supplierService.create({ name: 'PUR-test-supplier-F' }, user);
  ids.supplierIds.push(supplier.id);
  const productId = await createProduct(pool, { name: 'PUR-test-product-5' });

  const invoice = await purchaseService.create(
    {
      supplierId: supplier.id,
      items: [{ productId, quantity: 8, unitCost: 250 }],
      currency: 'IQD',
      paymentType: 'credit',
    },
    user
  );
  const cancelled = await purchaseService.cancel(invoice.id, 'اختبار', user);
  assert.equal(cancelled.status, 'cancelled');

  const { rows: stock } = await pool.query(
    `SELECT quantity FROM product_stock WHERE product_id = $1`,
    [productId]
  );
  assert.equal(Number(stock[0].quantity), 0, 'stock reversed');

  const reloaded = await supplierService.getById(supplier.id);
  assert.equal(reloaded.totalDebt, 0, 'AP cache reversed');

  // Consume from a new purchase's batch, then try cancelling it → blocked.
  const invoice2 = await purchaseService.create(
    {
      supplierId: supplier.id,
      items: [{ productId, quantity: 5, unitCost: 250 }],
      currency: 'IQD',
      paymentType: 'credit',
    },
    user
  );
  ids.invoiceIds.push(invoice2.id);
  await pool.query(
    `UPDATE product_stock_entries SET remaining_quantity = remaining_quantity - 1
     WHERE id = (SELECT product_stock_entry_id FROM purchase_items WHERE purchase_invoice_id = $1 LIMIT 1)`,
    [invoice2.id]
  );
  await assert.rejects(
    purchaseService.cancel(invoice2.id, 'اختبار', user),
    (err) => err.code === 'PURCHASE_ALREADY_CONSUMED'
  );
});

test('supplier backfill is idempotent (migration 0007 re-run safe)', async () => {
  const pool = await getPool();
  // Simulate a legacy product with only the text supplier.
  const productId = await createProduct(pool, { name: 'PUR-test-product-legacy' });
  await pool.query(`UPDATE products SET supplier = 'PUR-test-legacy-supplier', supplier_id = NULL WHERE id = $1`, [productId]);

  const backfill = async () => {
    await pool.query(`
      INSERT INTO suppliers (name)
      SELECT DISTINCT trim(supplier) FROM products
      WHERE supplier IS NOT NULL AND trim(supplier) <> ''
      ON CONFLICT (name) DO NOTHING
    `);
    await pool.query(`
      UPDATE products p SET supplier_id = s.id
      FROM suppliers s
      WHERE p.supplier_id IS NULL AND p.supplier IS NOT NULL AND trim(p.supplier) = s.name
    `);
  };

  await backfill();
  await backfill(); // second run must be a no-op

  const { rows: sup } = await pool.query(
    `SELECT id FROM suppliers WHERE name = 'PUR-test-legacy-supplier'`
  );
  assert.equal(sup.length, 1, 'exactly one supplier row after two runs');
  const { rows: prod } = await pool.query(`SELECT supplier_id FROM products WHERE id = $1`, [productId]);
  assert.equal(Number(prod[0].supplier_id), Number(sup[0].id));

  ids.supplierIds.push(sup[0].id);
});
