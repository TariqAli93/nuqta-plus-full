import { z } from 'zod';
import treasuryService from '../services/treasuryService.js';
import featureFlagsService from '../services/featureFlagsService.js';
import auditService from '../services/auditService.js';

const openingBalancesSchema = z.record(z.string(), z.coerce.number()).optional();

const cashboxSchema = z.object({
  name: z.string().trim().min(1, 'اسم الصندوق مطلوب').max(120),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  openingBalances: openingBalancesSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});

const cashboxUpdateSchema = cashboxSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const bankAccountSchema = z.object({
  name: z.string().trim().min(1, 'اسم الحساب مطلوب').max(120),
  bankName: z.string().trim().max(120).nullable().optional(),
  accountNumber: z.string().trim().max(60).nullable().optional(),
  iban: z.string().trim().max(60).nullable().optional(),
  currency: z.enum(['USD', 'IQD']).default('IQD'),
  openingBalance: z.coerce.number().optional().default(0),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const bankAccountUpdateSchema = bankAccountSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const transferSchema = z.object({
  fromCashboxId: z.coerce.number().int().positive().optional().nullable(),
  fromBankAccountId: z.coerce.number().int().positive().optional().nullable(),
  toCashboxId: z.coerce.number().int().positive().optional().nullable(),
  toBankAccountId: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  currency: z.enum(['USD', 'IQD']).default('IQD'),
  toAmount: z.coerce.number().positive().optional().nullable(),
  toCurrency: z.enum(['USD', 'IQD']).optional().nullable(),
  exchangeRate: z.coerce.number().positive().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(25),
  status: z.string().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export class TreasuryController {
  // ── Cashboxes ─────────────────────────────────────────────────────────────

  async listCashboxes(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const includeInactive = request.query?.includeInactive === 'true';
    const branchId = request.query?.branchId ? Number(request.query.branchId) : undefined;
    const data = await treasuryService.listCashboxes({ includeInactive, branchId }, request.user);
    return reply.send({ success: true, data });
  }

  async getCashbox(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const data = await treasuryService.getCashboxById(request.params.id, request.user);
    return reply.send({ success: true, data });
  }

  async createCashbox(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const body = cashboxSchema.parse(request.body || {});
    const data = await treasuryService.createCashbox(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'treasury:cashbox_created',
      resource: 'cashboxes',
      resourceId: data.id,
      details: { name: data.name, branchId: data.branchId },
    });
    return reply.code(201).send({ success: true, data, message: 'تم إنشاء الصندوق' });
  }

  async updateCashbox(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const body = cashboxUpdateSchema.parse(request.body || {});
    const data = await treasuryService.updateCashbox(request.params.id, body, request.user);
    return reply.send({ success: true, data, message: 'تم تحديث الصندوق' });
  }

  async setDefaultCashbox(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const data = await treasuryService.setDefaultCashbox(request.params.id, request.user);
    return reply.send({ success: true, data, message: 'تم تعيين الصندوق الافتراضي' });
  }

  async getCashboxLedger(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const filters = {
      dateFrom: request.query?.dateFrom,
      dateTo: request.query?.dateTo,
    };
    const data = await treasuryService.getCashboxLedger(request.params.id, filters, request.user);
    return reply.send({ success: true, data });
  }

  // ── Bank accounts ─────────────────────────────────────────────────────────

  async listBankAccounts(request, reply) {
    await featureFlagsService.requireFeature('bankAccounts');
    const includeInactive = request.query?.includeInactive === 'true';
    const branchId = request.query?.branchId ? Number(request.query.branchId) : undefined;
    const data = await treasuryService.listBankAccounts(
      { includeInactive, branchId },
      request.user
    );
    return reply.send({ success: true, data });
  }

  async createBankAccount(request, reply) {
    const body = bankAccountSchema.parse(request.body || {});
    const data = await treasuryService.createBankAccount(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'treasury:bank_account_created',
      resource: 'bank_accounts',
      resourceId: data.id,
      details: { name: data.name },
    });
    return reply.code(201).send({ success: true, data, message: 'تم إنشاء الحساب المصرفي' });
  }

  async updateBankAccount(request, reply) {
    await featureFlagsService.requireFeature('bankAccounts');
    const body = bankAccountUpdateSchema.parse(request.body || {});
    const data = await treasuryService.updateBankAccount(request.params.id, body, request.user);
    return reply.send({ success: true, data, message: 'تم تحديث الحساب المصرفي' });
  }

  // ── Transfers ─────────────────────────────────────────────────────────────

  async listTransfers(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const query = listQuerySchema.parse(request.query || {});
    const result = await treasuryService.listTransfers(query, request.user);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async createTransfer(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const body = transferSchema.parse(request.body || {});
    const data = await treasuryService.createTransfer(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'treasury:transfer_created',
      resource: 'treasury_transfers',
      resourceId: data.id,
      details: { transferNumber: data.transferNumber, amount: data.amount },
    });
    return reply.code(201).send({ success: true, data, message: 'تم تنفيذ التحويل' });
  }

  async cancelTransfer(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const reason = request.body?.reason || null;
    const data = await treasuryService.cancelTransfer(request.params.id, reason, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'treasury:transfer_cancelled',
      resource: 'treasury_transfers',
      resourceId: data.id,
      details: { reason },
    });
    return reply.send({ success: true, data, message: 'تم إلغاء التحويل' });
  }
}

export default new TreasuryController();
