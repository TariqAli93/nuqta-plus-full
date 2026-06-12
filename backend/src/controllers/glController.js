import { z } from 'zod';
import accountService from '../services/gl/accountService.js';
import systemAccountsService from '../services/gl/systemAccountsService.js';
import journalService from '../services/gl/journalService.js';
import glPostingService from '../services/gl/glPostingService.js';
import coaTemplateService from '../services/gl/coaTemplateService.js';
import featureFlagsService from '../services/featureFlagsService.js';
import auditService from '../services/auditService.js';

const accountSchema = z.object({
  code: z.string().trim().min(1, 'رمز الحساب مطلوب').max(20),
  name: z.string().trim().min(1, 'اسم الحساب مطلوب').max(160),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.coerce.number().int().positive().optional().nullable(),
  isPostable: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const manualEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        accountId: z.coerce.number().int().positive(),
        debit: z.coerce.number().nonnegative().default(0),
        credit: z.coerce.number().nonnegative().default(0),
        currency: z.enum(['USD', 'IQD']).optional(),
        exchangeRate: z.coerce.number().positive().optional(),
        description: z.string().trim().max(300).nullable().optional(),
      })
    )
    .min(2, 'القيد اليدوي يحتاج سطرين على الأقل'),
});

const journalListSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(25),
  sourceType: z.string().optional(),
  status: z.enum(['posted', 'reversed']).optional(),
  accountId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export class GlController {
  // ── Chart of accounts ─────────────────────────────────────────────────────
  async getTree(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const includeInactive = request.query?.includeInactive === 'true';
    const data = await accountService.getTree({ includeInactive });
    return reply.send({ success: true, data });
  }

  async createAccount(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const body = accountSchema.parse(request.body || {});
    const data = await accountService.create(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'gl:account_created',
      resource: 'accounts',
      resourceId: data.id,
      details: { code: data.code, name: data.name },
    });
    return reply.code(201).send({ success: true, data, message: 'تم إنشاء الحساب' });
  }

  async updateAccount(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const body = accountUpdateSchema.parse(request.body || {});
    const data = await accountService.update(request.params.id, body, request.user);
    return reply.send({ success: true, data, message: 'تم تحديث الحساب' });
  }

  async deleteAccount(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const result = await accountService.delete(request.params.id);
    return reply.send({ success: true, ...result });
  }

  // ── COA templates ─────────────────────────────────────────────────────────
  async listTemplates(request, reply) {
    return reply.send({ success: true, data: coaTemplateService.listTemplates() });
  }

  async seedTemplate(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const templateKey = request.body?.template;
    const result = await coaTemplateService.seed(templateKey, request.user?.id);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'gl:coa_template_seeded',
      resource: 'accounts',
      details: result,
    });
    return reply.send({ success: true, data: result, message: 'تم إنشاء شجرة الحسابات' });
  }

  // ── System accounts mapping ───────────────────────────────────────────────
  async listSystemAccounts(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const data = await systemAccountsService.list();
    return reply.send({ success: true, data });
  }

  async setSystemAccount(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const { key, accountId } = request.body || {};
    if (!key || !accountId) {
      return reply.code(422).send({ success: false, message: 'key و accountId مطلوبان' });
    }
    const data = await systemAccountsService.setMapping(String(key), Number(accountId), request.user?.id);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'gl:system_account_mapped',
      resource: 'system_accounts',
      details: { key, accountId },
    });
    return reply.send({ success: true, data, message: 'تم تحديث الربط' });
  }

  // ── Journal ───────────────────────────────────────────────────────────────
  async listEntries(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const query = journalListSchema.parse(request.query || {});
    const result = await journalService.getAll(query, request.user);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async getEntry(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const data = await journalService.getById(request.params.id, request.user);
    return reply.send({ success: true, data });
  }

  async createManualEntry(request, reply) {
    const body = manualEntrySchema.parse(request.body || {});
    const data = await journalService.createManual(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'gl:manual_entry_created',
      resource: 'journal_entries',
      resourceId: data.id,
      details: { entryNumber: data.entryNumber },
    });
    return reply.code(201).send({ success: true, data, message: 'تم ترحيل القيد اليدوي' });
  }

  async reverseManualEntry(request, reply) {
    const reason = request.body?.reason || null;
    const data = await journalService.reverseManual(request.params.id, reason, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'gl:manual_entry_reversed',
      resource: 'journal_entries',
      resourceId: Number(request.params.id),
      details: { reason },
    });
    return reply.send({ success: true, data, message: 'تم عكس القيد' });
  }

  // ── Posting failures (إصلاح القيود) ───────────────────────────────────────
  async listFailures(request, reply) {
    await featureFlagsService.requireFeature('generalLedger');
    const data = await glPostingService.listFailures({ status: request.query?.status || 'pending' });
    return reply.send({ success: true, data });
  }

  async repostFailure(request, reply) {
    const data = await glPostingService.repostFailed(request.params.id, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'gl:posting_repaired',
      resource: 'gl_posting_failures',
      resourceId: Number(request.params.id),
    });
    return reply.send({ success: true, data, message: 'تمت إعادة الترحيل' });
  }

  async ignoreFailure(request, reply) {
    const data = await glPostingService.ignoreFailure(request.params.id, request.user);
    return reply.send({ success: true, data, message: 'تم تجاهل السجل' });
  }
}

export default new GlController();
