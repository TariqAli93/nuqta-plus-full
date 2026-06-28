import { CollectionsController } from '../controllers/collectionsController.js';

const collectionsController = new CollectionsController();

/**
 * Collections workspace routes. Mounted under /api/collections.
 *
 * Read-only aggregations on top of installments + installment_actions.
 * Branch scope is enforced inside the service via branchFilterFor(user).
 */
export default async function collectionsRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/overdue', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: collectionsController.overdue,
    schema: {
      description: 'List overdue installments for the current branch scope',
      tags: ['collections'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          branchId: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          agingBucket: { type: 'string', enum: ['1-7', '8-30', '31-60', '60+'] },
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 50 },
        },
      },
    },
  });

  fastify.get('/installments', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: collectionsController.installments,
    schema: {
      description: 'Unified installments list for the collections workspace (read-only)',
      tags: ['collections'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['all', 'due_today', 'overdue', 'due_7d', 'paid', 'unpaid'],
            default: 'all',
          },
          search: { type: 'string' },
          branchId: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 25 },
        },
      },
    },
  });

  fastify.get('/stats', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: collectionsController.stats,
    schema: {
      description: 'Collections summary stats (counts + per-currency totals)',
      tags: ['collections'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          branchId: { type: 'number' },
        },
      },
    },
  });

  fastify.get('/customer/:customerId', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: collectionsController.customerHistory,
    schema: {
      description: 'List collection actions for all installments of a customer',
      tags: ['collections'],
      security: [{ bearerAuth: [] }],
    },
  });
}
