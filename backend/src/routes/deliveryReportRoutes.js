import { DeliveryReportController } from '../controllers/deliveryReportController.js';

const c = new DeliveryReportController();

/** Delivery / shipping reports — all gated by `delivery_reports:view`. */
export default async function deliveryReportRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  // Shipping reports belong to the shipping feature (الشحن). When it's off, these
  // endpoints reject with 403 FEATURE_DISABLED.
  fastify.addHook('onRequest', fastify.requireFeature('shipping'));
  const auth = (perm) => ({ onRequest: [fastify.authenticate, fastify.authorize(perm)] });
  const tag = { tags: ['reports'], security: [{ bearerAuth: [] }] };

  fastify.get('/overview', { ...auth('delivery_reports:view'), handler: c.overview,
    schema: { description: 'Delivery reports overview (KPIs + breakdowns)', ...tag } });
  fastify.get('/by-provider', { ...auth('delivery_reports:view'), handler: c.byProvider,
    schema: { description: 'Shipments by provider (+ success/return rate)', ...tag } });
  fastify.get('/by-status', { ...auth('delivery_reports:view'), handler: c.byStatus,
    schema: { description: 'Shipments by canonical status', ...tag } });
  fastify.get('/by-date', { ...auth('delivery_reports:view'), handler: c.byDate,
    schema: { description: 'Shipments by date', ...tag } });
  fastify.get('/late', { ...auth('delivery_reports:view'), handler: c.late,
    schema: { description: 'Late (overdue, non-terminal) shipments', ...tag } });
  fastify.get('/cost', { ...auth('delivery_reports:view'), handler: c.cost,
    schema: { description: 'Shipping cost totals per currency', ...tag } });
}
