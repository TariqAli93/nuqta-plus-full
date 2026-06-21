import { UserService } from '../services/userService.js';
import { z } from 'zod';

const userService = new UserService();

// Role is a dynamic RBAC code (table `roles`), not a fixed enum. The shape is
// validated here; existence + active status are enforced in userService against
// the DB, so any active role added on the Roles & permissions page is accepted.
const ROLE_CODE = z.string().trim().min(1, 'الدور مطلوب');

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  role: ROLE_CODE.default('cashier'),
  assignedBranchId: z.union([z.number().int().positive(), z.null()]).optional(),
  // Many-to-many branch assignment. First entry (or assignedBranchId) is the
  // primary branch; omit for single-branch behaviour.
  branchIds: z.array(z.number().int().positive()).optional(),
  assignedWarehouseId: z.union([z.number().int().positive(), z.null()]).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: ROLE_CODE.optional(),
  isActive: z.boolean().optional(),
  assignedBranchId: z.union([z.number().int().positive(), z.null()]).optional(),
  branchIds: z.array(z.number().int().positive()).optional(),
  assignedWarehouseId: z.union([z.number().int().positive(), z.null()]).optional(),
});

export class UserController {
  async list(request, reply) {
    const { page = 1, limit = 10, search, role, isActive, branchId } = request.query || {};
    const result = await userService.list(
      {
        page: Number(page),
        limit: Number(limit),
        search,
        role: role || undefined,
        isActive: typeof isActive !== 'undefined' ? isActive === 'true' : undefined,
        branchId: branchId ? Number(branchId) : undefined,
      },
      request.user
    );
    return reply.send({ success: true, data: result });
  }

  async getById(request, reply) {
    const { id } = request.params;
    const user = await userService.getById(Number(id));
    return reply.send({ success: true, data: user });
  }

  async create(request, reply) {
    const data = createUserSchema.parse(request.body);
    const user = await userService.create(data, request.user);
    return reply.code(201).send({ success: true, data: user, message: 'User created' });
  }

  async update(request, reply) {
    const { id } = request.params;
    const data = updateUserSchema.parse(request.body);
    const user = await userService.update(Number(id), data, request.user);
    return reply.send({ success: true, data: user, message: 'User updated' });
  }

  async resetPassword(request, reply) {
    const { id } = request.params;
    const { password } = request.body || {};
    const result = await userService.resetPassword(Number(id), password, request.user.id);
    return reply.send({ success: true, data: result, message: 'Password reset' });
  }

  async remove(request, reply) {
    const { id } = request.params;
    const result = await userService.remove(Number(id), request.user.id);
    return reply.send({ success: true, data: result, message: 'User deactivated' });
  }

  async checkFirstUser(request, reply) {
    try {
      const exists = await userService.checkFirstUser();
      return reply.send({ success: true, data: { exists } });
    } catch (error) {
      return reply.send({ success: false, message: error.message });
    }
  }
}
