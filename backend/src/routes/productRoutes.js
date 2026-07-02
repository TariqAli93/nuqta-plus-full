import { ProductController } from '../controllers/productController.js';

const productController = new ProductController();

export default async function productRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.authorize('products:create')],
    handler: productController.create,
    schema: {
      description: 'Create new product',
      tags: ['products'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.authorize('products:read')],
    handler: productController.getAll,
    schema: {
      description: 'Get all products (ranked search + filters)',
      tags: ['products'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          // Hard ceiling: the list screen uses 25; POS / sale-form deliberately
          // pull the full catalogue at 1000. Cap at 2000 so a legit 1000 still
          // works but a pathological "give me everything" (was 1,000,000) can't
          // sequential-scan the whole table in one request.
          limit: { type: 'integer', minimum: 1, maximum: 2000, default: 25 },
          categoryId: { type: 'integer' },
          warehouseId: { type: 'integer' },
          status: { type: 'string' },
          productType: { type: 'string', enum: ['inventory', 'service'] },
          unit: { type: 'string' },
          minPrice: { type: 'number', minimum: 0 },
          maxPrice: { type: 'number', minimum: 0 },
        },
      },
    },
  });

  fastify.get('/low-stock', {
    onRequest: [fastify.authenticate, fastify.authorize('products:read')],
    handler: productController.getLowStock,
    schema: {
      description: 'Get low stock products',
      tags: ['products'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('products:read')],
    handler: productController.getById,
    schema: {
      description: 'Get product by ID',
      tags: ['products'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('products:update')],
    handler: productController.update,
    schema: {
      description: 'Update product',
      tags: ['products'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.authorize('products:delete')],
    handler: productController.delete,
    schema: {
      description: 'Delete product',
      tags: ['products'],
      security: [{ bearerAuth: [] }],
    },
  });
}
