/**
 * usePermissions() — the single composable every component uses to gate UI on
 * permissions. All checks are DYNAMIC (granted permission KEYS from the session,
 * never a hard-coded role name) and reactive: because they read the Pinia auth
 * store, using them in a template/computed re-evaluates when the session changes.
 *
 * Use it for:
 *   - showing/hiding buttons, cards, tabs, sub-sections
 *   - deciding whether to fire an OPTIONAL background API call
 *
 * Page access is enforced by the router guard (route meta), not here.
 *
 * Example:
 *   const { can, canFeature } = usePermissions();
 *   if (canFeature('deliveryProviders')) store.fetchProviders({ optional: true });
 *   <v-btn v-if="can('products:create')">إضافة</v-btn>
 */

import { useAuthStore } from '@/stores/auth';
import { getFeature, featurePermission } from '@/auth/permissionRegistry';

export function usePermissions() {
  const auth = useAuthStore();

  /** True if the user holds the permission (string) or ANY in the array. */
  const hasPermission = (permission) => auth.hasPermission(permission);

  /** True if the user holds AT LEAST ONE of the listed permissions. */
  const hasAnyPermission = (permissions = []) => auth.hasPermission(permissions);

  /** True if the user holds ALL of the listed permissions. */
  const hasAllPermissions = (permissions = []) => auth.hasAllPermissions(permissions);

  /** `can(key)` — terse alias of hasPermission, the common in-template call. */
  const can = (permission) => auth.hasPermission(permission);

  /** Backend-issued capability flag (feature + role + scope folded in). */
  const canCapability = (capabilityName) => auth.can(capabilityName);

  /** Combined feature-flag + capability gate. */
  const canUse = (featureName, capabilityName) => auth.canUse(featureName, capabilityName);

  const isGlobalAdmin = () => auth.isGlobalAdmin === true;

  /**
   * `canFeature(registryKey)` — registry-aware check for a NAMED feature
   * (page / action / optional_feature). Resolves the feature's permission from
   * the central registry, so callers reference a stable key instead of a raw
   * permission string. Unknown key → false (fail-safe). No-permission feature →
   * true.
   */
  const canFeature = (key) => {
    const def = getFeature(key);
    if (!def) return false;
    const perm = def.permission;
    if (perm == null) return true;
    return auth.hasPermission(perm);
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    can,
    canCapability,
    canUse,
    isGlobalAdmin,
    canFeature,
    featurePermission,
  };
}

export default usePermissions;
