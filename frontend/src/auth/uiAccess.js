/**
 * UI Access Control Helper — DYNAMIC.
 *
 * Thin wrappers used across the Vue UI (menu items, buttons, router guards).
 * Every check delegates to the auth store, which holds the granted permission
 * KEYS issued by the DB-backed RBAC at login/session. No static matrix.
 *
 * The legacy `role` parameter is kept on signatures for backward-compat but is
 * IGNORED — checks always concern the CURRENT signed-in user. Backend
 * `authorize()` remains the authoritative gate.
 */

import { useAuthStore } from '@/stores/auth';

const auth = () => useAuthStore();
const can = (key) => auth().hasPermission(key);

// ── Scope / admin ───────────────────────────────────────────────────────────
export function isGlobalAdmin() {
  return auth().user?.allPermissions === true;
}

// ── Branch / warehouse context ────────────────────────────────────────────
export function canSwitchBranchContext() {
  return can('switch_branch_context');
}
export function canSwitchWarehouseContext() {
  return can('switch_warehouse_context');
}
export function canApproveWarehouseTransfer() {
  return can('approve_warehouse_transfer');
}
export function canManageFeatureToggles() {
  return can('manage_feature_toggles');
}

// ── Resource helpers ───────────────────────────────────────────────────────
export function canManageUsers() {
  return can('users:manage');
}
export function canViewUsers() {
  return can('view:users');
}
export function canDeleteSales() {
  return can('sales:delete');
}
export function canRestoreSales() {
  return can('sales:delete');
}
export function canCreateSales() {
  return can('sales:create');
}
export function canAddPayments() {
  return can('sales:update');
}
export function canManageProducts() {
  return can('products:update');
}
export function canDeleteProducts() {
  return can('products:delete');
}
export function canManageCategories() {
  return can('categories:update');
}
export function canManageCustomers() {
  return can('customers:update');
}
export function canDeleteCustomers() {
  return can('customers:delete');
}
export function canManageSettings() {
  return can('settings:manage');
}
export function canViewReports() {
  return can('view:reports');
}

// ── Inventory ──────────────────────────────────────────────────────────────
export function canViewInventory() {
  return can('inventory:read');
}
export function canAdjustInventory() {
  return can('inventory:adjust');
}
export function canRequestTransfer() {
  return can('inventory:transfer');
}
export function canManageInventory() {
  return can('inventory:manage');
}

// ── Coarse write guard ─────────────────────────────────────────────────────
// "Can write" = holds any common create/update grant (vs a read-only role).
export function canWrite() {
  const s = auth();
  if (s.user?.allPermissions === true) return true;
  return s.hasAnyPermission([
    'sales:create',
    'sales:update',
    'products:update',
    'customers:update',
    'inventory:adjust',
    'expenses:create',
    'purchases:create',
  ]);
}
export function isReadOnly() {
  return !canWrite();
}
export function canDelete() {
  return canDeleteSales();
}

export function getAllowedActions() {
  return {
    isGlobalAdmin: isGlobalAdmin(),
    canSwitchBranchContext: canSwitchBranchContext(),
    canSwitchWarehouseContext: canSwitchWarehouseContext(),
    canApproveWarehouseTransfer: canApproveWarehouseTransfer(),
    canManageFeatureToggles: canManageFeatureToggles(),
    canManageUsers: canManageUsers(),
    canViewUsers: canViewUsers(),
    canDeleteSales: canDeleteSales(),
    canRestoreSales: canRestoreSales(),
    canCreateSales: canCreateSales(),
    canAddPayments: canAddPayments(),
    canManageProducts: canManageProducts(),
    canDeleteProducts: canDeleteProducts(),
    canManageCategories: canManageCategories(),
    canManageCustomers: canManageCustomers(),
    canDeleteCustomers: canDeleteCustomers(),
    canManageSettings: canManageSettings(),
    canViewReports: canViewReports(),
    canViewInventory: canViewInventory(),
    canAdjustInventory: canAdjustInventory(),
    canRequestTransfer: canRequestTransfer(),
    canManageInventory: canManageInventory(),
    isReadOnly: isReadOnly(),
    canWrite: canWrite(),
    canDelete: canDelete(),
  };
}

export default {
  isGlobalAdmin,
  canSwitchBranchContext,
  canSwitchWarehouseContext,
  canApproveWarehouseTransfer,
  canManageFeatureToggles,
  canManageUsers,
  canViewUsers,
  canDeleteSales,
  canRestoreSales,
  canCreateSales,
  canAddPayments,
  canManageProducts,
  canDeleteProducts,
  canManageCategories,
  canManageCustomers,
  canDeleteCustomers,
  canManageSettings,
  canViewReports,
  canViewInventory,
  canAdjustInventory,
  canRequestTransfer,
  canManageInventory,
  isReadOnly,
  canWrite,
  canDelete,
  getAllowedActions,
};
