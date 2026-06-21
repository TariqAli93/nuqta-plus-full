import recurringExpensesController from '../controllers/recurringExpensesController.js';

export default async function recurringExpensesRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.authorize('recurring_expenses:create')],
    handler: recurringExpensesController.create.bind(recurringExpensesController),
    schema: {
      description: 'Create a recurring (fixed) expense template',
      tags: ['recurring-expenses'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.authorize('recurring_expenses:read')],
    handler: recurringExpensesController.getAll.bind(recurringExpensesController),
    schema: {
      description: 'List recurring expense templates (branch-scoped)',
      tags: ['recurring-expenses'],
      security: [{ bearerAuth: [] }],
    },
  });

  // Manual catch-up trigger — same scope as create.
  fastify.post('/run', {
    onRequest: [fastify.authenticate, fastify.authorize('recurring_expenses:create')],
    handler: recurringExpensesController.runNow.bind(recurringExpensesController),
    schema: {
      description: 'Run the due-expense generation now (catch-up)',
      tags: ['recurring-expenses'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('recurring_expenses:read')],
    handler: recurringExpensesController.getById.bind(recurringExpensesController),
    schema: {
      description: 'Get a recurring expense template by id',
      tags: ['recurring-expenses'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('recurring_expenses:update')],
    handler: recurringExpensesController.update.bind(recurringExpensesController),
    schema: {
      description: 'Update a recurring expense template',
      tags: ['recurring-expenses'],
      security: [{ bearerAuth: [] }],
    },
  });

  // Pause/resume (إيقاف مؤقت) without deleting.
  fastify.patch('/:id/active', {
    onRequest: [fastify.authenticate, fastify.authorize('recurring_expenses:update')],
    handler: recurringExpensesController.setActive.bind(recurringExpensesController),
    schema: {
      description: 'Activate or pause a recurring expense template',
      tags: ['recurring-expenses'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('recurring_expenses:delete')],
    handler: recurringExpensesController.delete.bind(recurringExpensesController),
    schema: {
      description: 'Delete a recurring expense template (generated expenses are preserved)',
      tags: ['recurring-expenses'],
      security: [{ bearerAuth: [] }],
    },
  });
}
