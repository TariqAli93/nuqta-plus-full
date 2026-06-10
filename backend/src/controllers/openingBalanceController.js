import { z } from 'zod';
import openingBalanceService from '../services/openingBalanceService.js';
import auditService from '../services/auditService.js';

const customerSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  currency: z.enum(['USD', 'IQD']).optional(),
  note: z.string().trim().max(300).optional(),
});

const supplierSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  currency: z.enum(['USD', 'IQD']).optional(),
  note: z.string().trim().max(300).optional(),
});

const entrySchema = z.object({
  cashAmount: z.coerce.number().nonnegative().optional(),
  inventoryAmount: z.coerce.number().nonnegative().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export class OpeningBalanceController {
  async status(request, reply) {
    const data = await openingBalanceService.getStatus();
    return reply.send({ success: true, data });
  }

  async createCustomerOpening(request, reply) {
    const body = customerSchema.parse(request.body || {});
    const data = await openingBalanceService.createCustomerOpening(body, request.user);
    return reply.code(201).send({ success: true, data, message: 'تم تسجيل الرصيد الافتتاحي للعميل' });
  }

  async createSupplierOpening(request, reply) {
    const body = supplierSchema.parse(request.body || {});
    const data = await openingBalanceService.createSupplierOpening(body, request.user);
    return reply.code(201).send({ success: true, data, message: 'تم تسجيل الرصيد الافتتاحي للمورد' });
  }

  async generateEntry(request, reply) {
    const body = entrySchema.parse(request.body || {});
    const data = await openingBalanceService.generateOpeningEntry(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'opening_balances:entry_generated',
      resource: 'journal_entries',
      resourceId: data?.id,
    });
    return reply.code(201).send({ success: true, data, message: 'تم إنشاء القيد الافتتاحي' });
  }
}

export default new OpeningBalanceController();
