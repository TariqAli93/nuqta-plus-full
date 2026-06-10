import supplierController from '../controllers/supplierController.js';

export default async function supplierRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:read')],
    handler: supplierController.getAll.bind(supplierController),
    schema: { description: 'List suppliers (الموردون)', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:read')],
    handler: supplierController.getById.bind(supplierController),
    schema: { description: 'Get supplier by id', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/:id/debts', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:read')],
    handler: supplierController.getDebts.bind(supplierController),
    schema: { description: 'Open AP invoices for the supplier', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/:id/statement', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:read')],
    handler: supplierController.getStatement.bind(supplierController),
    schema: { description: 'Supplier statement (كشف حساب المورد)', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });

  fastify.get('/:id/products', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:read')],
    handler: supplierController.getProducts.bind(supplierController),
    schema: { description: 'Products linked to the supplier', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });

  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:create')],
    handler: supplierController.create.bind(supplierController),
    schema: { description: 'Create supplier', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });

  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:update')],
    handler: supplierController.update.bind(supplierController),
    schema: { description: 'Update supplier', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });

  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('suppliers:delete')],
    handler: supplierController.delete.bind(supplierController),
    schema: { description: 'Delete (or deactivate) supplier', tags: ['suppliers'], security: [{ bearerAuth: [] }] },
  });
}
