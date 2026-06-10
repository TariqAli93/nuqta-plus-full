import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import coaTemplateService from '../src/services/gl/coaTemplateService.js';
import systemAccountsService from '../src/services/gl/systemAccountsService.js';
import journalService from '../src/services/gl/journalService.js';
import glPostingService from '../src/services/gl/glPostingService.js';
import treasuryService from '../src/services/treasuryService.js';
import voucherService from '../src/services/voucherService.js';
import expensesService from '../src/services/expensesService.js';
import supplierService from '../src/services/supplierService.js';
import purchaseService from '../src/services/purchaseService.js';

/**
 * GL posting engine (محرك الترحيل) suite.
 *
 * Covers: COA template idempotent seeding + key resolution; auto entries for
 * expenses, standalone vouchers, purchases (uniform AP model), supplier
 * payments, transfers; balance validation; the failure valve (broken mapping
 * → document commits + pending failure → repost succeeds); manual entries
 * (validation + reversal immutability); double-post backstop.
 */

const original = {};
let user;
let boxId;
const ids = { cashboxIds: [], supplierIds: [], productIds: [], invoiceIds: [] };

async function readSetting(pool, key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function writeSetting(pool, key, value) {
  if (value === null) await pool.query('DELETE FROM settings WHERE key = $1', [key]);
  else {
    await pool.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, $2, 'test')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

async function cleanupPriorTestData(pool) {
  const tryDel = async (text, params) => { try { await pool.query(text, params); } catch { /* ignore */ } };
  await tryDel(`DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE description LIKE '%GLX-test%' OR created_by IN (SELECT id FROM users WHERE username LIKE 'glx-test%'))`);
  await tryDel(`DELETE FROM journal_entries WHERE description LIKE '%GLX-test%' OR created_by IN (SELECT id FROM users WHERE username LIKE 'glx-test%')`);
  await tryDel(`DELETE FROM gl_posting_failures WHERE status = 'pending'`);
  await tryDel(`DELETE FROM vouchers WHERE description LIKE '%GLX-test%' OR cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'GLX-test%')`);
  await tryDel(`DELETE FROM expenses WHERE note LIKE 'GLX-test%'`);
  await tryDel(`DELETE FROM purchase_return_items WHERE return_id IN (SELECT id FROM purchase_returns WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'GLX-test%'))`);
  await tryDel(`DELETE FROM purchase_returns WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'GLX-test%')`);
  await tryDel(`DELETE FROM purchase_items WHERE purchase_invoice_id IN (SELECT id FROM purchase_invoices WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'GLX-test%'))`);
  await tryDel(`DELETE FROM purchase_invoices WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'GLX-test%')`);
  await tryDel(`DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'GLX-test%')`);
  await tryDel(`DELETE FROM product_stock_entries WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'GLX-test%')`);
  await tryDel(`DELETE FROM product_stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'GLX-test%')`);
  await tryDel(`DELETE FROM products WHERE name LIKE 'GLX-test%'`);
  await tryDel(`DELETE FROM suppliers WHERE name LIKE 'GLX-test%'`);
  await tryDel(`DELETE FROM treasury_transfers WHERE from_cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'GLX-test%') OR to_cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'GLX-test%')`);
  await tryDel(`DELETE FROM cashboxes WHERE name LIKE 'GLX-test%'`);
  await tryDel(`DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'glx-test%')`);
  await tryDel(`DELETE FROM users WHERE username LIKE 'glx-test%'`);
}

/** Sum debit/credit per system key for one entry — assertion helper. */
async function entryLines(pool, entryId) {
  const { rows } = await pool.query(
    `SELECT l.*, a.code AS account_code FROM journal_entry_lines l
     JOIN accounts a ON a.id = l.account_id
     WHERE l.journal_entry_id = $1 ORDER BY l.line_no`,
    [entryId]
  );
  return rows;
}

async function entryForSource(pool, sourceType, sourceId, status = 'posted') {
  const { rows } = await pool.query(
    `SELECT * FROM journal_entries WHERE source_type = $1 AND source_id = $2 AND status = $3`,
    [sourceType, sourceId, status]
  );
  return rows[0] || null;
}

function sumDebit(lines) {
  return lines.reduce((a, l) => a + Number(l.debit_base), 0);
}
function sumCredit(lines) {
  return lines.reduce((a, l) => a + Number(l.credit_base), 0);
}

before(async () => {
  const pool = await getPool();
  await cleanupPriorTestData(pool);
  for (const key of ['feature_flags', 'app_mode', 'coa_template']) {
    original[key] = await readSetting(pool, key);
  }

  const flags = JSON.parse(original.feature_flags || '{}');
  await writeSetting(pool, 'app_mode', 'full');
  await writeSetting(
    pool,
    'feature_flags',
    JSON.stringify({
      ...flags,
      treasury: true,
      suppliers: true,
      purchases: true,
      generalLedger: true,
      manualJournal: true,
      accountingPeriods: false,
    })
  );

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'GL Test', 'admin', true) RETURNING id`,
    [`glx-test-${Date.now()}`]
  );
  user = { id: u.rows[0].id, role: 'admin', username: 'glx-test' };

  await coaTemplateService.seed('simple_tree', user.id);

  const box = await treasuryService.createCashbox(
    { name: 'GLX-test-box', openingBalances: { IQD: 1000000 } },
    user
  );
  boxId = box.id;
  ids.cashboxIds.push(box.id);
});

after(async () => {
  const pool = await getPool();
  await cleanupPriorTestData(pool);
  for (const key of ['feature_flags', 'app_mode', 'coa_template']) {
    await writeSetting(pool, key, original[key]);
  }
  await closeDatabase().catch(() => {});
});

test('COA template seeds idempotently and all system keys resolve', async () => {
  const first = await coaTemplateService.seed('simple_tree', user.id);
  assert.equal(first.created, 0, 're-seed creates nothing new');

  const pool = await getPool();
  for (const key of [
    'cash_default', 'bank_default', 'accounts_receivable', 'inventory',
    'accounts_payable', 'sales_revenue', 'sales_returns', 'cogs',
    'expenses_default', 'other_income', 'other_expenses', 'capital',
    'retained_earnings', 'opening_balance_equity', 'currency_exchange_diff',
    'cash_short_over', 'sales_discount', 'installment_interest_income',
  ]) {
    const accountId = await systemAccountsService.resolve(null, key);
    assert.ok(accountId > 0, `${key} resolves`);
  }
});

test('expense posts Dr expense-category / Cr cashbox', async () => {
  const expense = await expensesService.create(
    { category: 'rent', amount: 50000, currency: 'IQD', note: 'GLX-test rent', cashboxId: boxId },
    user
  );
  const pool = await getPool();
  const entry = await entryForSource(pool, 'expense', expense.id);
  assert.ok(entry, 'entry posted');
  const lines = await entryLines(pool, entry.id);
  assert.equal(lines.length, 2);
  const rentLine = lines.find((l) => Number(l.debit) > 0);
  assert.equal(rentLine.account_code, '5301', 'rent hits the rent account (expense_cat:rent)');
  assert.equal(Number(rentLine.debit), 50000);
  assert.equal(sumDebit(lines).toFixed(2), sumCredit(lines).toFixed(2), 'balanced');

  // Delete reverses: original flips to reversed + a reversal entry exists.
  await expensesService.delete(expense.id, user);
  const reversed = await entryForSource(pool, 'expense', expense.id, 'reversed');
  assert.ok(reversed, 'original entry reversed on delete');
});

test('standalone voucher posts and cancel reverses', async () => {
  const v = await voucherService.create(
    {
      voucherType: 'receipt',
      amount: 30000,
      currency: 'IQD',
      cashboxId: boxId,
      description: 'GLX-test other income',
    },
    user
  );
  const pool = await getPool();
  const entry = await entryForSource(pool, 'voucher', v.id);
  assert.ok(entry, 'voucher entry posted');
  const lines = await entryLines(pool, entry.id);
  const creditLine = lines.find((l) => Number(l.credit) > 0);
  assert.equal(creditLine.account_code, '44', 'credit hits other_income');

  await voucherService.cancel(v.id, 'GLX-test', user);
  const reversed = await entryForSource(pool, 'voucher', v.id, 'reversed');
  assert.ok(reversed, 'cancel reversed the entry');
});

test('purchase: Dr inventory / Cr AP full total; payment voucher settles AP', async () => {
  const pool = await getPool();
  const supplier = await supplierService.create({ name: 'GLX-test-supplier' }, user);
  ids.supplierIds.push(supplier.id);
  const { rows: prod } = await pool.query(
    `INSERT INTO products (name, cost_price, selling_price, currency, product_type, stock, is_active)
     VALUES ('GLX-test-product', 10, 15, 'IQD', 'inventory', 0, true) RETURNING id`
  );
  const productId = prod[0].id;
  ids.productIds.push(productId);

  // Cash purchase 10 × 1000 = 10000 paid from the box.
  const invoice = await purchaseService.create(
    {
      supplierId: supplier.id,
      items: [{ productId, quantity: 10, unitCost: 1000 }],
      currency: 'IQD',
      paymentType: 'cash',
      cashboxId: boxId,
    },
    user
  );
  ids.invoiceIds.push(invoice.id);

  const purchaseEntry = await entryForSource(pool, 'purchase', invoice.id);
  assert.ok(purchaseEntry, 'purchase entry posted');
  const pLines = await entryLines(pool, purchaseEntry.id);
  const invLine = pLines.find((l) => l.account_code === '1104');
  const apLine = pLines.find((l) => l.account_code === '2101');
  assert.equal(Number(invLine.debit), 10000, 'inventory debited full total');
  assert.equal(Number(apLine.credit), 10000, 'AP credited full total (uniform model)');
  assert.equal(apLine.party_type, 'supplier');

  // The at-receipt voucher posted Dr AP / Cr cashbox.
  const { rows: vRows } = await pool.query(
    `SELECT id FROM vouchers WHERE purchase_invoice_id = $1 AND source_type = 'purchase_payment' AND status = 'active'`,
    [invoice.id]
  );
  assert.equal(vRows.length, 1);
  const vEntry = await entryForSource(pool, 'voucher', vRows[0].id);
  assert.ok(vEntry, 'at-receipt payment voucher posted');
  const vLines = await entryLines(pool, vEntry.id);
  const apDebit = vLines.find((l) => l.account_code === '2101');
  assert.equal(Number(apDebit.debit), 10000, 'voucher debits AP — net AP = 0');

  // Net AP across both entries = 0 for this supplier.
  const { rows: apNet } = await pool.query(
    `SELECT COALESCE(SUM(l.credit_base::numeric - l.debit_base::numeric), 0) AS net
     FROM journal_entry_lines l
     JOIN journal_entries e ON e.id = l.journal_entry_id
     WHERE e.status = 'posted' AND l.party_type = 'supplier' AND l.party_id = $1`,
    [supplier.id]
  );
  assert.equal(Number(apNet[0].net), 0, 'supplier AP nets to zero after full payment');
});

test('treasury transfer posts; cancel reverses', async () => {
  const b = await treasuryService.createCashbox({ name: 'GLX-test-box-2' }, user);
  ids.cashboxIds.push(b.id);
  const t = await treasuryService.createTransfer(
    { fromCashboxId: boxId, toCashboxId: b.id, amount: 20000, currency: 'IQD' },
    user
  );
  const pool = await getPool();
  const entry = await entryForSource(pool, 'treasury_transfer', t.id);
  assert.ok(entry, 'transfer entry posted');
  const lines = await entryLines(pool, entry.id);
  assert.equal(sumDebit(lines).toFixed(2), sumCredit(lines).toFixed(2));

  await treasuryService.cancelTransfer(t.id, 'GLX-test', user);
  assert.ok(await entryForSource(pool, 'treasury_transfer', t.id, 'reversed'));
});

test('failure valve: broken mapping → document commits + pending failure → repost succeeds', async () => {
  const pool = await getPool();
  // Break the mapping the expense rule needs.
  const { rows: saved } = await pool.query(
    `SELECT key, account_id FROM system_accounts WHERE key IN ('expenses_default', 'expense_cat:supplies')`
  );
  await pool.query(`DELETE FROM system_accounts WHERE key IN ('expenses_default', 'expense_cat:supplies')`);

  let expense;
  try {
    expense = await expensesService.create(
      { category: 'supplies', amount: 9000, currency: 'IQD', note: 'GLX-test valve', cashboxId: boxId },
      user
    );
    assert.ok(expense.id, 'expense committed despite the posting defect');

    const entry = await entryForSource(pool, 'expense', expense.id);
    assert.equal(entry, null, 'no entry posted');

    const { rows: failures } = await pool.query(
      `SELECT * FROM gl_posting_failures WHERE source_type = 'expense' AND source_id = $1 AND status = 'pending'`,
      [expense.id]
    );
    assert.equal(failures.length, 1, 'failure recorded');
  } finally {
    // Restore the mappings.
    for (const row of saved) {
      await pool.query(
        `INSERT INTO system_accounts (key, account_id) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET account_id = EXCLUDED.account_id`,
        [row.key, row.account_id]
      );
    }
  }

  // Repair: repost succeeds now that the mapping is back.
  const { rows: failures } = await pool.query(
    `SELECT id FROM gl_posting_failures WHERE source_type = 'expense' AND source_id = $1 AND status = 'pending'`,
    [expense.id]
  );
  const entry = await glPostingService.repostFailed(failures[0].id, user);
  assert.ok(entry, 'repost produced the entry');
  const { rows: resolved } = await pool.query(
    `SELECT status FROM gl_posting_failures WHERE id = $1`,
    [failures[0].id]
  );
  assert.equal(resolved[0].status, 'resolved');

  await expensesService.delete(expense.id, user);
});

test('manual entry: validation throws to the user; reversal is immutable-style', async () => {
  const pool = await getPool();
  const cash = await systemAccountsService.resolve(null, 'cash_default');
  const income = await systemAccountsService.resolve(null, 'other_income');

  // Unbalanced → throws (manual entries don't use the valve).
  await assert.rejects(
    journalService.createManual(
      {
        description: 'GLX-test unbalanced',
        lines: [
          { accountId: cash, debit: 1000, credit: 0 },
          { accountId: income, debit: 0, credit: 900 },
        ],
      },
      user
    ),
    /غير متوازن/
  );

  // Non-postable (root) account → throws.
  const { rows: root } = await pool.query(`SELECT id FROM accounts WHERE code = '4'`);
  await assert.rejects(
    journalService.createManual(
      {
        description: 'GLX-test non-postable',
        lines: [
          { accountId: cash, debit: 1000, credit: 0 },
          { accountId: root[0].id, debit: 0, credit: 1000 },
        ],
      },
      user
    ),
    /الورقية/
  );

  // Valid entry posts; reverse flips status + posts a mirrored entry.
  const entry = await journalService.createManual(
    {
      description: 'GLX-test manual ok',
      lines: [
        { accountId: cash, debit: 5000, credit: 0, currency: 'IQD' },
        { accountId: income, debit: 0, credit: 5000, currency: 'IQD' },
      ],
    },
    user
  );
  assert.equal(entry.totalDebitBase, entry.totalCreditBase);

  const reversal = await journalService.reverseManual(entry.id, 'GLX-test', user);
  assert.equal(reversal.sourceType, 'reversal');
  const { rows: orig } = await pool.query(`SELECT status FROM journal_entries WHERE id = $1`, [entry.id]);
  assert.equal(orig[0].status, 'reversed');
  await assert.rejects(journalService.reverseManual(entry.id, 'again', user), /مسبقاً/);
});

test('double-post backstop: unique index blocks a second posted entry per source', async () => {
  const pool = await getPool();
  const expense = await expensesService.create(
    { category: 'transport', amount: 1000, currency: 'IQD', note: 'GLX-test dup', cashboxId: boxId },
    user
  );
  const entry = await entryForSource(pool, 'expense', expense.id);
  assert.ok(entry);

  // A direct second insert for the same source must violate the partial index.
  await assert.rejects(
    pool.query(
      `INSERT INTO journal_entries (entry_number, entry_date, source_type, source_id, status)
       VALUES ('GLX-DUP-1', CURRENT_DATE, 'expense', $1, 'posted')`,
      [expense.id]
    ),
    /duplicate key|unique/i
  );
  await expensesService.delete(expense.id, user);
});

test('GL flag OFF → no posting at all', async () => {
  const pool = await getPool();
  const flags = JSON.parse((await readSetting(pool, 'feature_flags')) || '{}');
  await writeSetting(pool, 'feature_flags', JSON.stringify({ ...flags, generalLedger: false }));
  try {
    const expense = await expensesService.create(
      { category: 'other', amount: 500, currency: 'IQD', note: 'GLX-test off', cashboxId: boxId },
      user
    );
    const entry = await entryForSource(pool, 'expense', expense.id);
    assert.equal(entry, null, 'no entry while flag off');
    await expensesService.delete(expense.id, user);
  } finally {
    await writeSetting(pool, 'feature_flags', JSON.stringify({ ...flags, generalLedger: true }));
  }
});
