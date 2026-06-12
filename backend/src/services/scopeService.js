import { getDb } from '../db.js';
import { warehouses, branches } from '../models/index.js';
import { eq, and, asc } from 'drizzle-orm';
import { AuthorizationError, ValidationError } from '../utils/errors.js';
import featureFlagsService from './featureFlagsService.js';
import { ensureDefaultBranch, getDefaultBranchId } from './systemDefaultsService.js';

/**
 * Branch-aware auth scope helpers.
 *
 * - `global_admin` / legacy `admin`  → full cross-branch access, can switch context.
 * - `branch_admin`                   → bound to users.assignedBranchId.
 * - `branch_manager`                 → bound to users.assignedBranchId, but
 *                                      may switch active warehouse within it
 *                                      and update the branch default warehouse.
 * - `manager` / `cashier` / `viewer` → bound to their assigned branch (and to their
 *                                      assigned warehouse if one is set).
 *
 * When the `multiBranch` feature flag is OFF, branches are effectively a no-op:
 * everyone shares the global warehouse list and branch enforcement is skipped.
 */

const GLOBAL_ROLES = new Set(['global_admin', 'admin']);
const BRANCH_ADMIN_ROLES = new Set(['branch_admin']);
const BRANCH_MANAGER_ROLES = new Set(['branch_manager']);

export function isGlobalAdmin(user) {
  return !!user && GLOBAL_ROLES.has(user.role);
}

export function isBranchAdmin(user) {
  return !!user && BRANCH_ADMIN_ROLES.has(user.role);
}

export function isBranchManager(user) {
  return !!user && BRANCH_MANAGER_ROLES.has(user.role);
}

/**
 * Resolve the effective scope for a user. Called by authService at login and
 * anywhere the UI needs to know what the user can see and switch.
 */
export async function resolveUserScope(user) {
  if (!user) {
    return {
      role: null,
      isGlobalAdmin: false,
      isBranchAdmin: false,
      isBranchManager: false,
      branchId: null,
      warehouseId: null,
      defaultWarehouseId: null,
      hasDefaultWarehouse: false,
      allowedBranchIds: [],
      allowedWarehouseIds: [],
      canSwitchBranch: false,
      canSwitchWarehouse: false,
      branchFeatureEnabled: false,
    };
  }

  const db = await getDb();
  const flags = await featureFlagsService.getFeatureFlags();
  const branchFeatureOn = flags.multiBranch !== false;
  const global_ = isGlobalAdmin(user);

  // ── Branch feature OFF: warehouses are global ─────────────────────────────
  if (!branchFeatureOn) {
    const warehouseRows = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.isActive, true));
    const allowedWarehouseIds = warehouseRows.map((w) => w.id);
    const fixed = user.assignedWarehouseId || null;
    const visible = fixed
      ? allowedWarehouseIds.filter((id) => id === fixed)
      : allowedWarehouseIds;
    return {
      role: user.role,
      isGlobalAdmin: global_,
      isBranchAdmin: !global_ && isBranchAdmin(user),
      isBranchManager: !global_ && isBranchManager(user),
      branchId: null,
      warehouseId: fixed || visible[0] || null,
      defaultWarehouseId: null,
      hasDefaultWarehouse: false,
      allowedBranchIds: [],
      allowedWarehouseIds: visible,
      canSwitchBranch: false,
      canSwitchWarehouse: !fixed && visible.length > 1,
      branchFeatureEnabled: false,
    };
  }

  // ── Branch feature ON ─────────────────────────────────────────────────────
  if (global_) {
    const [branchRows, warehouseRows] = await Promise.all([
      db.select({ id: branches.id }).from(branches).where(eq(branches.isActive, true)),
      db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.isActive, true)),
    ]);
    return {
      role: user.role,
      isGlobalAdmin: true,
      isBranchAdmin: false,
      isBranchManager: false,
      branchId: user.assignedBranchId || null,
      warehouseId: user.assignedWarehouseId || null,
      defaultWarehouseId: null,
      hasDefaultWarehouse: false,
      allowedBranchIds: branchRows.map((b) => b.id),
      allowedWarehouseIds: warehouseRows.map((w) => w.id),
      canSwitchBranch: true,
      canSwitchWarehouse: true,
      branchFeatureEnabled: true,
    };
  }

  // Non-global users must have an assigned branch
  const branchId = user.assignedBranchId || null;
  let allowedWarehouseIds = [];
  let defaultWarehouseId = null;
  let hasDefaultWarehouse = false;

  if (branchId) {
    const [branchRow] = await db
      .select({ id: branches.id, defaultWarehouseId: branches.defaultWarehouseId })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);
    defaultWarehouseId = branchRow?.defaultWarehouseId || null;
    hasDefaultWarehouse = !!defaultWarehouseId;

    const whs = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.branchId, branchId), eq(warehouses.isActive, true)));
    allowedWarehouseIds = whs.map((w) => w.id);
  }

  // If the user has a specific warehouse assignment, lock them to it.
  const fixedWarehouseId = user.assignedWarehouseId || null;
  const visibleWarehouseIds = fixedWarehouseId
    ? allowedWarehouseIds.filter((id) => id === fixedWarehouseId)
    : allowedWarehouseIds;

  // Pick the active warehouse: explicit user assignment > branch default >
  // first allowed. Default may be invalid (deleted, disabled, moved to a
  // different branch) — in that case fall through to the first allowed.
  let activeWarehouseId = fixedWarehouseId;
  if (!activeWarehouseId && defaultWarehouseId && visibleWarehouseIds.includes(defaultWarehouseId)) {
    activeWarehouseId = defaultWarehouseId;
  }
  if (!activeWarehouseId) activeWarehouseId = visibleWarehouseIds[0] || null;

  return {
    role: user.role,
    isGlobalAdmin: false,
    isBranchAdmin: isBranchAdmin(user),
    isBranchManager: isBranchManager(user),
    branchId,
    warehouseId: activeWarehouseId,
    defaultWarehouseId,
    hasDefaultWarehouse,
    allowedBranchIds: branchId ? [branchId] : [],
    allowedWarehouseIds: visibleWarehouseIds,
    canSwitchBranch: false,
    // A user with only one visible warehouse has nothing to switch between.
    canSwitchWarehouse: !fixedWarehouseId && visibleWarehouseIds.length > 1,
    branchFeatureEnabled: true,
  };
}

/**
 * Whether a user may target a branch OTHER than the one assigned to their
 * account. Today only global admins switch branch context; branch-bound users
 * (branch_admin / branch_manager / manager / cashier / viewer) are always
 * pinned to `assignedBranchId`. Kept as a named helper so the rule lives in one
 * place and can be widened later (e.g. a "regional manager" capability).
 */
export function canSwitchBranch(user) {
  return isGlobalAdmin(user);
}

/**
 * Pick a usable DEFAULT *active* branch, in precedence order:
 *   1. the system default (oldest) branch, if it's active;
 *   2. otherwise the first active branch (lowest id);
 *   3. otherwise (ensure only) create the main branch "الفرع الرئيسي".
 * Returns null when nothing active exists and `ensure` is false.
 */
async function resolveDefaultActiveBranchId(db, { ensure = true } = {}) {
  const defId = await getDefaultBranchId(db);
  if (defId) {
    const [row] = await db
      .select({ id: branches.id, isActive: branches.isActive })
      .from(branches)
      .where(eq(branches.id, defId))
      .limit(1);
    if (row && row.isActive !== false) return row.id;
  }

  const [active] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.id))
    .limit(1);
  if (active) return active.id;

  if (ensure) return ensureDefaultBranch(db);
  return null;
}

/**
 * THE single source of truth for "which branch does a new operation bind to".
 *
 * Use this for opening shifts, sales, returns, expenses, inventory moves,
 * transfers and report scoping — NEVER re-derive branch selection inside a
 * controller. It both RESOLVES and VALIDATES the branch so callers can `insert`
 * with confidence (a bad/inactive/foreign branch surfaces a clear localized
 * error instead of a downstream FK `DatabaseError`).
 *
 * Rules (see the shift-permissions / branch-selection spec):
 *   multiBranch OFF:
 *     - Branch selection is hidden; the system default branch ("الفرع الرئيسي")
 *       is used for EVERYTHING. Any requested/assigned/localStorage branch is
 *       ignored. `ensure:true` creates the default on demand.
 *   multiBranch ON:
 *     - User CAN switch branch (global admin) → requested branch (must exist &
 *       be active) → otherwise the default active branch.
 *     - User CANNOT switch (branch-bound) → their assigned branch (must exist &
 *       be active). A mismatched explicit request is rejected.
 *
 * @param {object|null} user            acting user (reads role + assignedBranchId)
 * @param {number|string|null} requestedBranchId  branch sent by the client (only honored for switchers)
 * @param {{ensure?: boolean}} options  ensure:true (default) creates the default branch when needed
 * @returns {Promise<number|null>} a validated branch id (null only when ensure:false and none exists)
 */
export async function resolveBranchIdForOperation(user, requestedBranchId = null, { ensure = true } = {}) {
  const db = await getDb();
  const flags = await featureFlagsService.getFeatureFlags();
  const branchesEnabled = flags.multiBranch !== false;

  // ── Branches OFF: always the internal default; ignore requested/assigned. ──
  if (!branchesEnabled) {
    let id = await getDefaultBranchId(db);
    if (!id && ensure) id = await ensureDefaultBranch(db);
    if (!id) {
      if (!ensure) return null;
      const err = new ValidationError('لا يوجد فرع افتراضي للنظام. يرجى إعداد فرع افتراضي أولاً.');
      err.code = 'NO_EFFECTIVE_BRANCH';
      err.statusCode = 422;
      throw err;
    }
    return id;
  }

  // ── Branches ON, user may switch branch (global admin) ─────────────────────
  if (canSwitchBranch(user)) {
    if (!requestedBranchId) {
      const def = await resolveDefaultActiveBranchId(db, { ensure });
      if (!def) {
        if (!ensure) return null;
        const err = new ValidationError('لا يوجد فرع نشط في النظام. يرجى إنشاء فرع أولاً.');
        err.code = 'NO_EFFECTIVE_BRANCH';
        err.statusCode = 422;
        throw err;
      }
      return def;
    }
    const [row] = await db
      .select({ id: branches.id, isActive: branches.isActive })
      .from(branches)
      .where(eq(branches.id, Number(requestedBranchId)))
      .limit(1);
    if (!row) throw new ValidationError('الفرع المحدد غير موجود');
    if (row.isActive === false) throw new ValidationError('الفرع المحدد غير نشط');
    return row.id;
  }

  // ── Branches ON, branch-bound user → their assigned branch only ────────────
  const assigned = user?.assignedBranchId ? Number(user.assignedBranchId) : null;
  if (!assigned) {
    throw new AuthorizationError('لا يوجد فرع صالح مرتبط بحسابك. يرجى مراجعة المدير.');
  }
  if (requestedBranchId && Number(requestedBranchId) !== assigned) {
    throw new AuthorizationError('لا يمكنك تنفيذ العملية على فرع آخر');
  }
  const [row] = await db
    .select({ id: branches.id, isActive: branches.isActive })
    .from(branches)
    .where(eq(branches.id, assigned))
    .limit(1);
  if (!row || row.isActive === false) {
    throw new AuthorizationError('لا يوجد فرع صالح مرتبط بحسابك. يرجى مراجعة المدير.');
  }
  return row.id;
}

/**
 * Backward-compatible shim around {@link resolveBranchIdForOperation}. Existing
 * callers (accounting periods, cash sessions) keep the `{ user, requestedBranchId,
 * ensure }` object signature; new code should call resolveBranchIdForOperation
 * directly.
 */
export async function resolveEffectiveBranchId({ user = null, requestedBranchId = null, ensure = false } = {}) {
  return resolveBranchIdForOperation(user, requestedBranchId, { ensure });
}

/**
 * Throw if the given user cannot access a resource in the given branch.
 * Global admins and resources without a branchId pass through.
 *
 * NOTE: kept synchronous so existing controllers don't need to be rewritten.
 * When the multi-branch feature is OFF, resources are not expected to carry
 * a meaningful branchId (writes set it to null) so this check is effectively
 * a no-op anyway. Use {@link enforceWarehouseScope} for the warehouse-aware
 * variant that consults feature flags.
 */
export function enforceBranchScope(user, resourceBranchId) {
  if (isGlobalAdmin(user)) return;
  if (!resourceBranchId) return; // legacy rows without a branch — let them through
  if (!user?.assignedBranchId) {
    throw new AuthorizationError('User has no branch assigned');
  }
  if (Number(user.assignedBranchId) !== Number(resourceBranchId)) {
    throw new AuthorizationError('Resource belongs to a different branch');
  }
}

/**
 * Throw unless the user is allowed to act on `warehouseId`.
 */
export async function enforceWarehouseScope(user, warehouseId) {
  if (isGlobalAdmin(user)) return;
  if (!warehouseId) return;

  const db = await getDb();
  const [wh] = await db
    .select({ id: warehouses.id, branchId: warehouses.branchId })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .limit(1);
  if (!wh) throw new AuthorizationError('Warehouse not found');

  // Skip branch check when the multi-branch feature is off — warehouses are
  // global and any allowed user can act on any of them.
  const flags = await featureFlagsService.getFeatureFlags();
  if (flags.multiBranch !== false) {
    enforceBranchScope(user, wh.branchId);
  }

  // Fixed-warehouse users are locked to their one warehouse, even when the
  // multi-branch feature is off.
  if (user?.assignedWarehouseId && Number(user.assignedWarehouseId) !== Number(warehouseId)) {
    throw new AuthorizationError('User is restricted to a different warehouse');
  }
}

export async function getAllowedWarehouseIds(user) {
  const scope = await resolveUserScope(user);
  return scope.allowedWarehouseIds;
}

/**
 * Resolve the branch a resource inherits from a warehouse id. Handy for sale
 * creation when the caller only passes warehouseId.
 */
export async function getBranchIdForWarehouse(warehouseId) {
  if (!warehouseId) return null;
  const db = await getDb();
  const [wh] = await db
    .select({ branchId: warehouses.branchId })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .limit(1);
  return wh?.branchId || null;
}

/**
 * Filter-helper for Drizzle `where` clauses: returns the branch id list a user
 * is allowed to see, or null when the user is global (no filtering needed).
 *
 * NOTE: this helper is synchronous and therefore can't read feature flags.
 * Callers that need feature-flag-aware filtering must check the flag and skip
 * branch filtering when it's off.
 */
export function branchFilterFor(user) {
  if (isGlobalAdmin(user)) return null;
  if (!user?.assignedBranchId) return [];
  return [user.assignedBranchId];
}

export default {
  isGlobalAdmin,
  isBranchAdmin,
  isBranchManager,
  resolveUserScope,
  canSwitchBranch,
  resolveBranchIdForOperation,
  resolveEffectiveBranchId,
  enforceBranchScope,
  enforceWarehouseScope,
  getAllowedWarehouseIds,
  getBranchIdForWarehouse,
  branchFilterFor,
};
