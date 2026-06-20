import { SalesChannelController } from '../controllers/salesChannelController.js';

const salesChannelController = new SalesChannelController();

export default async function salesChannelRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.authorize('sales_channels:create')],
    handler: salesChannelController.create,
    schema: {
      description: 'Create new sales channel',
      tags: ['sales-channels'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.authorize('sales_channels:read')],
    handler: salesChannelController.getAll,
    schema: {
      description: 'Get all sales channels',
      tags: ['sales-channels'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('sales_channels:read')],
    handler: salesChannelController.getById,
    schema: {
      description: 'Get sales channel by ID',
      tags: ['sales-channels'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('sales_channels:update')],
    handler: salesChannelController.update,
    schema: {
      description: 'Update sales channel',
      tags: ['sales-channels'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('sales_channels:delete')],
    handler: salesChannelController.delete,
    schema: {
      description: 'Delete sales channel',
      tags: ['sales-channels'],
      security: [{ bearerAuth: [] }],
    },
  });
}
