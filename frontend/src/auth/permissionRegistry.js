/**
 * Central Permission Registry.
 *
 * A single place that classifies every permission-bearing surface in the UI so
 * the app can apply the RIGHT behaviour when the user lacks a permission:
 *
 *   type 'page'             → route/page access. Missing → Forbidden (handled by
 *                              the router guard via route meta).
 *   type 'action'           → an explicit button the user clicks (delete/export/
 *                              return…). Missing → show a clear error (the
 *                              backend's PERMISSION_DENIED dialog). The button
 *                              itself is hidden when the permission is absent.
 *   type 'optional_feature' → a sub-feature loaded/shown inside a page the user
 *                              CAN access (delivery widget, channel picker,
 *                              online-commerce tiles…). Missing → hide silently,
 *                              never fire its API, never toast.
 *
 * `fallbackBehavior` is the explicit contract for the "missing permission" case:
 *   'redirect_forbidden' | 'show_error' | 'hide_silently'
 *
 * Only REAL permission keys (see backend/src/auth/permissionCatalog.js) are used
 * here — keep them in sync with the backend RBAC seed.
 */

export const FEATURE_TYPES = Object.freeze({
  PAGE: 'page',
  ACTION: 'action',
  OPTIONAL: 'optional_feature',
});

export const FALLBACK = Object.freeze({
  FORBIDDEN: 'redirect_forbidden',
  ERROR: 'show_error',
  HIDE: 'hide_silently',
});

/**
 * key → { permission, label, type, fallbackBehavior }
 *
 * `permission` may be a string (single) or an array (ANY of). A `null`
 * permission means "always available to an authenticated user".
 */
const REGISTRY = Object.freeze({
  // ── Optional sub-features (hide silently, do NOT call their API) ───────────
  deliveryProviders: {
    permission: 'delivery_providers:read',
    label: 'شركات التوصيل',
    type: FEATURE_TYPES.OPTIONAL,
    fallbackBehavior: FALLBACK.HIDE,
  },
  deliveryShipments: {
    permission: 'delivery_shipments:read',
    label: 'الشحنات',
    type: FEATURE_TYPES.OPTIONAL,
    fallbackBehavior: FALLBACK.HIDE,
  },
  createShipment: {
    permission: 'delivery_shipments:create',
    label: 'إنشاء شحنة',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  onlineCommerceWidgets: {
    permission: 'online_commerce_reports:read',
    label: 'مؤشرات التجارة الأونلاين',
    type: FEATURE_TYPES.OPTIONAL,
    fallbackBehavior: FALLBACK.HIDE,
  },
  deliveryReports: {
    permission: 'delivery_reports:view',
    label: 'تقارير الشحن',
    type: FEATURE_TYPES.OPTIONAL,
    fallbackBehavior: FALLBACK.HIDE,
  },
  deliveryActionLogs: {
    permission: 'delivery_logs:view',
    label: 'سجل إجراءات التوصيل',
    type: FEATURE_TYPES.OPTIONAL,
    fallbackBehavior: FALLBACK.HIDE,
  },
  salesChannelsPicker: {
    permission: 'sales_channels:read',
    label: 'قنوات البيع',
    type: FEATURE_TYPES.OPTIONAL,
    fallbackBehavior: FALLBACK.HIDE,
  },

  // ── In-page actions (button hidden; clicking it would show a clear error) ──
  productsCreate: {
    permission: 'products:create',
    label: 'إضافة منتج',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  productsUpdate: {
    permission: 'products:update',
    label: 'تعديل منتج',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  productsDelete: {
    permission: 'products:delete',
    label: 'حذف منتج',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  salesDelete: {
    permission: 'sales:delete',
    label: 'حذف فاتورة',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  reportsExport: {
    // Exporting reuses the report's own read grant — there is no separate
    // export permission. Hidden when the user can't read any report.
    permission: ['reports:read_profit', 'reports:read_financial', 'view:reports'],
    label: 'تصدير التقرير',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  settingsUpdate: {
    permission: 'settings:manage',
    label: 'حفظ الإعدادات',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  usersCreate: {
    permission: 'users:create',
    label: 'إضافة مستخدم',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  usersDelete: {
    permission: 'users:delete',
    label: 'حذف مستخدم',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
  rolesManage: {
    permission: 'roles:manage',
    label: 'إدارة الأدوار',
    type: FEATURE_TYPES.ACTION,
    fallbackBehavior: FALLBACK.HIDE,
  },
});

/** Look up a feature definition by key (returns `null` when unknown). */
export function getFeature(key) {
  return REGISTRY[key] || null;
}

/** The permission(s) a feature requires, or `null` for always-available. */
export function featurePermission(key) {
  return REGISTRY[key]?.permission ?? null;
}

/** Is this feature an optional sub-feature that should hide silently? */
export function isOptionalFeature(key) {
  return REGISTRY[key]?.type === FEATURE_TYPES.OPTIONAL;
}

export const PERMISSION_REGISTRY = REGISTRY;
export default REGISTRY;
