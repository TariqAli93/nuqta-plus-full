import { OnlineOrderController } from '../controllers/onlineOrderController.js';

const onlineOrderController = new OnlineOrderController();

export default async function onlineOrderRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  // Whole router is gated by the online-orders feature flag (الطلبات الأونلاين).
  // When the feature is off the API rejects with 403 FEATURE_DISABLED, so a
  // disabled module can't be reached by calling the endpoints directly.
  fastify.addHook('onRequest', fastify.requireFeature('onlineOrders'));

  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.authorize('online_orders:create')],
    handler: onlineOrderController.create,
    schema: {
      description: 'Create new online order',
      tags: ['online-orders'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.authorize('online_orders:read')],
    handler: onlineOrderController.getAll,
    schema: {
      description: 'Get all online orders',
      tags: ['online-orders'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('online_orders:read')],
    handler: onlineOrderController.getById,
    schema: {
      description: 'Get online order by ID',
      tags: ['online-orders'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('online_orders:update')],
    handler: onlineOrderController.update,
    schema: {
      description: 'Update online order',
      tags: ['online-orders'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.patch('/:id/status', {
    onRequest: [fastify.authenticate, fastify.authorize('online_orders:update_status')],
    handler: onlineOrderController.updateStatus,
    schema: {
      description: 'Change online order status',
      tags: ['online-orders'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.post('/:id/convert', {
    onRequest: [fastify.authenticate, fastify.authorize('online_orders:convert')],
    handler: onlineOrderController.convert,
    schema: {
      description: 'Convert an online order into a sale invoice',
      tags: ['online-orders'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('online_orders:delete')],
    handler: onlineOrderController.delete,
    schema: {
      description: 'Delete online order',
      tags: ['online-orders'],
      security: [{ bearerAuth: [] }],
    },
  });
}
