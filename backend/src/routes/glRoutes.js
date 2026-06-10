import glController from '../controllers/glController.js';

export default async function glRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // ── Chart of accounts (شجرة الحسابات) ─────────────────────────────────────
  fastify.get('/accounts', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:read')],
    handler: glController.getTree.bind(glController),
    schema: { description: 'Chart of accounts tree with live balances', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/accounts', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:manage_accounts')],
    handler: glController.createAccount.bind(glController),
    schema: { description: 'Create account', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.put('/accounts/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:manage_accounts')],
    handler: glController.updateAccount.bind(glController),
    schema: { description: 'Update account', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.delete('/accounts/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:manage_accounts')],
    handler: glController.deleteAccount.bind(glController),
    schema: { description: 'Delete account (no lines, not system)', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  // ── Templates ─────────────────────────────────────────────────────────────
  fastify.get('/templates', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:read')],
    handler: glController.listTemplates.bind(glController),
    schema: { description: 'List COA templates', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/templates/seed', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:manage_system_accounts')],
    handler: glController.seedTemplate.bind(glController),
    schema: { description: 'Seed a COA template (idempotent)', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  // ── System account mapping (ربط الحسابات) ─────────────────────────────────
  fastify.get('/system-accounts', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:read')],
    handler: glController.listSystemAccounts.bind(glController),
    schema: { description: 'List system-account mappings', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.put('/system-accounts', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:manage_system_accounts')],
    handler: glController.setSystemAccount.bind(glController),
    schema: { description: 'Map a posting key to an account', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  // ── Journal (القيود اليومية) ──────────────────────────────────────────────
  fastify.get('/journal', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:read')],
    handler: glController.listEntries.bind(glController),
    schema: { description: 'List journal entries', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/journal/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:read')],
    handler: glController.getEntry.bind(glController),
    schema: { description: 'Journal entry with lines', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/journal', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:post_manual')],
    handler: glController.createManualEntry.bind(glController),
    schema: { description: 'Create a manual journal entry (قيد يدوي)', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/journal/:id/reverse', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:post_manual')],
    handler: glController.reverseManualEntry.bind(glController),
    schema: { description: 'Reverse a manual entry', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  // ── Posting failures (إصلاح القيود) ───────────────────────────────────────
  fastify.get('/posting-failures', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:repair_postings')],
    handler: glController.listFailures.bind(glController),
    schema: { description: 'List GL posting failures', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/posting-failures/:id/repost', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:repair_postings')],
    handler: glController.repostFailure.bind(glController),
    schema: { description: 'Re-run posting for a failed document', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/posting-failures/:id/ignore', {
    onRequest: [fastify.authenticate, fastify.authorize('gl:repair_postings')],
    handler: glController.ignoreFailure.bind(glController),
    schema: { description: 'Mark a posting failure as ignored', tags: ['gl'], security: [{ bearerAuth: [] }] },
  });
}
