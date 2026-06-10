import openingBalanceController from '../controllers/openingBalanceController.js';

export default async function openingBalanceRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  const guard = 'opening_balances:manage';

  fastify.get('/status', {
    onRequest: [fastify.authenticate, fastify.authorize(guard)],
    handler: openingBalanceController.status.bind(openingBalanceController),
    schema: { description: 'Opening-balance wizard status', tags: ['opening-balances'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/customer', {
    onRequest: [fastify.authenticate, fastify.authorize(guard)],
    handler: openingBalanceController.createCustomerOpening.bind(openingBalanceController),
    schema: { description: 'Record a customer opening debt', tags: ['opening-balances'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/supplier', {
    onRequest: [fastify.authenticate, fastify.authorize(guard)],
    handler: openingBalanceController.createSupplierOpening.bind(openingBalanceController),
    schema: { description: 'Record a supplier opening balance', tags: ['opening-balances'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/generate-entry', {
    onRequest: [fastify.authenticate, fastify.authorize(guard)],
    handler: openingBalanceController.generateEntry.bind(openingBalanceController),
    schema: { description: 'Generate the opening journal entry (قيد افتتاحي)', tags: ['opening-balances'], security: [{ bearerAuth: [] }] },
  });
}
