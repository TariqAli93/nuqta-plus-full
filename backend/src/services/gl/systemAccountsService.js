import { getDb } from '../../db.js';
import { systemAccounts, accounts } from '../../models/index.js';
import { asc, eq } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * System-account mapping (ربط الحسابات): posting-rule key → account id.
 * Rules live in code (postingRules.js); WHICH account a key hits is data.
 */
export class SystemAccountsService {
  /**
   * Resolve a key to its account id within the caller's executor (tx or db).
   * Throws a coded error when unmapped — the posting engine's failure valve
   * turns that into a gl_posting_failures row instead of breaking the doc.
   */
  async resolve(executor, key) {
    const db = executor || (await getDb());
    const [row] = await db
      .select({ accountId: systemAccounts.accountId })
      .from(systemAccounts)
      .where(eq(systemAccounts.key, key))
      .limit(1);
    if (!row) {
      const err = new ValidationError(`حساب النظام غير مربوط: ${key}`);
      err.code = 'SYSTEM_ACCOUNT_UNMAPPED';
      err.key = key;
      throw err;
    }
    return row.accountId;
  }

  /** Resolve with a fallback key (e.g. expense_cat:<name> → expenses_default). */
  async resolveWithFallback(executor, key, fallbackKey) {
    try {
      return await this.resolve(executor, key);
    } catch (err) {
      if (err.code === 'SYSTEM_ACCOUNT_UNMAPPED' && fallbackKey) {
        return this.resolve(executor, fallbackKey);
      }
      throw err;
    }
  }

  async list() {
    const db = await getDb();
    return db
      .select({
        id: systemAccounts.id,
        key: systemAccounts.key,
        accountId: systemAccounts.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        description: systemAccounts.description,
        updatedAt: systemAccounts.updatedAt,
      })
      .from(systemAccounts)
      .leftJoin(accounts, eq(systemAccounts.accountId, accounts.id))
      .orderBy(asc(systemAccounts.key));
  }

  /** Re-point a key at another POSTABLE account. */
  async setMapping(key, accountId, userId) {
    const db = await getDb();
    const [account] = await db
      .select({ id: accounts.id, isPostable: accounts.isPostable, isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, Number(accountId)))
      .limit(1);
    if (!account) throw new NotFoundError('Account');
    if (!account.isPostable || account.isActive === false) {
      throw new ValidationError('يجب ربط المفتاح بحساب ورقي (قابل للترحيل) ونشط');
    }

    const [existing] = await db
      .select({ id: systemAccounts.id })
      .from(systemAccounts)
      .where(eq(systemAccounts.key, key))
      .limit(1);
    if (existing) {
      const [row] = await db
        .update(systemAccounts)
        .set({ accountId: Number(accountId), updatedAt: new Date(), updatedBy: userId || null })
        .where(eq(systemAccounts.key, key))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(systemAccounts)
      .values({ key, accountId: Number(accountId), updatedBy: userId || null })
      .returning();
    return row;
  }
}

export default new SystemAccountsService();
