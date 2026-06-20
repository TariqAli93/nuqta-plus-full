import { OnlineCommerceReportController } from '../controllers/onlineCommerceReportController.js';

const c = new OnlineCommerceReportController();

export default async function onlineCommerceReportRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  // Online-commerce reports belong to the online-orders feature (الطلبات
  // الأونلاين). When it's off, these endpoints reject with 403 FEATURE_DISABLED.
  fastify.addHook('onRequest', fastify.requireFeature('onlineOrders'));

  // Compact dashboard widgets (top channel / revenue / profit + rates).
  fastify.get('/widgets', {
    onRequest: [fastify.authenticate, fastify.authorize('online_commerce_reports:read')],
    handler: c.widgets,
    schema: {
      description: 'Online commerce dashboard widgets',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });

  // Reports 1–6 (sales / orders / delivered / returned / return % / revenue).
  fastify.get('/overview', {
    onRequest: [fastify.authenticate, fastify.authorize('online_commerce_reports:read')],
    handler: c.overview,
    schema: {
      description: 'Online commerce reports: sales, orders, delivered/returned, return %, revenue by channel',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });

  // Report 7 (profit) — profit-sensitive, gated on reports:read_profit.
  fastify.get('/profit', {
    onRequest: [fastify.authenticate, fastify.authorize('reports:read_profit')],
    handler: c.profit,
    schema: {
      description: 'Online commerce report: profit by channel',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });
}
