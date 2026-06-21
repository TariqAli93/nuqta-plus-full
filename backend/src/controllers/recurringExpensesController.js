import { z } from 'zod';
import recurringExpensesService from '../services/recurringExpensesService.js';

const baseSchema = z.object({
  branchId: z.coerce.number().int().positive().optional().nullable(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.string().trim().min(1, 'Category is required').max(60),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  currency: z.enum(['USD', 'IQD']).default('USD'),
  note: z.string().trim().max(1000).nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  monthOfYear: z.coerce.number().int().min(1).max(12).optional().nullable(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  isActive: z.boolean().optional(),
  // Optional treasury attribution propagated to every generated expense.
  cashboxId: z.coerce.number().int().positive().optional().nullable(),
  bankAccountId: z.coerce.number().int().positive().optional().nullable(),
});

const createSchema = baseSchema.superRefine((val, ctx) => {
  if (val.frequency === 'weekly' && (val.dayOfWeek === undefined || val.dayOfWeek === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dayOfWeek is required for weekly', path: ['dayOfWeek'] });
  }
  if (val.frequency === 'monthly' && (val.dayOfMonth === undefined || val.dayOfMonth === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dayOfMonth is required for monthly', path: ['dayOfMonth'] });
  }
  if (val.frequency === 'yearly') {
    if (val.dayOfMonth === undefined || val.dayOfMonth === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dayOfMonth is required for yearly', path: ['dayOfMonth'] });
    }
    if (val.monthOfYear === undefined || val.monthOfYear === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'monthOfYear is required for yearly', path: ['monthOfYear'] });
    }
  }
});

const updateSchema = baseSchema.partial();

const listQuerySchema = z.object({
  category: z.string().optional(),
  frequency: z.string().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  isActive: z.union([z.boolean(), z.string()]).optional(),
});

const setActiveSchema = z.object({ isActive: z.boolean() });

export class RecurringExpensesController {
  async create(request, reply) {
    const body = createSchema.parse(request.body || {});
    const created = await recurringExpensesService.create(body, request.user);
    return reply.code(201).send({ success: true, data: created, message: 'Recurring expense created' });
  }

  async getAll(request, reply) {
    const query = listQuerySchema.parse(request.query || {});
    const data = await recurringExpensesService.getAll(query, request.user);
    return reply.send({ success: true, data });
  }

  async getById(request, reply) {
    const data = await recurringExpensesService.getById(request.params.id, request.user);
    return reply.send({ success: true, data });
  }

  async update(request, reply) {
    const body = updateSchema.parse(request.body || {});
    const data = await recurringExpensesService.update(request.params.id, body, request.user);
    return reply.send({ success: true, data, message: 'Recurring expense updated' });
  }

  async setActive(request, reply) {
    const { isActive } = setActiveSchema.parse(request.body || {});
    const data = await recurringExpensesService.setActive(request.params.id, isActive, request.user);
    return reply.send({ success: true, data, message: 'Recurring expense updated' });
  }

  async delete(request, reply) {
    const result = await recurringExpensesService.delete(request.params.id, request.user);
    return reply.send({ success: true, message: result.message });
  }

  /** Manually trigger the catch-up generation run (admins/managers). */
  async runNow(request, reply) {
    const summary = await recurringExpensesService.generateDue({});
    return reply.send({ success: true, data: summary, message: 'Generation run complete' });
  }
}

export default new RecurringExpensesController();
