import { getDb, getPool } from '../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../models/index.js';
import {
  cashboxes,
  bankAccounts,
  vouchers,
  treasuryTransfers,
  branches,
  users,
} from '../models/index.js';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { branchFilterFor, enforceBranchScope, isGlobalAdmin } from './scopeService.js';
import accountingPeriodService from './accountingPeriodService.js';
import featureFlagsService from './featureFlagsService.js';
import glPostingService from './gl/glPostingService.js';
import { allocateDocumentNumber } from './documentSequenceService.js';
import {
  ensureDefaultBranch,
  ensureDefaultCashbox,
} from './systemDefaultsService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

function n(v) {
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

async function withTransaction(callback) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txDb = drizzle(client, { schema });
    const result = await callback(txDb);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Treasury (الخزينة): cashboxes + bank accounts + transfers + balances.
 *
 * Balance model — a cashbox balance per currency is COMPUTED, never stored:
 *   opening_balances_json[currency]
 *   + Σ active receipt vouchers   (سند قبض)
 *   − Σ active payment vouchers   (سند صرف)
 *   + Σ active transfers in − Σ active transfers out
 * Legacy payments (pre-treasury, cashbox_id NULL) never affect balances.
 * Bank accounts are single-currency and follow the same formula.
 */
export class TreasuryService {
  // ── Cashboxes ─────────────────────────────────────────────────────────────

  async listCashboxes(filters = {}, actingUser = null) {
    const db = await getDb();
    const conds = [];
    if (filters.includeInactive !== true) conds.push(eq(cashboxes.isActive, true));

    const allowed = branchFilterFor(actingUser);
    if (allowed === null) {
      if (filters.branchId) conds.push(eq(cashboxes.branchId, Number(filters.branchId)));
    } else if (allowed.length === 0) {
      return [];
    } else {
      conds.push(eq(cashboxes.branchId, Number(allowed[0])));
    }

    const rows = await db
      .select({
        id: cashboxes.id,
        name: cashboxes.name,
        branchId: cashboxes.branchId,
        branchName: branches.name,
        isDefault: cashboxes.isDefault,
        openingBalancesJson: cashboxes.openingBalancesJson,
        notes: cashboxes.notes,
        isActive: cashboxes.isActive,
        createdAt: cashboxes.createdAt,
      })
      .from(cashboxes)
      .leftJoin(branches, eq(cashboxes.branchId, branches.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(cashboxes.id));

    const withBalances = [];
    for (const row of rows) {
      withBalances.push({ ...row, balances: await this.getCashboxBalances(row) });
    }
    return withBalances;
  }

  async getCashboxById(id, actingUser = null) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(cashboxes)
      .where(eq(cashboxes.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Cashbox');
    enforceBranchScope(actingUser, row.branchId);
    return { ...row, balances: await this.getCashboxBalances(row) };
  }

  /**
   * Per-currency balances for one cashbox. Accepts the row (to reuse its
   * opening balances) and aggregates vouchers + transfers in two queries.
   */
  async getCashboxBalances(cashboxRow) {
    const db = await getDb();
    const id = Number(cashboxRow.id);
    const balances = {};

    const opening = cashboxRow.openingBalancesJson || {};
    for (const [cur, amount] of Object.entries(opening)) {
      balances[cur] = n(amount);
    }

    const voucherSums = await db
      .select({
        currency: vouchers.currency,
        total: sql`COALESCE(SUM(CASE WHEN ${vouchers.voucherType} = 'receipt' THEN ${vouchers.amount}::numeric ELSE -${vouchers.amount}::numeric END), 0)`,
      })
      .from(vouchers)
      .where(and(eq(vouchers.cashboxId, id), eq(vouchers.status, 'active')))
      .groupBy(vouchers.currency);
    for (const r of voucherSums) {
      balances[r.currency] = (balances[r.currency] || 0) + n(r.total);
    }

    // Transfers out (in the source currency).
    const outSums = await db
      .select({
        currency: treasuryTransfers.currency,
        total: sql`COALESCE(SUM(${treasuryTransfers.amount}::numeric), 0)`,
      })
      .from(treasuryTransfers)
      .where(and(eq(treasuryTransfers.fromCashboxId, id), eq(treasuryTransfers.status, 'active')))
      .groupBy(treasuryTransfers.currency);
    for (const r of outSums) {
      balances[r.currency] = (balances[r.currency] || 0) - n(r.total);
    }

    // Transfers in (in the destination currency — to_currency/to_amount when
    // the transfer crossed currencies, else the source currency/amount).
    const inSums = await db
      .select({
        currency: sql`COALESCE(${treasuryTransfers.toCurrency}, ${treasuryTransfers.currency})`,
        total: sql`COALESCE(SUM(COALESCE(${treasuryTransfers.toAmount}, ${treasuryTransfers.amount})::numeric), 0)`,
      })
      .from(treasuryTransfers)
      .where(and(eq(treasuryTransfers.toCashboxId, id), eq(treasuryTransfers.status, 'active')))
      .groupBy(sql`COALESCE(${treasuryTransfers.toCurrency}, ${treasuryTransfers.currency})`);
    for (const r of inSums) {
      balances[r.currency] = (balances[r.currency] || 0) + n(r.total);
    }

    return balances;
  }

  async createCashbox(input, user) {
    const name = String(input.name || '').trim();
    if (!name) throw new ValidationError('اسم الصندوق مطلوب');

    let branchId;
    if (isGlobalAdmin(user)) {
      branchId = input.branchId ? Number(input.branchId) : await ensureDefaultBranch();
    } else {
      branchId = user?.assignedBranchId || (await ensureDefaultBranch());
    }

    const opening = {};
    if (input.openingBalances && typeof input.openingBalances === 'object') {
      for (const [cur, amount] of Object.entries(input.openingBalances)) {
        const a = Number(amount);
        if (Number.isFinite(a) && a !== 0) opening[String(cur).toUpperCase()] = String(a);
      }
    }

    return await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(cashboxes)
        .values({
          name,
          branchId,
          isDefault: false,
          openingBalancesJson: Object.keys(opening).length ? opening : null,
          notes: input.notes || null,
          isActive: true,
          createdBy: user?.id || null,
        })
        .returning();
      return row;
    });
  }

  async updateCashbox(id, input, user) {
    const existing = await this.getCashboxById(id, user);
    const patch = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new ValidationError('اسم الصندوق مطلوب');
      patch.name = name;
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.openingBalances !== undefined) {
      const opening = {};
      for (const [cur, amount] of Object.entries(input.openingBalances || {})) {
        const a = Number(amount);
        if (Number.isFinite(a) && a !== 0) opening[String(cur).toUpperCase()] = String(a);
      }
      patch.openingBalancesJson = Object.keys(opening).length ? opening : null;
    }
    if (input.isActive !== undefined) {
      if (input.isActive === false && existing.isDefault) {
        throw new ValidationError('لا يمكن تعطيل الصندوق الافتراضي — عيّن صندوقاً افتراضياً آخر أولاً');
      }
      patch.isActive = !!input.isActive;
    }

    const db = await getDb();
    const [row] = await db
      .update(cashboxes)
      .set(patch)
      .where(eq(cashboxes.id, Number(id)))
      .returning();
    return row;
  }

  /** Flip the default cashbox for the box's branch scope (one default each). */
  async setDefaultCashbox(id, user) {
    const target = await this.getCashboxById(id, user);
    if (!target.isActive) throw new ValidationError('لا يمكن جعل صندوق معطل افتراضياً');

    return await withTransaction(async (tx) => {
      const scopeFilter =
        target.branchId == null
          ? sql`${cashboxes.branchId} IS NULL`
          : eq(cashboxes.branchId, Number(target.branchId));
      await tx
        .update(cashboxes)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(cashboxes.isDefault, true), scopeFilter));
      const [row] = await tx
        .update(cashboxes)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(cashboxes.id, Number(id)))
        .returning();
      return row;
    });
  }

  /**
   * Resolve the cashbox a money operation should target:
   * explicit → branch default (created on demand).
   */
  async resolveEffectiveCashboxId({ cashboxId = null, branchId = null } = {}) {
    if (cashboxId) return Number(cashboxId);
    return ensureDefaultCashbox(null, branchId);
  }

  // ── Bank accounts ─────────────────────────────────────────────────────────

  async listBankAccounts(filters = {}, actingUser = null) {
    const db = await getDb();
    const conds = [];
    if (filters.includeInactive !== true) conds.push(eq(bankAccounts.isActive, true));

    const allowed = branchFilterFor(actingUser);
    if (allowed === null) {
      if (filters.branchId) conds.push(eq(bankAccounts.branchId, Number(filters.branchId)));
    } else if (allowed.length === 0) {
      return [];
    } else {
      conds.push(eq(bankAccounts.branchId, Number(allowed[0])));
    }

    const rows = await db
      .select()
      .from(bankAccounts)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(bankAccounts.id));

    const result = [];
    for (const row of rows) {
      result.push({ ...row, balance: await this.getBankAccountBalance(row) });
    }
    return result;
  }

  async getBankAccountById(id, actingUser = null) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Bank account');
    enforceBranchScope(actingUser, row.branchId);
    return { ...row, balance: await this.getBankAccountBalance(row) };
  }

  /** Single-currency balance: opening + vouchers ± transfers. */
  async getBankAccountBalance(bankRow) {
    const db = await getDb();
    const id = Number(bankRow.id);
    let balance = n(bankRow.openingBalance);

    const [voucherSum] = await db
      .select({
        total: sql`COALESCE(SUM(CASE WHEN ${vouchers.voucherType} = 'receipt' THEN ${vouchers.amount}::numeric ELSE -${vouchers.amount}::numeric END), 0)`,
      })
      .from(vouchers)
      .where(and(eq(vouchers.bankAccountId, id), eq(vouchers.status, 'active')));
    balance += n(voucherSum?.total);

    const [outSum] = await db
      .select({ total: sql`COALESCE(SUM(${treasuryTransfers.amount}::numeric), 0)` })
      .from(treasuryTransfers)
      .where(
        and(eq(treasuryTransfers.fromBankAccountId, id), eq(treasuryTransfers.status, 'active'))
      );
    balance -= n(outSum?.total);

    const [inSum] = await db
      .select({
        total: sql`COALESCE(SUM(COALESCE(${treasuryTransfers.toAmount}, ${treasuryTransfers.amount})::numeric), 0)`,
      })
      .from(treasuryTransfers)
      .where(
        and(eq(treasuryTransfers.toBankAccountId, id), eq(treasuryTransfers.status, 'active'))
      );
    balance += n(inSum?.total);

    return balance;
  }

  async createBankAccount(input, user) {
    await featureFlagsService.requireFeature('bankAccounts');
    const name = String(input.name || '').trim();
    if (!name) throw new ValidationError('اسم الحساب المصرفي مطلوب');

    let branchId;
    if (isGlobalAdmin(user)) {
      branchId = input.branchId ? Number(input.branchId) : await ensureDefaultBranch();
    } else {
      branchId = user?.assignedBranchId || (await ensureDefaultBranch());
    }

    const db = await getDb();
    const [row] = await db
      .insert(bankAccounts)
      .values({
        name,
        bankName: input.bankName || null,
        accountNumber: input.accountNumber || null,
        iban: input.iban || null,
        currency: input.currency || 'IQD',
        openingBalance: String(Number(input.openingBalance) || 0),
        branchId,
        notes: input.notes || null,
        isActive: true,
        createdBy: user?.id || null,
      })
      .returning();
    return row;
  }

  async updateBankAccount(id, input, user) {
    await this.getBankAccountById(id, user); // scope + existence
    const patch = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new ValidationError('اسم الحساب المصرفي مطلوب');
      patch.name = name;
    }
    if (input.bankName !== undefined) patch.bankName = input.bankName;
    if (input.accountNumber !== undefined) patch.accountNumber = input.accountNumber;
    if (input.iban !== undefined) patch.iban = input.iban;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.openingBalance !== undefined) {
      patch.openingBalance = String(Number(input.openingBalance) || 0);
    }
    if (input.isActive !== undefined) patch.isActive = !!input.isActive;

    const db = await getDb();
    const [row] = await db
      .update(bankAccounts)
      .set(patch)
      .where(eq(bankAccounts.id, Number(id)))
      .returning();
    return row;
  }

  // ── Transfers ─────────────────────────────────────────────────────────────

  /**
   * Move money between treasury containers. Exactly one source and one
   * destination (cashbox or bank each). Cross-currency moves require toAmount
   * (the amount received) and record the rate used.
   */
  async createTransfer(input, user) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('مبلغ التحويل يجب أن يكون أكبر من صفر');
    }

    const fromCashboxId = input.fromCashboxId ? Number(input.fromCashboxId) : null;
    const fromBankAccountId = input.fromBankAccountId ? Number(input.fromBankAccountId) : null;
    const toCashboxId = input.toCashboxId ? Number(input.toCashboxId) : null;
    const toBankAccountId = input.toBankAccountId ? Number(input.toBankAccountId) : null;

    if ((fromCashboxId ? 1 : 0) + (fromBankAccountId ? 1 : 0) !== 1) {
      throw new ValidationError('حدد مصدراً واحداً للتحويل (صندوق أو حساب مصرفي)');
    }
    if ((toCashboxId ? 1 : 0) + (toBankAccountId ? 1 : 0) !== 1) {
      throw new ValidationError('حدد وجهة واحدة للتحويل (صندوق أو حساب مصرفي)');
    }
    if (fromCashboxId && toCashboxId && fromCashboxId === toCashboxId) {
      throw new ValidationError('لا يمكن التحويل من الصندوق إلى نفسه');
    }
    if (fromBankAccountId && toBankAccountId && fromBankAccountId === toBankAccountId) {
      throw new ValidationError('لا يمكن التحويل من الحساب إلى نفسه');
    }
    if (fromBankAccountId || toBankAccountId) {
      await featureFlagsService.requireFeature('bankAccounts');
    }

    const currency = String(input.currency || 'IQD').toUpperCase();
    const toCurrency = input.toCurrency ? String(input.toCurrency).toUpperCase() : null;
    let toAmount = input.toAmount != null ? Number(input.toAmount) : null;
    if (toCurrency && toCurrency !== currency) {
      if (!Number.isFinite(toAmount) || toAmount <= 0) {
        throw new ValidationError('حدد المبلغ المستلم بعملة الوجهة للتحويل بين العملات');
      }
    } else {
      toAmount = null;
    }

    // Scope checks + load (throws NotFound / scope errors).
    const source = fromCashboxId
      ? await this.getCashboxById(fromCashboxId, user)
      : await this.getBankAccountById(fromBankAccountId, user);
    if (toCashboxId) await this.getCashboxById(toCashboxId, user);
    else await this.getBankAccountById(toBankAccountId, user);

    // Bank accounts are single-currency — enforce coherent currencies.
    if (fromBankAccountId && source.currency !== currency) {
      throw new ValidationError(`عملة الحساب المصدر ${source.currency} لا تطابق عملة التحويل`);
    }

    const branchId = source.branchId || (await ensureDefaultBranch());
    const accountingPeriodId = await accountingPeriodService.resolvePeriodIdForWrite(
      user,
      branchId,
      { require: true, message: 'لا يمكن تنفيذ التحويل — لا يوجد قيد محاسبي مفتوح' }
    );

    const transferDate =
      input.transferDate && /^\d{4}-\d{2}-\d{2}$/.test(input.transferDate)
        ? input.transferDate
        : new Date().toISOString().slice(0, 10);

    return await withTransaction(async (tx) => {
      const { number } = await allocateDocumentNumber(tx, {
        docType: 'treasury_transfer',
        branchId,
      });
      const [row] = await tx
        .insert(treasuryTransfers)
        .values({
          transferNumber: number,
          fromCashboxId,
          fromBankAccountId,
          toCashboxId,
          toBankAccountId,
          amount: String(amount),
          currency,
          toAmount: toAmount != null ? String(toAmount) : null,
          toCurrency: toAmount != null ? toCurrency : null,
          exchangeRate: String(Number(input.exchangeRate) || 1),
          branchId,
          accountingPeriodId,
          notes: input.notes || null,
          transferDate,
          createdBy: user?.id || null,
        })
        .returning();

      // GL: post the transfer entry (cross-currency FX diff plugged).
      await glPostingService.postDocument(tx, {
        sourceType: 'treasury_transfer',
        sourceId: row.id,
        user,
      });

      return row;
    });
  }

  async cancelTransfer(id, reason, user) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(treasuryTransfers)
      .where(eq(treasuryTransfers.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Treasury transfer');
    enforceBranchScope(user, row.branchId);
    if (row.status === 'cancelled') {
      throw new ValidationError('التحويل ملغى مسبقاً');
    }
    await accountingPeriodService.assertWritable(row.accountingPeriodId || null);

    return await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(treasuryTransfers)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: user?.id || null,
          cancelReason: reason || null,
        })
        .where(eq(treasuryTransfers.id, Number(id)))
        .returning();

      // GL: mirror the cancellation in the ledger.
      await glPostingService.reverseEntry(tx, {
        sourceType: 'treasury_transfer',
        sourceId: Number(id),
        user,
        reason: reason || 'إلغاء التحويل',
      });

      return updated;
    });
  }

  async listTransfers(filters = {}, actingUser = null) {
    const db = await getDb();
    const { page = 1, limit = 25 } = filters;
    const conds = [];
    if (filters.status) conds.push(eq(treasuryTransfers.status, String(filters.status)));
    if (filters.dateFrom) conds.push(gte(treasuryTransfers.transferDate, filters.dateFrom));
    if (filters.dateTo) conds.push(lte(treasuryTransfers.transferDate, filters.dateTo));

    const allowed = branchFilterFor(actingUser);
    if (allowed === null) {
      if (filters.branchId) conds.push(eq(treasuryTransfers.branchId, Number(filters.branchId)));
    } else if (allowed.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    } else {
      conds.push(eq(treasuryTransfers.branchId, Number(allowed[0])));
    }

    const where = conds.length ? and(...conds) : undefined;
    const [countRow] = await db
      .select({ count: sql`COUNT(*)` })
      .from(treasuryTransfers)
      .where(where);
    const total = Number(countRow?.count || 0);

    const fromBox = sql`(SELECT name FROM cashboxes WHERE id = ${treasuryTransfers.fromCashboxId})`;
    const toBox = sql`(SELECT name FROM cashboxes WHERE id = ${treasuryTransfers.toCashboxId})`;
    const fromBank = sql`(SELECT name FROM bank_accounts WHERE id = ${treasuryTransfers.fromBankAccountId})`;
    const toBank = sql`(SELECT name FROM bank_accounts WHERE id = ${treasuryTransfers.toBankAccountId})`;

    const rows = await db
      .select({
        id: treasuryTransfers.id,
        transferNumber: treasuryTransfers.transferNumber,
        fromCashboxId: treasuryTransfers.fromCashboxId,
        fromBankAccountId: treasuryTransfers.fromBankAccountId,
        toCashboxId: treasuryTransfers.toCashboxId,
        toBankAccountId: treasuryTransfers.toBankAccountId,
        fromName: sql`COALESCE(${fromBox}, ${fromBank})`,
        toName: sql`COALESCE(${toBox}, ${toBank})`,
        amount: treasuryTransfers.amount,
        currency: treasuryTransfers.currency,
        toAmount: treasuryTransfers.toAmount,
        toCurrency: treasuryTransfers.toCurrency,
        status: treasuryTransfers.status,
        notes: treasuryTransfers.notes,
        transferDate: treasuryTransfers.transferDate,
        createdAt: treasuryTransfers.createdAt,
        createdByName: users.fullName,
      })
      .from(treasuryTransfers)
      .leftJoin(users, eq(treasuryTransfers.createdBy, users.id))
      .where(where)
      .orderBy(desc(treasuryTransfers.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows.map((r) => ({
        ...r,
        amount: n(r.amount),
        toAmount: r.toAmount != null ? n(r.toAmount) : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Cashbox ledger (كشف حركة الصندوق) ─────────────────────────────────────

  /**
   * Chronological movement list for one cashbox: vouchers (in/out) +
   * transfers (in/out), oldest first, with a per-currency running balance
   * seeded from the opening balances.
   */
  async getCashboxLedger(cashboxId, filters = {}, actingUser = null) {
    const box = await this.getCashboxById(cashboxId, actingUser);
    const db = await getDb();
    const id = Number(cashboxId);

    const entries = [];

    const voucherConds = [eq(vouchers.cashboxId, id), eq(vouchers.status, 'active')];
    if (filters.dateFrom) voucherConds.push(gte(vouchers.voucherDate, filters.dateFrom));
    if (filters.dateTo) voucherConds.push(lte(vouchers.voucherDate, filters.dateTo));
    const vRows = await db
      .select({
        id: vouchers.id,
        number: vouchers.voucherNumber,
        type: vouchers.voucherType,
        sourceType: vouchers.sourceType,
        amount: vouchers.amount,
        currency: vouchers.currency,
        description: vouchers.description,
        category: vouchers.category,
        date: vouchers.voucherDate,
        createdAt: vouchers.createdAt,
      })
      .from(vouchers)
      .where(and(...voucherConds));
    for (const v of vRows) {
      entries.push({
        kind: 'voucher',
        id: v.id,
        number: v.number,
        direction: v.type === 'receipt' ? 'in' : 'out',
        sourceType: v.sourceType,
        amount: n(v.amount),
        currency: v.currency,
        description: v.description || v.category || null,
        date: v.date,
        createdAt: v.createdAt,
      });
    }

    const outConds = [eq(treasuryTransfers.fromCashboxId, id), eq(treasuryTransfers.status, 'active')];
    const inConds = [eq(treasuryTransfers.toCashboxId, id), eq(treasuryTransfers.status, 'active')];
    if (filters.dateFrom) {
      outConds.push(gte(treasuryTransfers.transferDate, filters.dateFrom));
      inConds.push(gte(treasuryTransfers.transferDate, filters.dateFrom));
    }
    if (filters.dateTo) {
      outConds.push(lte(treasuryTransfers.transferDate, filters.dateTo));
      inConds.push(lte(treasuryTransfers.transferDate, filters.dateTo));
    }
    const tOut = await db.select().from(treasuryTransfers).where(and(...outConds));
    for (const t of tOut) {
      entries.push({
        kind: 'transfer',
        id: t.id,
        number: t.transferNumber,
        direction: 'out',
        sourceType: 'treasury_transfer',
        amount: n(t.amount),
        currency: t.currency,
        description: t.notes || null,
        date: t.transferDate,
        createdAt: t.createdAt,
      });
    }
    const tIn = await db.select().from(treasuryTransfers).where(and(...inConds));
    for (const t of tIn) {
      entries.push({
        kind: 'transfer',
        id: t.id,
        number: t.transferNumber,
        direction: 'in',
        sourceType: 'treasury_transfer',
        amount: t.toAmount != null ? n(t.toAmount) : n(t.amount),
        currency: t.toCurrency || t.currency,
        description: t.notes || null,
        date: t.transferDate,
        createdAt: t.createdAt,
      });
    }

    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    // Running balance per currency, seeded from the opening balances. When a
    // date filter hides earlier rows the running balance is relative to the
    // filtered window (the header still shows the true current balances).
    const running = {};
    for (const [cur, amount] of Object.entries(box.openingBalancesJson || {})) {
      running[cur] = n(amount);
    }
    for (const e of entries) {
      running[e.currency] = (running[e.currency] || 0) + (e.direction === 'in' ? e.amount : -e.amount);
      e.runningBalance = running[e.currency];
    }

    return {
      cashbox: { id: box.id, name: box.name, branchId: box.branchId, isDefault: box.isDefault },
      balances: box.balances,
      entries,
    };
  }
}

export default new TreasuryService();
