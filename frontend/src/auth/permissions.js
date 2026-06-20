/**
 * Dynamic Permission Helper — single, central place for every access decision
 * in the UI.
 *
 * The frontend NEVER decides access from a hard-coded role name
 * (global_admin / branch_admin / cashier …). Instead it asks the auth store,
 * which holds the granted-permission KEYS the DB-backed RBAC issued for the
 * current user at login/session. The backend `authorize()` middleware remains
 * the authoritative gate — these helpers only decide what to render/route.
 *
 * Two layers use this module:
 *   1. The router guard (page-level access → /forbidden).
 *   2. Components, for sub-actions only (add / edit / delete / export buttons).
 *
 * Page access is decided by the Route Guard via `meta.permission`, NOT by
 * hiding cards behind cards. Buttons remain individually gated.
 */

import { useAuthStore } from '@/stores/auth';

const store = () => useAuthStore();

/**
 * `hasPermission(key)` — true when the current user holds the permission.
 * Accepts a single key or an array (ANY match). Global admin always passes.
 * @param {string|string[]} permission
 */
export function hasPermission(permission) {
  return store().hasPermission(permission);
}

/** True when the user holds AT LEAST ONE of the listed permissions. */
export function hasAnyPermission(permissions = []) {
  return store().hasPermission(permissions); // store getter ANY-matches arrays
}

/** True when the user holds ALL of the listed permissions. */
export function hasAllPermissions(permissions = []) {
  return store().hasAllPermissions(permissions);
}

/** True for the global administrator (allPermissions === true). */
export function isGlobalAdmin() {
  return store().isGlobalAdmin === true;
}

/**
 * Collect the page-level permission requirement declared on a route's meta.
 *
 * Supported meta keys (all optional):
 *   - `permission`       string | string[]  → user needs ANY of them
 *   - `permissions`      string[]            → user needs ANY of them
 *   - `allPermissions`   string[]            → user needs ALL of them
 *
 * `permission` and `permissions` are pooled together (ANY match) so a page can
 * be reached through more than one grant, e.g.
 *   meta: { permissions: ['users.view', 'roles.view'] }
 */
function collectMetaPermissions(meta = {}) {
  const anyOf = [];
  if (meta.permission) {
    anyOf.push(...(Array.isArray(meta.permission) ? meta.permission : [meta.permission]));
  }
  if (Array.isArray(meta.permissions)) {
    anyOf.push(...meta.permissions);
  }
  return anyOf;
}

/**
 * Decide whether the current user may OPEN (view) a route.
 *
 * The order of checks mirrors the guard's intent:
 *   - `requiresGlobalAdmin` → must be the global admin.
 *   - `permission` / `permissions` → must hold ANY of the pooled keys.
 *   - `allPermissions` → must hold ALL of them.
 *
 * Returns `true` when no permission constraint is declared (public-to-auth
 * page such as the profile or dashboard).
 *
 * @param {object} meta - the route's (merged) meta object
 * @returns {boolean}
 */
export function canAccessRouteMeta(meta = {}) {
  const s = store();

  if (meta.requiresGlobalAdmin && !s.isGlobalAdmin) return false;

  const anyOf = collectMetaPermissions(meta);
  if (anyOf.length > 0 && !s.hasPermission(anyOf)) return false;

  if (
    Array.isArray(meta.allPermissions) &&
    meta.allPermissions.length > 0 &&
    !s.hasAllPermissions(meta.allPermissions)
  ) {
    return false;
  }

  return true;
}

export default {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isGlobalAdmin,
  canAccessRouteMeta,
};
