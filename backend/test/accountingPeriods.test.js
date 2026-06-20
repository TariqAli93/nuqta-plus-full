import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import accountingPeriodService from '../src/services/accountingPeriodService.js';
import expensesService from '../src/services/expensesService.js';
import reportService from '../src/services/reportService.js';
import { SaleService } from '../src/services/saleService.js';

const saleService = new SaleService();

/**
 * End-to-end lifecycle test for the accounting period (القيد المحاسبي) system.
 *
 * Runs with the feature flag ON and multi-branch OFF (single global period).
 * Real service wiring is exercised for opening, expense stamping and write
 * guards; the close snapshot / P&L is verified against a controlled fixture
 * (currency 'ACP', year 2099 — isolated from real data).
 *
 * NOTE: the cash-session (shift) system was removed. Accounting periods are now
 * fully INDEPENDENT of shifts — operations bind to the acting user (created_by),
 * not to a shift. This suite therefore only asserts period behaviour; the old
 * shift↔period enforcement tests were dropped. The period write guards
 * (assertWritable, resolvePeriodIdForWrite) are unchanged and still enforced.
 *
 * Fixture P&L:
 *   sale 5 × 30 = 150, cost 10/unit → COGS 50
 *   return 2 units = 60 returned, returned COGS 20
 *   expense 20
 *   netSalesAfterReturns 90, cogsNet 30, grossProfit 60, netProfit 40
 */

const CUR = 'ACP';
const DAY = '2099-06-15';
const ids = {};
let originalFlags = null;
let user;

// Full feature set with accounting periods ON, multi-branch OFF. Reused on every
// restore so a test that flips flags can't leave a partial set behind.
const FLAGS_ON = {
  inventory: true, pos: true, installments: true, creditScore: true, draftInvoices: true,
  multiBranch: false, multiWarehouse: false, warehouseTransfers: false,
  alerts: true, liveOperations: true, accountingPeriods: true,
};

async function setFlags(pool, obj) {
  await pool.query(
    `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'test')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(obj)]
  );
}

/**
 * Self-heal a shared/dev DB before the suite runs. A previously-INTERRUPTED run
 * (its `after` never executed) can leave an open accounting period that blocks
 * "open a global period" — and because the open period was reused by the next
 * run, that run's data piled onto it and its `after` (keyed on its own user id)
 * couldn't clear it. We scrub only THIS suite's signature — the reserved `ACP`
 * test currency and `acc-period-test%` users — plus fully-empty orphan open
 * periods (zero linked rows across every accounting_period_id table).
 *
 * TEST-ONLY: runs against the configured test/dev DB; never point it at
 * production. The "empty orphan" branch can match a non-test period, so it
 * relies on the empty-across-all-tables guard (incl. stock_movements) for safety.
 */
async function cleanupPriorTestData(pool) {
  const tryDel = async (text, params) => { try { await pool.query(text, params); } catch { /* ignore */ } };
  const { rows } = await pool.query(`
    SELECT ap.id FROM accounting_periods ap WHERE
      ap.opened_by_user_id IN (SELECT id FROM users WHERE username LIKE 'acc-period-test%')
      OR ap.id IN (SELECT accounting_period_id FROM expenses WHERE currency = $1 AND accounting_period_id IS NOT NULL)
      OR ap.id IN (SELECT accounting_period_id FROM sales WHERE currency = $1 AND accounting_period_id IS NOT NULL)
      -- Empty orphan OPEN periods left by interrupted runs: they carry no data
      -- yet (so the currency match above misses them) but still occupy the
      -- one-open-per-scope slot and block "open a period". An open period with
      -- ZERO linked rows across EVERY accounting_period_id table is unambiguously
      -- stale test residue. (Every table holding accounting_period_id is listed
      -- so a period with any real activity — incl. stock movements — is spared.)
      OR (
        ap.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM accounting_period_shifts s WHERE s.accounting_period_id = ap.id)
        AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.accounting_period_id = ap.id)
        AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.accounting_period_id = ap.id)
        AND NOT EXISTS (SELECT 1 FROM sale_returns r WHERE r.accounting_period_id = ap.id)
        AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.accounting_period_id = ap.id)
      )
  `, [CUR]);
  const pids = rows.map((r) => r.id);
  if (pids.length) {
    await tryDel('DELETE FROM sale_return_items WHERE return_id IN (SELECT id FROM sale_returns WHERE accounting_period_id = ANY($1))', [pids]);
    await tryDel('DELETE FROM sale_returns WHERE accounting_period_id = ANY($1)', [pids]);
    await tryDel('DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE accounting_period_id = ANY($1))', [pids]);
    await tryDel('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE accounting_period_id = ANY($1))', [pids]);
    await tryDel('DELETE FROM sales WHERE accounting_period_id = ANY($1)', [pids]);
    await tryDel('DELETE FROM expenses WHERE accounting_period_id = ANY($1)', [pids]);
    await tryDel('DELETE FROM accounting_period_shifts WHERE accounting_period_id = ANY($1)', [pids]);
    await tryDel('DELETE FROM cash_sessions WHERE accounting_period_id = ANY($1)', [pids]);
    await tryDel('DELETE FROM accounting_periods WHERE id = ANY($1)', [pids]); // snapshots cascade
  }
  await tryDel("DELETE FROM cash_sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'acc-period-test%')");
  await tryDel("DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'acc-period-test%')");
  await tryDel("DELETE FROM users WHERE username LIKE 'acc-period-test%'");
}

before(async () => {
  const pool = await getPool();
  await cleanupPriorTestData(pool);
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  await setFlags(pool, FLAGS_ON);

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'Acc Period Test', 'admin', true) RETURNING id`,
    [`acc-period-test-${Date.now()}`]
  );
  ids.userId = u.rows[0].id;
  user = { id: ids.userId, role: 'admin', username: 'acc-period-test' };
});

after(async () => {
  const pool = await getPool();
  // Restore the feature flags FIRST and unconditionally — leaving
  // accountingPeriods=true would make the running app (and other test files,
  // since the suite shares one DB) require open periods. We coerce
  // accountingPeriods back to its product default (false) on restore so an
  // interrupted prior run can never leave enforcement on for the next suite.
  try {
    if (originalFlags !== null) {
      const restored = { ...JSON.parse(originalFlags), accountingPeriods: false };
      await setFlags(pool, restored);
    } else {
      await pool.query("DELETE FROM settings WHERE key='feature_flags'");
    }
  } catch { /* best effort */ }

  // Each delete is independent so one FK hiccup can't skip the rest.
  const tryDel = async (text, params) => { try { await pool.query(text, params); } catch { /* ignore */ } };
  // User-scoped cleanup: covers every period this user opened (incl. the extra
  // periods the report tests create), so nothing leaks.
  let pid = [];
  if (ids.userId) {
    const r = await pool.query('SELECT id FROM accounting_periods WHERE opened_by_user_id=$1', [ids.userId]);
    pid = r.rows.map((x) => x.id);
  }
  if (ids.returnId) await tryDel('DELETE FROM sale_return_items WHERE return_id=$1', [ids.returnId]);
  if (ids.returnId) await tryDel('DELETE FROM sale_returns WHERE id=$1', [ids.returnId]);
  if (pid.length) await tryDel('DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE accounting_period_id = ANY($1))', [pid]);
  if (pid.length) await tryDel('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE accounting_period_id = ANY($1))', [pid]);
  if (pid.length) await tryDel('DELETE FROM sales WHERE accounting_period_id = ANY($1)', [pid]);
  for (const sid of [ids.saleId, ids.sale2Id].filter(Boolean)) {
    await tryDel('DELETE FROM payments WHERE sale_id=$1', [sid]);
    await tryDel('DELETE FROM sale_items WHERE sale_id=$1', [sid]);
    await tryDel('DELETE FROM sales WHERE id=$1', [sid]);
  }
  if (pid.length) await tryDel('DELETE FROM expenses WHERE accounting_period_id = ANY($1)', [pid]);
  if (pid.length) await tryDel('DELETE FROM accounting_period_shifts WHERE accounting_period_id = ANY($1)', [pid]);
  if (ids.userId) await tryDel('DELETE FROM cash_sessions WHERE user_id=$1', [ids.userId]);
  // Catch-all: orphaned rows this user created whose period was already deleted
  // (the sales.accounting_period_id FK is ON DELETE SET NULL, so deleting a
  // period nulls the link and the by-period sweep above would miss them).
  if (ids.userId) {
    await tryDel('DELETE FROM sale_return_items WHERE return_id IN (SELECT id FROM sale_returns WHERE created_by=$1)', [ids.userId]);
    await tryDel('DELETE FROM sale_returns WHERE created_by=$1', [ids.userId]);
    await tryDel('DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE created_by=$1)', [ids.userId]);
    await tryDel('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE created_by=$1)', [ids.userId]);
    await tryDel('DELETE FROM sales WHERE created_by=$1', [ids.userId]);
    await tryDel('DELETE FROM expenses WHERE created_by=$1', [ids.userId]);
  }
  // Snapshot rows cascade when their period is deleted (FK ON DELETE cascade).
  if (pid.length) await tryDel('DELETE FROM accounting_periods WHERE id = ANY($1)', [pid]);
  // Throwaway branch used by the multi-branch / branch-report tests. Its sales
  // were stamped to user-owned periods and already removed above; drop the
  // branch last so no FK references remain.
  if (ids.branchBId) await tryDel('DELETE FROM sales WHERE branch_id=$1', [ids.branchBId]);
  if (ids.branchBId) await tryDel('DELETE FROM accounting_periods WHERE branch_id=$1', [ids.branchBId]);
  if (ids.branchBId) await tryDel('DELETE FROM branches WHERE id=$1', [ids.branchBId]);
  if (ids.userId) await tryDel('DELETE FROM audit_log WHERE user_id=$1', [ids.userId]);
  if (ids.userId) await tryDel('DELETE FROM users WHERE id=$1', [ids.userId]);

  await closeDatabase().catch(() => {});
});

// ── Period lifecycle ─────────────────────────────────────────────────────────

test('open a global accounting period binds the default branch (multiBranch off)', async () => {
  const period = await accountingPeriodService.open({ type: 'monthly' }, user);
  ids.periodId = period.id;
  ids.periodBranchId = period.branchId;
  assert.equal(period.status, 'open');
  // scope_type stays 'global' when branches are off …
  assert.equal(period.scopeType, 'global');
  // … but branch_id is the internal default branch, never null.
  assert.notEqual(period.branchId, null, 'off-mode period carries the default branch, not null');
});

test('cannot open a second period for the same scope', async () => {
  await assert.rejects(
    () => accountingPeriodService.open({ type: 'monthly' }, user),
    /مفتوح بالفعل/
  );
});

test('an expense created while a period is open is stamped with the period (no shift needed)', async () => {
  // Shifts are gone: an open accounting period is the ONLY gate for a write.
  const exp = await expensesService.create(
    { amount: 20, category: 'misc', currency: CUR, expenseDate: DAY }, user
  );
  ids.expenseId = exp.id;
  assert.equal(Number(exp.accountingPeriodId), ids.periodId);
});

test('closing computes a frozen P&L snapshot', async () => {
  // Controlled sale + return stamped to the period (currency ACP, 2099).
  const pool = await getPool();
  const sale = await pool.query(
    `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
                        paid_amount, remaining_amount, created_at, issued_at, accounting_period_id, created_by)
     VALUES ($1, 150, 150, $2, 'cash', 'completed', 90, 0, $3::timestamp, $3::timestamp, $4, $5)
     RETURNING id`,
    [`ACP-${Date.now()}`, CUR, DAY, ids.periodId, ids.userId]
  );
  ids.saleId = sale.rows[0].id;
  const si = await pool.query(
    `INSERT INTO sale_items (sale_id, product_name, quantity, unit_price, subtotal, unit_cost_price, base_quantity)
     VALUES ($1, 'ACP item', 5, 30, 150, 10, 5) RETURNING id`,
    [ids.saleId]
  );
  const ret = await pool.query(
    `INSERT INTO sale_returns (sale_id, returned_value, refund_amount, refund_method, currency,
                               accounting_period_id, created_at, created_by)
     VALUES ($1, 60, 60, 'cash', $2, $3, $4::timestamp, $5) RETURNING id`,
    [ids.saleId, CUR, ids.periodId, DAY, ids.userId]
  );
  ids.returnId = ret.rows[0].id;
  await pool.query(
    `INSERT INTO sale_return_items (return_id, sale_item_id, product_name, quantity, unit_price, subtotal, base_quantity)
     VALUES ($1, $2, 'ACP item', 2, 30, 60, 2)`,
    [ids.returnId, si.rows[0].id]
  );

  const closed = await accountingPeriodService.close(ids.periodId, user);
  assert.equal(closed.status, 'closed');
  assert.ok(closed.closedAt, 'closed_at stamped');

  const cur = closed.totals.byCurrency[CUR];
  assert.ok(cur, 'snapshot has the ACP currency bucket');
  assert.equal(cur.netSales, 150);
  assert.equal(cur.returnedValue, 60);
  assert.equal(cur.netSalesAfterReturns, 90);
  assert.equal(cur.cogs, 50);
  assert.equal(cur.returnedCogs, 20);
  assert.equal(cur.cogsNet, 30);
  assert.equal(cur.grossProfit, 60);
  assert.equal(cur.expenses, 20);
  assert.equal(cur.netProfit, 40);
});

test('closing writes an immutable snapshot row and links it via snapshot_id', async () => {
  const pool = await getPool();
  const { rows } = await pool.query(
    'SELECT snapshot_id FROM accounting_periods WHERE id=$1',
    [ids.periodId]
  );
  assert.ok(rows[0].snapshot_id, 'closed period points at its snapshot row');

  const { rows: snap } = await pool.query(
    'SELECT id, accounting_period_id, snapshot_json FROM accounting_period_report_snapshots WHERE accounting_period_id=$1',
    [ids.periodId]
  );
  assert.equal(snap.length, 1, 'exactly one frozen snapshot per period');
  assert.equal(snap[0].id, rows[0].snapshot_id, 'snapshot_id matches the snapshot row');
  const cur = snap[0].snapshot_json.byCurrency[CUR];
  assert.equal(cur.netSales, 150);
  assert.equal(cur.netProfit, 40);
  // Richer frozen summaries the spec requires.
  assert.ok(Array.isArray(snap[0].snapshot_json.productSalesSummary), 'has product sales summary');
});

test('the snapshot table row is frozen — later row edits do not change it', async () => {
  const pool = await getPool();
  await pool.query('UPDATE sales SET total = 8888 WHERE id=$1', [ids.saleId]);
  const { rows } = await pool.query(
    'SELECT snapshot_json FROM accounting_period_report_snapshots WHERE accounting_period_id=$1',
    [ids.periodId]
  );
  assert.equal(rows[0].snapshot_json.byCurrency[CUR].netSales, 150, 'frozen snapshot row unchanged');
  await pool.query('UPDATE sales SET total = 150 WHERE id=$1', [ids.saleId]); // restore
});

test('snapshot is frozen — later row edits do not change the closed totals', async () => {
  const pool = await getPool();
  await pool.query('UPDATE sales SET total = 9999 WHERE id=$1', [ids.saleId]);
  const period = await accountingPeriodService.getById(ids.periodId, user);
  assert.equal(period.totals.byCurrency[CUR].netSales, 150, 'frozen snapshot unchanged');
  await pool.query('UPDATE sales SET total = 150 WHERE id=$1', [ids.saleId]); // restore
});

test('cannot close an already-closed period', async () => {
  await assert.rejects(
    () => accountingPeriodService.close(ids.periodId, user),
    /مغلق مسبقاً/
  );
});

test('writes inside a closed period are blocked; a new period can be opened', async () => {
  // No open period now → expense create is rejected (feature on, require).
  await assert.rejects(
    () => expensesService.create({ amount: 5, category: 'misc', currency: CUR }, user),
    /قيد محاسبي مفتوح/
  );

  // Closing freed the scope: a fresh period can be opened.
  const period2 = await accountingPeriodService.open({ type: 'daily' }, user);
  ids.period2Id = period2.id;
  assert.equal(period2.status, 'open');

  // assertWritable blocks the old (closed) period, allows the new one.
  await assert.rejects(
    () => accountingPeriodService.assertWritable(ids.periodId),
    /مغلق/
  );
  await accountingPeriodService.assertWritable(ids.period2Id); // resolves (open)
});

test('a payment is blocked once the sale\'s accounting period is closed', async () => {
  // Stamp a sale to the still-open period2, then close the period: the sale now
  // lives in a CLOSED period and any further write (addPayment) must be rejected.
  const pool = await getPool();
  const s = await pool.query(
    `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
                        paid_amount, remaining_amount, created_at, issued_at, accounting_period_id, created_by)
     VALUES ($1, 10, 10, $2, 'credit', 'completed', 5, 5, $3::timestamp, $3::timestamp, $4, $5)
     RETURNING id`,
    [`ACP-PAY-${Date.now()}`, CUR, DAY, ids.period2Id, ids.userId]
  );
  ids.sale2Id = s.rows[0].id;
  await pool.query(
    `INSERT INTO sale_items (sale_id, product_name, quantity, unit_price, subtotal, base_quantity, unit_conversion_factor)
     VALUES ($1, 'x', 1, 10, 10, 1, 1)`,
    [ids.sale2Id]
  );

  await accountingPeriodService.close(ids.period2Id, user);

  await assert.rejects(
    () => saleService.addPayment(ids.sale2Id, { amount: 5, paymentMethod: 'cash' }, user.id),
    /مغلق/
  );
});

test('with the accounting-period feature OFF, an expense records WITHOUT a period (legacy POS)', async () => {
  // Period enforcement is feature-gated: when OFF, POS behaves as before — an
  // expense (or sale) is accepted with no open period required. Confirms the
  // shift removal did not couple writes to anything but the optional period.
  const pool = await getPool();
  await setFlags(pool, { ...FLAGS_ON, accountingPeriods: false });
  try {
    const exp = await expensesService.create(
      { amount: 5, category: 'misc', currency: CUR, expenseDate: DAY }, user
    );
    assert.ok(exp.id, 'expense recorded with the period feature off');
    assert.equal(exp.accountingPeriodId ?? null, null, 'no period linked when the feature is off');
    // Clean it up immediately (no period to scope the after-hook cleanup to).
    await pool.query('DELETE FROM expenses WHERE id=$1', [exp.id]);
  } finally {
    await setFlags(pool, FLAGS_ON); // restore enforcement for the remaining tests
  }
});

// ── Live report active-period scoping (القيد المحاسبي) — global scope ─────────

test('live report starts from zero when a fresh accounting period is opened (test 8)', async () => {
  const period = await accountingPeriodService.open({ type: 'daily' }, user);
  ids.reportPeriodId = period.id;
  const rep = await reportService.getProfitReport({ currency: CUR }, user);
  assert.equal(rep.meta.noOpenPeriod, false);
  assert.equal(rep.meta.accountingPeriodId, ids.reportPeriodId, 'scoped to the new open period');
  const cur = rep.totals.byCurrency[CUR];
  assert.ok(!cur || cur.revenue === 0, 'a fresh period reports zero revenue');
});

test('live report includes only data from the active open period (test 9)', async () => {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
       paid_amount, remaining_amount, created_at, issued_at, accounting_period_id, created_by)
     VALUES ($1, 100, 100, $2, 'cash', 'completed', 100, 0, $3::timestamp, $3::timestamp, $4, $5)`,
    [`ACP-RPT-${Date.now()}`, CUR, DAY, ids.reportPeriodId, ids.userId]
  );
  const rep = await reportService.getProfitReport({ currency: CUR }, user);
  // The old closed period's ACP sale (150) is excluded — only the 100 here counts.
  assert.equal(rep.totals.byCurrency[CUR]?.revenue, 100);
});

test('live report returns zero when there is no open accounting period (test 7)', async () => {
  await accountingPeriodService.close(ids.reportPeriodId, user);
  const rep = await reportService.getProfitReport({ currency: CUR }, user);
  assert.equal(rep.meta.noOpenPeriod, true, 'flagged so the UI shows "no open accounting period"');
  const cur = rep.totals.byCurrency[CUR];
  assert.ok(!cur || cur.revenue === 0, 'no open period → zero revenue');
});

test('off-mode report ignores a non-admin branch and counts default-branch data', async () => {
  // Regression: branchFilterFor is flag-unaware and returns a non-admin user's
  // assignedBranchId; in OFF mode all data is under the default branch, so the
  // report must NOT branch-filter or it would wrongly zero out. The sale is
  // stamped with created_by = this user so per-user report scoping keeps it.
  const period = await accountingPeriodService.open({ type: 'daily' }, user);
  const defBranch = Number(period.branchId);
  const pool = await getPool();
  await pool.query(
    `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
       paid_amount, remaining_amount, created_at, issued_at, accounting_period_id, branch_id, created_by)
     VALUES ($1, 40, 40, $2, 'cash', 'completed', 40, 0, $3::timestamp, $3::timestamp, $4, $5, $6)`,
    [`ACP-OFFBR-${Date.now()}`, CUR, DAY, period.id, defBranch, ids.userId]
  );
  const mismatchedUser = { id: ids.userId, role: 'cashier', username: 'acp-off', assignedBranchId: defBranch + 9999 };
  const rep = await reportService.getProfitReport({ currency: CUR }, mismatchedUser);
  assert.equal(rep.totals.byCurrency[CUR]?.revenue, 40, 'counts default-branch sales regardless of the user branch');
  await accountingPeriodService.close(period.id, user);
});

// ── Cannot create a SALE / EXPENSE when the accounting period is closed ───────
// saleService.create rejects at the period guard (before any stock work), so a
// minimal dummy item is enough to drive the guard. (The legacy "closed shift"
// variants of these tests were removed — shifts no longer gate writes.)
const dummySaleInput = () => ({
  items: [{ productId: 1, quantity: 1, unitPrice: 10 }],
  paymentMethod: 'cash',
  paidAmount: 10,
  currency: CUR,
});

test('cannot create a sale when the accounting period is closed (test 11)', async () => {
  // No open global period at this point (every one opened above is closed).
  await assert.rejects(
    () => saleService.create(dummySaleInput(), user),
    /قيد محاسبي مفتوح/
  );
});

test('cannot create an expense when the accounting period is closed (test 13)', async () => {
  await assert.rejects(
    () => expensesService.create({ amount: 5, category: 'misc', currency: CUR }, user),
    /قيد محاسبي مفتوح/
  );
});

// ── Multi-branch: reports filter by BOTH accounting_period_id AND branch_id ────

test('multi-branch: reports filter by branch + period (test 15)', async () => {
  const pool = await getPool();
  await setFlags(pool, { ...FLAGS_ON, multiBranch: true });
  try {
    // A dedicated throwaway branch so the test never collides with seed/dev data.
    const b = await pool.query(
      `INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`,
      [`ACP-Branch-${Date.now()}`]
    );
    ids.branchBId = b.rows[0].id;

    const bp = await accountingPeriodService.open({ type: 'daily', branchId: ids.branchBId }, user);
    ids.branchPeriodId = bp.id;

    // 70 → this branch, this period (should count). created_by = this user so the
    // per-user report scope (a branch cashier sees only their own ops) keeps it.
    await pool.query(
      `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
         paid_amount, remaining_amount, created_at, issued_at, accounting_period_id, branch_id, created_by)
       VALUES ($1, 70, 70, $2, 'cash', 'completed', 70, 0, $3::timestamp, $3::timestamp, $4, $5, $6)`,
      [`ACP-BR-IN-${Date.now()}`, CUR, DAY, ids.branchPeriodId, ids.branchBId, ids.userId]
    );
    // 50 → this period but ANOTHER branch (excluded by branch filter).
    await pool.query(
      `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
         paid_amount, remaining_amount, created_at, issued_at, accounting_period_id, branch_id, created_by)
       VALUES ($1, 50, 50, $2, 'cash', 'completed', 50, 0, $3::timestamp, $3::timestamp, $4, 1, $5)`,
      [`ACP-BR-OTHER-${Date.now()}`, CUR, DAY, ids.branchPeriodId, ids.userId]
    );
    // 30 → this branch but a DIFFERENT (closed) period (excluded by period filter).
    await pool.query(
      `INSERT INTO sales (invoice_number, subtotal, total, currency, payment_type, status,
         paid_amount, remaining_amount, created_at, issued_at, accounting_period_id, branch_id, created_by)
       VALUES ($1, 30, 30, $2, 'cash', 'completed', 30, 0, $3::timestamp, $3::timestamp, $4, $5, $6)`,
      [`ACP-BR-OLD-${Date.now()}`, CUR, DAY, ids.periodId, ids.branchBId, ids.userId]
    );

    // A branch-bound cashier scoped to branch B sees only its own open period.
    const branchUser = { id: ids.userId, role: 'cashier', username: 'acp-branch', assignedBranchId: ids.branchBId };
    const rep = await reportService.getProfitReport({ currency: CUR }, branchUser);
    assert.equal(rep.meta.accountingPeriodId, ids.branchPeriodId, 'scoped to the branch open period');
    assert.equal(rep.meta.noOpenPeriod, false);
    assert.equal(rep.totals.byCurrency[CUR]?.revenue, 70, 'only same-branch same-period sales count');

    if (ids.branchPeriodId) await accountingPeriodService.close(ids.branchPeriodId, user);
  } finally {
    await setFlags(pool, FLAGS_ON);
  }
});

test('migration 0005 repair binds an open null-branch period to the default branch (test 9b)', async () => {
  const pool = await getPool();
  // Simulate a legacy period created before the fix: open, branch_id = NULL.
  const ins = await pool.query(
    `INSERT INTO accounting_periods (type, scope_type, branch_id, status, opened_by_user_id)
     VALUES ('daily', 'global', NULL, 'open', $1) RETURNING id`,
    [ids.userId]
  );
  const legacyId = ins.rows[0].id;
  try {
    // Apply migration 0005's repair statement verbatim.
    await pool.query(`
      UPDATE accounting_periods
      SET branch_id = (SELECT MIN(id) FROM branches), updated_at = now()
      WHERE status = 'open' AND branch_id IS NULL AND EXISTS (SELECT 1 FROM branches)
    `);
    const def = (await pool.query('SELECT MIN(id) AS id FROM branches')).rows[0];
    const row = (await pool.query('SELECT branch_id FROM accounting_periods WHERE id=$1', [legacyId])).rows[0];
    assert.notEqual(row.branch_id, null, 'legacy null-branch period is repaired');
    assert.equal(Number(row.branch_id), Number(def.id), 'repaired to the system default branch');
  } finally {
    // Don't leave an open period behind to block the next run.
    await pool.query('DELETE FROM accounting_periods WHERE id=$1', [legacyId]);
  }
});
