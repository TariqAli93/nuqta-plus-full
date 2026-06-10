import { getDb, getPool } from '../../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../models/index.js';
import {
  journalEntries,
  journalEntryLines,
  glPostingFailures,
  currencySettings,
} from '../../models/index.js';
import { and, eq } from 'drizzle-orm';
import featureFlagsService from '../featureFlagsService.js';
import { allocateDocumentNumber } from '../documentSequenceService.js';
import { ensureDefaultBranch } from '../systemDefaultsService.js';
import { RULE_BUILDERS } from './postingRules.js';
import { ValidationError } from '../../utils/errors.js';

const n = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);
const r4 = (v) => Math.round(v * 10000) / 10000;

/** Base-balance rounding tolerance routed to currency_exchange_diff. */
const BASE_ROUNDING_TOLERANCE = 0.5;

/**
 * GL posting engine (محرك الترحيل).
 *
 * postDocument() runs INSIDE the source document's transaction. Failure
 * isolation is structural:
 *   - any defect (unmapped account, unbalanced build, code bug) is caught,
 *     recorded in gl_posting_failures (trivial insert, same tx) and the
 *     DOCUMENT COMMITS — a posting bug never breaks a sale;
 *   - double-posting is impossible: partial unique index on
 *     (source_type, source_id) WHERE posted (migration 0008);
 *   - posted entries are immutable — corrections via reverseEntry().
 */
export class GlPostingService {
  async isEnabled() {
    return featureFlagsService.isFeatureEnabled('generalLedger');
  }

  /** The base currency code (IQD typical). Cached per process. */
  async getBaseCurrency(executor = null) {
    if (this._baseCurrency) return this._baseCurrency;
    const db = executor || (await getDb());
    const [row] = await db
      .select({ code: currencySettings.currencyCode })
      .from(currencySettings)
      .where(eq(currencySettings.isBaseCurrency, true))
      .limit(1);
    this._baseCurrency = row?.code || 'USD';
    return this._baseCurrency;
  }

  /** Invalidate the cached base currency (called by currency settings updates). */
  invalidateBaseCurrencyCache() {
    this._baseCurrency = null;
  }

  /**
   * Build + validate + insert the journal entry for a source document.
   * Returns the entry, or null (flag off / nothing to post / failure valve).
   */
  async postDocument(tx, { sourceType, sourceId, user = null }) {
    if (!(await this.isEnabled())) return null;
    const builder = RULE_BUILDERS[sourceType];
    if (!builder) return null;

    try {
      const draft = await builder(tx, Number(sourceId));
      if (!draft || !draft.lines || draft.lines.length === 0) return null;
      return await this.#insertEntry(tx, {
        ...draft,
        sourceType,
        sourceId: Number(sourceId),
        userId: user?.id || null,
      });
    } catch (err) {
      await this.#recordFailure(tx, { sourceType, sourceId, error: err });
      return null;
    }
  }

  /**
   * Insert a validated entry. Shared by postDocument and journalService
   * (manual entries — which DON'T swallow errors).
   */
  async #insertEntry(tx, draft) {
    const base = await this.getBaseCurrency(tx);

    // Compute base amounts + validate.
    const currencies = new Set();
    let totalDebitBase = 0;
    let totalCreditBase = 0;
    const perCurrency = {};
    const lines = draft.lines.map((line, i) => {
      const cur = line.currency || base;
      currencies.add(cur);
      const rate = cur === base ? 1 : n(line.exchangeRate) || 1;
      const debit = r4(n(line.debit));
      const credit = r4(n(line.credit));
      if (debit < 0 || credit < 0) {
        throw new ValidationError('لا يمكن أن يكون طرف القيد سالباً');
      }
      if (debit > 0 && credit > 0) {
        throw new ValidationError('سطر القيد لا يكون مديناً ودائناً معاً');
      }
      const debitBase = r4(debit * rate);
      const creditBase = r4(credit * rate);
      totalDebitBase += debitBase;
      totalCreditBase += creditBase;
      perCurrency[cur] = (perCurrency[cur] || 0) + debit - credit;
      return {
        lineNo: i + 1,
        accountId: line.accountId,
        branchId: draft.branchId || null,
        debit: String(debit),
        credit: String(credit),
        currency: cur,
        exchangeRate: String(rate),
        debitBase: String(debitBase),
        creditBase: String(creditBase),
        partyType: line.partyType || null,
        partyId: line.partyId || null,
        description: line.description || null,
      };
    });

    // Per-currency balance — required for single-currency entries. Multi-
    // currency entries (transfers/opening/manual FX) can't balance per
    // currency by definition; the base check below is their guarantee.
    if (currencies.size === 1) {
      const [only] = currencies;
      if (Math.abs(r4(perCurrency[only])) > 0.0001) {
        throw new ValidationError(
          `القيد غير متوازن بعملة ${only}: فرق ${r4(perCurrency[only])}`
        );
      }
    }

    // Base balance with a small FX-rounding plug.
    let baseDiff = r4(totalDebitBase - totalCreditBase);
    if (Math.abs(baseDiff) > BASE_ROUNDING_TOLERANCE) {
      throw new ValidationError(`القيد غير متوازن بالعملة الأساس: فرق ${baseDiff}`);
    }
    if (Math.abs(baseDiff) > 0.0001) {
      const systemAccountsService = (await import('./systemAccountsService.js')).default;
      const fxAccount = await systemAccountsService.resolve(tx, 'currency_exchange_diff');
      lines.push({
        lineNo: lines.length + 1,
        accountId: fxAccount,
        branchId: draft.branchId || null,
        debit: baseDiff < 0 ? String(r4(Math.abs(baseDiff))) : '0',
        credit: baseDiff > 0 ? String(r4(baseDiff)) : '0',
        currency: base,
        exchangeRate: '1',
        debitBase: baseDiff < 0 ? String(r4(Math.abs(baseDiff))) : '0',
        creditBase: baseDiff > 0 ? String(r4(baseDiff)) : '0',
        partyType: null,
        partyId: null,
        description: 'فرق تقريب صرف',
      });
      if (baseDiff < 0) totalDebitBase += Math.abs(baseDiff);
      else totalCreditBase += baseDiff;
    }

    const numberBranchId = draft.branchId || (await ensureDefaultBranch(tx));
    const { number } = await allocateDocumentNumber(tx, {
      docType: 'journal',
      branchId: numberBranchId,
    });

    const [entry] = await tx
      .insert(journalEntries)
      .values({
        entryNumber: number,
        entryDate: draft.entryDate,
        branchId: draft.branchId || null,
        accountingPeriodId: draft.accountingPeriodId || null,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId ?? null,
        description: draft.description || null,
        status: 'posted',
        reversalOfEntryId: draft.reversalOfEntryId || null,
        totalDebitBase: String(r4(totalDebitBase)),
        totalCreditBase: String(r4(totalCreditBase)),
        isOpening: draft.isOpening === true,
        createdBy: draft.userId || null,
      })
      .returning();

    for (const line of lines) {
      await tx.insert(journalEntryLines).values({ ...line, journalEntryId: entry.id });
    }

    return entry;
  }

  /** Public wrapper for journalService (manual/opening entries — throws). */
  async insertValidatedEntry(tx, draft) {
    return this.#insertEntry(tx, draft);
  }

  /**
   * Reverse the posted entry of a source document (cancellations). Posts a
   * mirrored entry (sourceType 'reversal') and marks the original 'reversed'
   * — which frees the one-posted-entry-per-source slot for a later re-post
   * (e.g. sale restore). No-op when the flag is off or nothing was posted.
   */
  async reverseEntry(tx, { sourceType, sourceId, user = null, reason = null }) {
    if (!(await this.isEnabled())) return null;

    const [original] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.sourceType, sourceType),
          eq(journalEntries.sourceId, Number(sourceId)),
          eq(journalEntries.status, 'posted')
        )
      )
      .limit(1);
    if (!original) return null;

    try {
      const lines = await tx
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, original.id));

      const reversal = await this.#insertEntry(tx, {
        entryDate: new Date().toISOString().slice(0, 10),
        branchId: original.branchId,
        accountingPeriodId: original.accountingPeriodId,
        sourceType: 'reversal',
        sourceId: original.id,
        description: `قيد عكسي للقيد ${original.entryNumber}${reason ? ` — ${reason}` : ''}`,
        reversalOfEntryId: original.id,
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
        .where(eq(journalEntries.id, original.id));

      return reversal;
    } catch (err) {
      await this.#recordFailure(tx, {
        sourceType: `reverse:${sourceType}`,
        sourceId,
        error: err,
      });
      return null;
    }
  }

  /** Failure valve — trivial insert in the SAME tx so the document commits. */
  async #recordFailure(tx, { sourceType, sourceId, error }) {
    try {
      await tx
        .insert(glPostingFailures)
        .values({
          sourceType: String(sourceType),
          sourceId: Number(sourceId) || 0,
          errorMessage: String(error?.message || error).slice(0, 2000),
          payloadJson: { code: error?.code || null, key: error?.key || null },
          status: 'pending',
        })
        .onConflictDoNothing();
    } catch {
      // Even the valve failing must never break the document.
    }
  }

  /** List posting failures (repair screen). */
  async listFailures({ status = 'pending' } = {}) {
    const db = await getDb();
    return db
      .select()
      .from(glPostingFailures)
      .where(status === 'all' ? undefined : eq(glPostingFailures.status, status))
      .orderBy(glPostingFailures.id);
  }

  /**
   * Re-run posting for a failed document in a fresh transaction. The partial
   * unique index makes this idempotent even if a prior attempt half-worked.
   */
  async repostFailed(failureId, user) {
    const db = await getDb();
    const [failure] = await db
      .select()
      .from(glPostingFailures)
      .where(eq(glPostingFailures.id, Number(failureId)))
      .limit(1);
    if (!failure) throw new ValidationError('سجل الفشل غير موجود');
    if (failure.status !== 'pending') throw new ValidationError('سجل الفشل معالج مسبقاً');

    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = drizzle(client, { schema });

      const sourceType = failure.sourceType.replace(/^reverse:/, '');
      const isReverse = failure.sourceType.startsWith('reverse:');
      let entry = null;
      let error = null;
      try {
        if (isReverse) {
          entry = await this.reverseEntry(tx, {
            sourceType,
            sourceId: failure.sourceId,
            user,
            reason: 'إعادة ترحيل',
          });
        } else {
          const builder = RULE_BUILDERS[sourceType];
          if (!builder) throw new ValidationError(`لا توجد قاعدة ترحيل للنوع ${sourceType}`);
          const draft = await builder(tx, failure.sourceId);
          if (draft && draft.lines?.length) {
            entry = await this.#insertEntry(tx, {
              ...draft,
              sourceType,
              sourceId: failure.sourceId,
              userId: user?.id || null,
            });
          }
        }
      } catch (err) {
        error = err;
      }

      if (error) {
        // Roll back any partial posting, then bump the attempt counter on a
        // clean connection so the failure row reflects the retry.
        await client.query('ROLLBACK');
        await db
          .update(glPostingFailures)
          .set({ attempts: failure.attempts + 1, errorMessage: String(error.message).slice(0, 2000) })
          .where(eq(glPostingFailures.id, failure.id));
        const err = new ValidationError(`فشلت إعادة الترحيل: ${error.message}`);
        err.statusCode = 422;
        throw err;
      }

      await tx
        .update(glPostingFailures)
        .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: user?.id || null })
        .where(eq(glPostingFailures.id, failure.id));
      await client.query('COMMIT');
      return entry;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* already committed */ }
      throw err;
    } finally {
      client.release();
    }
  }

  /** Mark a failure as ignored (operator decision). */
  async ignoreFailure(failureId, user) {
    const db = await getDb();
    const [row] = await db
      .update(glPostingFailures)
      .set({ status: 'ignored', resolvedAt: new Date(), resolvedBy: user?.id || null })
      .where(eq(glPostingFailures.id, Number(failureId)))
      .returning();
    if (!row) throw new ValidationError('سجل الفشل غير موجود');
    return row;
  }
}

export default new GlPostingService();
