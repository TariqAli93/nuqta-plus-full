import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { SaleService } from '../src/services/saleService.js';
import { InventoryService } from '../src/services/inventoryService.js';
import {
  SALE_SOURCE_NEW_SALE,
  SALE_TYPE_CASH,
  PAYMENT_METHOD_CASH,
} from '../src/constants/sales.js';

/**
 * Custom per-line price — the actual price used on the invoice (custom or
 * catalog) is what gets saved, totalled and reported, and it is FROZEN against
 * later catalog price changes.
 *
 * Pins (spec §3, §5, §8):
 *   1. A line with no custom price stores the catalog price.
 *   2. A line with a custom price (≠ catalog) stores the custom price; the
 *      invoice total and per-item profit are computed from it.
 *   3. Changing the product's selling price afterwards does NOT change the saved
 *      invoice line (immutable snapshot).
 */

const saleService = new SaleService();
const inventoryService = new InventoryService();

const TAG = 'CLP-TEST';
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
     VALUES ($1, 'x', 'CLP Admin', 'admin', true) RETURNING id`,
    [`clp-test-admin-${ts}`]
  );
  admin = { id: u.rows[0].id, role: 'admin', username: 'clp-test-admin' };

  // Catalog selling price = 5000, cost = 1000.
  const prod = await pool.query(
    `INSERT INTO products (name, cost_price, selling_price, currency, product_type, stock, is_active)
     VALUES ($1, 1000, 5000, 'IQD', 'inventory', 0, true) RETURNING id`,
    [`${TAG}-سلعة-${ts}`]
  );
  ids.productId = prod.rows[0].id;

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
  saleType: SALE_TYPE_CASH,
  paymentType: 'cash',
  paymentMethod: PAYMENT_METHOD_CASH,
  branchId: ids.branchId,
  warehouseId: ids.warehouseId,
  customerId: ids.customerId,
  ...over,
});

const lineFor = (sale) => sale.items.find((i) => i.productId === ids.productId);

test('no custom price → catalog price (5000) is used and stored', async () => {
  const created = await saleService.create(
    newSale({ items: [{ productId: ids.productId, quantity: 1, unitPrice: 5000 }], paidAmount: 5000 }),
    admin
  );
  ids.saleIds.push(created.id);

  const sale = await saleService.getById(created.id);
  assert.equal(Number(sale.total), 5000, 'total = catalog price');
  assert.equal(Number(lineFor(sale).unitPrice), 5000, 'line stores the catalog price');
});

test('custom price (≠ catalog) is stored; total + profit use the actual price', async () => {
  // Catalog is 5000, sell at a custom 6000 × 2.
  const created = await saleService.create(
    newSale({ items: [{ productId: ids.productId, quantity: 2, unitPrice: 6000 }], paidAmount: 12000 }),
    admin
  );
  ids.saleIds.push(created.id);

  // Raw DB column holds the ACTUAL sold price, not the catalog price.
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT unit_price, subtotal FROM sale_items WHERE sale_id = $1`,
    [created.id]
  );
  assert.equal(Number(rows[0].unit_price), 6000, 'sale_items.unit_price = the custom price');
  assert.equal(Number(rows[0].subtotal), 12000, 'line subtotal uses the custom price');

  const sale = await saleService.getById(created.id);
  const line = lineFor(sale);
  assert.equal(Number(sale.total), 12000, 'invoice total = 2 × 6000 (custom)');
  assert.equal(Number(line.unitPrice), 6000, 'getById returns the custom price');
  // Profit is computed from the actual sold price: (6000 − 1000) × 2 = 10000.
  assert.equal(Number(line.profit), 10000, 'profit uses the actual sold price, not the catalog');

  ids.customSaleId = created.id;
});

test('changing the product price later does NOT change the saved invoice line', async () => {
  const pool = await getPool();
  // Bump the catalog price well away from the sold price.
  await pool.query(`UPDATE products SET selling_price = 9999 WHERE id = $1`, [ids.productId]);

  const sale = await saleService.getById(ids.customSaleId);
  const line = lineFor(sale);
  assert.equal(Number(line.unitPrice), 6000, 'old invoice keeps its sold price (immutable snapshot)');
  assert.equal(Number(sale.total), 12000, 'old invoice total unchanged after catalog edit');
  assert.equal(Number(line.profit), 10000, 'profit still from the sold price');

  // Restore for isolation hygiene.
  await pool.query(`UPDATE products SET selling_price = 5000 WHERE id = $1`, [ids.productId]);
});
