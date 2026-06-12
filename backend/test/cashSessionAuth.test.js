import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import cashSessionService from '../src/services/cashSessionService.js';

/**
 * Authorization + lifecycle coverage for cash sessions / shifts.
 *
 * Validates the shift-permissions spec:
 *   - A cashier can always reach their OWN shift, even when their assigned
 *     branch differs from the shift's branch — no spurious
 *     "Cash session belongs to a different branch" error.
 *   - A cashier may NOT view/close another user's shift.
 *   - A branch manager (branch_manager / branch_admin) may view+close any shift
 *     inside their own branch, but NOT a shift in another branch.
 *   - A super admin (global_admin / admin) may close any shift in any branch.
 *   - Logout auto-closes the user's open shift (closedAt + closing balance).
 *
 * Runs with multiBranch ON so branch-scope enforcement is live. Fixtures use
 * the reserved `CSAUTH-` branch / `csauth-` user prefixes so the before-hook
 * can self-heal a shared dev DB after an interrupted run.
 */

const ids = {};
let originalFlags = null;

// User stand-ins (the service only reads id/role/username/assignedBranchId).
let superAdmin;
let branchManagerA;
let cashierA;
let cashierA2;
let cashierB;
let cashierNoBranch;

async function setFlags(pool, obj) {
  await pool.query(
    `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'test')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(obj)]
  );
}

async function insertSession(pool, { userId, branchId, status = 'open', opening = '100' }) {
  if (status === 'open') {
    // A partial unique index allows only ONE open session per user/branch.
    // Clear any leftover open shift for this user so each test's insert is
    // independent and never trips the constraint.
    await pool.query("DELETE FROM cash_sessions WHERE user_id=$1 AND status='open'", [userId]);
  }
  const { rows } = await pool.query(
    `INSERT INTO cash_sessions (user_id, branch_id, status, opening_cash, currency)
     VALUES ($1, $2, $3, $4, 'USD') RETURNING id`,
    [userId, branchId, status, opening]
  );
  return rows[0].id;
}

async function cleanupOwnFixtures(pool) {
  const tryDel = async (text, params) => {
    try { await pool.query(text, params); } catch { /* ignore */ }
  };
  await tryDel("DELETE FROM cash_sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'csauth-%')");
  await tryDel("DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'csauth-%')");
  await tryDel("DELETE FROM users WHERE username LIKE 'csauth-%'");
  await tryDel("DELETE FROM branches WHERE name LIKE 'CSAUTH-BR-%'");
}

before(async () => {
  const pool = await getPool();
  await cleanupOwnFixtures(pool);

  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  await setFlags(pool, {
    inventory: true, pos: true, installments: true, creditScore: true, draftInvoices: true,
    multiBranch: true, multiWarehouse: false, warehouseTransfers: false,
    alerts: true, liveOperations: true, accountingPeriods: false, treasury: false,
  });

  const ts = Date.now();
  const a = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`CSAUTH-BR-A-${ts}`]);
  const b = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`CSAUTH-BR-B-${ts}`]);
  ids.branchA = a.rows[0].id;
  ids.branchB = b.rows[0].id;

  const mkUser = async (suffix, role, branchId) => {
    const { rows: ur } = await pool.query(
      `INSERT INTO users (username, password, full_name, role, is_active, assigned_branch_id)
       VALUES ($1, 'x', $2, $3, true, $4) RETURNING id`,
      [`csauth-${suffix}-${ts}`, `CSAuth ${suffix}`, role, branchId]
    );
    return { id: ur[0].id, role, username: `csauth-${suffix}`, assignedBranchId: branchId };
  };

  superAdmin = await mkUser('admin', 'global_admin', null);
  branchManagerA = await mkUser('mgr-a', 'branch_manager', ids.branchA);
  cashierA = await mkUser('cashier-a', 'cashier', ids.branchA);
  cashierA2 = await mkUser('cashier-a2', 'cashier', ids.branchA);
  cashierB = await mkUser('cashier-b', 'cashier', ids.branchB);
  // A cashier with NO assigned branch — reproduces the spurious cross-branch
  // error: their shift carries branchA but branchFilterFor() returns [].
  cashierNoBranch = await mkUser('cashier-nb', 'cashier', null);
});

after(async () => {
  const pool = await getPool();
  try {
    if (originalFlags !== null) {
      await setFlags(pool, JSON.parse(originalFlags));
    } else {
      await pool.query("DELETE FROM settings WHERE key='feature_flags'");
    }
  } catch { /* best effort */ }
  await cleanupOwnFixtures(pool);
  await closeDatabase().catch(() => {});
});

// ── Requirement #6: no spurious "different branch" for the shift's owner ─────

test('owner can load their OWN shift even when their branch differs (no spurious error)', async () => {
  const pool = await getPool();
  const sid = await insertSession(pool, { userId: cashierNoBranch.id, branchId: ids.branchA });
  // Under the old code this threw "Cash session belongs to a different branch".
  const session = await cashSessionService.getById(sid, cashierNoBranch);
  assert.equal(session.id, sid);
  assert.equal(session.status, 'open');
});

test('getCurrent returns the cashier\'s own open shift without a branch error', async () => {
  const pool = await getPool();
  await insertSession(pool, { userId: cashierA.id, branchId: ids.branchA });
  const current = await cashSessionService.getCurrent(cashierA);
  assert.ok(current, 'cashier should see their current open shift');
  assert.equal(Number(current.userId), Number(cashierA.id));
});

// ── Requirement #3: a cashier cannot view another user's shift ───────────────

test('cashier CANNOT view another user\'s shift (same branch)', async () => {
  const pool = await getPool();
  const sid = await insertSession(pool, { userId: cashierA2.id, branchId: ids.branchA });
  await assert.rejects(
    () => cashSessionService.getById(sid, cashierA),
    /مستخدم آخر/
  );
});

test('cashier CANNOT close another user\'s shift', async () => {
  const pool = await getPool();
  const sid = await insertSession(pool, { userId: cashierA2.id, branchId: ids.branchA });
  await assert.rejects(
    () => cashSessionService.close(sid, { closingCash: 100 }, cashierA),
    /مستخدم آخر/
  );
});

// ── Requirement #3: branch manager scope ─────────────────────────────────────

test('branch manager CAN close a shift within their own branch', async () => {
  const pool = await getPool();
  const sid = await insertSession(pool, { userId: cashierA2.id, branchId: ids.branchA, opening: '100' });
  // closingCash = opening keeps variance 0 (no GL posting needed in this test).
  const closed = await cashSessionService.close(sid, { closingCash: 100 }, branchManagerA);
  assert.equal(closed.status, 'closed');
  assert.ok(closed.closedAt, 'closedAt should be stamped');
});

test('branch manager CANNOT close a shift from another branch', async () => {
  const pool = await getPool();
  const sid = await insertSession(pool, { userId: cashierB.id, branchId: ids.branchB });
  await assert.rejects(
    () => cashSessionService.close(sid, { closingCash: 100 }, branchManagerA),
    /فرعاً آخر/
  );
  const { rows } = await pool.query("SELECT status FROM cash_sessions WHERE id=$1", [sid]);
  assert.equal(rows[0].status, 'open', 'cross-branch shift must stay open');
});

// ── Requirement #3: super admin overrides branch scope ───────────────────────

test('super admin CAN close any shift in any branch', async () => {
  const pool = await getPool();
  const sid = await insertSession(pool, { userId: cashierB.id, branchId: ids.branchB, opening: '50' });
  const closed = await cashSessionService.close(sid, { closingCash: 50 }, superAdmin);
  assert.equal(closed.status, 'closed');
  assert.ok(closed.closedAt);
});

// ── Requirement #2: logout auto-closes the user's open shift ─────────────────

test('logout auto-closes the user\'s open shift (closedAt + closing balance)', async () => {
  const pool = await getPool();
  const sid = await insertSession(pool, { userId: cashierA.id, branchId: ids.branchA, opening: '250' });

  const result = await cashSessionService.closeOpenSessionsForUser(cashierA);
  assert.ok(result.closed.includes(sid), 'the open shift id should be reported as closed');

  const { rows } = await pool.query(
    "SELECT status, closed_at, closing_cash, expected_cash, variance FROM cash_sessions WHERE id=$1",
    [sid]
  );
  assert.equal(rows[0].status, 'closed');
  assert.ok(rows[0].closed_at, 'closedAt must be recorded');
  // No drawer count at logout → closes at expected (= opening here), variance 0.
  assert.equal(Number(rows[0].closing_cash), 250);
  assert.equal(Number(rows[0].expected_cash), 250);
  assert.equal(Number(rows[0].variance), 0);
});

test('logout leaves no open shift hanging for the user', async () => {
  const pool = await getPool();
  await insertSession(pool, { userId: cashierA2.id, branchId: ids.branchA });
  await cashSessionService.closeOpenSessionsForUser(cashierA2);
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM cash_sessions WHERE user_id=$1 AND status='open'",
    [cashierA2.id]
  );
  assert.equal(rows[0].n, 0, 'no open shift should remain after logout');
});
