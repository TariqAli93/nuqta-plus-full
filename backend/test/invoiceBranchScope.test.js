import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import { SaleService } from '../src/services/saleService.js';
import { enforceInvoiceBranchScope, invoiceBranchScope } from '../src/services/scopeService.js';

/**
 * Branch-scoped invoice visibility (تقييد عرض الفواتير حسب فروع المستخدم).
 *
 * Acceptance:
 *   ✓ a single-branch user sees only their branch's invoices;
 *   ✓ a multi-branch user sees ALL their branches and may filter between them;
 *   ✓ the super admin sees every invoice (incl. legacy null-branch);
 *   ✓ direct-by-id access to a foreign OR null-branch invoice is BLOCKED for a
 *     branch-bound user (can't bypass the list filter via the API);
 *   ✓ with the multiBranch feature OFF, scoping is a no-op (single-branch shop).
 *
 * Reserved `IVB-` branch / `INVSCOPE-` invoice prefixes for self-heal cleanup.
 */

const svc = new SaleService();
const ids = {};
let originalFlags = null;

const cashierA = () => ({ id: 990101, role: 'cashier', assignedBranchId: ids.a, allowedBranchIds: [ids.a] });
const multiAB = () => ({ id: 990102, role: 'cashier', assignedBranchId: ids.a, allowedBranchIds: [ids.a, ids.b] });
const noBranch = () => ({ id: 990103, role: 'cashier', assignedBranchId: null, allowedBranchIds: [] });
const admin = () => ({ id: 990104, role: 'global_admin' });

async function setMultiBranch(pool, on) {
  await pool.query(
    `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'test')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ multiBranch: on, pos: true, inventory: true })]
  );
}

async function cleanup(pool) {
  const tryDel = async (t, p) => { try { await pool.query(t, p); } catch { /* ignore */ } };
  await tryDel("DELETE FROM sales WHERE invoice_number LIKE 'INVSCOPE-%'");
  await tryDel("DELETE FROM branches WHERE name LIKE 'IVB-%'");
}

const tagsFor = async (user, filters = {}) => {
  const r = await svc.getAll({ limit: 500, ...filters }, user);
  return r.data
    .filter((s) => String(s.invoiceNumber).startsWith('INVSCOPE-'))
    .map((s) => s.invoiceNumber.replace(`-${ids.ts}`, ''))
    .sort();
};

before(async () => {
  const pool = await getPool();
  await cleanup(pool);
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='feature_flags'");
  originalFlags = rows[0]?.value ?? null;
  await setMultiBranch(pool, true);

  ids.ts = Date.now();
  ids.a = (await pool.query(`INSERT INTO branches (name,is_active) VALUES ($1,true) RETURNING id`, [`IVB-A-${ids.ts}`])).rows[0].id;
  ids.b = (await pool.query(`INSERT INTO branches (name,is_active) VALUES ($1,true) RETURNING id`, [`IVB-B-${ids.ts}`])).rows[0].id;
  const mk = (branchId, n) =>
    pool.query(
      `INSERT INTO sales (invoice_number, branch_id, subtotal, total, payment_type, status)
       VALUES ($1, $2, 10, 10, 'cash', 'completed')`,
      [`INVSCOPE-${n}-${ids.ts}`, branchId]
    );
  await mk(ids.a, 'a');
  await mk(ids.b, 'b');
  await mk(null, 'null'); // legacy un-tagged invoice
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
  await cleanup(pool);
  await closeDatabase().catch(() => {});
});

// ── List scoping ─────────────────────────────────────────────────────────────

test('single-branch user sees only their branch invoices', async () => {
  assert.deepEqual(await tagsFor(cashierA()), ['INVSCOPE-a']);
});

test('multi-branch user sees BOTH assigned branches', async () => {
  assert.deepEqual(await tagsFor(multiAB()), ['INVSCOPE-a', 'INVSCOPE-b']);
});

test('multi-branch user can FILTER to one of their branches', async () => {
  assert.deepEqual(await tagsFor(multiAB(), { branchId: ids.b }), ['INVSCOPE-b']);
});

test('multi-branch user CANNOT widen to a foreign branch via the filter', async () => {
  // Requesting a branch they don't own falls back to their full set, never wider.
  assert.deepEqual(await tagsFor(multiAB(), { branchId: 999999 }), ['INVSCOPE-a', 'INVSCOPE-b']);
});

test('user with NO branch sees nothing', async () => {
  assert.deepEqual(await tagsFor(noBranch()), []);
});

test('super admin sees every invoice including the legacy null-branch one', async () => {
  assert.deepEqual(await tagsFor(admin()), ['INVSCOPE-a', 'INVSCOPE-b', 'INVSCOPE-null']);
});

// ── Direct-by-id access (no bypass) ──────────────────────────────────────────

test('branch user is blocked from a foreign / null-branch invoice; allowed on their own', async () => {
  await assert.doesNotReject(() => enforceInvoiceBranchScope(cashierA(), ids.a));
  await assert.rejects(() => enforceInvoiceBranchScope(cashierA(), ids.b), /غير مصرح به/);
  await assert.rejects(() => enforceInvoiceBranchScope(cashierA(), null), /غير مصرح به/);
});

test('multi-branch user is allowed on both, blocked on a foreign branch', async () => {
  await assert.doesNotReject(() => enforceInvoiceBranchScope(multiAB(), ids.a));
  await assert.doesNotReject(() => enforceInvoiceBranchScope(multiAB(), ids.b));
  await assert.rejects(() => enforceInvoiceBranchScope(multiAB(), 999999), /غير مصرح به/);
});

test('super admin is never blocked', async () => {
  await assert.doesNotReject(() => enforceInvoiceBranchScope(admin(), ids.b));
  await assert.doesNotReject(() => enforceInvoiceBranchScope(admin(), null));
});

// ── Feature flag OFF → scoping is a no-op ─────────────────────────────────────

test('with multiBranch OFF, a branch user sees all invoices (single-branch shop)', async () => {
  const pool = await getPool();
  await setMultiBranch(pool, false);
  try {
    assert.equal(await invoiceBranchScope(cashierA()), null);
    assert.deepEqual(await tagsFor(cashierA()), ['INVSCOPE-a', 'INVSCOPE-b', 'INVSCOPE-null']);
    await assert.doesNotReject(() => enforceInvoiceBranchScope(cashierA(), ids.b));
  } finally {
    await setMultiBranch(pool, true);
  }
});
