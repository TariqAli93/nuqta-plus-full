import { getDb, getPool } from '../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../models/index.js';
import {
  vouchers,
  payments,
  cashSessions,
  customers,
  branches,
  users,
} from '../models/index.js';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { branchFilterFor, enforceBranchScope, isGlobalAdmin } from './scopeService.js';
import accountingPeriodService from './accountingPeriodService.js';
import featureFlagsService from './featureFlagsService.js';
import glPostingService from './gl/glPostingService.js';
import { allocateDocumentNumber } from './documentSequenceService.js';
import { ensureDefaultBranch, ensureDefaultCashbox } from './systemDefaultsService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

function n(v) {
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
 * Vouchers (سندات القبض والصرف).
 *
 * Two creation paths:
 *  - `create()` — standalone vouchers (sourceType 'manual'): other income via
 *    receipt, other outflow via payment. The ONLY user-facing direct create.
 *  - `mintFor*()` — system-minted vouchers attached to a payments/expenses/
 *    sale_returns row, called INSIDE the source document's transaction. The
 *    payments table stays the canonical AR row; the voucher is the treasury
 *    record (cashbox balances read vouchers only — nothing double-counts).
 *
 * Customer debt settlement intentionally has NO direct voucher path: the UI
 * calls the existing sale-payment endpoint and the payment pipeline mints the
 * voucher, so money always flows through one writer chain.
 */
export class VoucherService {
  // ── System minting (called inside source-document transactions) ───────────

  /**
   * Mint the treasury voucher for an AR payment row. No-op (returns null)
   * when the treasury flag is off, or when the payment is non-cash with no
   * explicit bank target (card/transfer money never enters a cashbox).
   *
   * @param {object} tx The source document's transaction handle.
   * @param {object} params
   *   payment: {id, amount, currency, exchangeRate, paymentMethod, cashSessionId}
   *   sale:    {id, branchId, customerId, invoiceNumber} (nullable fields ok)
   *   sourceType: 'sale_payment' | 'collections'
   *   cashboxId / bankAccountId: explicit overrides from the API payload.
   */
  async mintForPayment(tx, { payment, sale, user, sourceType = 'sale_payment', cashboxId = null, bankAccountId = null }) {
    if (!(await featureFlagsService.isFeatureEnabled('treasury'))) return null;

    const method = payment.paymentMethod || 'cash';
    const isCash = method === 'cash';
    if (!isCash && !bankAccountId) return null;

    const branchId = sale?.branchId || (await ensureDefaultBranch(tx));
    const target = await this.#resolveTarget(tx, {
      isCash,
      cashboxId,
      bankAccountId,
      cashSessionId: payment.cashSessionId || null,
      branchId,
      userId: user?.id || null,
    });

    const accountingPeriodId = await accountingPeriodService.resolvePeriodIdForWrite(
      user,
      branchId,
      { require: false }
    );

    const { number } = await allocateDocumentNumber(tx, {
      docType: 'voucher_receipt',
      branchId,
    });

    const [voucher] = await tx
      .insert(vouchers)
      .values({
        voucherNumber: number,
        voucherType: 'receipt',
        branchId,
        accountingPeriodId,
        cashSessionId: payment.cashSessionId || null,
        partyType: sale?.customerId ? 'customer' : 'other',
        customerId: sale?.customerId || null,
        saleId: sale?.id || null,
        paymentId: payment.id,
        cashboxId: target.cashboxId,
        bankAccountId: target.bankAccountId,
        method: target.method,
        amount: String(n(payment.amount)),
        currency: payment.currency || 'IQD',
        exchangeRate: String(n(payment.exchangeRate) || 1),
        description: sale?.invoiceNumber
          ? `قبض دفعة عن الفاتورة ${sale.invoiceNumber}`
          : 'قبض دفعة مبيعات',
        sourceType,
        voucherDate: today(),
        createdBy: user?.id || null,
      })
      .returning();

    await tx
      .update(payments)
      .set({
        voucherId: voucher.id,
        cashboxId: target.cashboxId,
        bankAccountId: target.bankAccountId,
      })
      .where(eq(payments.id, payment.id));

    return voucher;
  }

  /**
   * Mint the payment voucher (سند صرف) for an expense. No-op when treasury is
   * off or the expense targets a bank without the bankAccounts feature.
   * Returns the voucher so the caller can stamp expense.voucher_id.
   */
  async mintForExpense(tx, { expense, user, cashboxId = null, bankAccountId = null }) {
    if (!(await featureFlagsService.isFeatureEnabled('treasury'))) return null;

    const branchId = expense.branchId || (await ensureDefaultBranch(tx));
    const isCash = !bankAccountId;
    const target = await this.#resolveTarget(tx, {
      isCash,
      cashboxId,
      bankAccountId,
      cashSessionId: expense.cashSessionId || null,
      branchId,
    });

    const { number } = await allocateDocumentNumber(tx, {
      docType: 'voucher_payment',
      branchId,
    });

    const [voucher] = await tx
      .insert(vouchers)
      .values({
        voucherNumber: number,
        voucherType: 'payment',
        branchId,
        accountingPeriodId: expense.accountingPeriodId || null,
        cashSessionId: expense.cashSessionId || null,
        partyType: 'other',
        expenseId: expense.id,
        cashboxId: target.cashboxId,
        bankAccountId: target.bankAccountId,
        method: target.method,
        amount: String(n(expense.amount)),
        currency: expense.currency || 'IQD',
        category: expense.category || null,
        description: expense.note ? `مصروف: ${expense.note}` : `مصروف (${expense.category})`,
        sourceType: 'expense',
        voucherDate: expense.expenseDate || today(),
        createdBy: user?.id || null,
      })
      .returning();

    return voucher;
  }

  /**
   * Mint the payment voucher for a cash refund on a sale return. No-op when
   * treasury is off, the refund is zero, or the refund isn't cash.
   */
  async mintForRefund(tx, { saleReturn, sale, user }) {
    if (!(await featureFlagsService.isFeatureEnabled('treasury'))) return null;
    const refund = n(saleReturn.refundAmount);
    if (refund <= 0) return null;
    if (saleReturn.refundMethod && saleReturn.refundMethod !== 'cash') return null;

    const branchId = saleReturn.branchId || sale?.branchId || (await ensureDefaultBranch(tx));
    const target = await this.#resolveTarget(tx, {
      isCash: true,
      cashboxId: null,
      bankAccountId: null,
      cashSessionId: saleReturn.cashSessionId || null,
      branchId,
    });

    const { number } = await allocateDocumentNumber(tx, {
      docType: 'voucher_payment',
      branchId,
    });

    const [voucher] = await tx
      .insert(vouchers)
      .values({
        voucherNumber: number,
        voucherType: 'payment',
        branchId,
        accountingPeriodId: saleReturn.accountingPeriodId || null,
        cashSessionId: saleReturn.cashSessionId || null,
        partyType: saleReturn.customerId ? 'customer' : 'other',
        customerId: saleReturn.customerId || null,
        saleId: saleReturn.saleId || null,
        cashboxId: target.cashboxId,
        bankAccountId: null,
        method: 'cash',
        amount: String(refund),
        currency: saleReturn.currency || 'IQD',
        description: sale?.invoiceNumber
          ? `استرداد نقدي عن مرتجع الفاتورة ${sale.invoiceNumber}`
          : 'استرداد نقدي عن مرتجع مبيعات',
        sourceType: 'sale_refund',
        voucherDate: today(),
        createdBy: user?.id || null,
      })
      .returning();

    return voucher;
  }

  /**
   * Resolve the cashbox/bank a mint should hit:
   * explicit bank → explicit cashbox → the linked shift's cashbox → the
   * acting user's open shift's cashbox → branch default cashbox.
   */
  async #resolveTarget(tx, { isCash, cashboxId, bankAccountId, cashSessionId, branchId, userId = null }) {
    if (!isCash && bankAccountId) {
      return { method: 'bank', cashboxId: null, bankAccountId: Number(bankAccountId) };
    }
    if (cashboxId) {
      return { method: 'cash', cashboxId: Number(cashboxId), bankAccountId: null };
    }
    if (cashSessionId) {
      const [session] = await tx
        .select({ cashboxId: cashSessions.cashboxId })
        .from(cashSessions)
        .where(eq(cashSessions.id, Number(cashSessionId)))
        .limit(1);
      if (session?.cashboxId) {
        return { method: 'cash', cashboxId: Number(session.cashboxId), bankAccountId: null };
      }
    }
    if (userId) {
      // Debt payments aren't linked to a shift, but the collecting cashier's
      // drawer is where the cash lands — prefer their open shift's cashbox.
      const [open] = await tx
        .select({ cashboxId: cashSessions.cashboxId })
        .from(cashSessions)
        .where(and(eq(cashSessions.userId, Number(userId)), eq(cashSessions.status, 'open')))
        .limit(1);
      if (open?.cashboxId) {
        return { method: 'cash', cashboxId: Number(open.cashboxId), bankAccountId: null };
      }
    }
    const fallback = await ensureDefaultCashbox(tx, branchId);
    return { method: 'cash', cashboxId: fallback, bankAccountId: null };
  }

  // ── Standalone vouchers ───────────────────────────────────────────────────

  /**
   * Create a standalone voucher (sourceType 'manual'):
   *  - receipt  (قبض): other income into a cashbox/bank.
   *  - payment  (صرف): other outflow from a cashbox/bank.
   * Debt settlement is NOT handled here (see class docs).
   */
  async create(input, user) {
    await featureFlagsService.requireFeature('treasury');

    const voucherType = input.voucherType;
    if (voucherType !== 'receipt' && voucherType !== 'payment') {
      throw new ValidationError('نوع السند يجب أن يكون قبض (receipt) أو صرف (payment)');
    }
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('مبلغ السند يجب أن يكون أكبر من صفر');
    }

    const cashboxId = input.cashboxId ? Number(input.cashboxId) : null;
    const bankAccountId = input.bankAccountId ? Number(input.bankAccountId) : null;
    if ((cashboxId ? 1 : 0) + (bankAccountId ? 1 : 0) !== 1) {
      throw new ValidationError('حدد صندوقاً أو حساباً مصرفياً واحداً للسند');
    }
    if (bankAccountId) {
      await featureFlagsService.requireFeature('bankAccounts');
    }

    let branchId;
    if (isGlobalAdmin(user)) {
      branchId = input.branchId ? Number(input.branchId) : await ensureDefaultBranch();
    } else {
      branchId = user?.assignedBranchId || (await ensureDefaultBranch());
    }

    // Standalone vouchers are first-class financial documents: when the
    // accounting-periods feature is on they require an open period (same rule
    // as expenses). System-minted vouchers inherit their source's stamping.
    const accountingPeriodId = await accountingPeriodService.resolvePeriodIdForWrite(
      user,
      branchId,
      { require: true, message: 'لا يمكن إنشاء سند — لا يوجد قيد محاسبي مفتوح' }
    );

    const voucherDate =
      input.voucherDate && /^\d{4}-\d{2}-\d{2}$/.test(input.voucherDate)
        ? input.voucherDate
        : today();

    const customerId = input.customerId ? Number(input.customerId) : null;

    return await withTransaction(async (tx) => {
      const { number } = await allocateDocumentNumber(tx, {
        docType: voucherType === 'receipt' ? 'voucher_receipt' : 'voucher_payment',
        branchId,
      });
      const [row] = await tx
        .insert(vouchers)
        .values({
          voucherNumber: number,
          voucherType,
          branchId,
          accountingPeriodId,
          partyType: customerId ? 'customer' : 'other',
          customerId,
          cashboxId,
          bankAccountId,
          method: bankAccountId ? 'bank' : 'cash',
          amount: String(amount),
          currency: String(input.currency || 'IQD').toUpperCase(),
          exchangeRate: String(Number(input.exchangeRate) || 1),
          category: input.category || null,
          counterAccountId: input.counterAccountId ? Number(input.counterAccountId) : null,
          description: input.description || null,
          referenceNumber: input.referenceNumber || null,
          sourceType: 'manual',
          voucherDate,
          createdBy: user?.id || null,
        })
        .returning();

      // GL: standalone vouchers are canonical money documents — post them.
      await glPostingService.postDocument(tx, {
        sourceType: 'voucher',
        sourceId: row.id,
        user,
      });

      return { ...row, amount: n(row.amount) };
    });
  }

  /**
   * Cancel a MANUAL voucher (reverses its balance effect). System-minted
   * vouchers must be cancelled through their source document so the canonical
   * row and the treasury record never drift apart.
   */
  async cancel(id, reason, user) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Voucher');
    enforceBranchScope(user, row.branchId);
    if (row.status === 'cancelled') throw new ValidationError('السند ملغى مسبقاً');
    if (row.sourceType !== 'manual') {
      const err = new ValidationError(
        'هذا السند مرتبط بعملية (دفعة/مصروف/مرتجع) — ألغِ العملية الأصلية بدلاً من السند'
      );
      err.code = 'VOUCHER_HAS_SOURCE';
      err.statusCode = 422;
      throw err;
    }
    await accountingPeriodService.assertWritable(row.accountingPeriodId || null);

    return await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(vouchers)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: user?.id || null,
          cancelReason: reason || null,
        })
        .where(eq(vouchers.id, Number(id)))
        .returning();

      // GL: reverse the voucher's entry so the ledger mirrors the cancel.
      await glPostingService.reverseEntry(tx, {
        sourceType: 'voucher',
        sourceId: Number(id),
        user,
        reason: reason || 'إلغاء السند',
      });

      return updated;
    });
  }

  /**
   * Cancel the voucher minted for a source row (payment/expense), if any.
   * Called inside the source document's own cancellation transaction.
   */
  async cancelForSource(tx, { paymentId = null, expenseId = null, reason, userId }) {
    const conds = [eq(vouchers.status, 'active')];
    if (paymentId) conds.push(eq(vouchers.paymentId, Number(paymentId)));
    else if (expenseId) conds.push(eq(vouchers.expenseId, Number(expenseId)));
    else return null;

    const rows = await tx
      .update(vouchers)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId || null,
        cancelReason: reason || 'إلغاء العملية الأصلية',
      })
      .where(and(...conds))
      .returning({ id: vouchers.id });
    return rows.length;
  }

  // ── Listing ───────────────────────────────────────────────────────────────

  async getAll(filters = {}, actingUser = null) {
    const db = await getDb();
    const { page = 1, limit = 25 } = filters;
    const conds = [];
    if (filters.voucherType) conds.push(eq(vouchers.voucherType, String(filters.voucherType)));
    if (filters.status) conds.push(eq(vouchers.status, String(filters.status)));
    if (filters.sourceType) conds.push(eq(vouchers.sourceType, String(filters.sourceType)));
    if (filters.cashboxId) conds.push(eq(vouchers.cashboxId, Number(filters.cashboxId)));
    if (filters.bankAccountId) conds.push(eq(vouchers.bankAccountId, Number(filters.bankAccountId)));
    if (filters.customerId) conds.push(eq(vouchers.customerId, Number(filters.customerId)));
    if (filters.dateFrom) conds.push(gte(vouchers.voucherDate, filters.dateFrom));
    if (filters.dateTo) conds.push(lte(vouchers.voucherDate, filters.dateTo));
    if (filters.currency && filters.currency !== 'ALL') {
      conds.push(eq(vouchers.currency, String(filters.currency)));
    }

    const allowed = branchFilterFor(actingUser);
    if (allowed === null) {
      if (filters.branchId) conds.push(eq(vouchers.branchId, Number(filters.branchId)));
    } else if (allowed.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    } else {
      conds.push(eq(vouchers.branchId, Number(allowed[0])));
    }

    const where = conds.length ? and(...conds) : undefined;
    const [countRow] = await db
      .select({ count: sql`COUNT(*)` })
      .from(vouchers)
      .where(where);
    const total = Number(countRow?.count || 0);

    const rows = await db
      .select({
        id: vouchers.id,
        voucherNumber: vouchers.voucherNumber,
        voucherType: vouchers.voucherType,
        branchId: vouchers.branchId,
        partyType: vouchers.partyType,
        customerId: vouchers.customerId,
        customerName: customers.name,
        saleId: vouchers.saleId,
        paymentId: vouchers.paymentId,
        expenseId: vouchers.expenseId,
        cashboxId: vouchers.cashboxId,
        cashboxName: sql`(SELECT name FROM cashboxes WHERE id = ${vouchers.cashboxId})`,
        bankAccountId: vouchers.bankAccountId,
        bankAccountName: sql`(SELECT name FROM bank_accounts WHERE id = ${vouchers.bankAccountId})`,
        method: vouchers.method,
        amount: vouchers.amount,
        currency: vouchers.currency,
        category: vouchers.category,
        description: vouchers.description,
        referenceNumber: vouchers.referenceNumber,
        sourceType: vouchers.sourceType,
        status: vouchers.status,
        voucherDate: vouchers.voucherDate,
        createdAt: vouchers.createdAt,
        createdByName: users.fullName,
      })
      .from(vouchers)
      .leftJoin(customers, eq(vouchers.customerId, customers.id))
      .leftJoin(users, eq(vouchers.createdBy, users.id))
      .where(where)
      .orderBy(desc(vouchers.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows.map((r) => ({ ...r, amount: n(r.amount) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id, actingUser = null) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Voucher');
    enforceBranchScope(actingUser, row.branchId);
    return { ...row, amount: n(row.amount) };
  }
}

export default new VoucherService();
