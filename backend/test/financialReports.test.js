import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import coaTemplateService from '../src/services/gl/coaTemplateService.js';
import treasuryService from '../src/services/treasuryService.js';
import voucherService from '../src/services/voucherService.js';
import expensesService from '../src/services/expensesService.js';
import financialReportService from '../src/services/financialReportService.js';

/**
 * Financial statements (التقارير المالية) over a controlled GL fixture.
 *
 * The dev DB is shared, so other suites leave posted GL rows behind. To assert
 * EXACT totals we isolate the fixture to a DEDICATED BRANCH and scope every
 * report query to it (`branchId`), since journal entries are branch-stamped.
 *
 * Fixture (IQD, base currency), all on the test branch: a receipt voucher of
 * 50,000 (other income) and an expense of 20,000, against one cashbox.
 *   → revenue 50,000 ; expense 20,000 ; net profit 30,000
 *   → assets (cash) 30,000 = equity 30,000 (virtual retained earnings)
 */

const original = {};
let user;
let boxId;
let branchId;
let cashAccountId;

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
  await d(`DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'fin-test%'))`);
  await d(`DELETE FROM journal_entries WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'fin-test%')`);
  await d(`DELETE FROM vouchers WHERE description LIKE 'FIN-test%' OR cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'FIN-test%')`);
  await d(`DELETE FROM expenses WHERE note LIKE 'FIN-test%'`);
  await d(`DELETE FROM cashboxes WHERE name LIKE 'FIN-test%'`);
  await d(`DELETE FROM branches WHERE name LIKE 'FIN-test%'`);
  await d(`DELETE FROM users WHERE username LIKE 'fin-test%'`);
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
    JSON.stringify({ ...flags, treasury: true, generalLedger: true, financialReports: true, accountingPeriods: false })
  );

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'Fin Test', 'admin', true) RETURNING id`,
    [`fin-test-${Date.now()}`]
  );
  user = { id: u.rows[0].id, role: 'admin', username: 'fin-test' };

  const b = await pool.query(
    `INSERT INTO branches (name, is_active) VALUES ($1, true) RETURNING id`,
    [`FIN-test-branch-${Date.now()}`]
  );
  branchId = b.rows[0].id;

  await coaTemplateService.seed('simple_tree', user.id);
  const box = await treasuryService.createCashbox({ name: 'FIN-test-box', branchId }, user);
  boxId = box.id;

  // Income 50,000 + expense 20,000, both stamped to the test branch.
  await voucherService.create(
    { voucherType: 'receipt', amount: 50000, currency: 'IQD', cashboxId: boxId, branchId, description: 'FIN-test income' },
    user
  );
  await expensesService.create(
    { category: 'misc', amount: 20000, currency: 'IQD', note: 'FIN-test expense', cashboxId: boxId, branchId },
    user
  );

  // The cash side resolves to the box's GL account, else cash_default.
  const { rows: boxRows } = await pool.query('SELECT gl_account_id FROM cashboxes WHERE id = $1', [boxId]);
  cashAccountId = boxRows[0]?.gl_account_id;
  if (!cashAccountId) {
    const { rows } = await pool.query(
      `SELECT account_id FROM system_accounts WHERE key = 'cash_default'`
    );
    cashAccountId = rows[0]?.account_id;
  }
});

after(async () => {
  const pool = await getPool();
  await cleanup(pool);
  for (const key of ['feature_flags', 'app_mode']) await writeSetting(pool, key, original[key]);
  await closeDatabase().catch(() => {});
});

test('trial balance (branch-scoped) is balanced', async () => {
  const tb = await financialReportService.getTrialBalance({ branchId }, user);
  assert.equal(tb.totals.balanced, true, 'debits == credits');
  assert.equal(tb.totals.debit, tb.totals.credit, 'columns equal');
  assert.ok(tb.totals.debit >= 50000, 'includes the income movement');
});

test('income statement: revenue 50,000 − expenses 20,000 = net profit 30,000', async () => {
  const is = await financialReportService.getIncomeStatement({ branchId }, user);
  assert.equal(is.totals.revenue, 50000);
  assert.equal(is.totals.expenses, 20000);
  assert.equal(is.totals.netProfit, 30000);
});

test('balance sheet balances: assets == liabilities + equity', async () => {
  const bs = await financialReportService.getBalanceSheet({ branchId }, user);
  assert.equal(bs.totals.balanced, true, 'A = L + E');
  assert.equal(bs.totals.equity, 30000, 'current-period profit in equity');
  assert.equal(bs.totals.assets, 30000, 'net cash 30,000');
});

test('general ledger for the cash account shows both movements + running balance', async () => {
  assert.ok(cashAccountId, 'cash account resolved');
  const led = await financialReportService.getAccountLedger({ accountId: cashAccountId, branchId }, user);
  assert.equal(led.lines.length, 2, 'income + expense lines');
  assert.equal(led.totals.closing, 30000, 'net cash 30,000');
});
