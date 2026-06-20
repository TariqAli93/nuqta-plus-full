import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

import { getPool, getDb, closeDatabase } from '../src/db.js';
import { deliveryProviders } from '../src/models/index.js';
import deliveryService from '../src/services/delivery/deliveryService.js';
import deliveryReportService from '../src/services/deliveryReportService.js';
import { runDeliverySyncJob } from '../src/jobs/deliverySyncJob.js';
import { registerAdapter } from '../src/services/delivery/adapters/index.js';
import { httpJsonWithRetry } from '../src/services/delivery/adapters/baseAdapter.js';
import { hasPermission } from '../src/auth/permissionMatrix.js';
import { DELIVERY_STATUS, DELIVERY_ACTION } from '../src/constants/delivery.js';

/**
 * Delivery integration tests.
 *
 * Uses FAKE in-memory adapters injected via the registry test seam
 * (registerAdapter) for deterministic provider behaviour, plus three reserved
 * provider codes (TEST-FAKE-%) so the before/after hooks can self-heal a shared
 * dev DB. No HTTP server / JWTs — services are called directly.
 */

const OK = 'TEST-FAKE-OK';
const FAIL = 'TEST-FAKE-FAIL';
const RPT = 'TEST-FAKE-RPT';
const ORDER_MARK = 'DLVTEST';
const USER = { id: null, role: 'cashier' };
const ids = {};

// ── FAKE adapters ────────────────────────────────────────────────────────────
function fakeOkAdapter() {
  return {
    code: OK,
    mapStatus: (s) => s,
    async createShipment(shipment) {
      return {
        ok: true,
        providerShipmentId: `FAKE-${shipment.id}`,
        trackingNumber: `TRK-${shipment.id}`,
        status: DELIVERY_STATUS.SUBMITTED,
        providerStatus: 'accepted',
        response: { ok: true, httpStatus: 200, body: { id: `FAKE-${shipment.id}` } },
      };
    },
    async getStatus() {
      return {
        ok: true,
        status: DELIVERY_STATUS.IN_TRANSIT,
        providerStatus: 'in_transit',
        response: { ok: true, httpStatus: 200, body: {} },
      };
    },
    async cancelShipment() {
      return { ok: true, response: { ok: true, httpStatus: 200 } };
    },
    async calculateCost() {
      return { ok: true, cost: 5000, currency: 'IQD', breakdown: { base: 5000 } };
    },
    parseWebhook(payload) {
      return {
        ok: true,
        eventId: payload.event_id || null,
        providerShipmentId: payload.shipment_id,
        trackingNumber: payload.tracking_number || null,
        status: payload.status,
        providerStatus: payload.raw || payload.status,
        occurredAt: null,
      };
    },
  };
}

function fakeFailAdapter() {
  return {
    code: FAIL,
    mapStatus: (s) => s,
    async createShipment() {
      return { ok: false, error: 'provider rejected', response: { ok: false, httpStatus: 400 } };
    },
    async getStatus() {
      return { ok: false, error: 'status failed' };
    },
    async cancelShipment() {
      return { ok: false, error: 'cancel failed' };
    },
    // no calculateCost → exercises the "unsupported" path
    parseWebhook() {
      return { ok: false, error: 'unparseable' };
    },
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
async function cleanup(pool) {
  const d = async (q, p) => {
    try {
      await pool.query(q, p);
    } catch {
      /* ignore */
    }
  };
  const sub = `SELECT id FROM delivery_providers WHERE code LIKE 'TEST-FAKE-%'`;
  await d(`DELETE FROM delivery_action_logs WHERE provider_id IN (${sub})`);
  await d(`DELETE FROM delivery_events WHERE shipment_id IN (SELECT id FROM delivery_shipments WHERE provider_id IN (${sub}))`);
  await d(`DELETE FROM delivery_webhook_logs WHERE provider_id IN (${sub})`);
  await d(`DELETE FROM delivery_shipments WHERE provider_id IN (${sub})`);
  await d(`DELETE FROM delivery_providers WHERE code LIKE 'TEST-FAKE-%'`);
  await d(`DELETE FROM online_orders WHERE customer_name LIKE '${ORDER_MARK}%'`);
  await d(`DELETE FROM users WHERE username LIKE 'dlvtest-%'`);
  // Restore BOXY as the seed default (a setDefault test may have moved it).
  await d(`UPDATE delivery_providers SET is_default=false WHERE is_default=true AND code <> 'BOXY'`);
  await d(`UPDATE delivery_providers SET is_default=true WHERE code='BOXY'`);
}

async function mkProvider(pool, code, { active = true, isDefault = false } = {}) {
  const r = await pool.query(
    `INSERT INTO delivery_providers (code, name, adapter_key, is_active, is_default)
     VALUES ($1, $1, $1, $2, $3) RETURNING id`,
    [code, active, isDefault]
  );
  return r.rows[0].id;
}

let orderSeq = 0;
async function mkOrder(pool, { status = 'NEW', total = 25000 } = {}) {
  orderSeq += 1;
  // order_number is provided explicitly (rather than relying on the DB default)
  // so the fixture is robust regardless of sequence state.
  const r = await pool.query(
    `INSERT INTO online_orders (order_number, customer_name, customer_phone, province, status, total_amount, created_by)
     VALUES ($1, $2, '07700000000', 'بغداد', $3, $4, $5) RETURNING id`,
    [
      `ORD-TEST-${Date.now()}-${orderSeq}`,
      `${ORDER_MARK}-${Date.now()}-${orderSeq}`,
      status,
      total,
      ids.userId,
    ]
  );
  return r.rows[0].id;
}

let shipSeq = 0;
async function mkShipment(pool, providerId, { status, currency = 'IQD', fee = 0, ageDays = 0 } = {}) {
  shipSeq += 1;
  const r = await pool.query(
    `INSERT INTO delivery_shipments
       (shipment_number, provider_id, status, currency, delivery_fee, cod_amount, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, now() - make_interval(days => $6), now())
     RETURNING id`,
    [`SHP-TEST-${Date.now()}-${shipSeq}`, providerId, status, currency, fee, ageDays]
  );
  return r.rows[0].id;
}

before(async () => {
  registerAdapter(OK, fakeOkAdapter);
  registerAdapter(FAIL, fakeFailAdapter);

  const pool = await getPool();
  await cleanup(pool);

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'Delivery Test', 'cashier', true) RETURNING id`,
    [`dlvtest-${Date.now()}`]
  );
  ids.userId = u.rows[0].id;
  USER.id = ids.userId;

  ids.okId = await mkProvider(pool, OK, { active: true });
  ids.failId = await mkProvider(pool, FAIL, { active: true });
  ids.rptId = await mkProvider(pool, RPT, { active: true });
});

after(async () => {
  const pool = await getPool();
  await cleanup(pool);
  await closeDatabase();
});

// ── Tests ────────────────────────────────────────────────────────────────────
test('listProviders masks secrets and exposes flags', async () => {
  const providers = await deliveryService.listProviders();
  const ok = providers.find((p) => p.code === OK);
  assert.ok(ok, 'test provider listed');
  assert.equal(ok.apiKeyEncrypted, undefined, 'no encrypted column leaks');
  assert.equal(ok.apiSecretEncrypted, undefined);
  assert.equal(ok.credentialsEncrypted, undefined);
  assert.equal(typeof ok.hasApiKey, 'boolean');
  assert.equal(typeof ok.hasCredentials, 'boolean');
  assert.equal(typeof ok.isDefault, 'boolean');
});

test('updateProvider round-trips credentials encrypted (no plaintext leaves masked)', async () => {
  await deliveryService.updateProvider(ids.okId, {
    username: 'u1',
    accessToken: 't1',
    password: 'p1',
    baseUrl: 'https://carrier.example.com',
  });
  // Internal load decrypts the bag + password + base URL for the adapter.
  const loaded = await deliveryService._loadProviderForAdapter(eq(deliveryProviders.id, ids.okId));
  assert.equal(loaded.username, 'u1');
  assert.equal(loaded.accessToken, 't1');
  assert.equal(loaded.apiSecret, 'p1');
  assert.equal(loaded.baseUrl, 'https://carrier.example.com');
  // Masked view never carries the plaintext.
  const masked = await deliveryService.getProvider(ids.okId);
  assert.equal(masked.hasCredentials, true);
  assert.equal(masked.hasApiSecret, true);
  assert.equal(JSON.stringify(masked).includes('p1'), false);
  assert.equal(JSON.stringify(masked).includes('t1'), false);
});

test('_sanitizeForLog redacts sensitive keys (incl. nested)', () => {
  const out = deliveryService._sanitizeForLog({
    apiKey: 'secret',
    nested: { password: 'pw', authorization: 'Bearer x', keep: 'ok' },
    arr: [{ accessToken: 'tok' }],
  });
  assert.equal(out.apiKey, '[REDACTED]');
  assert.equal(out.nested.password, '[REDACTED]');
  assert.equal(out.nested.authorization, '[REDACTED]');
  assert.equal(out.nested.keep, 'ok');
  assert.equal(out.arr[0].accessToken, '[REDACTED]');
});

test('createShipment happy path → SUBMITTED + tracking + CREATE action log', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  const shipment = await deliveryService.createShipment(
    { onlineOrderId: orderId, providerCode: OK, recipientName: 'زبون', recipientPhone: '07701234567' },
    USER
  );
  assert.equal(shipment.status, DELIVERY_STATUS.SUBMITTED);
  assert.ok(shipment.trackingNumber, 'tracking number set');
  assert.equal(shipment.providerShipmentId, `FAKE-${shipment.id}`);

  const logs = await deliveryService.listActionLogs({ shipmentId: shipment.id });
  const createLog = logs.data.find((l) => l.action === DELIVERY_ACTION.CREATE);
  assert.ok(createLog, 'CREATE action logged');
  assert.equal(createLog.success, true);
  assert.equal(JSON.stringify(logs.data).includes('p1'), false, 'no secret in logs');
});

test('createShipment failure → FAILED + CREATE action log success=false', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  const shipment = await deliveryService.createShipment(
    { onlineOrderId: orderId, providerCode: FAIL, recipientName: 'زبون', recipientPhone: '07701234567' },
    USER
  );
  assert.equal(shipment.status, DELIVERY_STATUS.FAILED);
  const logs = await deliveryService.listActionLogs({ shipmentId: shipment.id });
  const createLog = logs.data.find((l) => l.action === DELIVERY_ACTION.CREATE);
  assert.ok(createLog);
  assert.equal(createLog.success, false);
});

test('calculateCost: supported returns cost, unsupported throws', async () => {
  const quote = await deliveryService.calculateCost({ providerCode: OK }, { province: 'بغداد' }, USER);
  assert.equal(quote.cost, 5000);
  assert.equal(quote.currency, 'IQD');
  await assert.rejects(
    () => deliveryService.calculateCost({ providerCode: FAIL }, { province: 'بغداد' }, USER),
    /غير مدعوم/
  );
});

test('default provider: setDefault is exclusive and createShipment falls back to it', async () => {
  const pool = await getPool();
  await deliveryService.setDefaultProvider(ids.okId);
  const ok = await deliveryService.getProvider(ids.okId);
  assert.equal(ok.isDefault, true);
  // Exactly one default across all providers.
  const { rows } = await pool.query(`SELECT count(*)::int AS c FROM delivery_providers WHERE is_default=true`);
  assert.equal(rows[0].c, 1);

  const orderId = await mkOrder(pool);
  const shipment = await deliveryService.createShipment(
    { onlineOrderId: orderId, recipientName: 'افتراضي', recipientPhone: '07700000001' },
    USER
  );
  assert.equal(shipment.providerId, ids.okId, 'used the default provider');
});

test('partial unique index forbids a second default', async () => {
  const pool = await getPool();
  await deliveryService.setDefaultProvider(ids.okId);
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO delivery_providers (code, name, adapter_key, is_active, is_default)
         VALUES ('TEST-FAKE-DUP','dup','CUSTOM', true, true)`
      ),
    /duplicate key|unique/i
  );
  await pool.query(`DELETE FROM delivery_providers WHERE code='TEST-FAKE-DUP'`);
});

test('webhook is idempotent on repeated event id', async () => {
  const pool = await getPool();
  const orderId = await mkOrder(pool);
  const shipment = await deliveryService.createShipment(
    { onlineOrderId: orderId, providerCode: OK, recipientName: 'زبون', recipientPhone: '07701234567' },
    USER
  );
  const payload = { shipment_id: shipment.providerShipmentId, status: DELIVERY_STATUS.DELIVERED, event_id: 'evt-1' };
  const r1 = await deliveryService.handleWebhook(OK, payload, {}, JSON.stringify(payload));
  assert.equal(r1.ok, true);
  assert.notEqual(r1.deduped, true);
  const r2 = await deliveryService.handleWebhook(OK, payload, {}, JSON.stringify(payload));
  assert.equal(r2.deduped, true, 'replayed webhook deduped');
});

test('report overview: success/return rates + cost per currency', async () => {
  const pool = await getPool();
  // 4 delivered, 1 returned, 2 in_transit, 1 cancelled (8 total) under RPT.
  for (let i = 0; i < 4; i += 1) await mkShipment(pool, ids.rptId, { status: DELIVERY_STATUS.DELIVERED, currency: 'IQD', fee: 1000 });
  await mkShipment(pool, ids.rptId, { status: DELIVERY_STATUS.RETURNED, currency: 'IQD', fee: 1000 });
  await mkShipment(pool, ids.rptId, { status: DELIVERY_STATUS.IN_TRANSIT, currency: 'USD', fee: 5 });
  await mkShipment(pool, ids.rptId, { status: DELIVERY_STATUS.IN_TRANSIT, currency: 'USD', fee: 5 });
  await mkShipment(pool, ids.rptId, { status: DELIVERY_STATUS.CANCELLED, currency: 'IQD', fee: 1000 });

  const ov = await deliveryReportService.getOverview({ providerId: ids.rptId });
  assert.equal(ov.summary.total, 8);
  assert.equal(ov.summary.delivered, 4);
  assert.equal(ov.summary.returned, 1);
  assert.equal(ov.summary.cancelled, 1);
  // success = delivered / (total − cancelled) = 4/7 = 57.14
  assert.equal(ov.summary.successRate, 57.14);
  // return = returned / delivered = 1/4 = 25
  assert.equal(ov.summary.returnRate, 25);

  const iqd = ov.costByCurrency.find((c) => c.currency === 'IQD');
  const usd = ov.costByCurrency.find((c) => c.currency === 'USD');
  assert.equal(iqd.totalFee, 6000); // 6 IQD shipments × 1000
  assert.equal(usd.totalFee, 10); // 2 USD shipments × 5
});

test('lateShipments returns only aged non-terminal shipments', async () => {
  const pool = await getPool();
  await mkShipment(pool, ids.failId, { status: DELIVERY_STATUS.IN_TRANSIT, ageDays: 10 }); // late
  await mkShipment(pool, ids.failId, { status: DELIVERY_STATUS.DELIVERED, ageDays: 10 }); // terminal → not late
  const late = await deliveryReportService.lateShipments({ providerId: ids.failId, days: 3 });
  assert.ok(late.data.length >= 1);
  assert.ok(late.data.every((s) => s.status === DELIVERY_STATUS.IN_TRANSIT));
});

test('auto-sync job ignores non-implemented providers and never throws', async () => {
  const pool = await getPool();
  // A non-terminal shipment under a FAKE (non-implemented) provider must NOT be polled.
  await mkShipment(pool, ids.okId, { status: DELIVERY_STATUS.IN_TRANSIT });
  const res = await runDeliverySyncJob({ logger: { info() {}, warn() {} } });
  assert.equal(typeof res.scanned, 'number');
  assert.equal(typeof res.synced, 'number');
  // FAKE providers aren't in IMPLEMENTED_ADAPTERS, so none of our test shipments are scanned.
});

test('httpJsonWithRetry retries transient failures then succeeds', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ done: true }) };
  };
  try {
    const res = await httpJsonWithRetry('https://x', { method: 'GET' }, { baseDelayMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(calls, 3, 'retried twice then succeeded');
  } finally {
    globalThis.fetch = original;
  }
});

test('httpJsonWithRetry does NOT retry a 4xx', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: false, status: 400, json: async () => ({}) };
  };
  try {
    const res = await httpJsonWithRetry('https://x', { method: 'GET' }, { baseDelayMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(calls, 1, 'no retry on 4xx');
  } finally {
    globalThis.fetch = original;
  }
});

test('new granular permissions map to the expected roles', () => {
  assert.equal(hasPermission('delivery_shipments:cancel', 'cashier'), true);
  assert.equal(hasPermission('delivery_shipments:sync', 'cashier'), true);
  assert.equal(hasPermission('delivery_shipments:print_label', 'cashier'), true);
  // change_provider is manager-level — cashiers must not have it.
  assert.equal(hasPermission('delivery_shipments:change_provider', 'cashier'), false);
  assert.equal(hasPermission('delivery_shipments:change_provider', 'manager'), true);
  assert.equal(hasPermission('delivery_reports:view', 'manager'), true);
  assert.equal(hasPermission('delivery_logs:view', 'branch_admin'), true);
});
