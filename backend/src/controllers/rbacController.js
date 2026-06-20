import rbacService from '../services/rbacService.js';

export class RbacController {
  /** Arabic permission catalog grouped by section (for the management UI). */
  async listPermissions(request, reply) {
    const data = await rbacService.listPermissions();
    return reply.send({ success: true, data });
  }

  async listRoles(request, reply) {
    await rbacService.ensureLoaded();
    const data = await rbacService.listRoles();
    return reply.send({ success: true, data });
  }

  async getRole(request, reply) {
    await rbacService.ensureLoaded();
    const data = await rbacService.getRole(request.params.id);
    return reply.send({ success: true, data });
  }

  async createRole(request, reply) {
    const data = await rbacService.createRole(request.body || {}, request.user?.id);
    return reply.code(201).send({ success: true, data, message: 'تم إنشاء الدور' });
  }

  async updateRole(request, reply) {
    const data = await rbacService.updateRole(request.params.id, request.body || {});
    return reply.send({ success: true, data, message: 'تم تحديث الدور' });
  }

  /** Replace a role's permission set (body: { permissionKeys: string[] }). */
  async setRolePermissions(request, reply) {
    const keys = Array.isArray(request.body?.permissionKeys) ? request.body.permissionKeys : [];
    const data = await rbacService.setRolePermissions(request.params.id, keys);
    return reply.send({ success: true, data, message: 'تم حفظ صلاحيات الدور' });
  }

  async deleteRole(request, reply) {
    const result = await rbacService.deleteRole(request.params.id);
    return reply.send({ success: true, message: result.message });
  }
}
