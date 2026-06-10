import { getDb, getPool } from '../../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../models/index.js';
import {
  journalEntries,
  journalEntryLines,
  accounts,
  users,
  branches,
} from '../../models/index.js';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import featureFlagsService from '../featureFlagsService.js';
import accountingPeriodService from '../accountingPeriodService.js';
import glPostingService from './glPostingService.js';
import { branchFilterFor, isGlobalAdmin } from '../scopeService.js';
import { ensureDefaultBranch } from '../systemDefaultsService.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const n = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);

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
 * Journal entries: listing/details for ALL entries + the manual-entry path
 * (قيد يدوي — full mode). Unlike auto posting, manual entries THROW on any
 * validation problem (the entry IS the user's document).
 */
export class JournalService {
  /**
   * Create a manual journal entry.
   * lines[]: {accountId, debit, credit, currency?, exchangeRate?, description?}
   */
  async createManual(input, user) {
    await featureFlagsService.requireFeature('generalLedger');
    await featureFlagsService.requireFeature('manualJournal');

    if (!Array.isArray(input.lines) || input.lines.length < 2) {
      throw new ValidationError('القيد اليدوي يحتاج سطرين على الأقل');
    }

    let branchId;
    if (isGlobalAdmin(user)) {
      branchId = input.branchId ? Number(input.branchId) : await ensureDefaultBranch();
    } else {
      branchId = user?.assignedBranchId || (await ensureDefaultBranch());
    }

    const entryDate =
      input.entryDate && /^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)
        ? input.entryDate
        : new Date().toISOString().slice(0, 10);

    // Period stamping + window validation when the periods feature is on.
    const accountingPeriodId = await accountingPeriodService.resolvePeriodIdForWrite(
      user,
      branchId,
      { require: true, message: 'لا يمكن إنشاء قيد يدوي — لا يوجد قيد محاسبي مفتوح' }
    );
    if (accountingPeriodId) {
      const period = await accountingPeriodService.getActiveAccountingPeriod({ branchId });
      if (period?.openedAt) {
        const openedDate = new Date(period.openedAt).toISOString().slice(0, 10);
        if (entryDate < openedDate) {
          const err = new ValidationError(
            'تاريخ القيد يسبق فترة القيد المحاسبي المفتوح — لا يمكن الترحيل بأثر رجعي'
          );
          err.code = 'ENTRY_DATE_OUTSIDE_PERIOD';
          err.statusCode = 422;
          throw err;
        }
      }
    }

    // Postable-leaf validation for every referenced account.
    const db = await getDb();
    for (const line of input.lines) {
      const [acc] = await db
        .select({ id: accounts.id, isPostable: accounts.isPostable, isActive: accounts.isActive })
        .from(accounts)
        .where(eq(accounts.id, Number(line.accountId)))
        .limit(1);
      if (!acc) throw new ValidationError(`الحساب ${line.accountId} غير موجود`);
      if (!acc.isPostable || acc.isActive === false) {
        throw new ValidationError('يمكن الترحيل فقط على الحسابات الورقية النشطة');
      }
    }

    return await withTransaction(async (tx) => {
      const entry = await glPostingService.insertValidatedEntry(tx, {
        entryDate,
        branchId,
        accountingPeriodId,
        sourceType: 'manual',
        sourceId: null,
        description: input.description || 'قيد يدوي',
        userId: user?.id || null,
        lines: input.lines.map((l) => ({
          accountId: Number(l.accountId),
          debit: n(l.debit),
          credit: n(l.credit),
          currency: l.currency || undefined,
          exchangeRate: l.exchangeRate || undefined,
          description: l.description || null,
        })),
      });
      return this.getById(entry.id, user, tx);
    });
  }

  /** Reverse a posted MANUAL entry (corrections). */
  async reverseManual(entryId, reason, user) {
    await featureFlagsService.requireFeature('manualJournal');
    const db = await getDb();
    const [entry] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, Number(entryId)))
      .limit(1);
    if (!entry) throw new NotFoundError('Journal entry');
    if (entry.sourceType !== 'manual') {
      throw new ValidationError('القيود التلقائية تُعكس بإلغاء مستندها الأصلي');
    }
    if (entry.status !== 'posted') throw new ValidationError('القيد معكوس مسبقاً');
    await accountingPeriodService.assertWritable(entry.accountingPeriodId || null);

    return await withTransaction(async (tx) => {
      const lines = await tx
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, entry.id));
      const reversal = await glPostingService.insertValidatedEntry(tx, {
        entryDate: new Date().toISOString().slice(0, 10),
        branchId: entry.branchId,
        accountingPeriodId: entry.accountingPeriodId,
        sourceType: 'reversal',
        sourceId: entry.id,
        description: `قيد عكسي للقيد ${entry.entryNumber}${reason ? ` — ${reason}` : ''}`,
        reversalOfEntryId: entry.id,
        userId: user?.id || null,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: n(l.credit),
          credit: n(l.debit),
          currency: l.currency,
          exchangeRate: n(l.exchangeRate),
          partyType: l.partyType,
          partyId: l.partyId,
          description: l.description,
        })),
      });
      await tx
        .update(journalEntries)
        .set({ status: 'reversed', reversedByEntryId: reversal.id })
        .where(eq(journalEntries.id, entry.id));
      return reversal;
    });
  }

  async getAll(filters = {}, actingUser = null) {
    const db = await getDb();
    const { page = 1, limit = 25 } = filters;
    const conds = [];
    if (filters.sourceType) conds.push(eq(journalEntries.sourceType, String(filters.sourceType)));
    if (filters.status) conds.push(eq(journalEntries.status, String(filters.status)));
    if (filters.dateFrom) conds.push(gte(journalEntries.entryDate, filters.dateFrom));
    if (filters.dateTo) conds.push(lte(journalEntries.entryDate, filters.dateTo));
    if (filters.accountId) {
      conds.push(
        sql`${journalEntries.id} IN (SELECT journal_entry_id FROM journal_entry_lines WHERE account_id = ${Number(filters.accountId)})`
      );
    }

    const allowed = branchFilterFor(actingUser);
    if (allowed === null) {
      if (filters.branchId) conds.push(eq(journalEntries.branchId, Number(filters.branchId)));
    } else if (allowed.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    } else {
      conds.push(eq(journalEntries.branchId, Number(allowed[0])));
    }

    const where = conds.length ? and(...conds) : undefined;
    const [countRow] = await db
      .select({ count: sql`COUNT(*)` })
      .from(journalEntries)
      .where(where);
    const total = Number(countRow?.count || 0);

    const rows = await db
      .select({
        id: journalEntries.id,
        entryNumber: journalEntries.entryNumber,
        entryDate: journalEntries.entryDate,
        branchId: journalEntries.branchId,
        branchName: branches.name,
        sourceType: journalEntries.sourceType,
        sourceId: journalEntries.sourceId,
        description: journalEntries.description,
        status: journalEntries.status,
        totalDebitBase: journalEntries.totalDebitBase,
        totalCreditBase: journalEntries.totalCreditBase,
        isOpening: journalEntries.isOpening,
        createdAt: journalEntries.createdAt,
        createdByName: users.fullName,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.createdBy, users.id))
      .leftJoin(branches, eq(journalEntries.branchId, branches.id))
      .where(where)
      .orderBy(desc(journalEntries.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows.map((r) => ({
        ...r,
        totalDebitBase: n(r.totalDebitBase),
        totalCreditBase: n(r.totalCreditBase),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id, actingUser = null, executor = null) {
    const db = executor || (await getDb());
    const [entry] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, Number(id)))
      .limit(1);
    if (!entry) throw new NotFoundError('Journal entry');

    const lines = await db
      .select({
        id: journalEntryLines.id,
        lineNo: journalEntryLines.lineNo,
        accountId: journalEntryLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
        currency: journalEntryLines.currency,
        exchangeRate: journalEntryLines.exchangeRate,
        debitBase: journalEntryLines.debitBase,
        creditBase: journalEntryLines.creditBase,
        partyType: journalEntryLines.partyType,
        partyId: journalEntryLines.partyId,
        description: journalEntryLines.description,
      })
      .from(journalEntryLines)
      .leftJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
      .where(eq(journalEntryLines.journalEntryId, entry.id))
      .orderBy(journalEntryLines.lineNo);

    return {
      ...entry,
      totalDebitBase: n(entry.totalDebitBase),
      totalCreditBase: n(entry.totalCreditBase),
      lines: lines.map((l) => ({
        ...l,
        debit: n(l.debit),
        credit: n(l.credit),
        debitBase: n(l.debitBase),
        creditBase: n(l.creditBase),
        exchangeRate: n(l.exchangeRate),
      })),
    };
  }
}

export default new JournalService();
