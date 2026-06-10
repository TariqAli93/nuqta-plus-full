import { z } from 'zod';
import purchaseService from '../services/purchaseService.js';
import featureFlagsService from '../services/featureFlagsService.js';
import auditService from '../services/auditService.js';

const purchaseItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitCost: z.coerce.number().nonnegative('الكلفة لا يمكن أن تكون سالبة'),
  discount: z.coerce.number().nonnegative().optional(),
  unitId: z.coerce.number().int().positive().optional().nullable(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const purchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  supplierInvoiceNumber: z.string().trim().max(80).nullable().optional(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  warehouseId: z.coerce.number().int().positive().optional().nullable(),
  items: z.array(purchaseItemSchema).min(1, 'فاتورة الشراء تحتاج صنفاً واحداً على الأقل'),
  discount: z.coerce.number().nonnegative().optional(),
  tax: z.coerce.number().nonnegative().optional(),
  currency: z.enum(['USD', 'IQD']).default('IQD'),
  exchangeRate: z.coerce.number().positive().optional(),
  paymentType: z.enum(['cash', 'credit']).default('cash'),
  paidAmount: z.coerce.number().nonnegative().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  updateCostPrices: z.boolean().optional(),
  cashboxId: z.coerce.number().int().positive().optional().nullable(),
  bankAccountId: z.coerce.number().int().positive().optional().nullable(),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive('مبلغ الدفعة يجب أن يكون أكبر من صفر'),
  cashboxId: z.coerce.number().int().positive().optional().nullable(),
  bankAccountId: z.coerce.number().int().positive().optional().nullable(),
});

const returnSchema = z.object({
  items: z
    .array(
      z.object({
        purchaseItemId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1, 'حدد الأصناف المرتجعة'),
  refundMethod: z.enum(['cash', 'credit']).optional(),
  refundReference: z.string().trim().max(120).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  cashboxId: z.coerce.number().int().positive().optional().nullable(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(25),
  supplierId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  status: z.enum(['received', 'cancelled']).optional(),
  currency: z.string().optional().default('ALL'),
  unpaidOnly: z.coerce.boolean().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export class PurchaseController {
  async create(request, reply) {
    const body = purchaseSchema.parse(request.body || {});
    const data = await purchaseService.create(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'purchases:created',
      resource: 'purchase_invoices',
      resourceId: data.id,
      details: { invoiceNumber: data.invoiceNumber, total: data.total },
    });
    return reply.code(201).send({ success: true, data, message: 'تم تسجيل فاتورة الشراء' });
  }

  async getAll(request, reply) {
    await featureFlagsService.requireFeature('purchases');
    const query = listQuerySchema.parse(request.query || {});
    const result = await purchaseService.getAll(query, request.user);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async getById(request, reply) {
    await featureFlagsService.requireFeature('purchases');
    const data = await purchaseService.getById(request.params.id, request.user);
    return reply.send({ success: true, data });
  }

  async addPayment(request, reply) {
    const body = paymentSchema.parse(request.body || {});
    const data = await purchaseService.addPayment(request.params.id, body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'purchases:payment_added',
      resource: 'purchase_invoices',
      resourceId: Number(request.params.id),
      details: { amount: body.amount },
    });
    return reply.send({ success: true, data, message: 'تم تسجيل الدفعة للمورد' });
  }

  async createReturn(request, reply) {
    const body = returnSchema.parse(request.body || {});
    const data = await purchaseService.createReturn(request.params.id, body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'purchases:return_created',
      resource: 'purchase_returns',
      resourceId: data.id,
      details: { returnNumber: data.returnNumber, returnedValue: data.returnedValue },
    });
    return reply.code(201).send({ success: true, data, message: 'تم تسجيل مرتجع الشراء' });
  }

  async cancel(request, reply) {
    const reason = request.body?.reason || null;
    const data = await purchaseService.cancel(request.params.id, reason, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'purchases:cancelled',
      resource: 'purchase_invoices',
      resourceId: data.id,
      details: { reason },
    });
    return reply.send({ success: true, data, message: 'تم إلغاء فاتورة الشراء' });
  }
}

export default new PurchaseController();
