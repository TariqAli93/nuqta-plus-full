/**
 * Permission Matrix — single source of truth for RBAC.
 *
 * Roles:
 * - global_admin: Cross-branch access. Can switch branch/warehouse context,
 *                 manage feature flags, approve any transfer.
 * - admin: Legacy full-access role. Treated as global_admin for authorization.
 * - branch_admin: Admin for one branch. Can approve transfers inside their branch
 *                 and create/delete warehouses in that branch.
 * - branch_manager: Like branch_admin but can NOT create/delete branches or
 *                   warehouses. Can change the branch's default warehouse,
 *                   transfer stock inside the branch, and switch active
 *                   warehouse within the branch.
 * - manager: Manages sales, products, customers inside their branch.
 * - cashier: Creates sales, reads data; cannot delete or manage users.
 * - viewer: Read-only.
 */

// ── Role groups ───────────────────────────────────────────────────────────
// Keep role lists named so they stay consistent and easy to audit.
export const ROLES = Object.freeze({
  GLOBAL_ADMIN: 'global_admin',
  ADMIN: 'admin',
  BRANCH_ADMIN: 'branch_admin',
  BRANCH_MANAGER: 'branch_manager',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  VIEWER: 'viewer',
});

const GLOBAL = [ROLES.GLOBAL_ADMIN, ROLES.ADMIN];
const BRANCH_ADMIN = [...GLOBAL, ROLES.BRANCH_ADMIN];
// Branch managers sit between branch_admin and manager: they get
// branch-scoped admin privileges that don't create/delete branches or
// warehouses.
const BRANCH_MANAGER = [...BRANCH_ADMIN, ROLES.BRANCH_MANAGER];
const MANAGER = [...BRANCH_MANAGER, ROLES.MANAGER];
const CASHIER = [...MANAGER, ROLES.CASHIER];
const ALL = [...CASHIER, ROLES.VIEWER];

const PERMISSION_MATRIX = {
  // ── Sales ────────────────────────────────────────────────────────────────
  'sales:create': CASHIER,
  'sales:read': ALL,
  'sales:update': CASHIER,
  'sales:delete': MANAGER,
  'sales.override_credit_limit': MANAGER,

  // ── Accounting periods (القيد المحاسبي) ──────────────────────────────────
  // Global admins manage any period; branch admins manage their own branch's
  // (scope enforced in the service). Cashiers do not open/close by default.
  'accounting_periods:open': BRANCH_ADMIN,
  'accounting_periods:close': BRANCH_ADMIN,
  'accounting_periods:read': MANAGER,

  // ── Products ─────────────────────────────────────────────────────────────
  'products:create': MANAGER,
  'products:read': ALL,
  'products:update': MANAGER,
  'products:delete': [...GLOBAL, ROLES.MANAGER], // skip branch_admin for delete

  // ── Customers ────────────────────────────────────────────────────────────
  'customers:create': CASHIER,
  'customers:read': ALL,
  'customers:update': CASHIER,
  'customers:delete': MANAGER,

  // ── Categories ───────────────────────────────────────────────────────────
  'categories:create': MANAGER,
  'categories:read': ALL,
  'categories:update': MANAGER,
  'categories:delete': [...GLOBAL, ROLES.MANAGER],

  // ── Sales channels (قنوات البيع) ─────────────────────────────────────────
  // Managing the channel list is an admin/manager concern; everyone in scope
  // may read it so order/POS screens can show the channel picker later.
  'sales_channels:create': MANAGER,
  'sales_channels:read': ALL,
  'sales_channels:update': MANAGER,
  'sales_channels:delete': [...GLOBAL, ROLES.MANAGER],
  'view:sales_channels': MANAGER,

  // ── Online orders (الطلبات الأونلاين) ────────────────────────────────────
  // Order intake before invoicing. Cashiers take and progress orders; deleting
  // is manager-level. Status changes share the same operational scope as create.
  'online_orders:create': CASHIER,
  'online_orders:read': ALL,
  'online_orders:update': CASHIER,
  // Generic status moves (e.g. بدء المعالجة). Specific workflow actions below
  // are governed by their own permissions, enforced per-transition.
  'online_orders:update_status': CASHIER,
  // Confirming creates a real invoice + deducts stock → same scope as
  // sales:create. Preparing/delivering are operational (cashier). Cancelling a
  // confirmed order reverses stock, and returns reduce revenue → manager-level.
  'online_orders:confirm': CASHIER,
  'online_orders:prepare': CASHIER,
  'online_orders:deliver': CASHIER,
  'online_orders:cancel': MANAGER,
  'online_orders:return': MANAGER,
  // Legacy convert-to-invoice endpoint (kept for backward compat).
  'online_orders:convert': CASHIER,
  'online_orders:delete': MANAGER,
  // Opening the linked invoice + viewing the shipment are read-only (the sale
  // page itself still enforces view:sales). Sending is operational (cashier);
  // re-sending an already-shipped order is a manager override.
  'online_orders:open_invoice': ALL,
  'online_orders:send_to_shipping': CASHIER,
  'online_orders:resend_to_shipping': MANAGER,
  'online_orders:view_shipment': ALL,
  'view:online_orders': ALL,

  // ── Delivery integration (التوصيل) ───────────────────────────────────────
  // Provider config holds credentials → branch-admin+. Shipments are an
  // operational concern handled by cashiers and above. Webhooks are public
  // (verified by a per-provider secret, not RBAC).
  'delivery_providers:read': MANAGER,
  'delivery_providers:manage': BRANCH_ADMIN,
  // Webhook logs are a debugging surface (raw payloads) → admin-level.
  'delivery_webhooks:view': BRANCH_ADMIN,
  'delivery_shipments:read': ALL,
  'delivery_shipments:create': CASHIER,
  // Legacy combined gate (sync + cancel). Kept for backward compatibility; new
  // finer permissions below are backfilled onto roles that hold this one.
  'delivery_shipments:update': CASHIER,
  'delivery_shipments:cancel': CASHIER,
  'delivery_shipments:sync': CASHIER,
  'delivery_shipments:print_label': CASHIER,
  // Choosing a non-default carrier on a shipment is a manager decision.
  'delivery_shipments:change_provider': MANAGER,
  // Outbound action log (request/response audit) → admin-level, like webhooks.
  'delivery_logs:view': BRANCH_ADMIN,
  'view:delivery': MANAGER,

  // ── Online commerce reports (تقارير التجارة الأونلاين) ───────────────────
  // Channel/order analytics → manager-level; profit-by-channel reuses the
  // existing profit gate (reports:read_profit).
  'online_commerce_reports:read': MANAGER,
  'view:online_commerce_reports': MANAGER,

  // ── Delivery reports (تقارير الشحن) ──────────────────────────────────────
  'delivery_reports:view': MANAGER,
  'view:delivery_reports': MANAGER,

  // ── Frontend view permissions ───────────────────────────────────────────
  'view:dashboard': ALL,
  'view:sales': ALL,
  'view:products': ALL,
  'view:customers': ALL,
  'view:categories': ALL,
  'view:reports': ALL,
  'view:inventory': ALL,
  'view:users': BRANCH_ADMIN,
  'view:settings': GLOBAL,
  'view:roles': GLOBAL,
  'view:permissions': GLOBAL,
  'view:audit': GLOBAL,

  // ── Frontend action aliases (kept for backward compat) ──────────────────
  'create:sales': CASHIER,
  'manage:sales': MANAGER,
  'delete:sales': MANAGER,
  'create:products': MANAGER,
  'manage:products': MANAGER,
  'create:customers': CASHIER,
  'manage:customers': MANAGER,
  'update:customers': CASHIER,
  'update:products': MANAGER,
  'read:reports': ALL,

  // ── User management ──────────────────────────────────────────────────────
  // Branch admins manage users inside their branch; global admins manage all.
  'users:create': BRANCH_ADMIN,
  'users:read': BRANCH_MANAGER,
  'users:update': BRANCH_ADMIN,
  'users:delete': GLOBAL,
  'users:manage': BRANCH_ADMIN,

  // ── Settings ─────────────────────────────────────────────────────────────
  // Administrative settings require global admin.
  'settings:read': GLOBAL,
  'settings:update': GLOBAL,
  'settings:manage': GLOBAL,
  'settings:create': GLOBAL,
  'settings:delete': GLOBAL,
  // Public-read settings (currency, company info) — needed everywhere in the UI.
  'settings:read_public': ALL,

  // ── Audit log ────────────────────────────────────────────────────────────
  'audit:read': GLOBAL,
  'audit:delete': GLOBAL,

  // ── Expenses ─────────────────────────────────────────────────────────────
  // Cashiers cannot record expenses (avoids accidental drawer accounting
  // mismatches); branch managers and above can.
  'expenses:create': MANAGER,
  'expenses:read': MANAGER,
  'expenses:update': MANAGER,
  'expenses:delete': BRANCH_MANAGER,

  // ── Reports ──────────────────────────────────────────────────────────────
  // Profit-sensitive aggregates require manager-level role.
  'reports:read_profit': MANAGER,
  // Managers may see every user's operations in reports; lower roles are scoped
  // to their own operations in the service layer.
  'reports:view_all_users': MANAGER,
  'view:expenses': MANAGER,

  // ── Inventory ────────────────────────────────────────────────────────────
  'inventory:read': ALL,
  'inventory:adjust': MANAGER,
  // Cashiers create transfer *requests* (those go to the approval queue).
  'inventory:transfer': CASHIER,
  // Branch/warehouse CRUD — restricted to branch_admin and global admins.
  // Branch managers intentionally lack this so they can't create/delete
  // warehouses or rename branches; their branch-config rights are limited
  // to the dedicated `branches:set_default_warehouse` permission below.
  'inventory:manage': BRANCH_ADMIN,
  // Granular: change the branch's default warehouse only. Branch managers
  // get this so they can pick the active default for their own branch.
  'branches:set_default_warehouse': BRANCH_MANAGER,

  // ── Branch / warehouse scope ─────────────────────────────────────────────
  manage_all_branches: GLOBAL,
  switch_branch_context: GLOBAL,
  switch_warehouse_context: GLOBAL,
  approve_warehouse_transfer: BRANCH_ADMIN,
  manage_feature_toggles: GLOBAL,

  // ── Suppliers (الموردون) ─────────────────────────────────────────────────
  'suppliers:create': MANAGER,
  'suppliers:read': MANAGER,
  'suppliers:update': MANAGER,
  'suppliers:delete': BRANCH_MANAGER,
  'view:suppliers': MANAGER,

  // ── Purchases (المشتريات) ────────────────────────────────────────────────
  'purchases:create': MANAGER,
  'purchases:read': MANAGER,
  'purchases:return': MANAGER,
  'purchases:cancel': BRANCH_MANAGER,
  'view:purchases': MANAGER,

  // ── Treasury (الخزينة: صناديق، بنوك، سندات، تحويلات) ─────────────────────
  // Cashbox/bank ledgers are money-sensitive → manager+. CRUD of the boxes
  // themselves is branch-admin scope. Receipt vouchers stay at cashier level
  // because cashiers already collect customer debts via collections today.
  'treasury:read': MANAGER,
  'treasury:manage': BRANCH_ADMIN,
  'treasury:transfer': BRANCH_MANAGER,
  'view:treasury': MANAGER,
  'vouchers:create_receipt': CASHIER,
  'vouchers:create_payment': MANAGER,
  'vouchers:cancel': BRANCH_MANAGER,

  // ── General ledger (الشجرة المحاسبية والقيود) ────────────────────────────
  'gl:read': MANAGER,
  'gl:manage_accounts': BRANCH_ADMIN,
  'gl:post_manual': BRANCH_ADMIN,
  'gl:manage_system_accounts': GLOBAL,
  'gl:repair_postings': GLOBAL,
  'view:gl': MANAGER,

  // ── Financial reports / opening balances / mode ──────────────────────────
  // Aligned with reports:read_profit — financial statements expose profit.
  'reports:read_financial': MANAGER,
  'opening_balances:manage': GLOBAL,
  'app_mode:upgrade': GLOBAL,

  // ── Agent pricing (تسعير الوكلاء) ────────────────────────────────────────
  'customers:set_credit_limit': MANAGER,
};

/** Any role that grants full cross-branch access. */
export function isGlobalRole(role) {
  return role === ROLES.GLOBAL_ADMIN || role === ROLES.ADMIN;
}

// Dynamic, DB-backed checker injected by rbacService once the RBAC cache is
// loaded. Until then (early boot), the static matrix below is the fallback.
// Injection (not import) avoids a permissionMatrix ↔ rbacService cycle.
let _dynamicChecker = null;
export function setDynamicChecker(fn) {
  _dynamicChecker = typeof fn === 'function' ? fn : null;
}

/**
 * Check if a role has a specific permission. Delegates to the dynamic DB-backed
 * RBAC cache when available; falls back to the static matrix during early boot.
 */
export function hasPermission(permission, role) {
  if (!permission || !role) return false;

  // Global admins always have everything (incl. future permissions).
  if (isGlobalRole(role)) return true;

  if (_dynamicChecker) return _dynamicChecker(role, permission) === true;

  // Pre-boot fallback: static matrix (fail secure on unknown keys).
  const allowedRoles = PERMISSION_MATRIX[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/**
 * Get all permissions for a role.
 */
export function getRolePermissions(role) {
  if (!role) return [];
  if (isGlobalRole(role)) return Object.keys(PERMISSION_MATRIX);

  return Object.keys(PERMISSION_MATRIX).filter((permission) =>
    PERMISSION_MATRIX[permission].includes(role)
  );
}

/**
 * Pattern helpers kept for backward compat with existing callers.
 */
export function matchesPermissionPattern(permission, pattern) {
  if (permission === pattern) return true;

  if (pattern === 'manage:*') {
    return permission.startsWith('manage:') || permission.includes(':manage');
  }

  if (pattern.startsWith('manage:')) {
    const resource = pattern.split(':')[1];
    return permission.includes(`:${resource}`) || permission.startsWith(`${resource}:`);
  }

  return false;
}

export default PERMISSION_MATRIX;
