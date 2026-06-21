import { getDb } from '../db.js';
import { recurringExpenses, expenses, branches, users } from '../models/index.js';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import { branchFilterFor, enforceBranchScope, isGlobalAdmin } from './scopeService.js';
import expensesService from './expensesService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RecurringExpensesService');

/** Supported recurrence frequencies. */
export const RECURRENCE_FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);

// System actor for auto-generated rows: flagged as a global admin so the
// template's own branchId is honored (non-admins are pinned to their assigned
// branch). id null → generated expenses carry created_by = NULL (system).
const SYSTEM_ACTOR = Object.freeze({ id: null, role: 'admin', username: 'system' });

function n(v) {
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

// ── Date helpers (UTC-anchored, no external deps) ───────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(d, days) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function daysInMonth(year, monthIdx /* 0-based */) {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}
/** A date in (year, monthIdx) on `dom`, clamped to the month's last day. */
function monthlyOccurrence(year, monthIdx, dom) {
  const day = Math.min(dom, daysInMonth(year, monthIdx));
  return new Date(Date.UTC(year, monthIdx, day));
}

/**
 * First occurrence on/after `base` matching the recurrence rule.
 * Pure function (exported for tests).
 */
export function firstDueOnOrAfter(base, rule) {
  const { frequency, dayOfWeek, dayOfMonth, monthOfYear } = rule;
  switch (frequency) {
    case 'daily':
      return base;
    case 'weekly': {
      const delta = ((dayOfWeek - base.getUTCDay()) % 7 + 7) % 7;
      return addDays(base, delta);
    }
    case 'monthly': {
      let y = base.getUTCFullYear();
      let m = base.getUTCMonth();
      let cand = monthlyOccurrence(y, m, dayOfMonth);
      if (cand < base) {
        m += 1;
        if (m > 11) { m = 0; y += 1; }
        cand = monthlyOccurrence(y, m, dayOfMonth);
      }
      return cand;
    }
    case 'yearly': {
      const m = monthOfYear - 1;
      let y = base.getUTCFullYear();
      let cand = monthlyOccurrence(y, m, dayOfMonth);
      if (cand < base) cand = monthlyOccurrence(y + 1, m, dayOfMonth);
      return cand;
    }
    default:
      throw new ValidationError(`نوع تكرار غير صالح: ${frequency}`);
  }
}

/** The next occurrence strictly AFTER `due`. Pure function (exported for tests). */
export function nextOccurrenceAfter(due, rule) {
  const { frequency, dayOfMonth, monthOfYear } = rule;
  switch (frequency) {
    case 'daily':
      return addDays(due, 1);
    case 'weekly':
      return addDays(due, 7);
    case 'monthly': {
      let y = due.getUTCFullYear();
      let m = due.getUTCMonth() + 1;
      if (m > 11) { m = 0; y += 1; }
      return monthlyOccurrence(y, m, dayOfMonth);
    }
    case 'yearly':
      return monthlyOccurrence(due.getUTCFullYear() + 1, monthOfYear - 1, dayOfMonth);
    default:
      throw new ValidationError(`نوع تكرار غير صالح: ${frequency}`);
  }
}

export class RecurringExpensesService {
  /**
   * Validate + normalize the recurrence rule fields. Returns the cleaned
   * { frequency, dayOfWeek, dayOfMonth, monthOfYear }. Throws on a missing or
   * out-of-range field for the chosen frequency.
   */
  #normalizeRule(input) {
    const frequency = String(input.frequency || '').trim();
    if (!RECURRENCE_FREQUENCIES.includes(frequency)) {
      throw new ValidationError('نوع التكرار غير صالح');
    }
    let dayOfWeek = null;
    let dayOfMonth = null;
    let monthOfYear = null;

    if (frequency === 'weekly') {
      dayOfWeek = Number(input.dayOfWeek);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new ValidationError('يوم الأسبوع مطلوب (0-6) للتكرار الأسبوعي');
      }
    } else if (frequency === 'monthly') {
      dayOfMonth = Number(input.dayOfMonth);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        throw new ValidationError('يوم الشهر مطلوب (1-31) للتكرار الشهري');
      }
    } else if (frequency === 'yearly') {
      dayOfMonth = Number(input.dayOfMonth);
      monthOfYear = Number(input.monthOfYear);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        throw new ValidationError('يوم الشهر مطلوب (1-31) للتكرار السنوي');
      }
      if (!Number.isInteger(monthOfYear) || monthOfYear < 1 || monthOfYear > 12) {
        throw new ValidationError('الشهر مطلوب (1-12) للتكرار السنوي');
      }
    }
    return { frequency, dayOfWeek, dayOfMonth, monthOfYear };
  }

  /** Resolve the branch a template binds to, mirroring expensesService.create. */
  #resolveBranch(input, user) {
    if (isGlobalAdmin(user)) {
      return input.branchId ? Number(input.branchId) : null;
    }
    const branchId = user?.assignedBranchId || null;
    if (!branchId) throw new ValidationError('المستخدم غير مرتبط بأي فرع');
    return branchId;
  }

  /** Compute the next due date given the rule + a "generate from" base date. */
  #computeNextDue(rule, { startDate, lastRunDate }) {
    const base = lastRunDate
      ? addDays(parseDate(lastRunDate), 1) // day after the last generated occurrence
      : parseDate(startDate);
    return toDateStr(firstDueOnOrAfter(base, rule));
  }

  async create(input, user) {
    const rule = this.#normalizeRule(input);
    const branchId = this.#resolveBranch(input, user);

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('قيمة المصروف يجب أن تكون أكبر من صفر');
    }
    const name = String(input.name || '').trim();
    if (!name) throw new ValidationError('اسم المصروف مطلوب');
    const category = String(input.category || '').trim();
    if (!category) throw new ValidationError('الفئة مطلوبة');

    const startDate =
      input.startDate && DATE_RE.test(input.startDate) ? input.startDate : todayStr();

    const nextDueDate = this.#computeNextDue(rule, { startDate, lastRunDate: null });

    const db = await getDb();
    const [row] = await db
      .insert(recurringExpenses)
      .values({
        branchId,
        name,
        category,
        amount: String(amount),
        currency: input.currency || 'USD',
        note: input.note || null,
        frequency: rule.frequency,
        dayOfWeek: rule.dayOfWeek,
        dayOfMonth: rule.dayOfMonth,
        monthOfYear: rule.monthOfYear,
        startDate,
        isActive: input.isActive === undefined ? true : !!input.isActive,
        lastRunDate: null,
        nextDueDate,
        cashboxId: input.cashboxId || null,
        bankAccountId: input.bankAccountId || null,
        createdBy: user?.id || null,
      })
      .returning();

    return { ...row, amount: n(row.amount) };
  }

  async getAll(filters = {}, actingUser = null) {
    const db = await getDb();
    const conds = [];
    if (filters.category) conds.push(eq(recurringExpenses.category, String(filters.category)));
    if (filters.frequency) conds.push(eq(recurringExpenses.frequency, String(filters.frequency)));
    if (filters.isActive !== undefined && filters.isActive !== null && filters.isActive !== '') {
      conds.push(eq(recurringExpenses.isActive, filters.isActive === true || filters.isActive === 'true'));
    }

    const allowed = branchFilterFor(actingUser);
    if (allowed === null) {
      if (filters.branchId) conds.push(eq(recurringExpenses.branchId, Number(filters.branchId)));
    } else if (allowed.length === 0) {
      return [];
    } else {
      conds.push(eq(recurringExpenses.branchId, Number(allowed[0])));
    }

    const where = conds.length ? and(...conds) : undefined;
    const rows = await db
      .select({
        id: recurringExpenses.id,
        branchId: recurringExpenses.branchId,
        branchName: branches.name,
        name: recurringExpenses.name,
        category: recurringExpenses.category,
        amount: recurringExpenses.amount,
        currency: recurringExpenses.currency,
        note: recurringExpenses.note,
        frequency: recurringExpenses.frequency,
        dayOfWeek: recurringExpenses.dayOfWeek,
        dayOfMonth: recurringExpenses.dayOfMonth,
        monthOfYear: recurringExpenses.monthOfYear,
        startDate: recurringExpenses.startDate,
        isActive: recurringExpenses.isActive,
        lastRunDate: recurringExpenses.lastRunDate,
        nextDueDate: recurringExpenses.nextDueDate,
        cashboxId: recurringExpenses.cashboxId,
        bankAccountId: recurringExpenses.bankAccountId,
        createdAt: recurringExpenses.createdAt,
        createdBy: recurringExpenses.createdBy,
        createdByName: users.fullName,
      })
      .from(recurringExpenses)
      .leftJoin(branches, eq(recurringExpenses.branchId, branches.id))
      .leftJoin(users, eq(recurringExpenses.createdBy, users.id))
      .where(where)
      .orderBy(desc(recurringExpenses.isActive), recurringExpenses.nextDueDate, desc(recurringExpenses.id));

    return rows.map((r) => ({ ...r, amount: n(r.amount) }));
  }

  async getById(id, actingUser = null) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(recurringExpenses)
      .where(eq(recurringExpenses.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Recurring expense');
    enforceBranchScope(actingUser, row.branchId);
    return { ...row, amount: n(row.amount) };
  }

  async update(id, input, actingUser = null) {
    const existing = await this.getById(id, actingUser); // scope + existence
    const patch = {};

    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new ValidationError('اسم المصروف مطلوب');
      patch.name = name;
    }
    if (input.category !== undefined) {
      const category = String(input.category).trim();
      if (!category) throw new ValidationError('الفئة مطلوبة');
      patch.category = category;
    }
    if (input.amount !== undefined) {
      const a = Number(input.amount);
      if (!Number.isFinite(a) || a <= 0) throw new ValidationError('قيمة المصروف يجب أن تكون أكبر من صفر');
      patch.amount = String(a);
    }
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.note !== undefined) patch.note = input.note;
    if (input.isActive !== undefined) patch.isActive = !!input.isActive;
    if (input.cashboxId !== undefined) patch.cashboxId = input.cashboxId || null;
    if (input.bankAccountId !== undefined) patch.bankAccountId = input.bankAccountId || null;
    if (input.branchId !== undefined && isGlobalAdmin(actingUser)) {
      patch.branchId = input.branchId ? Number(input.branchId) : null;
    }

    // Recurrence-affecting fields → re-derive the schedule + next due date.
    const ruleChanged =
      input.frequency !== undefined ||
      input.dayOfWeek !== undefined ||
      input.dayOfMonth !== undefined ||
      input.monthOfYear !== undefined ||
      input.startDate !== undefined;

    let rule = {
      frequency: existing.frequency,
      dayOfWeek: existing.dayOfWeek,
      dayOfMonth: existing.dayOfMonth,
      monthOfYear: existing.monthOfYear,
    };
    let startDate = existing.startDate;
    if (input.startDate !== undefined && DATE_RE.test(input.startDate)) {
      startDate = input.startDate;
      patch.startDate = startDate;
    }
    if (ruleChanged) {
      rule = this.#normalizeRule({
        frequency: input.frequency ?? existing.frequency,
        dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
        dayOfMonth: input.dayOfMonth ?? existing.dayOfMonth,
        monthOfYear: input.monthOfYear ?? existing.monthOfYear,
      });
      patch.frequency = rule.frequency;
      patch.dayOfWeek = rule.dayOfWeek;
      patch.dayOfMonth = rule.dayOfMonth;
      patch.monthOfYear = rule.monthOfYear;
      patch.nextDueDate = this.#computeNextDue(rule, {
        startDate,
        lastRunDate: existing.lastRunDate,
      });
    }

    patch.updatedAt = new Date();

    const db = await getDb();
    const [row] = await db
      .update(recurringExpenses)
      .set(patch)
      .where(eq(recurringExpenses.id, Number(id)))
      .returning();
    return { ...row, amount: n(row.amount) };
  }

  /** Pause/resume without deleting (إيقاف مؤقت). */
  async setActive(id, isActive, actingUser = null) {
    await this.getById(id, actingUser); // scope check
    const db = await getDb();
    const [row] = await db
      .update(recurringExpenses)
      .set({ isActive: !!isActive, updatedAt: new Date() })
      .where(eq(recurringExpenses.id, Number(id)))
      .returning();
    return { ...row, amount: n(row.amount) };
  }

  async delete(id, actingUser = null) {
    await this.getById(id, actingUser); // scope check
    const db = await getDb();
    // Generated expense rows survive (FK is SET NULL) so reports stay intact.
    await db.delete(recurringExpenses).where(eq(recurringExpenses.id, Number(id)));
    return { success: true, message: 'Recurring expense deleted' };
  }

  /**
   * Generate one expense row for a single due occurrence. Idempotent: if a row
   * already exists for (template, date) — pre-check or the unique index — it is
   * treated as already generated. Returns 'created' | 'duplicate'.
   */
  async #generateOne(template, dateStr) {
    const db = await getDb();
    const [dup] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.recurringExpenseId, template.id), eq(expenses.expenseDate, dateStr)))
      .limit(1);
    if (dup) return 'duplicate';

    try {
      await expensesService.create(
        {
          branchId: template.branchId || null,
          category: template.category,
          amount: n(template.amount),
          currency: template.currency || 'USD',
          note: template.note || null,
          expenseDate: dateStr,
          cashboxId: template.cashboxId || null,
          bankAccountId: template.bankAccountId || null,
        },
        SYSTEM_ACTOR,
        { recurringExpenseId: template.id }
      );
      return 'created';
    } catch (err) {
      // Lost the race against the unique index → already generated.
      const code = err?.code || err?.cause?.code;
      if (code === '23505') return 'duplicate';
      throw err;
    }
  }

  /**
   * Catch-up engine. For every active template whose next due date is on/before
   * `asOf`, generate ALL missed occurrences up to `asOf` (so a program that was
   * closed across several due dates fills them all on the next launch), then
   * advance lastRunDate/nextDueDate.
   *
   * Per-template isolation: a failure (e.g. no open accounting period when that
   * feature is on) stops THAT template at the failing occurrence without
   * advancing its next due date, so it retries on the next run. Other templates
   * are unaffected.
   */
  async generateDue({ asOf = todayStr(), logger = log } = {}) {
    const db = await getDb();
    const asOfDate = parseDate(asOf);
    const MAX_CATCHUP = 1000; // runaway guard

    const templates = await db
      .select()
      .from(recurringExpenses)
      .where(and(eq(recurringExpenses.isActive, true), lte(recurringExpenses.nextDueDate, asOf)));

    let generated = 0;
    let duplicates = 0;
    let failedTemplates = 0;

    for (const template of templates) {
      const rule = {
        frequency: template.frequency,
        dayOfWeek: template.dayOfWeek,
        dayOfMonth: template.dayOfMonth,
        monthOfYear: template.monthOfYear,
      };
      // Resume from the stored next due date, or derive it if missing.
      let cursorStr =
        template.nextDueDate ||
        this.#computeNextDue(rule, { startDate: template.startDate, lastRunDate: template.lastRunDate });
      let cursor = parseDate(cursorStr);
      let lastRun = template.lastRunDate;
      let iterations = 0;
      let templateFailed = false;

      while (cursor <= asOfDate && iterations < MAX_CATCHUP) {
        iterations += 1;
        const dateStr = toDateStr(cursor);
        try {
          const result = await this.#generateOne(template, dateStr);
          if (result === 'created') generated += 1;
          else duplicates += 1;
          lastRun = dateStr;
        } catch (err) {
          // Stop this template here; leave nextDueDate at the failed occurrence
          // so it retries next run. Don't abort the whole batch.
          templateFailed = true;
          logger.warn?.(
            `[recurringExpenses] template ${template.id} ("${template.name}") failed at ${dateStr}: ${err.message}`
          );
          break;
        }
        cursor = nextOccurrenceAfter(cursor, rule);
      }

      // Persist progress. On failure, nextDueDate stays at the failed cursor
      // (still <= asOf) so it is retried; on success it points past asOf.
      const nextDueDate = toDateStr(cursor);
      try {
        await db
          .update(recurringExpenses)
          .set({
            lastRunDate: lastRun,
            nextDueDate,
            updatedAt: new Date(),
          })
          .where(eq(recurringExpenses.id, template.id));
      } catch (err) {
        logger.warn?.(`[recurringExpenses] failed to persist progress for template ${template.id}: ${err.message}`);
      }
      if (templateFailed) failedTemplates += 1;
    }

    const summary = {
      scannedTemplates: templates.length,
      generated,
      duplicates,
      failedTemplates,
      asOf,
    };
    if (templates.length) logger.info?.(`[recurringExpenses] ${JSON.stringify(summary)}`);
    return summary;
  }
}

export default new RecurringExpensesService();
