import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, getDb, closeDatabase } from '../src/db.js';
import { SaleService } from '../src/services/saleService.js';
import { ProductService } from '../src/services/productService.js';
import {
  SALE_SOURCE_POS,
  SALE_TYPE_CASH,
  PAYMENT_METHOD_CASH,
} from '../src/constants/sales.js';

/**
 * Service sales end-to-end (نظام الخدمات), driven through the real SaleService.
 *
 * Pins the business rules:
 *   1. A service with NO fixed price can be sold by entering the received price
 *      (السعر المستلم); the received amount becomes the line price.
 *   2. The whole received amount is net profit (cost = 0).
 *   3. NO stock movement is recorded for a service line.
 *   4. A service and a physical product CANNOT be mixed in one invoice.
 *   5. A service line with no received price is rejected with a clear message.
 *
 * Isolated by a dedicated branch/warehouse and the reserved `SVC-TEST-%` naming
 * so the before-hook can self-heal a shared dev DB after an interrupted run.
 * Feature flags are forced to a minimal, side-effect-free set (pos on; periods,
 * treasury and GL off) and restored afterwards.
 */

const saleService = new SaleService();
const productService = new ProductService();

const TAG = 'SVC-TEST';
const ids = { productIds: [], saleIds: [] };
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
  const d = async (t, p) => { try { await pool.query(t, p); } catch { /* ignore */ } };
  await d(`DELETE FROM stock_movements WHERE reference_id IN (SELECT id FROM sales WHERE invoice_number LIKE '%${TAG}%')`, []);
  await d(`DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE invoice_number LIKE '%${TAG}%')`, []);
  await d(`DELETE FROM sale_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${TAG}-%')`, []);
  await d(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE invoice_number LIKE '%${TAG}%')`, []);
  await d(`DELETE FROM sales WHERE invoice_number LIKE '%${TAG}%'`, []);
  await d(`DELETE FROM product_units WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${TAG}-%')`, []);
  await d(`DELETE FROM product_stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${TAG}-%')`, []);
  await d(`DELETE FROM products WHERE name LIKE '${TAG}-%'`, []);
  await d(`DELETE FROM warehouses WHERE name LIKE '${TAG}-%'`, []);
  await d(`DELETE FROM branches WHERE name LIKE '${TAG}-%'`, []);
}

before(async () => {
  const pool = await getPool();
  await cleanup(pool);

  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  const base = JSON.parse(originalFlags || '{}');
  // pos ON (POS sales allowed); periods/treasury/GL OFF so the payment path is a
  // pure no-op and nothing external gates the sale.
  await setFlags(pool, {
    ...base,
    pos: true,
    accountingPeriods: false,
    treasury: false,
    generalLedger: false,
    installments: false,
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
     VALUES ($1, 'x', 'SVC Admin', 'admin', true) RETURNING id`,
    [`svc-test-admin-${ts}`]
  );
  // Global admin → bypasses warehouse scope; we pass the warehouse explicitly.
  admin = { id: u.rows[0].id, role: 'admin', username: 'svc-test-admin' };

  // Service product with NO fixed price (created through the real service so it
  // gets a base unit, which the sale flow needs to resolve a unit snapshot).
  const svc = await productService.create(
    { name: `${TAG}-تصليح-${ts}`, currency: 'IQD', productType: 'service' },
    admin.id
  );
  ids.serviceProductId = svc.id;
  ids.productIds.push(svc.id);

  // A physical product (raw insert is enough — the mixing guard short-circuits
  // before any unit resolution).
  const phys = await pool.query(
    `INSERT INTO products (name, cost_price, selling_price, currency, product_type, is_active)
     VALUES ($1, 1000, 2000, 'IQD', 'inventory', true) RETURNING id`,
    [`${TAG}-سلعة-${ts}`]
  );
  ids.physicalProductId = phys.rows[0].id;
  ids.productIds.push(ids.physicalProductId);
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

const baseSale = (over = {}) => ({
  currency: 'IQD',
  saleSource: SALE_SOURCE_POS,
  saleType: SALE_TYPE_CASH,
  paymentMethod: PAYMENT_METHOD_CASH,
  branchId: ids.branchId,
  warehouseId: ids.warehouseId,
  ...over,
});

test('a service with no fixed price sells at the received price = full net profit', async () => {
  const sale = await saleService.create(
    baseSale({
      items: [{ productId: ids.serviceProductId, quantity: 1, serviceReceivedAmount: 50000 }],
      paidAmount: 50000,
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  assert.equal(sale.total, 50000, 'invoice total = received price');
  assert.equal(sale.paidAmount, 50000, 'paid in full');
  assert.equal(sale.remainingAmount, 0, 'nothing remaining');
  assert.equal(sale.items.length, 1);
  assert.equal(Number(sale.items[0].unitPrice), 50000, 'line price = received amount');
  // Cost is 0 for a service → the whole received amount is profit.
  assert.equal(Number(sale.items[0].unitCostPrice), 0, 'service cost snapshot is 0');
  assert.equal(sale.totalProfit, 50000, 'net profit = received amount');
});

test('a service sale records NO stock movement and no stock row', async () => {
  const sale = await saleService.create(
    baseSale({
      items: [{ productId: ids.serviceProductId, quantity: 2, serviceReceivedAmount: 30000 }],
      paidAmount: 60000,
    }),
    admin
  );
  ids.saleIds.push(sale.id);

  const pool = await getPool();
  const mv = await pool.query(
    `SELECT COUNT(*)::int AS c FROM stock_movements WHERE product_id = $1`,
    [ids.serviceProductId]
  );
  assert.equal(mv.rows[0].c, 0, 'no stock movement for a service product');

  const st = await pool.query(
    `SELECT COUNT(*)::int AS c FROM product_stock WHERE product_id = $1`,
    [ids.serviceProductId]
  );
  assert.equal(st.rows[0].c, 0, 'a service product has no stock rows');
});

test('mixing a service with a physical product in one invoice is rejected', async () => {
  await assert.rejects(
    () =>
      saleService.create(
        baseSale({
          items: [
            { productId: ids.serviceProductId, quantity: 1, serviceReceivedAmount: 10000 },
            { productId: ids.physicalProductId, quantity: 1, unitPrice: 2000 },
          ],
          paidAmount: 12000,
        }),
        admin
      ),
    (err) => {
      assert.equal(err.code, 'MIXED_SERVICE_PHYSICAL');
      assert.match(err.message, /لا يمكن دمج خدمة مع منتجات فعلية/);
      return true;
    }
  );
});

test('a service line with no received price is rejected', async () => {
  await assert.rejects(
    () =>
      saleService.create(
        baseSale({
          items: [{ productId: ids.serviceProductId, quantity: 1, unitPrice: 0 }],
          paidAmount: 0,
        }),
        admin
      ),
    (err) => {
      assert.equal(err.code, 'SERVICE_PRICE_REQUIRED');
      assert.match(err.message, /السعر المستلم/);
      return true;
    }
  );
});
