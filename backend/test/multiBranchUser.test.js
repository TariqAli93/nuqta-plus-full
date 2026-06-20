import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import {
  resolveBranchIdForOperation,
  branchFilterFor,
  enforceBranchScope,
  canSwitchBranch,
  effectiveBranchIds,
  loadUserBranchIds,
} from '../src/services/scopeService.js';
import { UserService } from '../src/services/userService.js';

/**
 * Coverage for the many-to-many user↔branch model (a user assigned to MORE THAN
 * one branch — especially a branch_manager).
 *
 * Guarantees:
 *   - a user assigned to several branches may act on / see ALL of them and only
 *     them; a foreign branch is always rejected;
 *   - a user assigned to a SINGLE branch behaves exactly like the legacy model;
 *   - the user_branches join table is the source of truth (loaded into
 *     `allowedBranchIds`), with the primary `assigned_branch_id` as the default;
 *   - WHO may assign WHICH branches is enforced (a branch-bound manager can't
 *     grant a branch outside their own set; a global admin can grant any).
 *
 * Fixtures use the reserved `MBR-` branch / `mbr-` user prefixes for self-heal.
 */

const userService = new UserService();
const ids = {};
let originalFlags = null;

let multiManager; // branch_manager over branchA + branchB (primary A)
let singleCashier; // cashier on branchA only

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
  await tryDel("DELETE FROM user_branches WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'mbr-%')");
  await tryDel("DELETE FROM users WHERE username LIKE 'mbr-%'");
  await tryDel("DELETE FROM branches WHERE name LIKE 'MBR-%'");
}

before(async () => {
  const pool = await getPool();
  await cleanupOwnFixtures(pool);

  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  await setMultiBranch(pool, true);

  const ts = Date.now();
  const a = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`MBR-A-${ts}`]);
  const b = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`MBR-B-${ts}`]);
  const c = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`MBR-C-${ts}`]);
  ids.a = a.rows[0].id;
  ids.b = b.rows[0].id;
  ids.c = c.rows[0].id; // foreign branch — never assigned to our users
  ids.ts = ts;
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

// ── User CRUD writes the join table ──────────────────────────────────────────

test('create a branch_manager with branchIds → join rows written, primary set, getById returns the set', async () => {
  const globalAdmin = { id: 0, role: 'global_admin' };
  const created = await userService.create(
    {
      username: `mbr-mgr-${ids.ts}`,
      password: 'password123',
      fullName: 'MBR Manager',
      role: 'branch_manager',
      assignedBranchId: ids.a, // primary
      branchIds: [ids.a, ids.b],
    },
    globalAdmin
  );
  assert.equal(Number(created.assignedBranchId), Number(ids.a), 'primary branch is the assigned one');
  assert.deepEqual(
    [...created.branchIds].map(Number).sort((x, y) => x - y),
    [ids.a, ids.b].sort((x, y) => x - y),
    'getById returns BOTH assigned branches'
  );

  const pool = await getPool();
  const { rows: ur } = await pool.query(
    "SELECT id FROM users WHERE username=$1",
    [`mbr-mgr-${ids.ts}`]
  );
  multiManager = {
    id: ur[0].id,
    role: 'branch_manager',
    assignedBranchId: ids.a,
    allowedBranchIds: [ids.a, ids.b], // mirrors what auth.js attaches per-request
  };
});

test('create a single-branch cashier (no branchIds) → exactly one join row, legacy behaviour', async () => {
  const globalAdmin = { id: 0, role: 'global_admin' };
  const created = await userService.create(
    {
      username: `mbr-cashier-${ids.ts}`,
      password: 'password123',
      fullName: 'MBR Cashier',
      role: 'cashier',
      assignedBranchId: ids.a,
    },
    globalAdmin
  );
  assert.deepEqual(created.branchIds.map(Number), [ids.a], 'single branch only');

  const allowed = await loadUserBranchIds({ id: created.id, assignedBranchId: ids.a });
  assert.deepEqual(allowed.map(Number), [ids.a]);

  singleCashier = {
    id: created.id,
    role: 'cashier',
    assignedBranchId: ids.a,
    allowedBranchIds: [ids.a],
  };
});

// ── Scope helpers honour the full set ────────────────────────────────────────

test('effectiveBranchIds + branchFilterFor return ALL assigned branches', () => {
  assert.deepEqual(effectiveBranchIds(multiManager).sort((x, y) => x - y), [ids.a, ids.b].sort((x, y) => x - y));
  assert.deepEqual(branchFilterFor(multiManager).sort((x, y) => x - y), [ids.a, ids.b].sort((x, y) => x - y));
});

test('canSwitchBranch is true for a multi-branch user, false for a single-branch user', () => {
  assert.equal(canSwitchBranch(multiManager), true);
  assert.equal(canSwitchBranch(singleCashier), false);
});

test('loadUserBranchIds reads the join table set from the DB', async () => {
  const loaded = await loadUserBranchIds({ id: multiManager.id, assignedBranchId: ids.a });
  assert.deepEqual(loaded.map(Number).sort((x, y) => x - y), [ids.a, ids.b].sort((x, y) => x - y));
});

// ── resolveBranchIdForOperation across the assigned set ───────────────────────

test('multi-branch user may target EITHER assigned branch', async () => {
  assert.equal(Number(await resolveBranchIdForOperation(multiManager, ids.a)), Number(ids.a));
  assert.equal(Number(await resolveBranchIdForOperation(multiManager, ids.b)), Number(ids.b));
});

test('multi-branch user with NO request → binds to the primary branch', async () => {
  assert.equal(Number(await resolveBranchIdForOperation(multiManager, null)), Number(ids.a));
});

test('multi-branch user targeting a FOREIGN branch → rejected', async () => {
  await assert.rejects(
    () => resolveBranchIdForOperation(multiManager, ids.c),
    /فرع آخر/
  );
});

// ── enforceBranchScope across the assigned set ────────────────────────────────

test('enforceBranchScope allows BOTH assigned branches and rejects a foreign one', () => {
  assert.doesNotThrow(() => enforceBranchScope(multiManager, ids.a));
  assert.doesNotThrow(() => enforceBranchScope(multiManager, ids.b));
  assert.throws(() => enforceBranchScope(multiManager, ids.c), /different branch/);
});

test('single-branch user is still pinned to its one branch', () => {
  assert.doesNotThrow(() => enforceBranchScope(singleCashier, ids.a));
  assert.throws(() => enforceBranchScope(singleCashier, ids.b), /different branch/);
});

// ── Who may assign which branches ─────────────────────────────────────────────

test('a branch-bound manager CANNOT grant a branch outside their own set', async () => {
  // multiManager owns {A,B}; attempting to create a user in branch C must fail.
  await assert.rejects(
    () =>
      userService.create(
        {
          username: `mbr-evil-${ids.ts}`,
          password: 'password123',
          fullName: 'Evil',
          role: 'cashier',
          branchIds: [ids.c],
        },
        multiManager
      ),
    /خارج نطاق صلاحيتك/
  );
});

test('a branch-bound manager CAN assign within their own set', async () => {
  const created = await userService.create(
    {
      username: `mbr-sub-${ids.ts}`,
      password: 'password123',
      fullName: 'Sub Cashier',
      role: 'cashier',
      branchIds: [ids.b], // inside the manager's {A,B}
    },
    multiManager
  );
  assert.deepEqual(created.branchIds.map(Number), [ids.b]);
});

// ── Update reconciles the set ─────────────────────────────────────────────────

test('updating branchIds replaces the join set (add + remove)', async () => {
  const globalAdmin = { id: 0, role: 'global_admin' };
  const updated = await userService.update(
    multiManager.id,
    { branchIds: [ids.b], assignedBranchId: ids.b },
    globalAdmin
  );
  assert.deepEqual(updated.branchIds.map(Number), [ids.b], 'set narrowed to just B');
  assert.equal(Number(updated.assignedBranchId), Number(ids.b), 'primary moved to B');
});
