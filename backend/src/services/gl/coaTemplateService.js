import { getDb } from '../../db.js';
import { accounts, systemAccounts } from '../../models/index.js';
import { eq } from 'drizzle-orm';
import simpleTree from './coaTemplates/simpleTree.js';
import iraqiUnified from './coaTemplates/iraqiUnified.js';
import { ValidationError } from '../../utils/errors.js';

const TEMPLATES = Object.freeze({
  simple_tree: simpleTree,
  iraqi_unified: iraqiUnified,
});

/**
 * COA template seeding — idempotent: accounts upsert on code (existing codes
 * are left untouched so operator edits survive re-seeds), system-account
 * keys are only inserted when missing.
 */
export class CoaTemplateService {
  listTemplates() {
    return Object.entries(TEMPLATES).map(([key, t]) => ({
      key,
      version: t.version,
      accountCount: t.accounts.length,
    }));
  }

  /**
   * Seed `templateKey` ('simple_tree' | 'iraqi_unified'). Safe to re-run.
   * Returns {created, skipped, mappedKeys}.
   */
  async seed(templateKey, userId = null, executor = null) {
    const template = TEMPLATES[templateKey];
    if (!template) throw new ValidationError(`Unknown COA template: ${templateKey}`);
    const db = executor || (await getDb());

    let created = 0;
    let skipped = 0;
    const idByCode = new Map();

    // Parents are declared before children in the template arrays, so a
    // single ordered pass resolves the hierarchy.
    for (const def of template.accounts) {
      const [existing] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.code, def.code))
        .limit(1);
      if (existing) {
        idByCode.set(def.code, existing.id);
        skipped += 1;
        continue;
      }
      const parentId = def.parent ? idByCode.get(def.parent) || null : null;
      const level = def.parent ? (def.code.length > 2 ? 3 : 2) : 1;
      const [row] = await db
        .insert(accounts)
        .values({
          code: def.code,
          name: def.name,
          accountType: def.type,
          parentId,
          level,
          isPostable: def.postable !== false,
          isSystem: true,
          isActive: true,
          createdBy: userId,
        })
        .onConflictDoNothing({ target: accounts.code })
        .returning({ id: accounts.id });
      if (row) {
        idByCode.set(def.code, row.id);
        created += 1;
      } else {
        // Lost a race — re-select.
        const [again] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.code, def.code))
          .limit(1);
        if (again) idByCode.set(def.code, again.id);
        skipped += 1;
      }
    }

    // Map system keys → accounts (insert-if-missing; operator remaps freely).
    let mappedKeys = 0;
    for (const [key, code] of Object.entries(template.systemAccountKeys)) {
      const accountId = idByCode.get(code);
      if (!accountId) continue;
      const [existing] = await db
        .select({ id: systemAccounts.id })
        .from(systemAccounts)
        .where(eq(systemAccounts.key, key))
        .limit(1);
      if (existing) continue;
      await db
        .insert(systemAccounts)
        .values({
          key,
          accountId,
          // User-facing — friendly Arabic only, never the technical key/version.
          description: `تم إنشاؤه تلقائياً من قالب ${template.label || 'شجرة الحسابات'}`,
        })
        .onConflictDoNothing({ target: systemAccounts.key });
      mappedKeys += 1;
    }

    return { created, skipped, mappedKeys, template: templateKey, version: template.version };
  }
}

export default new CoaTemplateService();
