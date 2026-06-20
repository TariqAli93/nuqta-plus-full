import { RbacController } from '../controllers/rbacController.js';

const c = new RbacController();

export default async function rbacRoutes(fastify) {
  const read = { onRequest: [fastify.authenticate, fastify.authorize('roles:read')] };
  const manage = { onRequest: [fastify.authenticate, fastify.authorize('roles:manage')] };
  const tag = { tags: ['rbac'], security: [{ bearerAuth: [] }] };

  fastify.get('/permissions', { ...read, handler: c.listPermissions,
    schema: { description: 'Arabic permission catalog (grouped)', ...tag } });

  fastify.get('/roles', { ...read, handler: c.listRoles,
    schema: { description: 'List roles', ...tag } });
  fastify.get('/roles/:id', { ...read, handler: c.getRole,
    schema: { description: 'Get a role + its permission keys', ...tag } });

  fastify.post('/roles', { ...manage, handler: c.createRole,
    schema: { description: 'Create a role', ...tag } });
  fastify.put('/roles/:id', { ...manage, handler: c.updateRole,
    schema: { description: 'Update a role (name/description/scope)', ...tag } });
  fastify.put('/roles/:id/permissions', { ...manage, handler: c.setRolePermissions,
    schema: { description: 'Replace a role permission set', ...tag } });
  fastify.delete('/roles/:id', { ...manage, handler: c.deleteRole,
    schema: { description: 'Delete a (non-system, unused) role', ...tag } });
}
