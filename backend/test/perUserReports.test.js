import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import posReportsService from '../src/services/posReportsService.js';
import reportService from '../src/services/reportService.js';

/**
 * Per-user report scoping (تقارير حسب المستخدم).
 *
 * After the shift system was removed, reports are scoped by the USER who
 * performed each operation (`created_by`) — enforced in the BACKEND, never only
 * in the UI. The rule (posReportsService / reportService):
 *   - a global admin, or a holder of a financial-reports permission
 *     (reports:read_profit / reports:read_financial / reports:view_all_users),
 *     sees EVERY user's operations — and may optionally filter to one `userId`;
 *   - a normal user (e.g. a cashier) sees ONLY operations they created, no
 *     matter what `userId` the client sends.
 *
 * Fixture (dedicated branch, currency 'PUS' so totals never collide with seed
 * data): cashier A made 2 sales (100 + 100 = 200); cashier B made 1 sale (50).
 *   → admin / manager see 3 invoices / 250 ; A sees 2 / 200 ; B sees 1 / 50.
 *
 * TEST-ONLY fixtures use the reserved `puser-test%` user names, `PUSER-BR-%`
 * branch names and the `PUS` currency, so the before-hook can self-heal a shared
 * dev DB after an interrupted run.
 */

const CUR = 'PUS';
const ids = {};
let originalFlags = null;
let adminU;
let managerU;
let cashierA;
let cashierB;

async function setFlags(pool, obj) {
  await pool.query(
    `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'test')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(obj)]
  );
}

async function cleanup(pool) {
  const d = async (t, p) => { try { await pool.query(t, p); } catch { /* ignore */ } };
  await d(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE currency = $1)`, [CUR]);
  await d(`DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE currency = $1)`, [CUR]);
  await d(`DELETE FROM sales WHERE currency = $1`, [CUR]);
  await d(`DELETE FROM users WHERE username LIKE 'puser-test%'`);
  await d(`DELETE FROM branches WHERE name LIKE 'PUSER-BR-%'`);
}

async function insertSale(pool, { total, createdBy }) {
  const inv = `PUS-${Date.now()}-${Math.round(total)}-${createdBy}`;
  await pool.query(
    `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
                        paid_amount, remaining_amount, branch_id, created_by, created_at, issued_at)
     VALUES ($1, $2, $2, $3, 'cash', 'completed', $2, 0, $4, $5, now(), now())`,
    [inv, total, CUR, ids.branchId, createdBy]
  );
}

before(async () => {
  const pool = await getPool();
  await cleanup(pool);

  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  const base = JSON.parse(originalFlags || '{}');
  // multiBranch ON so reportService applies branch scope; accountingPeriods OFF
  // so no period gating interferes with the per-USER assertions.
  await setFlags(pool, { ...base, multiBranch: true, accountingPeriods: false });

  const ts = Date.now();
  const br = await pool.query(
    `INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`,
    [`PUSER-BR-${ts}`]
  );
  ids.branchId = br.rows[0].id;

  const mkUser = async (label, role, full, assigned) => {
    const r = await pool.query(
      `INSERT INTO users (username, password, full_name, role, is_active, assigned_branch_id)
       VALUES ($1, 'x', $2, $3, true, $4) RETURNING id`,
      [`puser-test-${label}-${ts}`, full, role, assigned]
    );
    return r.rows[0].id;
  };

  ids.adminId = await mkUser('admin', 'admin', 'PUser Admin', null);
  ids.managerId = await mkUser('manager', 'manager', 'PUser Manager', ids.branchId);
  ids.cashierAId = await mkUser('cashier-a', 'cashier', 'PUser Cashier A', ids.branchId);
  ids.cashierBId = await mkUser('cashier-b', 'cashier', 'PUser Cashier B', ids.branchId);

  adminU = { id: ids.adminId, role: 'admin', username: 'puser-admin' };
  managerU = { id: ids.managerId, role: 'manager', username: 'puser-manager', assignedBranchId: ids.branchId };
  cashierA = { id: ids.cashierAId, role: 'cashier', username: 'puser-cashier-a', assignedBranchId: ids.branchId };
  cashierB = { id: ids.cashierBId, role: 'cashier', username: 'puser-cashier-b', assignedBranchId: ids.branchId };

  await insertSale(pool, { total: 100, createdBy: ids.cashierAId });
  await insertSale(pool, { total: 100, createdBy: ids.cashierAId });
  await insertSale(pool, { total: 50, createdBy: ids.cashierBId });
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

// ── posReportsService.sales (quick sales report) ─────────────────────────────

test('a normal cashier sees ONLY their own sales (backend-enforced)', async () => {
  const a = await posReportsService.sales({}, cashierA);
  assert.equal(a.summary.invoices, 2, 'cashier A sees only their 2 invoices');
  assert.equal(a.summary.totalSales, 200, 'cashier A totals only their own sales');

  const b = await posReportsService.sales({}, cashierB);
  assert.equal(b.summary.invoices, 1, 'cashier B sees only their 1 invoice');
  assert.equal(b.summary.totalSales, 50);
});

test('a cashier CANNOT widen scope by sending another user\'s userId', async () => {
  // The client asks for cashier B's data; the backend ignores it and still
  // restricts cashier A to their own rows. (UI is never the only gate.)
  const a = await posReportsService.sales({ userId: ids.cashierBId }, cashierA);
  assert.equal(a.summary.invoices, 2, 'forced back to own rows');
  assert.equal(a.summary.totalSales, 200);
});

test('a global admin sees ALL users\' sales', async () => {
  const all = await posReportsService.sales({ branchId: ids.branchId }, adminU);
  assert.equal(all.summary.invoices, 3, 'admin sees every user\'s invoices');
  assert.equal(all.summary.totalSales, 250);
});

test('a reports-permission holder (manager) sees ALL users\' sales', async () => {
  // manager has reports:read_profit (MANAGER group) → may view every user.
  const all = await posReportsService.sales({}, managerU);
  assert.equal(all.summary.invoices, 3, 'manager sees every user\'s invoices');
  assert.equal(all.summary.totalSales, 250);
});

test('a privileged user may filter to a single user via userId', async () => {
  const onlyA = await posReportsService.sales({ branchId: ids.branchId, userId: ids.cashierAId }, adminU);
  assert.equal(onlyA.summary.invoices, 2, 'admin filtered to cashier A');
  assert.equal(onlyA.summary.totalSales, 200);

  const onlyB = await posReportsService.sales({ branchId: ids.branchId, userId: ids.cashierBId }, adminU);
  assert.equal(onlyB.summary.invoices, 1, 'admin filtered to cashier B');
  assert.equal(onlyB.summary.totalSales, 50);
});

// ── reportService.getProfitReport (Drizzle dashboard/profit engine) ──────────

test('profit report is per-user scoped for a normal cashier', async () => {
  const a = await reportService.getProfitReport({ currency: CUR }, cashierA);
  assert.equal(a.totals.byCurrency[CUR]?.revenue, 200, 'cashier A revenue is only their own');

  const b = await reportService.getProfitReport({ currency: CUR }, cashierB);
  assert.equal(b.totals.byCurrency[CUR]?.revenue, 50, 'cashier B revenue is only their own');
});

test('profit report shows all users to an admin, and honours a userId filter', async () => {
  const all = await reportService.getProfitReport({ currency: CUR }, adminU);
  assert.equal(all.totals.byCurrency[CUR]?.revenue, 250, 'admin sees every user');

  const onlyA = await reportService.getProfitReport({ currency: CUR, userId: ids.cashierAId }, adminU);
  assert.equal(onlyA.totals.byCurrency[CUR]?.revenue, 200, 'admin filtered to cashier A');
});
