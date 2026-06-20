import { getDb } from '../db.js';
import { warehouses, branches, userBranches } from '../models/index.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { AuthorizationError, ValidationError } from '../utils/errors.js';
import featureFlagsService from './featureFlagsService.js';
import { ensureDefaultBranch, getDefaultBranchId } from './systemDefaultsService.js';

/**
 * Branch-aware auth scope helpers.
 *
 * - `global_admin` / legacy `admin`  → full cross-branch access, can switch context.
 * - `branch_admin` / `branch_manager` / `manager` / `cashier` / `viewer`
 *      → bound to the SET of branches assigned to them (many-to-many, via the
 *        user_branches join table). A user with one branch behaves exactly like
 *        the legacy single-branch model; a user with several may view/act on ALL
 *        of them and switch the active branch between them. `assignedBranchId`
 *        is the PRIMARY branch that new operations default to.
 *        branch_manager additionally may switch active warehouse and set the
 *        branch default warehouse; a fixed `assignedWarehouseId` still locks the
 *        user to one warehouse.
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
 * The branch ids a (non-global) user is allowed to act on, derived SYNCHRONOUSLY
 * from the user object. Prefers `user.allowedBranchIds` (attached at auth time
 * from the user_branches join table); falls back to the single primary
 * `assignedBranchId` when the list isn't attached — so any acting-user object
 * built without the join-table load still scopes correctly to its one branch
 * (identical to the legacy single-branch behaviour).
 *
 * Global admins are unrestricted — callers must check `isGlobalAdmin` first;
 * this returns the EXPLICIT list regardless of role.
 */
export function effectiveBranchIds(user) {
  if (Array.isArray(user?.allowedBranchIds)) {
    const ids = [...new Set(user.allowedBranchIds.map(Number).filter(Boolean))];
    if (ids.length) return ids;
  }
  if (user?.assignedBranchId) return [Number(user.assignedBranchId)];
  return [];
}

/**
 * The user's PRIMARY/default branch id — the one new operations bind to when no
 * branch is requested. The explicit `assignedBranchId` when it's part of the
 * allowed set; otherwise the first allowed branch.
 */
export function primaryBranchId(user) {
  const ids = effectiveBranchIds(user);
  if (!ids.length) return null;
  const assigned = user?.assignedBranchId ? Number(user.assignedBranchId) : null;
  if (assigned && ids.includes(assigned)) return assigned;
  return ids[0];
}

/**
 * Load (from the DB) the full set of branch ids assigned to a user via the
 * user_branches join table, falling back to the primary `assignedBranchId` when
 * no join rows exist yet. Async — used at auth time to attach
 * `user.allowedBranchIds` so the synchronous helpers above can run without I/O.
 */
export async function loadUserBranchIds(user) {
  if (!user?.id) return user?.assignedBranchId ? [Number(user.assignedBranchId)] : [];
  const db = await getDb();
  const rows = await db
    .select({ branchId: userBranches.branchId })
    .from(userBranches)
    .where(eq(userBranches.userId, user.id));
  const ids = [...new Set(rows.map((r) => Number(r.branchId)).filter(Boolean))];
  if (ids.length) return ids;
  return user.assignedBranchId ? [Number(user.assignedBranchId)] : [];
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

  // Non-global users: load the FULL set of branches they're assigned to
  // (many-to-many). The primary branch is the default-for-new-operations; the
  // active context branch is the primary by default.
  const allowedBranchIds = await loadUserBranchIds(user);
  const branchId = primaryBranchId(user.allowedBranchIds ? user : { ...user, allowedBranchIds });
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
  }

  // Warehouses span EVERY allowed branch (so a multi-branch manager sees all of
  // them and can switch between them); for a single-branch user this is exactly
  // that branch's warehouses.
  if (allowedBranchIds.length) {
    const whs = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(inArray(warehouses.branchId, allowedBranchIds), eq(warehouses.isActive, true)));
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
    allowedBranchIds,
    allowedWarehouseIds: visibleWarehouseIds,
    // A user assigned to more than one branch may switch the active branch
    // context between them (single-branch users have nothing to switch).
    canSwitchBranch: allowedBranchIds.length > 1,
    // A user with only one visible warehouse has nothing to switch between.
    canSwitchWarehouse: !fixedWarehouseId && visibleWarehouseIds.length > 1,
    branchFeatureEnabled: true,
  };
}

/**
 * Whether a user may target more than one branch context. Global admins switch
 * across ALL branches; a branch-bound user may switch only when they're
 * assigned to more than one branch (many-to-many). A user pinned to a single
 * branch cannot switch. The choice of WHICH branches are reachable is enforced
 * in {@link resolveBranchIdForOperation}, not here.
 */
export function canSwitchBranch(user) {
  if (isGlobalAdmin(user)) return true;
  return effectiveBranchIds(user).length > 1;
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

  // ── Branches ON, global admin → may target ANY active branch ───────────────
  if (isGlobalAdmin(user)) {
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

  // ── Branches ON, branch-bound user → only branches assigned to them ────────
  // Single-branch users behave exactly as before; multi-branch users (e.g. a
  // branch_manager over several branches) may target any branch in their set.
  const allowed = effectiveBranchIds(user);
  if (!allowed.length) {
    throw new AuthorizationError('لا يوجد فرع صالح مرتبط بحسابك. يرجى مراجعة المدير.');
  }

  // A requested branch must be one the user is assigned to.
  if (requestedBranchId) {
    const req = Number(requestedBranchId);
    if (!allowed.includes(req)) {
      throw new AuthorizationError('لا يمكنك تنفيذ العملية على فرع آخر');
    }
    const [row] = await db
      .select({ id: branches.id, isActive: branches.isActive })
      .from(branches)
      .where(eq(branches.id, req))
      .limit(1);
    if (!row || row.isActive === false) throw new ValidationError('الفرع المحدد غير نشط');
    return row.id;
  }

  // No explicit request → bind to the primary branch (or the first allowed one
  // that's still active).
  const activeRows = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(inArray(branches.id, allowed), eq(branches.isActive, true)));
  const activeIds = activeRows.map((r) => Number(r.id));
  if (!activeIds.length) {
    throw new AuthorizationError('لا يوجد فرع صالح مرتبط بحسابك. يرجى مراجعة المدير.');
  }
  const preferred = primaryBranchId(user);
  return preferred && activeIds.includes(preferred) ? preferred : activeIds[0];
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
  const allowed = effectiveBranchIds(user);
  if (!allowed.length) {
    throw new AuthorizationError('User has no branch assigned');
  }
  if (!allowed.includes(Number(resourceBranchId))) {
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
 * Branch scope for INVOICE (sales / returns) reads & writes — feature-flag aware
 * and multi-branch aware. Returns:
 *   - `null`  → NO restriction. The multiBranch feature is OFF (branches are a
 *               no-op, single-branch shop) OR the user is a global admin.
 *   - `[]`    → the user has NO assigned branch → must see NOTHING.
 *   - `[ids]` → restrict invoice queries to exactly these branch ids.
 *
 * This is the single source of truth for "which invoices may this user see",
 * so list, search, detail, edit, cancel, return, print and every invoice
 * statistic enforce the SAME rule and can't drift apart.
 */
export async function invoiceBranchScope(user) {
  const flags = await featureFlagsService.getFeatureFlags();
  if (flags.multiBranch === false) return null; // branches off → no scoping
  if (isGlobalAdmin(user)) return null; // super admin sees everything
  return effectiveBranchIds(user);
}

/**
 * Throw unless `user` may access an invoice/return tied to `branchId`. Mirrors
 * {@link invoiceBranchScope}: unrestricted when the feature is off or the user
 * is global; otherwise the branch MUST be one of the user's assigned branches.
 * A NULL/foreign branch is rejected — closing the "open it by raw ID" bypass.
 */
export async function enforceInvoiceBranchScope(user, branchId) {
  const allowed = await invoiceBranchScope(user);
  if (allowed === null) return;
  if (!allowed.length) {
    throw new AuthorizationError('لا توجد فروع مرتبطة بحسابك لعرض الفواتير');
  }
  if (branchId == null || !allowed.includes(Number(branchId))) {
    throw new AuthorizationError('لا يمكنك الوصول إلى فاتورة تابعة لفرع غير مصرح به');
  }
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
  return effectiveBranchIds(user);
}

export default {
  isGlobalAdmin,
  isBranchAdmin,
  isBranchManager,
  effectiveBranchIds,
  primaryBranchId,
  loadUserBranchIds,
  resolveUserScope,
  canSwitchBranch,
  resolveBranchIdForOperation,
  resolveEffectiveBranchId,
  enforceBranchScope,
  enforceWarehouseScope,
  invoiceBranchScope,
  enforceInvoiceBranchScope,
  getAllowedWarehouseIds,
  getBranchIdForWarehouse,
  branchFilterFor,
};
