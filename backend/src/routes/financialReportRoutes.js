import financialReportController from '../controllers/financialReportController.js';

export default async function financialReportRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  const guard = ['reports:read_financial'];

  fastify.get('/trial-balance', {
    onRequest: [fastify.authenticate, fastify.authorize(...guard)],
    handler: financialReportController.trialBalance.bind(financialReportController),
    schema: { description: 'ميزان المراجعة — Trial balance', tags: ['financial-reports'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/general-ledger', {
    onRequest: [fastify.authenticate, fastify.authorize(...guard)],
    handler: financialReportController.generalLedger.bind(financialReportController),
    schema: { description: 'دفتر الأستاذ — General ledger for an account', tags: ['financial-reports'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/account-statement', {
    onRequest: [fastify.authenticate, fastify.authorize(...guard)],
    handler: financialReportController.accountStatement.bind(financialReportController),
    schema: { description: 'كشف حساب — Account / party statement', tags: ['financial-reports'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/income-statement', {
    onRequest: [fastify.authenticate, fastify.authorize(...guard)],
    handler: financialReportController.incomeStatement.bind(financialReportController),
    schema: { description: 'قائمة الدخل — Income statement', tags: ['financial-reports'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/balance-sheet', {
    onRequest: [fastify.authenticate, fastify.authorize(...guard)],
    handler: financialReportController.balanceSheet.bind(financialReportController),
    schema: { description: 'الميزانية العمومية — Balance sheet', tags: ['financial-reports'], security: [{ bearerAuth: [] }] },
  });
}
