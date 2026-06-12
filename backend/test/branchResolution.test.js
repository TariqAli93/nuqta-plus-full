import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { resolveBranchIdForOperation } from '../src/services/scopeService.js';
import { getDefaultBranchId } from '../src/services/systemDefaultsService.js';

/**
 * Unit coverage for the SINGLE central branch resolver
 * `resolveBranchIdForOperation(user, requestedBranchId, { ensure })`.
 *
 * Validates the branch-selection spec:
 *   - multiBranch OFF → always the system default branch; requested ids ignored
 *     (no stale localStorage / foreign branch leaks into a new operation), and a
 *     non-existent id never produces a DatabaseError.
 *   - multiBranch ON + branch-bound user → their assigned branch only; a foreign
 *     request is rejected; a missing/inactive assigned branch yields the clear
 *     "راجع المدير" message.
 *   - multiBranch ON + switcher (global admin) → requested (validated exists +
 *     active) or the default active branch.
 *
 * Fixtures use the reserved `BRES-` branch / `bres-` user prefixes for self-heal.
 */

const ids = {};
let originalFlags = null;

let superAdmin;
let cashierActive;
let cashierInactive;
let cashierNoBranch;

async function setMultiBranch(pool, on) {
  await pool.query(
    `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'test')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({
      inventory: true, pos: true, draftInvoices: true,
      multiBranch: on, multiWarehouse: false, warehouseTransfers: false,
      alerts: true, liveOperations: true, accountingPeriods: false, treasury: false,
    })]
  );
}

async function cleanupOwnFixtures(pool) {
  const tryDel = async (text, params) => {
    try { await pool.query(text, params); } catch { /* ignore */ }
  };
  await tryDel("DELETE FROM users WHERE username LIKE 'bres-%'");
  await tryDel("DELETE FROM branches WHERE name LIKE 'BRES-%'");
}

before(async () => {
  const pool = await getPool();
  await cleanupOwnFixtures(pool);

  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;

  const ts = Date.now();
  const active = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`BRES-ACTIVE-${ts}`]);
  const active2 = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`BRES-ACTIVE2-${ts}`]);
  const inactive = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, false) RETURNING id`, [`BRES-INACTIVE-${ts}`]);
  ids.active = active.rows[0].id;
  ids.active2 = active2.rows[0].id;
  ids.inactive = inactive.rows[0].id;

  const mkUser = async (suffix, role, branchId) => {
    const { rows: ur } = await pool.query(
      `INSERT INTO users (username, password, full_name, role, is_active, assigned_branch_id)
       VALUES ($1, 'x', $2, $3, true, $4) RETURNING id`,
      [`bres-${suffix}-${ts}`, `BRes ${suffix}`, role, branchId]
    );
    return { id: ur[0].id, role, username: `bres-${suffix}`, assignedBranchId: branchId };
  };

  superAdmin = await mkUser('admin', 'global_admin', null);
  cashierActive = await mkUser('cashier', 'cashier', ids.active);
  cashierInactive = await mkUser('cashier-inact', 'cashier', ids.inactive);
  cashierNoBranch = await mkUser('cashier-nb', 'cashier', null);
});

after(async () => {
  const pool = await getPool();
  try {
    if (originalFlags !== null) {
      await pool.query(
        `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'restore')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [originalFlags]
      );
    } else {
      await pool.query("DELETE FROM settings WHERE key='feature_flags'");
    }
  } catch { /* best effort */ }
  await cleanupOwnFixtures(pool);
  await closeDatabase().catch(() => {});
});

// ── multiBranch OFF ──────────────────────────────────────────────────────────

test('branches OFF → returns the system default branch, ignoring requested id', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, false);
  const def = await getDefaultBranchId();
  // Even with a switcher passing an explicit (different) branch, OFF wins.
  const resolved = await resolveBranchIdForOperation(superAdmin, ids.active2, { ensure: true });
  assert.equal(Number(resolved), Number(def));
});

test('branches OFF → a stale/foreign requested id never throws a DatabaseError', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, false);
  // 999999999 does not exist; OFF must ignore it and return the default branch.
  const resolved = await resolveBranchIdForOperation(cashierActive, 999999999, { ensure: true });
  const def = await getDefaultBranchId();
  assert.equal(Number(resolved), Number(def));
});

// ── multiBranch ON, branch-bound user ────────────────────────────────────────

test('branches ON, cashier → their assigned branch (no request)', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  const resolved = await resolveBranchIdForOperation(cashierActive, null, { ensure: true });
  assert.equal(Number(resolved), Number(ids.active));
});

test('branches ON, cashier sending a DIFFERENT branch → rejected', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  await assert.rejects(
    () => resolveBranchIdForOperation(cashierActive, ids.active2, { ensure: true }),
    /فرع آخر/
  );
});

test('branches ON, cashier with NO assigned branch → clear "راجع المدير" message', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  await assert.rejects(
    () => resolveBranchIdForOperation(cashierNoBranch, null, { ensure: true }),
    /لا يوجد فرع صالح مرتبط بحسابك/
  );
});

test('branches ON, cashier whose assigned branch is INACTIVE → clear "راجع المدير" message', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  await assert.rejects(
    () => resolveBranchIdForOperation(cashierInactive, null, { ensure: true }),
    /لا يوجد فرع صالح مرتبط بحسابك/
  );
});

// ── multiBranch ON, switcher (super admin) ───────────────────────────────────

test('branches ON, super admin + valid active requested → returns it', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  const resolved = await resolveBranchIdForOperation(superAdmin, ids.active2, { ensure: true });
  assert.equal(Number(resolved), Number(ids.active2));
});

test('branches ON, super admin + no requested → returns a default ACTIVE branch', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  const resolved = await resolveBranchIdForOperation(superAdmin, null, { ensure: true });
  assert.ok(resolved, 'should resolve a branch');
  const { rows } = await pool.query('SELECT is_active FROM branches WHERE id=$1', [resolved]);
  assert.equal(rows[0].is_active, true, 'default branch must be active');
});

test('branches ON, super admin + NON-EXISTENT requested → clear message, not a DatabaseError', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  await assert.rejects(
    () => resolveBranchIdForOperation(superAdmin, 999999999, { ensure: true }),
    /غير موجود/
  );
});

test('branches ON, super admin + INACTIVE requested → rejected as inactive', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, true);
  await assert.rejects(
    () => resolveBranchIdForOperation(superAdmin, ids.inactive, { ensure: true }),
    /غير نشط/
  );
});
