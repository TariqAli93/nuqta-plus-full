import { z } from 'zod';
import supplierService from '../services/supplierService.js';
import featureFlagsService from '../services/featureFlagsService.js';
import auditService from '../services/auditService.js';

const supplierSchema = z.object({
  name: z.string().trim().min(1, 'اسم المورد مطلوب').max(160),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const supplierUpdateSchema = supplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().optional().default(25),
  search: z.string().optional(),
  hasDebt: z.coerce.boolean().optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export class SupplierController {
  async create(request, reply) {
    const body = supplierSchema.parse(request.body || {});
    const data = await supplierService.create(body, request.user);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'suppliers:created',
      resource: 'suppliers',
      resourceId: data.id,
      details: { name: data.name },
    });
    return reply.code(201).send({ success: true, data, message: 'تم إنشاء المورد' });
  }

  async update(request, reply) {
    await featureFlagsService.requireFeature('suppliers');
    const body = supplierUpdateSchema.parse(request.body || {});
    const data = await supplierService.update(request.params.id, body, request.user);
    return reply.send({ success: true, data, message: 'تم تحديث المورد' });
  }

  async getAll(request, reply) {
    await featureFlagsService.requireFeature('suppliers');
    const query = listQuerySchema.parse(request.query || {});
    const result = await supplierService.getAll(query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async getById(request, reply) {
    await featureFlagsService.requireFeature('suppliers');
    const data = await supplierService.getById(request.params.id);
    return reply.send({ success: true, data });
  }

  async getDebts(request, reply) {
    await featureFlagsService.requireFeature('suppliers');
    const data = await supplierService.getDebts(request.params.id);
    return reply.send({ success: true, data });
  }

  async getStatement(request, reply) {
    await featureFlagsService.requireFeature('suppliers');
    const data = await supplierService.getStatement(request.params.id, {
      dateFrom: request.query?.dateFrom,
      dateTo: request.query?.dateTo,
    });
    return reply.send({ success: true, data });
  }

  async getProducts(request, reply) {
    await featureFlagsService.requireFeature('suppliers');
    const data = await supplierService.getProducts(request.params.id);
    return reply.send({ success: true, data });
  }

  async delete(request, reply) {
    await featureFlagsService.requireFeature('suppliers');
    const result = await supplierService.delete(request.params.id);
    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'suppliers:deleted',
      resource: 'suppliers',
      resourceId: Number(request.params.id),
      details: { deactivated: result.deactivated },
    });
    return reply.send({ success: true, ...result });
  }
}

export default new SupplierController();
