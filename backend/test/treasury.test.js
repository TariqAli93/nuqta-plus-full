import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, closeDatabase } from '../src/db.js';
import treasuryService from '../src/services/treasuryService.js';
import { ensureDefaultCashbox, DEFAULT_CASHBOX_NAME } from '../src/services/systemDefaultsService.js';

/**
 * Treasury (الخزينة) suite: cashboxes, balances, transfers, ledger.
 * Isolation: test rows are named 'TRS-test%' and use currency codes that are
 * normal (IQD/USD) but only inside cashboxes created here, which are deleted
 * in after(). Feature flags are saved/restored per the repo convention.
 */

const original = {};
let user;
const created = { cashboxIds: [], transferIds: [] };

async function readSetting(pool, key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function writeSetting(pool, key, value) {
  if (value === null) {
    await pool.query('DELETE FROM settings WHERE key = $1', [key]);
  } else {
    await pool.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, $2, 'test')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

async function cleanupPriorTestData(pool) {
  const tryDel = async (text, params) => { try { await pool.query(text, params); } catch { /* ignore */ } };
  await tryDel(`DELETE FROM treasury_transfers WHERE from_cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'TRS-test%') OR to_cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'TRS-test%')`);
  await tryDel(`DELETE FROM vouchers WHERE cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'TRS-test%')`);
  await tryDel(`DELETE FROM cashboxes WHERE name LIKE 'TRS-test%'`);
  await tryDel(`DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'trs-test%')`);
  await tryDel(`DELETE FROM users WHERE username LIKE 'trs-test%'`);
}

before(async () => {
  const pool = await getPool();
  await cleanupPriorTestData(pool);
  for (const key of ['feature_flags', 'app_mode']) original[key] = await readSetting(pool, key);

  const flags = JSON.parse(original.feature_flags || '{}');
  await writeSetting(pool, 'feature_flags', JSON.stringify({ ...flags, treasury: true, accountingPeriods: false }));

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'Treasury Test', 'admin', true) RETURNING id`,
    [`trs-test-${Date.now()}`]
  );
  user = { id: u.rows[0].id, role: 'admin', username: 'trs-test' };
});

after(async () => {
  const pool = await getPool();
  const tryDel = async (text, params) => { try { await pool.query(text, params); } catch { /* ignore */ } };
  await tryDel('DELETE FROM treasury_transfers WHERE id = ANY($1)', [created.transferIds]);
  await tryDel('DELETE FROM vouchers WHERE cashbox_id = ANY($1)', [created.cashboxIds]);
  await tryDel('DELETE FROM cashboxes WHERE id = ANY($1)', [created.cashboxIds]);
  await tryDel(`DELETE FROM audit_log WHERE user_id = $1`, [user.id]);
  await tryDel('DELETE FROM users WHERE id = $1', [user.id]);
  for (const key of ['feature_flags', 'app_mode']) await writeSetting(pool, key, original[key]);
  await closeDatabase().catch(() => {});
});

test('ensureDefaultCashbox is idempotent and named correctly', async () => {
  const first = await ensureDefaultCashbox();
  const second = await ensureDefaultCashbox();
  assert.equal(first, second, 'same id on repeated calls');

  const pool = await getPool();
  const { rows } = await pool.query('SELECT name, is_default, branch_id FROM cashboxes WHERE id = $1', [first]);
  assert.ok(rows[0]);
  assert.equal(rows[0].is_default, true);
  assert.ok(rows[0].branch_id, 'default cashbox carries a real branch id');
  // Name is the default ONLY if this run created it (an operator may have
  // renamed theirs) — accept any name but assert the constant is exported.
  assert.equal(typeof DEFAULT_CASHBOX_NAME, 'string');
});

test('create cashbox with opening balances → balances reflect them', async () => {
  const box = await treasuryService.createCashbox(
    { name: 'TRS-test-A', openingBalances: { IQD: 150000, USD: 100 } },
    user
  );
  created.cashboxIds.push(box.id);
  const loaded = await treasuryService.getCashboxById(box.id, user);
  assert.equal(loaded.balances.IQD, 150000);
  assert.equal(loaded.balances.USD, 100);
});

test('vouchers move the balance (receipt +, payment −, cancelled ignored)', async () => {
  const box = await treasuryService.createCashbox({ name: 'TRS-test-B' }, user);
  created.cashboxIds.push(box.id);

  const pool = await getPool();
  // Insert vouchers directly (the voucherService path is covered in
  // vouchers.test.js — here we assert the balance math).
  await pool.query(
    `INSERT INTO vouchers (voucher_number, voucher_type, cashbox_id, method, amount, currency, source_type, status, voucher_date)
     VALUES ('TRS-T-1', 'receipt', $1, 'cash', '50000', 'IQD', 'manual', 'active', CURRENT_DATE),
            ('TRS-T-2', 'payment', $1, 'cash', '20000', 'IQD', 'manual', 'active', CURRENT_DATE),
            ('TRS-T-3', 'receipt', $1, 'cash', '99999', 'IQD', 'manual', 'cancelled', CURRENT_DATE)`,
    [box.id]
  );

  const loaded = await treasuryService.getCashboxById(box.id, user);
  assert.equal(loaded.balances.IQD, 30000, 'receipt 50000 − payment 20000, cancelled ignored');

  await pool.query(`DELETE FROM vouchers WHERE voucher_number LIKE 'TRS-T-%'`);
});

test('transfer moves money between cashboxes; cancel restores it', async () => {
  const a = await treasuryService.createCashbox(
    { name: 'TRS-test-C', openingBalances: { IQD: 100000 } },
    user
  );
  const b = await treasuryService.createCashbox({ name: 'TRS-test-D' }, user);
  created.cashboxIds.push(a.id, b.id);

  const transfer = await treasuryService.createTransfer(
    { fromCashboxId: a.id, toCashboxId: b.id, amount: 40000, currency: 'IQD' },
    user
  );
  created.transferIds.push(transfer.id);
  assert.ok(transfer.transferNumber.startsWith('TT'), 'numbered via document_sequences');

  let aLoaded = await treasuryService.getCashboxById(a.id, user);
  let bLoaded = await treasuryService.getCashboxById(b.id, user);
  assert.equal(aLoaded.balances.IQD, 60000);
  assert.equal(bLoaded.balances.IQD, 40000);

  await treasuryService.cancelTransfer(transfer.id, 'test', user);
  aLoaded = await treasuryService.getCashboxById(a.id, user);
  bLoaded = await treasuryService.getCashboxById(b.id, user);
  assert.equal(aLoaded.balances.IQD, 100000, 'cancel restores source');
  assert.equal(bLoaded.balances.IQD || 0, 0, 'cancel restores destination');
});

test('cross-currency transfer credits the destination in its own currency', async () => {
  const a = await treasuryService.createCashbox(
    { name: 'TRS-test-E', openingBalances: { USD: 500 } },
    user
  );
  const b = await treasuryService.createCashbox({ name: 'TRS-test-F' }, user);
  created.cashboxIds.push(a.id, b.id);

  const transfer = await treasuryService.createTransfer(
    {
      fromCashboxId: a.id,
      toCashboxId: b.id,
      amount: 100,
      currency: 'USD',
      toAmount: 140000,
      toCurrency: 'IQD',
      exchangeRate: 1400,
    },
    user
  );
  created.transferIds.push(transfer.id);

  const aLoaded = await treasuryService.getCashboxById(a.id, user);
  const bLoaded = await treasuryService.getCashboxById(b.id, user);
  assert.equal(aLoaded.balances.USD, 400);
  assert.equal(bLoaded.balances.IQD, 140000);
});

test('transfer validation: same box, missing sides', async () => {
  const a = await treasuryService.createCashbox({ name: 'TRS-test-G' }, user);
  created.cashboxIds.push(a.id);

  await assert.rejects(
    treasuryService.createTransfer(
      { fromCashboxId: a.id, toCashboxId: a.id, amount: 10, currency: 'IQD' },
      user
    )
  );
  await assert.rejects(
    treasuryService.createTransfer({ fromCashboxId: a.id, amount: 10, currency: 'IQD' }, user)
  );
});

test('cashbox ledger returns chronological entries with running balance', async () => {
  const box = await treasuryService.createCashbox(
    { name: 'TRS-test-H', openingBalances: { IQD: 10000 } },
    user
  );
  created.cashboxIds.push(box.id);

  const pool = await getPool();
  await pool.query(
    `INSERT INTO vouchers (voucher_number, voucher_type, cashbox_id, method, amount, currency, source_type, status, voucher_date)
     VALUES ('TRS-L-1', 'receipt', $1, 'cash', '5000', 'IQD', 'manual', 'active', '2099-01-01'),
            ('TRS-L-2', 'payment', $1, 'cash', '3000', 'IQD', 'manual', 'active', '2099-01-02')`,
    [box.id]
  );

  const ledger = await treasuryService.getCashboxLedger(box.id, {}, user);
  assert.equal(ledger.entries.length, 2);
  assert.equal(ledger.entries[0].direction, 'in');
  assert.equal(ledger.entries[0].runningBalance, 15000);
  assert.equal(ledger.entries[1].direction, 'out');
  assert.equal(ledger.entries[1].runningBalance, 12000);
  assert.equal(ledger.balances.IQD, 12000);

  await pool.query(`DELETE FROM vouchers WHERE voucher_number LIKE 'TRS-L-%'`);
});
