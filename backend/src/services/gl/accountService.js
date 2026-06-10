import { getDb } from '../../db.js';
import { accounts, journalEntryLines, systemAccounts } from '../../models/index.js';
import { asc, eq, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.js';

const ACCOUNT_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'expense']);

/**
 * Chart of accounts (شجرة الحسابات) CRUD.
 * Guards: unique code, postable-leaf discipline, is_system delete block,
 * no delete/no type-change once lines exist.
 */
export class AccountService {
  /** The full tree (flat list ordered by code — frontend nests by parentId). */
  async getTree({ includeInactive = false } = {}) {
    const db = await getDb();
    const rows = await db
      .select()
      .from(accounts)
      .where(includeInactive ? undefined : eq(accounts.isActive, true))
      .orderBy(asc(accounts.code));

    // Per-account base balance (posted entries only) so the tree can show
    // live balances without a second request.
    const balances = await db.execute(sql`
      SELECT l.account_id,
             COALESCE(SUM(l.debit_base::numeric - l.credit_base::numeric), 0) AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id
      WHERE e.status = 'posted'
      GROUP BY l.account_id
    `);
    const balanceRows = balances.rows ?? balances;
    const byAccount = new Map(balanceRows.map((r) => [Number(r.account_id), Number(r.balance)]));

    return rows.map((r) => ({ ...r, balanceBase: byAccount.get(r.id) || 0 }));
  }

  async getById(id) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Account');
    return row;
  }

  async create(input, user) {
    const code = String(input.code || '').trim();
    const name = String(input.name || '').trim();
    if (!code) throw new ValidationError('رمز الحساب مطلوب');
    if (!name) throw new ValidationError('اسم الحساب مطلوب');
    if (!ACCOUNT_TYPES.has(input.accountType)) {
      throw new ValidationError('نوع الحساب يجب أن يكون: asset | liability | equity | revenue | expense');
    }

    const db = await getDb();
    const [dup] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.code, code))
      .limit(1);
    if (dup) throw new ConflictError(`الرمز ${code} مستخدم مسبقاً`);

    let level = 1;
    if (input.parentId) {
      const parent = await this.getById(input.parentId);
      level = (parent.level || 1) + 1;
      // A parent with posted lines can't become a folder implicitly.
      if (parent.isPostable) {
        const [hasLines] = await db
          .select({ id: journalEntryLines.id })
          .from(journalEntryLines)
          .where(eq(journalEntryLines.accountId, parent.id))
          .limit(1);
        if (hasLines) {
          throw new ValidationError(
            'الحساب الأب عليه قيود — لا يمكن إضافة حسابات فرعية تحته'
          );
        }
        // Auto-flip the parent to non-postable so the leaf rule holds.
        await db
          .update(accounts)
          .set({ isPostable: false, updatedAt: new Date() })
          .where(eq(accounts.id, parent.id));
      }
    }

    const [row] = await db
      .insert(accounts)
      .values({
        code,
        name,
        accountType: input.accountType,
        parentId: input.parentId ? Number(input.parentId) : null,
        level,
        isPostable: input.isPostable !== false,
        isSystem: false,
        notes: input.notes || null,
        isActive: true,
        createdBy: user?.id || null,
      })
      .returning();
    return row;
  }

  async update(id, input, user) {
    const existing = await this.getById(id);
    const db = await getDb();
    const patch = { updatedAt: new Date() };

    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new ValidationError('اسم الحساب مطلوب');
      patch.name = name;
    }
    if (input.notes !== undefined) patch.notes = input.notes || null;
    if (input.accountType !== undefined && input.accountType !== existing.accountType) {
      const [hasLines] = await db
        .select({ id: journalEntryLines.id })
        .from(journalEntryLines)
        .where(eq(journalEntryLines.accountId, existing.id))
        .limit(1);
      if (hasLines) throw new ValidationError('لا يمكن تغيير نوع حساب عليه قيود');
      if (!ACCOUNT_TYPES.has(input.accountType)) throw new ValidationError('نوع حساب غير صالح');
      patch.accountType = input.accountType;
    }
    if (input.isActive !== undefined) patch.isActive = !!input.isActive;

    const [row] = await db
      .update(accounts)
      .set(patch)
      .where(eq(accounts.id, Number(id)))
      .returning();
    return row;
  }

  async delete(id) {
    const existing = await this.getById(id);
    const db = await getDb();

    if (existing.isSystem) {
      throw new ValidationError('حساب نظامي من القالب — يمكن إعادة تسميته أو تعطيله، لا حذفه');
    }
    const [mapped] = await db
      .select({ id: systemAccounts.id })
      .from(systemAccounts)
      .where(eq(systemAccounts.accountId, existing.id))
      .limit(1);
    if (mapped) throw new ValidationError('الحساب مربوط بمفتاح نظامي — أعد الربط أولاً');
    const [hasLines] = await db
      .select({ id: journalEntryLines.id })
      .from(journalEntryLines)
      .where(eq(journalEntryLines.accountId, existing.id))
      .limit(1);
    if (hasLines) throw new ValidationError('الحساب عليه قيود — عطّله بدلاً من حذفه');
    const [hasChildren] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.parentId, existing.id))
      .limit(1);
    if (hasChildren) throw new ValidationError('احذف الحسابات الفرعية أولاً');

    await db.delete(accounts).where(eq(accounts.id, existing.id));
    return { success: true, message: 'تم حذف الحساب' };
  }
}

export default new AccountService();
