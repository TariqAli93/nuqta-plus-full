import { getDb, saveDatabase } from '../db.js';
import { users, branches, warehouses, userBranches } from '../models/index.js';
import { eq, like, and, sql, desc, inArray } from 'drizzle-orm';
import { hashPassword } from '../utils/helpers.js';
import { NotFoundError, ConflictError, ValidationError, AuthorizationError } from '../utils/errors.js';
import rbacService from './rbacService.js';
import { effectiveBranchIds, isGlobalAdmin } from './scopeService.js';

const GLOBAL_ROLES = new Set(['admin', 'global_admin']);

/**
 * Normalise the requested branch assignment into a {primary, branchIds} pair.
 *
 * Accepts either the new `branchIds` array (many-to-many) and/or the legacy
 * `assignedBranchId` scalar, and reconciles them:
 *   - branchIds is the full allowed set; assignedBranchId (when given and in the
 *     set, else the first id) is the primary/default branch.
 *   - When only assignedBranchId is given, the set is just that one branch
 *     (identical to the legacy single-branch behaviour).
 *
 * `current` supplies the existing values on update so a partial payload (e.g.
 * editing only the role) keeps the user's branches untouched.
 */
function resolveBranchAssignment(data, current = {}) {
  const hasBranchIds = Array.isArray(data.branchIds);
  const hasAssigned = 'assignedBranchId' in data;

  // Nothing about branches in this payload → keep what's already there.
  if (!hasBranchIds && !hasAssigned) {
    return {
      primary: current.assignedBranchId ?? null,
      branchIds: current.branchIds ?? (current.assignedBranchId ? [current.assignedBranchId] : []),
      touched: false,
    };
  }

  let set = hasBranchIds ? data.branchIds.map(Number).filter(Boolean) : [];
  const assigned = hasAssigned && data.assignedBranchId ? Number(data.assignedBranchId) : null;
  if (assigned && !set.includes(assigned)) set = [assigned, ...set];
  set = [...new Set(set)];

  const primary = assigned && set.includes(assigned) ? assigned : set[0] ?? null;
  return { primary, branchIds: set, touched: true };
}

/**
 * Validate a role code against the dynamic RBAC roles table — NOT a static enum.
 * Accepts any role that exists AND is active; rejects unknown or deactivated
 * roles with a clear Arabic message. Called whenever a user's role is set.
 */
async function validateRole(roleCode) {
  const role = await rbacService.getRoleByCode(roleCode);
  if (!role || role.isActive === false) {
    throw new ValidationError('الدور المحدد غير موجود أو غير فعّال');
  }
}

/**
 * Ensure a non-global role has at least one valid assigned branch, that every
 * branch in the set exists, and (optionally) that the assigned warehouse lives
 * in one of those branches. Throws ValidationError on bad combinations.
 */
async function validateAssignment(db, { role, primary, branchIds, assignedWarehouseId }) {
  if (GLOBAL_ROLES.has(role)) return; // admins are allowed to roam

  if (!primary || !branchIds.length) {
    throw new ValidationError('Non-admin users must be assigned to a branch');
  }

  const found = await db
    .select({ id: branches.id })
    .from(branches)
    .where(inArray(branches.id, branchIds));
  const foundIds = new Set(found.map((b) => b.id));
  const missing = branchIds.filter((id) => !foundIds.has(id));
  if (missing.length) throw new ValidationError('Assigned branch not found');

  if (assignedWarehouseId) {
    const [wh] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, assignedWarehouseId))
      .limit(1);
    if (!wh) throw new ValidationError('Assigned warehouse not found');
    if (!branchIds.includes(Number(wh.branchId))) {
      throw new ValidationError('Assigned warehouse does not belong to assigned branch');
    }
  }
}

/**
 * Enforce WHO may grant WHICH branches. A global admin may assign any branches.
 * A branch-bound manager/admin may only assign branches that are within their
 * OWN assigned set — they can never grant access to a branch they don't hold.
 */
function authorizeBranchAssignment(actingUser, branchIds) {
  if (!actingUser || isGlobalAdmin(actingUser)) return;
  const own = effectiveBranchIds(actingUser);
  const outside = branchIds.filter((id) => !own.includes(Number(id)));
  if (outside.length) {
    throw new AuthorizationError('لا يمكنك تعيين فروع خارج نطاق صلاحيتك');
  }
}

/**
 * Replace a user's branch membership with exactly `branchIds`: drop rows no
 * longer in the set and insert the new ones (idempotent, no-op on a match).
 */
async function syncUserBranches(db, userId, branchIds) {
  const desired = [...new Set(branchIds.map(Number).filter(Boolean))];
  const existing = await db
    .select({ branchId: userBranches.branchId })
    .from(userBranches)
    .where(eq(userBranches.userId, userId));
  const have = new Set(existing.map((r) => Number(r.branchId)));

  const toAdd = desired.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !desired.includes(id));

  if (toRemove.length) {
    await db
      .delete(userBranches)
      .where(and(eq(userBranches.userId, userId), inArray(userBranches.branchId, toRemove)));
  }
  if (toAdd.length) {
    await db.insert(userBranches).values(toAdd.map((branchId) => ({ userId, branchId })));
  }
}

export class UserService {
  async list({ page = 1, limit = 10, search, role, isActive, branchId }, actingUser = null) {
    const db = await getDb();
    let where;
    if (search) {
      where = like(users.username, `%${search}%`);
    }
    if (typeof role !== 'undefined') {
      where = where ? and(where, eq(users.role, role)) : eq(users.role, role);
    }
    if (typeof isActive !== 'undefined') {
      where = where ? and(where, eq(users.isActive, !!isActive)) : eq(users.isActive, !!isActive);
    }

    // Branch-bound admins/managers can only list users in branches they're
    // assigned to (many-to-many); a global admin sees everyone. An explicit
    // branchId query param narrows further (and must stay within the allowed
    // set for non-globals).
    const restricted = actingUser && !GLOBAL_ROLES.has(actingUser.role);
    let branchCond = null; // array of allowed branch ids, or null = unrestricted
    if (restricted) {
      const own = effectiveBranchIds(actingUser);
      branchCond = branchId ? own.filter((id) => id === Number(branchId)) : own;
      // A restricted user with no branches sees nobody.
      if (!branchCond.length) branchCond = [-1];
    } else if (branchId) {
      branchCond = [Number(branchId)];
    }
    if (branchCond) {
      const cond = inArray(users.assignedBranchId, branchCond);
      where = where ? and(where, cond) : cond;
    }

    // Use SQL LIMIT/OFFSET for efficient pagination
    const offset = (page - 1) * limit;
    const data = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        phone: users.phone,
        isActive: users.isActive,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        assignedWarehouseId: users.assignedWarehouseId,
      })
      .from(users)
      .where(where)
      // Newest first — deterministic ordering so a just-created user always
      // lands at the top of page 1 (without an ORDER BY, pagination could push
      // the newest row onto a later page and it would seem to "disappear").
      .orderBy(desc(users.id))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination metadata
    let countQuery = db.select({ count: sql`count(*)` }).from(users);
    if (where) {
      countQuery = countQuery.where(where);
    }
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async getById(id) {
    const db = await getDb();
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        phone: users.phone,
        isActive: users.isActive,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        assignedWarehouseId: users.assignedWarehouseId,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) throw new NotFoundError('User');

    // Attach the full many-to-many branch set so the UI can pre-fill the
    // multi-branch picker. Falls back to the primary branch when no join rows
    // exist yet (legacy/single-branch users).
    const rows = await db
      .select({ branchId: userBranches.branchId })
      .from(userBranches)
      .where(eq(userBranches.userId, id));
    let branchIds = rows.map((r) => Number(r.branchId));
    if (!branchIds.length && user.assignedBranchId) branchIds = [Number(user.assignedBranchId)];
    user.branchIds = branchIds;
    return user;
  }

  async create(data, actingUser = null) {
    const db = await getDb();
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.username, data.username))
      .limit(1);
    if (existing) throw new ConflictError('Username already exists');

    const role = data.role || 'cashier';

    // Role must exist and be active in the dynamic RBAC roles table.
    await validateRole(role);

    const { primary, branchIds } = resolveBranchAssignment(data);
    authorizeBranchAssignment(actingUser, branchIds);

    await validateAssignment(db, {
      role,
      primary,
      branchIds,
      assignedWarehouseId: data.assignedWarehouseId,
    });

    const hashed = await hashPassword(data.password);
    const [user] = await db
      .insert(users)
      .values({
        username: data.username,
        password: hashed,
        fullName: data.fullName,
        phone: data.phone,
        role,
        assignedBranchId: primary || null,
        assignedWarehouseId: data.assignedWarehouseId || null,
        isActive: true,
      })
      .returning();

    // Global roles roam (no branch binding); branch-bound roles get their full
    // assigned set written to the join table.
    await syncUserBranches(db, user.id, GLOBAL_ROLES.has(role) ? [] : branchIds);

    saveDatabase();

    return this.getById(user.id);
  }

  async update(id, data, actingUser = null) {
    const db = await getDb();
    const existing = await this.getById(id);

    // Build update object with only provided fields
    const updateData = {
      updatedAt: new Date(),
    };

    if (data.fullName !== undefined) {
      updateData.fullName = data.fullName;
    }
    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }
    if (data.role !== undefined) {
      // Only validate when the role is actually being (re)assigned, so editing
      // other fields of a user whose role was later deactivated still works.
      await validateRole(data.role);
      updateData.role = data.role;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    if (data.assignedWarehouseId !== undefined) {
      updateData.assignedWarehouseId = data.assignedWarehouseId || null;
    }

    // Reconcile the branch assignment (many-to-many). A partial payload that
    // doesn't mention branches leaves the user's branches untouched.
    const assignment = resolveBranchAssignment(data, {
      assignedBranchId: existing.assignedBranchId,
      branchIds: existing.branchIds,
    });
    if (assignment.touched) {
      authorizeBranchAssignment(actingUser, assignment.branchIds);
      updateData.assignedBranchId = assignment.primary || null;
    }

    // Validate the resulting (role, branch, warehouse) combination.
    const nextRole = updateData.role || existing.role;
    const nextWarehouse =
      'assignedWarehouseId' in updateData
        ? updateData.assignedWarehouseId
        : existing.assignedWarehouseId;
    await validateAssignment(db, {
      role: nextRole,
      primary: assignment.primary,
      branchIds: assignment.branchIds,
      assignedWarehouseId: nextWarehouse,
    });

    await db.update(users).set(updateData).where(eq(users.id, id));

    // Keep the join table in sync. When the user is (now) a global role, clear
    // their branch bindings; otherwise mirror the resolved set. Only rewrite
    // when branches were actually part of this update OR the role changed.
    const becameGlobal = GLOBAL_ROLES.has(nextRole);
    if (assignment.touched || data.role !== undefined) {
      await syncUserBranches(db, id, becameGlobal ? [] : assignment.branchIds);
    }

    saveDatabase();

    return this.getById(id);
  }

  async resetPassword(id, newPassword, _actorId) {
    const db = await getDb();
    await this.getById(id);
    const hashed = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(users.id, id));

    saveDatabase();
    return { success: true };
  }

  async remove(id, actorId) {
    const db = await getDb();

    // Prevent users from deleting themselves
    if (Number(id) === Number(actorId)) {
      throw new ConflictError('Cannot deactivate your own account');
    }

    const userToDelete = await this.getById(id);

    // Prevent deleting the last admin user
    if (userToDelete.role === 'admin' && userToDelete.isActive) {
      const [adminCount] = await db
        .select({ count: sql`count(*)` })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.isActive, true)));

      const totalAdmins = Number(adminCount?.count || 0);
      if (totalAdmins <= 1) {
        throw new ConflictError('Cannot deactivate the last admin user');
      }
    }

    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id));

    saveDatabase();
    return { success: true };
  }

  async checkFirstUser() {
    const db = await getDb();
    const count = await db.select().from(users).limit(1);
    return count.length > 0;
  }
}
