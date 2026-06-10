import voucherController from '../controllers/voucherController.js';

export default async function voucherRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:read')],
    handler: voucherController.getAll.bind(voucherController),
    schema: { description: 'List vouchers (سندات القبض والصرف)', tags: ['vouchers'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:read')],
    handler: voucherController.getById.bind(voucherController),
    schema: { description: 'Get voucher by id', tags: ['vouchers'], security: [{ bearerAuth: [] }] },
  });

  // Receipt vouchers stay cashier-level (cashiers collect debts today);
  // payment vouchers move money OUT and require manager+.
  fastify.post('/receipt', {
    onRequest: [fastify.authenticate, fastify.authorize('vouchers:create_receipt')],
    handler: voucherController.createReceipt.bind(voucherController),
    schema: { description: 'Create a standalone receipt voucher (سند قبض)', tags: ['vouchers'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/payment', {
    onRequest: [fastify.authenticate, fastify.authorize('vouchers:create_payment')],
    handler: voucherController.createPayment.bind(voucherController),
    schema: { description: 'Create a standalone payment voucher (سند صرف)', tags: ['vouchers'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/:id/cancel', {
    onRequest: [fastify.authenticate, fastify.authorize('vouchers:cancel')],
    handler: voucherController.cancel.bind(voucherController),
    schema: { description: 'Cancel a manual voucher', tags: ['vouchers'], security: [{ bearerAuth: [] }] },
  });
}
