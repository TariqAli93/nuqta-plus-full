import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import coaTemplateService from '../src/services/gl/coaTemplateService.js';
import openingBalanceService from '../src/services/openingBalanceService.js';
import financialReportService from '../src/services/financialReportService.js';
import reportService from '../src/services/reportService.js';

/**
 * Opening balances (الأرصدة الافتتاحية).
 *
 * Verifies: a synthetic customer opening debt becomes AR without counting as
 * revenue; the single opening JE balances (Dr cash+inventory+AR / Cr AP, plug
 * equity); and a re-run is refused.
 *
 * Isolated to a dedicated branch + currency 'OPB' so revenue assertions and
 * the trial balance reflect only this fixture.
 */

const original = {};
let user;
let branchId;
let customerId;
let supplierId;

async function readSetting(pool, key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}
async function writeSetting(pool, key, value) {
  if (value === null) await pool.query('DELETE FROM settings WHERE key = $1', [key]);
  else
    await pool.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, $2, 'test')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
}

async function cleanup(pool) {
  const d = async (t, p) => { try { await pool.query(t, p); } catch { /* ignore */ } };
  await d(`DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'opb-test%'))`);
  await d(`DELETE FROM journal_entries WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'opb-test%')`);
  await d(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE invoice_number LIKE 'OPEN-%' AND customer_id IN (SELECT id FROM customers WHERE name LIKE 'OPB-test%'))`);
  await d(`DELETE FROM sales WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'OPB-test%')`);
  await d(`DELETE FROM purchase_invoices WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'OPB-test%')`);
  await d(`DELETE FROM customers WHERE name LIKE 'OPB-test%'`);
  await d(`DELETE FROM suppliers WHERE name LIKE 'OPB-test%'`);
  await d(`DELETE FROM branches WHERE name LIKE 'OPB-test%'`);
  await d(`DELETE FROM users WHERE username LIKE 'opb-test%'`);
}

before(async () => {
  const pool = await getPool();
  await cleanup(pool);
  for (const key of ['feature_flags', 'app_mode']) original[key] = await readSetting(pool, key);

  const flags = JSON.parse(original.feature_flags || '{}');
  await writeSetting(pool, 'app_mode', 'full');
  await writeSetting(
    pool,
    'feature_flags',
    JSON.stringify({ ...flags, suppliers: true, purchases: true, generalLedger: true, financialReports: true, accountingPeriods: false })
  );

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'OPB Test', 'admin', true) RETURNING id`,
    [`opb-test-${Date.now()}`]
  );
  user = { id: u.rows[0].id, role: 'admin', username: 'opb-test' };

  const b = await pool.query(`INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`, [`OPB-test-branch-${Date.now()}`]);
  branchId = b.rows[0].id;

  const c = await pool.query(`INSERT INTO customers (name, is_active) VALUES ($1, true) RETURNING id`, [`OPB-test-cust-${Date.now()}`]);
  customerId = c.rows[0].id;
  const s = await pool.query(`INSERT INTO suppliers (name, is_active) VALUES ($1, true) RETURNING id`, [`OPB-test-sup-${Date.now()}`]);
  supplierId = s.rows[0].id;

  await coaTemplateService.seed('simple_tree', user.id);
});

after(async () => {
  const pool = await getPool();
  await cleanup(pool);
  for (const key of ['feature_flags', 'app_mode']) await writeSetting(pool, key, original[key]);
  await closeDatabase().catch(() => {});
});

test('customer opening debt becomes AR but is NOT revenue', async () => {
  const sale = await openingBalanceService.createCustomerOpening(
    { customerId, amount: 100000, currency: 'OPB', branchId },
    user
  );
  assert.equal(sale.isOpeningBalance, true);
  assert.equal(Number(sale.remainingAmount), 100000);

  // Revenue report for the OPB currency must exclude the opening sale.
  const dash = await reportService.getDashboard({ currency: 'OPB', branchId }, user);
  const revenue = Number(dash?.kpisByCurrency?.OPB?.revenue || 0);
  assert.equal(revenue, 0, 'opening sale excluded from revenue');
});

test('opening journal entry balances (Dr cash+inventory+AR / Cr AP, plug equity)', async () => {
  await openingBalanceService.createSupplierOpening(
    { supplierId, amount: 40000, currency: 'OPB', branchId },
    user
  );

  const entry = await openingBalanceService.generateOpeningEntry(
    { cashAmount: 200000, inventoryAmount: 60000, branchId },
    user
  );
  assert.ok(entry?.id, 'entry posted');
  assert.equal(Number(entry.totalDebitBase), Number(entry.totalCreditBase), 'balanced');
  assert.equal(entry.isOpening, true);

  // Trial balance for the branch must be balanced after the opening entry.
  const tb = await financialReportService.getTrialBalance({ branchId }, user);
  assert.equal(tb.totals.balanced, true);
});

test('re-running the opening entry is refused', async () => {
  await assert.rejects(
    openingBalanceService.generateOpeningEntry({ cashAmount: 100, branchId }, user),
    (err) => {
      assert.match(err.message, /مسبقاً/);
      return true;
    }
  );
});
