import treasuryController from '../controllers/treasuryController.js';

export default async function treasuryRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // ── Cashboxes (الصناديق) ──────────────────────────────────────────────────
  fastify.get('/cashboxes', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:read')],
    handler: treasuryController.listCashboxes.bind(treasuryController),
    schema: { description: 'List cashboxes with per-currency balances', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/cashboxes/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:read')],
    handler: treasuryController.getCashbox.bind(treasuryController),
    schema: { description: 'Get one cashbox with balances', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/cashboxes/:id/ledger', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:read')],
    handler: treasuryController.getCashboxLedger.bind(treasuryController),
    schema: { description: 'Cashbox movement ledger (كشف حركة الصندوق)', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/cashboxes', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:manage')],
    handler: treasuryController.createCashbox.bind(treasuryController),
    schema: { description: 'Create a cashbox', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.put('/cashboxes/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:manage')],
    handler: treasuryController.updateCashbox.bind(treasuryController),
    schema: { description: 'Update a cashbox', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/cashboxes/:id/set-default', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:manage')],
    handler: treasuryController.setDefaultCashbox.bind(treasuryController),
    schema: { description: 'Make this cashbox the branch default', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  // ── Bank accounts (الحسابات المصرفية) ─────────────────────────────────────
  fastify.get('/bank-accounts', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:read')],
    handler: treasuryController.listBankAccounts.bind(treasuryController),
    schema: { description: 'List bank accounts with balances', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/bank-accounts', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:manage')],
    handler: treasuryController.createBankAccount.bind(treasuryController),
    schema: { description: 'Create a bank account', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.put('/bank-accounts/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:manage')],
    handler: treasuryController.updateBankAccount.bind(treasuryController),
    schema: { description: 'Update a bank account', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  // ── Transfers (التحويلات) ─────────────────────────────────────────────────
  fastify.get('/transfers', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:read')],
    handler: treasuryController.listTransfers.bind(treasuryController),
    schema: { description: 'List treasury transfers', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/transfers', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:transfer')],
    handler: treasuryController.createTransfer.bind(treasuryController),
    schema: { description: 'Transfer money between cashboxes/bank accounts', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/transfers/:id/cancel', {
    onRequest: [fastify.authenticate, fastify.authorize('treasury:transfer')],
    handler: treasuryController.cancelTransfer.bind(treasuryController),
    schema: { description: 'Cancel a treasury transfer', tags: ['treasury'], security: [{ bearerAuth: [] }] },
  });
}
