import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import accountingPeriodService, {
  computePeriodEnd,
  CLOSE_REASONS,
} from '../src/services/accountingPeriodService.js';
import { runAccountingPeriodCloseJob } from '../src/jobs/accountingPeriodCloseJob.js';

/**
 * Auto-close lifecycle for accounting periods (الإغلاق التلقائي للقيد المحاسبي).
 *
 * Covers, per the spec:
 *   - end-time computation for every type (daily/weekly/monthly/yearly) incl.
 *     varying month lengths, leap years and month/year rollover,
 *   - the auto-close engine closing each type on a single sweep,
 *   - the boot catch-up (app was down past the end time),
 *   - NOT closing a period before its time,
 *   - NOT re-closing an already-closed period (idempotent),
 *   - on-access lazy close (read + write guard + assertWritable) with a clear
 *     "auto-closed" message,
 *   - opt-out (autoClose=false) never expiring.
 *
 * Runs with accountingPeriods ON + multiBranch ON, binding every period to a
 * dedicated throwaway branch so it is fully isolated from the global-scope
 * accountingPeriods.test.js suite (which uses multiBranch OFF). Each test that
 * needs more than one OPEN period at once uses a DIFFERENT branch — the partial
 * unique index allows only one open period per branch.
 */

const SIG = `acp-autoclose-${Date.now()}`;
const branchIds = [];
let userId = null;
let user = null;
let originalFlags = null;

const FLAGS_ON = {
  inventory: true, pos: true, installments: true, creditScore: true, draftInvoices: true,
  multiBranch: true, multiWarehouse: false, warehouseTransfers: false,
  alerts: true, liveOperations: true, accountingPeriods: true,
};

async function setFlags(pool, obj) {
  await pool.query(
    `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'test')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(obj)]
  );
}

let pool;

async function makeBranch(label) {
  const { rows } = await pool.query(
    `INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`,
    [`${SIG}-${label}`]
  );
  branchIds.push(rows[0].id);
  return rows[0].id;
}

/** Insert an accounting period row directly with a controlled end time. */
async function insertPeriod({
  type = 'daily',
  branchId,
  status = 'open',
  openedAt = new Date(Date.now() - 2 * 86400000),
  endsAt,
  autoClose = true,
  closedReason = null,
  closedAt = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO accounting_periods
       (type, scope_type, branch_id, status, opened_at, ends_at, auto_close, closed_reason, closed_at, opened_by_user_id)
     VALUES ($1, 'branch', $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [type, branchId, status, openedAt, endsAt, autoClose, closedReason, closedAt, userId]
  );
  return rows[0];
}

async function fetchPeriod(id) {
  const { rows } = await pool.query('SELECT * FROM accounting_periods WHERE id=$1', [id]);
  return rows[0] || null;
}

before(async () => {
  pool = await getPool();
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  await setFlags(pool, FLAGS_ON);

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'ACP AutoClose Test', 'admin', true) RETURNING id`,
    [`${SIG}-user`]
  );
  userId = u.rows[0].id;
  user = { id: userId, role: 'admin', username: `${SIG}-user` };
});

after(async () => {
  const tryDel = async (text, params) => {
    try { await pool.query(text, params); } catch { /* ignore */ }
  };
  // Restore flags, forcing accountingPeriods back OFF so enforcement never leaks
  // into another suite sharing this DB.
  try {
    if (originalFlags !== null) {
      await setFlags(pool, { ...JSON.parse(originalFlags), accountingPeriods: false });
    } else {
      await pool.query("DELETE FROM settings WHERE key='feature_flags'");
    }
  } catch { /* best effort */ }

  if (branchIds.length) {
    const pid = (
      await pool.query('SELECT id FROM accounting_periods WHERE branch_id = ANY($1)', [branchIds])
    ).rows.map((r) => r.id);
    if (pid.length) {
      await tryDel('DELETE FROM accounting_period_report_snapshots WHERE accounting_period_id = ANY($1)', [pid]);
      await tryDel("DELETE FROM audit_log WHERE resource='accounting_periods' AND resource_id = ANY($1)", [pid]);
      await tryDel('DELETE FROM accounting_periods WHERE id = ANY($1)', [pid]);
    }
    await tryDel('DELETE FROM branches WHERE id = ANY($1)', [branchIds]);
  }
  if (userId) {
    await tryDel('DELETE FROM audit_log WHERE user_id=$1', [userId]);
    await tryDel('DELETE FROM users WHERE id=$1', [userId]);
  }
  await closeDatabase().catch(() => {});
});

// ── end-time computation (pure) ──────────────────────────────────────────────

test('computePeriodEnd: daily adds exactly 24h, weekly adds 7 days', () => {
  assert.equal(
    computePeriodEnd(new Date('2024-01-31T10:30:00.000Z'), 'daily').toISOString(),
    '2024-02-01T10:30:00.000Z'
  );
  assert.equal(
    computePeriodEnd(new Date('2024-01-31T10:30:00.000Z'), 'weekly').toISOString(),
    '2024-02-07T10:30:00.000Z'
  );
});

test('computePeriodEnd: monthly handles varying month lengths and year rollover', () => {
  // Mid-month — same day next month.
  assert.equal(
    computePeriodEnd(new Date('2024-01-15T08:00:00.000Z'), 'monthly').toISOString(),
    '2024-02-15T08:00:00.000Z'
  );
  // Jan 31 in a LEAP year → clamp to Feb 29.
  assert.equal(
    computePeriodEnd(new Date('2024-01-31T08:00:00.000Z'), 'monthly').toISOString(),
    '2024-02-29T08:00:00.000Z'
  );
  // Jan 31 in a NON-leap year → clamp to Feb 28.
  assert.equal(
    computePeriodEnd(new Date('2025-01-31T08:00:00.000Z'), 'monthly').toISOString(),
    '2025-02-28T08:00:00.000Z'
  );
  // Dec 31 → rolls into the next year.
  assert.equal(
    computePeriodEnd(new Date('2024-12-31T08:00:00.000Z'), 'monthly').toISOString(),
    '2025-01-31T08:00:00.000Z'
  );
});

test('computePeriodEnd: yearly clamps Feb 29 of a leap year to Feb 28', () => {
  assert.equal(
    computePeriodEnd(new Date('2024-02-29T08:00:00.000Z'), 'yearly').toISOString(),
    '2025-02-28T08:00:00.000Z'
  );
  assert.equal(
    computePeriodEnd(new Date('2023-06-21T12:00:00.000Z'), 'yearly').toISOString(),
    '2024-06-21T12:00:00.000Z'
  );
});

test('computePeriodEnd: rejects an unknown type', () => {
  assert.throws(() => computePeriodEnd(new Date(), 'hourly'), /غير صالح/);
});

// ── isExpired predicate ──────────────────────────────────────────────────────

test('isExpired: only an open, auto-close, past-end period is expired', () => {
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 3_600_000);
  assert.equal(accountingPeriodService.isExpired({ status: 'open', autoClose: true, endsAt: past }), true);
  assert.equal(accountingPeriodService.isExpired({ status: 'open', autoClose: true, endsAt: future }), false);
  assert.equal(accountingPeriodService.isExpired({ status: 'closed', autoClose: true, endsAt: past }), false);
  assert.equal(accountingPeriodService.isExpired({ status: 'open', autoClose: false, endsAt: past }), false);
  assert.equal(accountingPeriodService.isExpired({ status: 'open', autoClose: true, endsAt: null }), false);
  // snake_case row (raw pg) is understood too.
  assert.equal(
    accountingPeriodService.isExpired({ status: 'open', auto_close: true, ends_at: past.toISOString() }),
    true
  );
});

// ── the auto-close engine closes every type on one sweep ─────────────────────

test('closeExpiredPeriods closes daily/weekly/monthly/yearly and freezes a snapshot', async () => {
  const past = new Date(Date.now() - 60_000);
  const created = {};
  for (const type of ['daily', 'weekly', 'monthly', 'yearly']) {
    const b = await makeBranch(`close-${type}`);
    created[type] = await insertPeriod({ type, branchId: b, endsAt: past });
  }

  const summary = await accountingPeriodService.closeExpiredPeriods({ reason: CLOSE_REASONS.AUTO });
  assert.ok(summary.closed >= 4, `closed at least the 4 seeded periods (got ${summary.closed})`);

  for (const type of ['daily', 'weekly', 'monthly', 'yearly']) {
    const row = await fetchPeriod(created[type].id);
    assert.equal(row.status, 'closed', `${type} period is closed`);
    assert.equal(row.closed_reason, 'auto', `${type} period reason=auto`);
    assert.ok(row.closed_at, `${type} period stamped closed_at`);
    assert.ok(row.totals_json, `${type} period has a frozen totals snapshot`);
    const snap = await pool.query(
      'SELECT count(*)::int n FROM accounting_period_report_snapshots WHERE accounting_period_id=$1',
      [row.id]
    );
    assert.equal(snap.rows[0].n, 1, `${type} period has exactly one frozen snapshot row`);
  }
});

// ── does NOT close before its time ───────────────────────────────────────────

test('a period whose end time has not arrived is left open', async () => {
  const b = await makeBranch('future');
  const p = await insertPeriod({ type: 'monthly', branchId: b, endsAt: new Date(Date.now() + 3_600_000) });
  const summary = await accountingPeriodService.closeExpiredPeriods({ reason: CLOSE_REASONS.AUTO });
  assert.equal(summary.expired, 0, 'no period is treated as expired this sweep');
  const row = await fetchPeriod(p.id);
  assert.equal(row.status, 'open', 'future-dated period stays open');
});

// ── idempotency: never re-close ──────────────────────────────────────────────

test('an already-closed period is never re-closed (idempotent)', async () => {
  const b = await makeBranch('idempotent');
  const p = await insertPeriod({ type: 'daily', branchId: b, endsAt: new Date(Date.now() - 60_000) });

  // First sweep closes it.
  await accountingPeriodService.closeExpiredPeriods({ reason: CLOSE_REASONS.AUTO });
  const afterFirst = await fetchPeriod(p.id);
  assert.equal(afterFirst.status, 'closed');
  const firstClosedAt = afterFirst.closed_at;

  // A second sweep (and a direct auto-close call) must not touch it.
  const didClose = await accountingPeriodService.autoCloseExpiredPeriod(afterFirst);
  assert.equal(didClose, false, 'autoCloseExpiredPeriod is a no-op on a closed period');
  const summary = await accountingPeriodService.closeExpiredPeriods({ reason: CLOSE_REASONS.AUTO });
  // It must not count an already-closed period as expired again.
  const afterSecond = await fetchPeriod(p.id);
  assert.equal(afterSecond.status, 'closed');
  assert.deepEqual(afterSecond.closed_at, firstClosedAt, 'closed_at is unchanged on re-sweep');
  assert.equal(afterSecond.closed_reason, 'auto', 'reason unchanged on re-sweep');
  assert.ok(summary.closed === 0 || summary.expired === 0, 'closed period is not re-closed');
});

// ── boot catch-up (app was down past the end time) ───────────────────────────

test('startup catch-up closes a period that expired while the app was down', async () => {
  const b = await makeBranch('startup');
  // opened well in the past, end time already passed — as if the program was
  // closed across the boundary and only now restarted.
  const p = await insertPeriod({
    type: 'daily',
    branchId: b,
    openedAt: new Date(Date.now() - 3 * 86400000),
    endsAt: new Date(Date.now() - 2 * 86400000),
  });
  const summary = await accountingPeriodService.closeExpiredPeriods({
    reason: CLOSE_REASONS.AUTO_STARTUP,
  });
  assert.ok(summary.closed >= 1);
  const row = await fetchPeriod(p.id);
  assert.equal(row.status, 'closed', 'expired-while-down period is closed on catch-up');
  assert.equal(row.closed_reason, 'auto_startup', 'catch-up close is recorded as auto_startup');
});

test('the scheduler job wrapper closes expired periods', async () => {
  const b = await makeBranch('job');
  const p = await insertPeriod({ type: 'weekly', branchId: b, endsAt: new Date(Date.now() - 60_000) });
  await runAccountingPeriodCloseJob();
  const row = await fetchPeriod(p.id);
  assert.equal(row.status, 'closed', 'job closed the expired period');
  assert.ok(['auto', 'auto_startup'].includes(row.closed_reason));
});

// ── on-access lazy close ─────────────────────────────────────────────────────

test('getOpenPeriodForOperation auto-closes an expired period and reports none open', async () => {
  const b = await makeBranch('lazy-read');
  const p = await insertPeriod({ type: 'daily', branchId: b, endsAt: new Date(Date.now() - 60_000) });
  const open = await accountingPeriodService.getOpenPeriodForOperation(b);
  assert.equal(open, null, 'expired period is not returned as the open period');
  const row = await fetchPeriod(p.id);
  assert.equal(row.status, 'closed', 'reading the open period auto-closed the expired one');
  assert.equal(row.closed_reason, 'auto');
});

test('a write is rejected with a clear "auto-closed" message once the period expires', async () => {
  const b = await makeBranch('lazy-write');
  const p = await insertPeriod({ type: 'monthly', branchId: b, endsAt: new Date(Date.now() - 60_000) });

  let caught = null;
  try {
    await accountingPeriodService.resolvePeriodIdForWrite(user, b, { require: true });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'the write guard threw');
  assert.match(caught.message, /تلقائياً/, 'message states the period was auto-closed');
  assert.equal(caught.code, 'ACCOUNTING_PERIOD_AUTO_CLOSED');
  const row = await fetchPeriod(p.id);
  assert.equal(row.status, 'closed', 'the expired period was auto-closed by the write guard');
});

test('assertWritable blocks edits inside an expired period and auto-closes it', async () => {
  const b = await makeBranch('assert-writable');
  const p = await insertPeriod({ type: 'yearly', branchId: b, endsAt: new Date(Date.now() - 60_000) });

  let caught = null;
  try {
    await accountingPeriodService.assertWritable(p.id);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'assertWritable threw on an expired period');
  assert.match(caught.message, /تلقائياً/);
  assert.equal(caught.code, 'ACCOUNTING_PERIOD_AUTO_CLOSED');
  const row = await fetchPeriod(p.id);
  assert.equal(row.status, 'closed');
  assert.equal(row.closed_reason, 'auto');
});

// ── open() wiring + opt-out ──────────────────────────────────────────────────

test('open() computes and stores an end time matching the period type', async () => {
  const b = await makeBranch('open-daily');
  const period = await accountingPeriodService.open({ type: 'daily', branchId: b }, user);
  assert.ok(period.endsAt, 'open() stored an end time');
  const span = new Date(period.endsAt).getTime() - new Date(period.openedAt).getTime();
  assert.ok(Math.abs(span - 86400000) < 2000, `daily window ≈ 24h (got ${span}ms)`);
  assert.equal(accountingPeriodService.isExpired(period), false, 'a freshly opened period is not expired');
});

test('a period opened with autoClose=false has no end time and never auto-closes', async () => {
  const b = await makeBranch('manual-only');
  const period = await accountingPeriodService.open({ type: 'daily', branchId: b, autoClose: false }, user);
  assert.equal(period.endsAt, null, 'no end time when auto-close is opted out');
  assert.equal(accountingPeriodService.isExpired(period), false);
  // A sweep must never select a period with no end time, however old it is.
  await accountingPeriodService.closeExpiredPeriods({ reason: CLOSE_REASONS.AUTO });
  const stillOpen = await fetchPeriod(period.id);
  assert.equal(stillOpen.status, 'open', 'manual-only period is never auto-closed');
});
