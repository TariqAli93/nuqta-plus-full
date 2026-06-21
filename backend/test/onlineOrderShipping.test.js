import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { OnlineOrderService } from '../src/services/onlineOrderService.js';
import deliveryService from '../src/services/delivery/deliveryService.js';
import onlineCommerceReportService from '../src/services/onlineCommerceReportService.js';
import { registerAdapter } from '../src/services/delivery/adapters/index.js';
import { deliveryShipmentCreateSchema } from '../src/utils/validation.js';
import { hasPermission } from '../src/auth/permissionMatrix.js';
import { DELIVERY_STATUS } from '../src/constants/delivery.js';

/**
 * Online-order → invoice → shipping integration tests (Phase 4).
 *
 * Mirrors delivery.test.js: a FAKE in-memory adapter (registerAdapter) gives
 * deterministic carrier behaviour with no real HTTP, and reserved markers
 * (OOSHIP-/ooship-) let the before/after hooks self-heal a shared dev DB.
 * Services are called directly (no HTTP/JWT); RBAC is asserted via the matrix.
 */

const PROVIDER = 'OOSHIP-FAKE'; // active carrier #1
const PROVIDER2 = 'OOSHIP-FAKE2'; // active carrier #2 (provider choice)
const PROVIDER_OFF = 'OOSHIP-FAKE-OFF'; // inactive carrier (must be rejected)
const MARK = 'OOSHIP'; // online_orders.customer_name marker
const onlineOrderService = new OnlineOrderService();
const ids = {};
const USER = { id: null, role: 'cashier' };
let ADMIN; // { id, role:'admin' } — full branch scope for report queries

// ── FAKE carrier adapter: succeeds locally, issues tracking number + URL ──────
function fakeAdapter() {
  return {
    code: PROVIDER,
    mapStatus: (s) => s,
    async createShipment(shipment) {
      return {
        ok: true,
        providerShipmentId: `FAKE-${shipment.id}`,
        trackingNumber: `TRK-${shipment.id}`,
        trackingUrl: `https://track.test/${shipment.id}`,
        status: DELIVERY_STATUS.SUBMITTED,
        providerStatus: 'accepted',
        response: { ok: true, httpStatus: 200, body: { id: `FAKE-${shipment.id}` } },
      };
    },
    async getStatus() {
      return { ok: true, status: DELIVERY_STATUS.IN_TRANSIT, providerStatus: 'in_transit', response: { ok: true } };
    },
    async cancelShipment() {
      return { ok: true, response: { ok: true, httpStatus: 200 } };
    },
    parseWebhook(p) {
      return { ok: true, providerShipmentId: p.shipment_id, status: p.status, providerStatus: p.status };
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
async function cleanup(pool) {
  const d = async (q) => {
    try {
      await pool.query(q);
    } catch {
      /* ignore */
    }
  };
  const myOrders = `SELECT id FROM online_orders WHERE customer_name LIKE '${MARK}%'`;
  const myProv = `SELECT id FROM delivery_providers WHERE code LIKE '${PROVIDER}%'`;
  await d(`DELETE FROM delivery_action_logs WHERE provider_id IN (${myProv})`);
  await d(
    `DELETE FROM delivery_events WHERE shipment_id IN (SELECT id FROM delivery_shipments WHERE provider_id IN (${myProv}) OR online_order_id IN (${myOrders}))`
  );
  await d(`DELETE FROM delivery_shipments WHERE provider_id IN (${myProv}) OR online_order_id IN (${myOrders})`);
  await d(`DELETE FROM delivery_providers WHERE code LIKE '${PROVIDER}%'`);
  await d(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE invoice_number LIKE '${MARK}-%')`);
  await d(`DELETE FROM sales WHERE invoice_number LIKE '${MARK}-%'`);
  await d(`DELETE FROM online_order_items WHERE order_id IN (${myOrders})`);
  await d(`DELETE FROM online_orders WHERE customer_name LIKE '${MARK}%'`);
  await d(`DELETE FROM product_stock WHERE product_id IN (SELECT id FROM products WHERE sku LIKE '${MARK}-%')`);
  await d(`DELETE FROM products WHERE sku LIKE '${MARK}-%'`);
  await d(`DELETE FROM sales_channels WHERE code LIKE '${MARK}_CH%'`);
  await d(`DELETE FROM warehouses WHERE name LIKE '${MARK}-WH%'`);
  await d(`DELETE FROM branches WHERE name LIKE '${MARK}-BR%'`);
  await d(`DELETE FROM users WHERE username LIKE 'ooship-%'`);
}

let seq = 0;
async function mkOrder(pool, opts = {}) {
  seq += 1;
  const {
    status = 'CONFIRMED',
    name = `${MARK}-${Date.now()}-${seq}`,
    phone = '07700000000',
    address = 'بغداد - الكرادة',
    province = 'بغداد',
    channelId = null,
    total = 25000,
    withItems = true,
  } = opts;
  const r = await pool.query(
    `INSERT INTO online_orders (order_number, channel_id, customer_name, customer_phone, customer_address, province, status, total_amount, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [`OON-${Date.now()}-${seq}`, channelId, name, phone, address, province, status, total, ids.userId]
  );
  const orderId = r.rows[0].id;
  if (withItems) {
    await pool.query(
      `INSERT INTO online_order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [orderId, ids.productId, 'منتج اختبار', 2, 12500, 25000]
    );
  }
  return orderId;
}

let invSeq = 0;
async function linkSale(pool, orderId, { channelId = null, total = 25000 } = {}) {
  invSeq += 1;
  const inv = `${MARK}-${Date.now()}-${invSeq}`;
  const r = await pool.query(
    `INSERT INTO sales (invoice_number, channel_id, online_order_id, subtotal, total, currency,
                        payment_type, status, paid_amount, remaining_amount)
     VALUES ($1,$2,$3,$4,$4,'IQD','cash','completed',$4,0) RETURNING id`,
    [inv, channelId, orderId, total]
  );
  return { saleId: r.rows[0].id, invoiceNumber: inv };
}

async function snapshot(pool, orderId) {
  const sale = await pool.query(
    'SELECT total, paid_amount, remaining_amount, status FROM sales WHERE online_order_id=$1',
    [orderId]
  );
  const stock = await pool.query(
    'SELECT quantity FROM product_stock WHERE product_id=$1 AND warehouse_id=$2',
    [ids.productId, ids.warehouseId]
  );
  const movements = await pool.query('SELECT count(*)::int AS c FROM stock_movements WHERE product_id=$1', [
    ids.productId,
  ]);
  const saleCount = await pool.query('SELECT count(*)::int AS c FROM sales WHERE online_order_id=$1', [orderId]);
  return {
    sales: sale.rows,
    stock: stock.rows[0]?.quantity ?? null,
    movements: movements.rows[0].c,
    saleCount: saleCount.rows[0].c,
  };
}

before(async () => {
  registerAdapter(PROVIDER, fakeAdapter);
  registerAdapter(PROVIDER2, fakeAdapter);
  registerAdapter(PROVIDER_OFF, fakeAdapter);
  const pool = await getPool();
  await cleanup(pool);

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1,'x','OOShip Cashier','cashier',true) RETURNING id`,
    [`ooship-cashier-${Date.now()}`]
  );
  ids.userId = u.rows[0].id;
  USER.id = ids.userId;

  const a = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1,'x','OOShip Admin','admin',true) RETURNING id`,
    [`ooship-admin-${Date.now()}`]
  );
  ADMIN = { id: a.rows[0].id, role: 'admin', username: 'ooship-admin' };

  const br = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1,true) RETURNING id`, [
    `${MARK}-BR-${Date.now()}`,
  ]);
  ids.branchId = br.rows[0].id;
  const wh = await pool.query(
    `INSERT INTO warehouses (name, branch_id, is_active) VALUES ($1,$2,true) RETURNING id`,
    [`${MARK}-WH-${Date.now()}`, ids.branchId]
  );
  ids.warehouseId = wh.rows[0].id;

  const p = await pool.query(
    `INSERT INTO products (name, sku, cost_price, selling_price, currency, stock)
     VALUES ($1,$2,'8000','12500','IQD',100) RETURNING id`,
    ['منتج اختبار الشحن', `${MARK}-SKU-${Date.now()}`]
  );
  ids.productId = p.rows[0].id;
  await pool.query(
    `INSERT INTO product_stock (product_id, warehouse_id, quantity) VALUES ($1,$2,100)`,
    [ids.productId, ids.warehouseId]
  );

  const mkProvider = async (code, active) =>
    (
      await pool.query(
        `INSERT INTO delivery_providers (code, name, adapter_key, is_active, is_default)
         VALUES ($1,$1,$1,$2,false) RETURNING id`,
        [code, active]
      )
    ).rows[0].id;
  ids.providerId = await mkProvider(PROVIDER, true);
  ids.provider2Id = await mkProvider(PROVIDER2, true);
  ids.providerOffId = await mkProvider(PROVIDER_OFF, false);
});

after(async () => {
  const pool = await getPool();
  await cleanup(pool);
  await closeDatabase().catch(() => {});
});

// ── 1. Invoice linkage ────────────────────────────────────────────────────────
test('1a. confirmed order exposes convertedSaleId + invoiceNumber', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  const { saleId, invoiceNumber } = await linkSale(pool, orderId);
  const order = await onlineOrderService.getById(orderId);
  assert.equal(order.convertedSaleId, saleId, 'saleId linked');
  assert.equal(order.convertedInvoiceNumber, invoiceNumber, 'invoiceNumber linked');
});

test('1b. order without a sale has no convertedSaleId (UI shows the Arabic empty message)', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool, { status: 'NEW' });
  const order = await onlineOrderService.getById(orderId);
  assert.equal(order.convertedSaleId, null, 'no linked sale');
});

// ── 2. Send to shipping + persisted fields ────────────────────────────────────
test('2. createShipment persists requestPayload/responsePayload/tracking/provider/shippedAt/By', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  await linkSale(pool, orderId);

  const shipment = await deliveryService.createShipment(
    {
      onlineOrderId: orderId,
      providerCode: PROVIDER,
      recipientName: 'أحمد',
      recipientPhone: '07701234567',
      recipientAddress: 'بغداد - الكرادة',
    },
    USER
  );

  assert.equal(shipment.status, DELIVERY_STATUS.SUBMITTED, 'SUBMITTED');
  assert.equal(shipment.trackingNumber, `TRK-${shipment.id}`, 'tracking number saved');
  assert.equal(shipment.trackingUrl, `https://track.test/${shipment.id}`, 'tracking url saved');
  assert.equal(shipment.providerId, ids.providerId, 'providerId saved');

  // Unified business payload persisted (آخر payload) + provider response.
  assert.ok(shipment.requestPayload, 'requestPayload saved');
  assert.equal(shipment.requestPayload.onlineOrderId, orderId);
  assert.ok(shipment.requestPayload.invoiceNumber, 'invoice number in payload');
  assert.equal(shipment.requestPayload.items.length, 1, 'invoice lines in payload');
  assert.equal(shipment.requestPayload.items[0].quantity, 2);
  assert.ok(shipment.requestPayload.totals.codAmount > 0, 'COD in payload');
  assert.ok(shipment.responsePayload, 'responsePayload (آخر response) saved');

  // shippedAt = created_at, shippedByUserId = created_by.
  const row = await pool.query(
    'SELECT created_by, created_at FROM delivery_shipments WHERE id=$1',
    [shipment.id]
  );
  assert.equal(row.rows[0].created_by, USER.id, 'shippedByUserId');
  assert.ok(row.rows[0].created_at, 'shippedAt set');
});

// ── 3. Missing-data prevention (API zod guard, Arabic messages) ───────────────
test('3. shipment schema rejects missing name / phone / address with Arabic messages', () => {
  const base = {
    onlineOrderId: 1,
    providerCode: PROVIDER,
    recipientName: 'أحمد',
    recipientPhone: '07701234567',
    recipientAddress: 'بغداد',
  };
  const noName = deliveryShipmentCreateSchema.safeParse({ ...base, recipientName: '' });
  assert.equal(noName.success, false);
  assert.ok(JSON.stringify(noName.error.issues).includes('اسم المستلم مطلوب'));

  const noPhone = deliveryShipmentCreateSchema.safeParse({ ...base, recipientPhone: '' });
  assert.equal(noPhone.success, false);
  assert.ok(JSON.stringify(noPhone.error.issues).includes('رقم هاتف المستلم مطلوب'));

  const noAddr = deliveryShipmentCreateSchema.safeParse({ ...base, recipientAddress: '' });
  assert.equal(noAddr.success, false);
  assert.ok(JSON.stringify(noAddr.error.issues).includes('عنوان المستلم مطلوب'));

  assert.equal(deliveryShipmentCreateSchema.safeParse(base).success, true, 'complete data passes');
});

// ── 4. Duplicate prevention ───────────────────────────────────────────────────
test('4. a second normal send while a shipment is active is rejected (409)', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  await deliveryService.createShipment(
    { onlineOrderId: orderId, providerCode: PROVIDER, recipientName: 'أحمد', recipientPhone: '077', recipientAddress: 'بغداد' },
    USER
  );
  await assert.rejects(
    () =>
      deliveryService.createShipment(
        { onlineOrderId: orderId, providerCode: PROVIDER, recipientName: 'أحمد', recipientPhone: '077', recipientAddress: 'بغداد' },
        USER
      ),
    (err) => {
      assert.match(err.message, /شحنة نشطة/);
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

// ── 5. Resend (RBAC + supersede + no financial/stock change) ──────────────────
test('5a. resend permission is manager-level (cashier denied, manager/admin allowed)', () => {
  assert.equal(hasPermission('online_orders:resend_to_shipping', 'cashier'), false);
  assert.equal(hasPermission('online_orders:resend_to_shipping', 'manager'), true);
  assert.equal(hasPermission('online_orders:resend_to_shipping', 'admin'), true);
  // Sending (normal) is cashier-level; opening the invoice + viewing shipment are read-only.
  assert.equal(hasPermission('online_orders:send_to_shipping', 'cashier'), true);
  assert.equal(hasPermission('online_orders:open_invoice', 'cashier'), true);
  assert.equal(hasPermission('online_orders:view_shipment', 'viewer'), true);
});

test('5b. resend supersedes the active shipment and creates a new one', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  await linkSale(pool, orderId);

  const first = await deliveryService.createShipment(
    { onlineOrderId: orderId, providerCode: PROVIDER, recipientName: 'أحمد', recipientPhone: '077', recipientAddress: 'بغداد' },
    USER
  );
  const before = await snapshot(pool, orderId);

  const second = await deliveryService.resendShipment(
    { onlineOrderId: orderId, providerCode: PROVIDER, recipientName: 'أحمد', recipientPhone: '077', recipientAddress: 'بغداد' },
    USER
  );

  assert.notEqual(second.id, first.id, 'a new shipment is created');
  assert.equal(second.status, DELIVERY_STATUS.SUBMITTED, 'new shipment submitted');

  const old = await pool.query('SELECT status FROM delivery_shipments WHERE id=$1', [first.id]);
  assert.equal(old.rows[0].status, DELIVERY_STATUS.CANCELLED, 'old shipment superseded/cancelled');

  // Financial + stock invariants unchanged by resend.
  const after = await snapshot(pool, orderId);
  assert.deepEqual(after, before, 'sales / stock / movements / sale-count unchanged by resend');
});

// ── 6. Tracking display data contract ─────────────────────────────────────────
test('6. shipment exposes tracking number, status, provider name and tracking url', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  const created = await deliveryService.createShipment(
    { onlineOrderId: orderId, providerCode: PROVIDER, recipientName: 'أحمد', recipientPhone: '077', recipientAddress: 'بغداد' },
    USER
  );
  const ship = await deliveryService.getShipmentById(created.id);
  assert.ok(ship.trackingNumber, 'tracking number shown');
  assert.equal(ship.status, DELIVERY_STATUS.SUBMITTED, 'status shown');
  assert.equal(ship.providerName, PROVIDER, 'carrier name shown');
  assert.ok(ship.trackingUrl, 'tracking url present → track button shown');
});

// ── 7. Financial/stock invariants across send (+resend covered in 5b) ─────────
test('7. sending to shipping changes nothing in sales / stock / movements', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  await linkSale(pool, orderId);
  const before = await snapshot(pool, orderId);
  await deliveryService.createShipment(
    { onlineOrderId: orderId, providerCode: PROVIDER, recipientName: 'أحمد', recipientPhone: '077', recipientAddress: 'بغداد' },
    USER
  );
  const after = await snapshot(pool, orderId);
  assert.deepEqual(after, before, 'no money/stock side effects from shipping');
});

// ── 8. Reports: sent / not-sent counters + shipping filters ───────────────────
test('8. reports count sent vs not-sent and honour shipping filters without changing financials', async () => {
  const pool = await getPool();
  // Unique channel isolates this report assertion from other DB rows.
  const ch = await pool.query(
    `INSERT INTO sales_channels (code, name, is_active) VALUES ($1,$2,true) RETURNING id`,
    [`${MARK}_CH_${Date.now()}`, 'قناة اختبار الشحن']
  );
  const channelId = ch.rows[0].id;

  const sentOrder = await mkOrder(pool, { status: 'CONFIRMED', channelId });
  await linkSale(pool, sentOrder, { channelId });
  await deliveryService.createShipment(
    { onlineOrderId: sentOrder, providerCode: PROVIDER, recipientName: 'أحمد', recipientPhone: '077', recipientAddress: 'بغداد' },
    USER
  );
  // A confirmed, shippable order with NO shipment → "not sent".
  await mkOrder(pool, { status: 'CONFIRMED', channelId });

  const all = await onlineCommerceReportService.ordersByChannel({ channelId }, ADMIN);
  assert.equal(all.summary.sentToShipping, 1, 'one order sent to shipping');
  assert.equal(all.summary.notSentToShipping, 1, 'one eligible order not sent');

  // Filter by shipping company → only the order on that carrier.
  const byProvider = await onlineCommerceReportService.ordersByChannel(
    { channelId, shippingProviderId: ids.providerId },
    ADMIN
  );
  assert.equal(byProvider.summary.sentToShipping, 1);
  assert.equal(byProvider.summary.notSentToShipping, 0, 'provider filter excludes the not-sent order');

  // Filter by shipment status.
  const submitted = await onlineCommerceReportService.ordersByChannel(
    { channelId, shippingStatus: 'SUBMITTED' },
    ADMIN
  );
  assert.equal(submitted.summary.sentToShipping, 1);
  const delivered = await onlineCommerceReportService.ordersByChannel(
    { channelId, shippingStatus: 'DELIVERED' },
    ADMIN
  );
  assert.equal(delivered.summary.sentToShipping, 0, 'no delivered shipment in range');

  // Shipping filters must NOT alter the financial (sales/revenue) figures.
  const base = await onlineCommerceReportService.getOverview({ channelId }, ADMIN);
  const filtered = await onlineCommerceReportService.getOverview(
    { channelId, shippingProviderId: ids.providerId },
    ADMIN
  );
  assert.deepEqual(
    filtered.revenueByChannel,
    base.revenueByChannel,
    'revenue identical regardless of shipping filter'
  );
  assert.deepEqual(filtered.salesByChannel, base.salesByChannel, 'sales identical regardless of shipping filter');
});

// ── 9. Provider picker: active list + carrier choice + inactive rejection ─────
test('9a. listActiveProviders returns only active carriers (for the picker)', async () => {
  const list = await deliveryService.listActiveProviders();
  const codes = list.map((p) => p.code);
  assert.ok(codes.includes(PROVIDER), 'active carrier #1 listed');
  assert.ok(codes.includes(PROVIDER2), 'active carrier #2 listed');
  assert.ok(!codes.includes(PROVIDER_OFF), 'inactive carrier excluded');
  assert.ok(list.every((p) => p.isActive), 'every listed provider is active');
});

test('9b. sending by a chosen providerId (a different carrier) works', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  const shipment = await deliveryService.createShipment(
    {
      onlineOrderId: orderId,
      providerId: ids.provider2Id,
      recipientName: 'أحمد',
      recipientPhone: '077',
      recipientAddress: 'بغداد',
    },
    USER
  );
  assert.equal(shipment.status, DELIVERY_STATUS.SUBMITTED);
  assert.equal(shipment.providerId, ids.provider2Id, 'shipment uses the chosen carrier');
});

test('9c. sending with an INACTIVE providerId is rejected', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  await assert.rejects(
    () =>
      deliveryService.createShipment(
        {
          onlineOrderId: orderId,
          providerId: ids.providerOffId,
          recipientName: 'أحمد',
          recipientPhone: '077',
          recipientAddress: 'بغداد',
        },
        USER
      ),
    /غير مفعّلة/
  );
});

test('9d. resend can switch to a different carrier (supersedes the old one)', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  const first = await deliveryService.createShipment(
    {
      onlineOrderId: orderId,
      providerId: ids.providerId,
      recipientName: 'أحمد',
      recipientPhone: '077',
      recipientAddress: 'بغداد',
    },
    USER
  );
  const second = await deliveryService.resendShipment(
    {
      onlineOrderId: orderId,
      providerId: ids.provider2Id,
      recipientName: 'أحمد',
      recipientPhone: '077',
      recipientAddress: 'بغداد',
    },
    USER
  );
  assert.notEqual(second.id, first.id, 'a new shipment is created');
  assert.equal(second.providerId, ids.provider2Id, 'resend used the newly-chosen carrier');
  const old = await pool.query('SELECT status FROM delivery_shipments WHERE id=$1', [first.id]);
  assert.equal(old.rows[0].status, DELIVERY_STATUS.CANCELLED, 'old carrier shipment superseded');
});

// ── 10. Return refund default (a paid order's return refunds the customer) ────
test('10. default refund = paid portion of the returned value (debt written off first)', () => {
  const svc = new OnlineOrderService();
  const line = { id: 1, productId: 7, quantity: 2, subtotal: 20000, unitPrice: 10000 };

  // Fully paid (remaining 0) → full return refunds the whole returned value.
  assert.equal(
    svc._defaultRefundFor({ remainingAmount: 0, paidAmount: 20000, items: [line] }, [
      { saleItemId: 1, quantity: 2 },
    ]),
    20000
  );

  // Unpaid (remaining = total) → no cash refund, all debt write-off.
  assert.equal(
    svc._defaultRefundFor({ remainingAmount: 20000, paidAmount: 0, items: [line] }, [
      { saleItemId: 1, quantity: 2 },
    ]),
    0
  );

  // Partially paid → refund only the part exceeding remaining debt, capped by paid.
  assert.equal(
    svc._defaultRefundFor({ remainingAmount: 5000, paidAmount: 15000, items: [line] }, [
      { productId: 7, quantity: 1 },
    ]),
    5000
  );
});

// ── 11. Revenue/profit recognised at completion (DELIVERED) only ──────────────
test('11. revenue counts DELIVERED orders only (confirmed/returned excluded)', async () => {
  const pool = await getPool();
  const channelId = (
    await pool.query(
      `INSERT INTO sales_channels (code, name, is_active) VALUES ($1,$2,true) RETURNING id`,
      [`${MARK}_CH_D_${Date.now()}`, 'قناة مكتمل']
    )
  ).rows[0].id;

  const delivered = await mkOrder(pool, { status: 'DELIVERED', channelId });
  await linkSale(pool, delivered, { channelId, total: 30000 });
  const confirmed = await mkOrder(pool, { status: 'CONFIRMED', channelId });
  await linkSale(pool, confirmed, { channelId, total: 99000 });
  const returned = await mkOrder(pool, { status: 'RETURNED', channelId });
  await linkSale(pool, returned, { channelId, total: 77000 });

  const ov = await onlineCommerceReportService.getOverview({ channelId }, ADMIN);
  const rev = ov.revenueByChannel.find((r) => r.channelId === channelId);
  assert.ok(rev, 'the delivered order produces a revenue row');
  assert.equal(rev.grossSales, 30000, 'only the DELIVERED sale counts (99k/77k excluded)');
});

// ── 12. No completed orders + 100% returns → sales 0 / profit 0 ───────────────
test('12. no completed orders (all returned) → sales 0, profit 0, returnRate 100', async () => {
  const pool = await getPool();
  const channelId = (
    await pool.query(
      `INSERT INTO sales_channels (code, name, is_active) VALUES ($1,$2,true) RETURNING id`,
      [`${MARK}_CH_R_${Date.now()}`, 'قناة مرتجعة']
    )
  ).rows[0].id;

  const r1 = await mkOrder(pool, { status: 'RETURNED', channelId });
  await linkSale(pool, r1, { channelId, total: 50000 });
  const r2 = await mkOrder(pool, { status: 'RETURNED', channelId });
  await linkSale(pool, r2, { channelId, total: 20000 });

  const ov = await onlineCommerceReportService.getOverview({ channelId }, ADMIN);
  assert.equal(ov.revenueByChannel.length, 0, 'no DELIVERED orders → no revenue rows');

  const w = await onlineCommerceReportService.widgets({ channelId }, ADMIN, { includeProfit: true });
  assert.equal(w.totals.totalSales, 0, 'total sales = 0');
  assert.equal(w.totals.netProfit, 0, 'net profit = 0');
  assert.equal(w.totals.completed, 0, 'completed = 0');
  assert.equal(w.totals.returned, 2, 'returned counted in the funnel');
  assert.equal(w.returnRate, 100, 'return rate 100%');
});
