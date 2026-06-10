import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPool, getDb } from '../src/db.js';
import { closeDatabase } from '../src/db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/models/index.js';
import voucherService from '../src/services/voucherService.js';
import treasuryService from '../src/services/treasuryService.js';
import expensesService from '../src/services/expensesService.js';

/**
 * Vouchers (سندات القبض والصرف) suite:
 *  - standalone create/cancel and the balance effect
 *  - concurrent numbering uniqueness
 *  - system minting for payments (single writer chain — one payment row, one
 *    voucher, no double count) and for expenses (incl. cancel-on-delete)
 *  - minted vouchers can't be cancelled directly (VOUCHER_HAS_SOURCE)
 */

const original = {};
let user;
let boxId;
const created = { cashboxIds: [], voucherNumbers: [] };

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
  await tryDel(`DELETE FROM vouchers WHERE cashbox_id IN (SELECT id FROM cashboxes WHERE name LIKE 'VCH-test%')`);
  await tryDel(`DELETE FROM expenses WHERE note LIKE 'VCH-test%'`);
  await tryDel(`DELETE FROM payments WHERE notes LIKE 'VCH-test%'`);
  await tryDel(`DELETE FROM cashboxes WHERE name LIKE 'VCH-test%'`);
  await tryDel(`DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'vch-test%')`);
  await tryDel(`DELETE FROM users WHERE username LIKE 'vch-test%'`);
}

before(async () => {
  const pool = await getPool();
  await cleanupPriorTestData(pool);
  for (const key of ['feature_flags', 'app_mode']) original[key] = await readSetting(pool, key);

  const flags = JSON.parse(original.feature_flags || '{}');
  await writeSetting(
    pool,
    'feature_flags',
    JSON.stringify({ ...flags, treasury: true, accountingPeriods: false })
  );

  const u = await pool.query(
    `INSERT INTO users (username, password, full_name, role, is_active)
     VALUES ($1, 'x', 'Voucher Test', 'admin', true) RETURNING id`,
    [`vch-test-${Date.now()}`]
  );
  user = { id: u.rows[0].id, role: 'admin', username: 'vch-test' };

  const box = await treasuryService.createCashbox(
    { name: 'VCH-test-box', openingBalances: { IQD: 100000 } },
    user
  );
  boxId = box.id;
  created.cashboxIds.push(box.id);
});

after(async () => {
  const pool = await getPool();
  const tryDel = async (text, params) => { try { await pool.query(text, params); } catch { /* ignore */ } };
  await tryDel(`DELETE FROM vouchers WHERE cashbox_id = ANY($1)`, [created.cashboxIds]);
  await tryDel(`DELETE FROM expenses WHERE note LIKE 'VCH-test%'`);
  await tryDel(`DELETE FROM payments WHERE notes LIKE 'VCH-test%'`);
  await tryDel(`DELETE FROM cashboxes WHERE id = ANY($1)`, [created.cashboxIds]);
  await tryDel(`DELETE FROM audit_log WHERE user_id = $1`, [user.id]);
  await tryDel(`DELETE FROM users WHERE id = $1`, [user.id]);
  for (const key of ['feature_flags', 'app_mode']) await writeSetting(pool, key, original[key]);
  await closeDatabase().catch(() => {});
});

test('standalone receipt + payment vouchers move the cashbox balance', async () => {
  const receipt = await voucherService.create(
    {
      voucherType: 'receipt',
      amount: 25000,
      currency: 'IQD',
      cashboxId: boxId,
      category: 'إيراد آخر',
      description: 'VCH-test receipt',
    },
    user
  );
  assert.ok(receipt.voucherNumber.startsWith('RV'), 'receipt numbers use the RV prefix');

  const payment = await voucherService.create(
    {
      voucherType: 'payment',
      amount: 10000,
      currency: 'IQD',
      cashboxId: boxId,
      category: 'مصروف آخر',
      description: 'VCH-test payment',
    },
    user
  );
  assert.ok(payment.voucherNumber.startsWith('PV'), 'payment numbers use the PV prefix');

  const box = await treasuryService.getCashboxById(boxId, user);
  assert.equal(box.balances.IQD, 115000, '100000 + 25000 − 10000');
});

test('voucher numbering is unique under concurrency', async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      voucherService.create(
        {
          voucherType: 'receipt',
          amount: 1000,
          currency: 'IQD',
          cashboxId: boxId,
          description: `VCH-test concurrent ${i}`,
        },
        user
      )
    )
  );
  const numbers = results.map((r) => r.voucherNumber);
  assert.equal(new Set(numbers).size, numbers.length, 'no duplicate numbers');
  // Clean the balance effect for later assertions.
  for (const r of results) await voucherService.cancel(r.id, 'test cleanup', user);
});

test('cancelling a manual voucher reverses its balance effect', async () => {
  const before = (await treasuryService.getCashboxById(boxId, user)).balances.IQD || 0;
  const v = await voucherService.create(
    {
      voucherType: 'receipt',
      amount: 5000,
      currency: 'IQD',
      cashboxId: boxId,
      description: 'VCH-test cancel-me',
    },
    user
  );
  let mid = (await treasuryService.getCashboxById(boxId, user)).balances.IQD;
  assert.equal(mid, before + 5000);

  await voucherService.cancel(v.id, 'اختبار', user);
  const afterBal = (await treasuryService.getCashboxById(boxId, user)).balances.IQD;
  assert.equal(afterBal, before);
});

test('mintForPayment creates ONE voucher linked to the payment (no double count)', async () => {
  const pool = await getPool();
  const db = await getDb();

  // A bare payments row (saleId nullable) stands in for the AR pipeline.
  const { rows } = await pool.query(
    `INSERT INTO payments (amount, currency, exchange_rate, payment_method, notes, created_by)
     VALUES ('30000', 'IQD', '1', 'cash', 'VCH-test mint', $1) RETURNING id`,
    [user.id]
  );
  const paymentId = rows[0].id;

  const before = (await treasuryService.getCashboxById(boxId, user)).balances.IQD || 0;

  const pgPool = await getPool();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const tx = drizzle(client, { schema });
    const voucher = await voucherService.mintForPayment(tx, {
      payment: {
        id: paymentId,
        amount: 30000,
        currency: 'IQD',
        exchangeRate: 1,
        paymentMethod: 'cash',
        cashSessionId: null,
      },
      sale: { id: null, branchId: null, customerId: null, invoiceNumber: 'VCH-TEST-1' },
      user,
      sourceType: 'collections',
      cashboxId: boxId,
    });
    await client.query('COMMIT');

    assert.ok(voucher, 'voucher minted');
    created.voucherNumbers.push(voucher.voucherNumber);
    assert.equal(voucher.voucherType, 'receipt');
    assert.equal(voucher.paymentId, paymentId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Exactly one voucher for the payment; payment row carries the link back.
  const { rows: vRows } = await pool.query(
    `SELECT id FROM vouchers WHERE payment_id = $1 AND status = 'active'`,
    [paymentId]
  );
  assert.equal(vRows.length, 1);
  const { rows: pRows } = await pool.query(`SELECT voucher_id, cashbox_id FROM payments WHERE id = $1`, [paymentId]);
  assert.equal(pRows[0].voucher_id, vRows[0].id);
  assert.equal(Number(pRows[0].cashbox_id), boxId);

  const after = (await treasuryService.getCashboxById(boxId, user)).balances.IQD;
  assert.equal(after, before + 30000, 'balance reflects the voucher exactly once');

  await pool.query(`DELETE FROM vouchers WHERE payment_id = $1`, [paymentId]);
  await pool.query(`DELETE FROM payments WHERE id = $1`, [paymentId]);
});

test('minted vouchers cannot be cancelled directly (VOUCHER_HAS_SOURCE)', async () => {
  const pool = await getPool();
  const { rows } = await pool.query(
    `INSERT INTO vouchers (voucher_number, voucher_type, cashbox_id, method, amount, currency, source_type, status, voucher_date)
     VALUES ('VCH-SRC-1', 'receipt', $1, 'cash', '1000', 'IQD', 'sale_payment', 'active', CURRENT_DATE)
     RETURNING id`,
    [boxId]
  );
  await assert.rejects(
    voucherService.cancel(rows[0].id, 'test', user),
    (err) => err.code === 'VOUCHER_HAS_SOURCE'
  );
  await pool.query(`DELETE FROM vouchers WHERE id = $1`, [rows[0].id]);
});

test('expense create mints a payment voucher; expense delete cancels it', async () => {
  const before = (await treasuryService.getCashboxById(boxId, user)).balances.IQD || 0;

  const expense = await expensesService.create(
    {
      category: 'supplies',
      amount: 7000,
      currency: 'IQD',
      note: 'VCH-test expense',
      cashboxId: boxId,
    },
    user
  );
  assert.ok(expense.voucherId, 'expense stamped with its voucher');
  assert.equal(Number(expense.cashboxId), boxId);

  let bal = (await treasuryService.getCashboxById(boxId, user)).balances.IQD;
  assert.equal(bal, before - 7000, 'payment voucher reduces the cashbox');

  await expensesService.delete(expense.id, user);
  bal = (await treasuryService.getCashboxById(boxId, user)).balances.IQD;
  assert.equal(bal, before, 'deleting the expense cancels the voucher and restores the balance');
});

test('treasury OFF → expense minting is a no-op', async () => {
  const pool = await getPool();
  const flags = JSON.parse((await readSetting(pool, 'feature_flags')) || '{}');
  await writeSetting(pool, 'feature_flags', JSON.stringify({ ...flags, treasury: false }));

  try {
    const expense = await expensesService.create(
      { category: 'supplies', amount: 100, currency: 'IQD', note: 'VCH-test no-treasury' },
      user
    );
    assert.equal(expense.voucherId ?? null, null, 'no voucher minted while flag off');
    await expensesService.delete(expense.id, user);
  } finally {
    await writeSetting(pool, 'feature_flags', JSON.stringify({ ...flags, treasury: true }));
  }
});
