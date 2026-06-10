import { z } from 'zod';
import voucherService from '../services/voucherService.js';
import featureFlagsService from '../services/featureFlagsService.js';
import auditService from '../services/auditService.js';

const voucherSchema = z.object({
  voucherType: z.enum(['receipt', 'payment']),
  amount: z.coerce.number().positive('مبلغ السند يجب أن يكون أكبر من صفر'),
  currency: z.enum(['USD', 'IQD']).default('IQD'),
  exchangeRate: z.coerce.number().positive().optional(),
  cashboxId: z.coerce.number().int().positive().optional().nullable(),
  bankAccountId: z.coerce.number().int().positive().optional().nullable(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  customerId: z.coerce.number().int().positive().optional().nullable(),
  category: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  referenceNumber: z.string().trim().max(120).nullable().optional(),
  voucherDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(25),
  voucherType: z.enum(['receipt', 'payment']).optional(),
  status: z.enum(['active', 'cancelled']).optional(),
  sourceType: z.string().optional(),
  cashboxId: z.coerce.number().int().positive().optional(),
  bankAccountId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  currency: z.string().optional().default('ALL'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export class VoucherController {
  /** POST /vouchers/receipt — سند قبض (RBAC: vouchers:create_receipt). */
  async createReceipt(request, reply) {
    return this.create(
      { ...request, body: { ...(request.body || {}), voucherType: 'receipt' } },
      reply
    );
  }

  /** POST /vouchers/payment — سند صرف (RBAC: vouchers:create_payment). */
  async createPayment(request, reply) {
    return this.create(
      { ...request, body: { ...(request.body || {}), voucherType: 'payment' } },
      reply
    );
  }

  async create(request, reply) {
    const body = voucherSchema.parse(request.body || {});
    const data = await voucherService.create(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: `vouchers:${body.voucherType}_created`,
      resource: 'vouchers',
      resourceId: data.id,
      details: { voucherNumber: data.voucherNumber, amount: data.amount },
    });
    return reply.code(201).send({
      success: true,
      data,
      message: body.voucherType === 'receipt' ? 'تم إنشاء سند القبض' : 'تم إنشاء سند الصرف',
    });
  }

  async getAll(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const query = listQuerySchema.parse(request.query || {});
    const result = await voucherService.getAll(query, request.user);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async getById(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const data = await voucherService.getById(request.params.id, request.user);
    return reply.send({ success: true, data });
  }

  async cancel(request, reply) {
    await featureFlagsService.requireFeature('treasury');
    const reason = request.body?.reason || null;
    const data = await voucherService.cancel(request.params.id, reason, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'vouchers:cancelled',
      resource: 'vouchers',
      resourceId: data.id,
      details: { voucherNumber: data.voucherNumber, reason },
    });
    return reply.send({ success: true, data, message: 'تم إلغاء السند' });
  }
}

export default new VoucherController();
