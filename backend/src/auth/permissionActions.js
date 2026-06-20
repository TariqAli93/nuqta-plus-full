/**
 * Central operation/resource naming for Authorization (403) errors.
 *
 * When a permission check fails we want the user to read a precise, Arabic
 * explanation — what they tried to do, which permission is missing, why it was
 * refused, and who can fix it — instead of a vague "ليس لديك صلاحية".
 *
 * The Arabic ACTION phrase for each permission KEY is already maintained in
 * `permissionCatalog.js` (its `ar` field, e.g. 'حذف مستخدم'), so this module
 * builds on top of it rather than duplicating the list. It adds:
 *   - resource → Arabic resource name (plural) for the whole system
 *   - verb fallbacks for keys missing from the catalog
 *   - `describePermission(key)` → { action, resource, reason, suggestion, ... }
 *
 * Keys use the internal form (`users:delete`, `view:users`, or the dotted
 * `sales.override_credit_limit`). The dotted notation in the task spec
 * (`users.delete`) is accepted too and normalised here.
 */

import { PERMISSION_CATALOG } from './permissionCatalog.js';

/** resource slug → Arabic name (covers the whole system, per requirement #7). */
export const RESOURCE_NAMES = Object.freeze({
  users: 'المستخدمين',
  roles: 'الأدوار والصلاحيات',
  permissions: 'الصلاحيات',
  sales: 'الفواتير',
  customers: 'العملاء',
  products: 'المنتجات',
  categories: 'التصنيفات',
  inventory: 'المخزون',
  branches: 'الفروع',
  warehouses: 'المخازن',
  suppliers: 'الموردين',
  purchases: 'المشتريات',
  expenses: 'المصاريف',
  treasury: 'الخزينة',
  vouchers: 'سندات القبض والدفع',
  gl: 'المحاسبة والقيود',
  accounting_periods: 'فترات العمل',
  opening_balances: 'الأرصدة الافتتاحية',
  reports: 'التقارير',
  online_orders: 'الطلبات الأونلاين',
  online_commerce_reports: 'تقارير التجارة الأونلاين',
  sales_channels: 'قنوات البيع',
  delivery_providers: 'شركات التوصيل',
  delivery_shipments: 'الشحنات',
  delivery_webhooks: 'سجل الويبهوك',
  delivery_logs: 'سجل إجراءات التوصيل',
  delivery_reports: 'تقارير الشحن',
  delivery: 'التوصيل',
  settings: 'الإعدادات',
  backups: 'النسخ الاحتياطي',
  backup: 'النسخ الاحتياطي',
  audit: 'سجل النشاط',
  dashboard: 'لوحة التحكم',
  notifications: 'التنبيهات',
});

/** Verb → Arabic verb, used to synthesise an action when a key has no catalog. */
const VERB_NAMES = Object.freeze({
  create: 'إضافة',
  read: 'عرض',
  view: 'عرض',
  update: 'تعديل',
  delete: 'حذف',
  manage: 'إدارة',
  cancel: 'إلغاء',
  return: 'إرجاع',
  open: 'فتح',
  close: 'إغلاق',
  convert: 'تحويل',
  transfer: 'تحويل',
  adjust: 'جرد/تعديل',
  approve: 'الموافقة على',
});

/** Permission keys that always require the global administrator. */
const GLOBAL_ADMIN_KEYS = new Set([
  'settings:manage',
  'settings:read',
  'users:delete',
  'gl:manage_system_accounts',
  'gl:repair_postings',
  'opening_balances:manage',
  'manage_feature_toggles',
  'app_mode:upgrade',
]);

/** Resource overrides for single-token keys that don't carry a `resource:verb`. */
const RESOURCE_OVERRIDES = Object.freeze({
  manage_feature_toggles: 'settings',
  app_mode: 'settings',
  manage_all_branches: 'branches',
  switch_branch_context: 'branches',
  switch_warehouse_context: 'warehouses',
  approve_warehouse_transfer: 'warehouses',
});

/** Normalise a key written with dots (spec form) to the internal form. */
function normalizeKey(key = '') {
  // Only the leading `resource.verb` segment is converted; internal dotted keys
  // such as `sales.override_credit_limit` stay intact because they have no
  // colon equivalent in the catalog.
  if (typeof key !== 'string') return '';
  if (PERMISSION_CATALOG[key]) return key; // already canonical
  const colonised = key.replace('.', ':');
  if (PERMISSION_CATALOG[colonised]) return colonised;
  return key;
}

/** Extract the resource slug from a permission key. */
export function resourceOf(key = '') {
  if (RESOURCE_OVERRIDES[key]) return RESOURCE_OVERRIDES[key];
  if (key.startsWith('view:')) return key.slice(5);
  const head = key.split(/[:.]/)[0];
  return head || 'settings';
}

/** Arabic resource name (falls back to the slug itself). */
export function resourceNameAr(resource = '') {
  return RESOURCE_NAMES[resource] || resource;
}

/** Arabic action phrase for a permission key (catalog first, then verb+resource). */
export function actionNameAr(key = '') {
  const norm = normalizeKey(key);
  const fromCatalog = PERMISSION_CATALOG[norm]?.ar;
  if (fromCatalog) return fromCatalog;

  const resource = resourceOf(norm);
  const resName = resourceNameAr(resource);
  const verbToken = norm.startsWith('view:') ? 'view' : norm.split(/[:.]/)[1];
  const verb = VERB_NAMES[verbToken];
  if (verb) return `${verb} ${resName}`;
  return resName;
}

/**
 * Build a full, human description for a denied permission.
 *
 * @param {string} key - the permission key that was required
 * @param {object} [overrides] - { action, resource } to override the derived names
 * @returns {{ action:string, resource:string, resourceNameAr:string,
 *            requiredPermission:string, reason:string, suggestion:string }}
 */
export function describePermission(key, overrides = {}) {
  const norm = normalizeKey(key);
  const resource = overrides.resource || resourceOf(norm);
  const action = overrides.action || actionNameAr(norm);
  const resName = resourceNameAr(resource);
  const needsGlobalAdmin = GLOBAL_ADMIN_KEYS.has(norm);

  const reason = `حسابك لا يحتوي على صلاحية «${norm}» المطلوبة لتنفيذ هذه العملية (${action}).`;
  const suggestion = needsGlobalAdmin
    ? `هذه العملية متاحة للمدير العام فقط. تواصل مع المدير العام لتنفيذها أو لمنحك صلاحية «${action}».`
    : `تواصل مع المدير العام أو مدير النظام لمنحك صلاحية «${action}» على ${resName}.`;

  return {
    action,
    resource,
    resourceNameAr: resName,
    requiredPermission: norm,
    reason,
    suggestion,
  };
}

export default { RESOURCE_NAMES, resourceOf, resourceNameAr, actionNameAr, describePermission };
