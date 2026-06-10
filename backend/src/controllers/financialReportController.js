import { z } from 'zod';
import financialReportService from '../services/financialReportService.js';
import featureFlagsService from '../services/featureFlagsService.js';

const rangeSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ledgerSchema = rangeSchema.extend({
  accountId: z.coerce.number().int().positive(),
});

const statementSchema = rangeSchema.extend({
  accountId: z.coerce.number().int().positive().optional(),
  partyType: z.enum(['customer', 'supplier']).optional(),
  partyId: z.coerce.number().int().positive().optional(),
});

const balanceSheetSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export class FinancialReportController {
  async trialBalance(request, reply) {
    await featureFlagsService.requireFeature('financialReports');
    const filters = rangeSchema.parse(request.query || {});
    const data = await financialReportService.getTrialBalance(filters, request.user);
    return reply.send({ success: true, data });
  }

  async generalLedger(request, reply) {
    await featureFlagsService.requireFeature('financialReports');
    const filters = ledgerSchema.parse(request.query || {});
    const data = await financialReportService.getAccountLedger(filters, request.user);
    return reply.send({ success: true, data });
  }

  async accountStatement(request, reply) {
    await featureFlagsService.requireFeature('financialReports');
    const filters = statementSchema.parse(request.query || {});
    const data = await financialReportService.getAccountStatement(filters, request.user);
    return reply.send({ success: true, data });
  }

  async incomeStatement(request, reply) {
    await featureFlagsService.requireFeature('financialReports');
    const filters = rangeSchema.parse(request.query || {});
    const data = await financialReportService.getIncomeStatement(filters, request.user);
    return reply.send({ success: true, data });
  }

  async balanceSheet(request, reply) {
    await featureFlagsService.requireFeature('financialReports');
    const filters = balanceSheetSchema.parse(request.query || {});
    const data = await financialReportService.getBalanceSheet(filters, request.user);
    return reply.send({ success: true, data });
  }
}

export default new FinancialReportController();
