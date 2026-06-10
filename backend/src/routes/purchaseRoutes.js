import purchaseController from '../controllers/purchaseController.js';

export default async function purchaseRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.authorize('purchases:read')],
    handler: purchaseController.getAll.bind(purchaseController),
    schema: { description: 'List purchase invoices (فواتير الشراء)', tags: ['purchases'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('purchases:read')],
    handler: purchaseController.getById.bind(purchaseController),
    schema: { description: 'Get purchase invoice with items/returns/vouchers', tags: ['purchases'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.authorize('purchases:create')],
    handler: purchaseController.create.bind(purchaseController),
    schema: { description: 'Create + receive a purchase invoice', tags: ['purchases'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/:id/payments', {
    onRequest: [fastify.authenticate, fastify.authorize('vouchers:create_payment')],
    handler: purchaseController.addPayment.bind(purchaseController),
    schema: { description: 'Pay the supplier against an open invoice', tags: ['purchases'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/:id/returns', {
    onRequest: [fastify.authenticate, fastify.authorize('purchases:return')],
    handler: purchaseController.createReturn.bind(purchaseController),
    schema: { description: 'Return goods to the supplier (مرتجع شراء)', tags: ['purchases'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/:id/cancel', {
    onRequest: [fastify.authenticate, fastify.authorize('purchases:cancel')],
    handler: purchaseController.cancel.bind(purchaseController),
    schema: { description: 'Cancel a purchase invoice (stock untouched only)', tags: ['purchases'], security: [{ bearerAuth: [] }] },
  });
}
