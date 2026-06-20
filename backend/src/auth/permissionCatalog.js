/**
 * Arabic permission catalog — display metadata for every internal permission
 * KEY. The internal keys (e.g. 'sales:create') are used in code/DB only and
 * NEVER shown to the user; the UI shows `ar` (Arabic name) grouped by `group`.
 *
 * `active: false` hides a key from the management UI (kept for backward-compat
 * checks like the legacy `manage:*` aliases) while still honouring it in
 * authorization. Any matrix key missing here falls back to a generic entry.
 *
 * This is the SEED source for the `permissions` table (rbacService.ensureSeed).
 */

const G = Object.freeze({
  SALES: 'المبيعات والفواتير',
  ONLINE: 'الطلبات الأونلاين',
  DELIVERY: 'التوصيل',
  PRODUCTS: 'المنتجات والفئات',
  CUSTOMERS: 'العملاء',
  INVENTORY: 'المخزون والفروع',
  PURCHASES: 'المشتريات والموردون',
  TREASURY: 'الخزينة والسندات',
  ACCOUNTING: 'المحاسبة والقيود',
  REPORTS: 'التقارير',
  USERS: 'المستخدمون والصلاحيات',
  SETTINGS: 'الإعدادات',
});

// key → { ar, group, active? (default true) }
export const PERMISSION_CATALOG = Object.freeze({
  // ── Sales ──
  'sales:create': { ar: 'إضافة فاتورة', group: G.SALES },
  'sales:read': { ar: 'عرض الفواتير', group: G.SALES },
  'sales:update': { ar: 'تعديل فاتورة', group: G.SALES },
  'sales:delete': { ar: 'حذف فاتورة', group: G.SALES },
  'sales.override_credit_limit': { ar: 'تجاوز سقف دين العميل عند البيع', group: G.SALES },
  'view:sales': { ar: 'الوصول إلى صفحة المبيعات', group: G.SALES },
  'view:dashboard': { ar: 'عرض الشاشة الرئيسية', group: G.SALES },

  // ── Accounting periods ──
  'accounting_periods:open': { ar: 'فتح قيد محاسبي', group: G.ACCOUNTING },
  'accounting_periods:close': { ar: 'إغلاق قيد محاسبي', group: G.ACCOUNTING },
  'accounting_periods:read': { ar: 'عرض القيود المحاسبية', group: G.ACCOUNTING },

  // ── Products / categories ──
  'products:create': { ar: 'إضافة منتج', group: G.PRODUCTS },
  'products:read': { ar: 'عرض المنتجات', group: G.PRODUCTS },
  'products:update': { ar: 'تعديل المنتجات', group: G.PRODUCTS },
  'products:delete': { ar: 'حذف المنتجات', group: G.PRODUCTS },
  'view:products': { ar: 'الوصول إلى صفحة المنتجات', group: G.PRODUCTS },
  'categories:create': { ar: 'إضافة فئة', group: G.PRODUCTS },
  'categories:read': { ar: 'عرض الفئات', group: G.PRODUCTS },
  'categories:update': { ar: 'تعديل فئة', group: G.PRODUCTS },
  'categories:delete': { ar: 'حذف فئة', group: G.PRODUCTS },
  'view:categories': { ar: 'الوصول إلى صفحة الفئات', group: G.PRODUCTS },

  // ── Customers ──
  'customers:create': { ar: 'إضافة عميل', group: G.CUSTOMERS },
  'customers:read': { ar: 'عرض العملاء', group: G.CUSTOMERS },
  'customers:update': { ar: 'تعديل عميل', group: G.CUSTOMERS },
  'customers:delete': { ar: 'حذف عميل', group: G.CUSTOMERS },
  'customers:set_credit_limit': { ar: 'تحديد سقف دين العميل', group: G.CUSTOMERS },
  'view:customers': { ar: 'الوصول إلى صفحة العملاء', group: G.CUSTOMERS },

  // ── Sales channels ──
  'sales_channels:create': { ar: 'إضافة قناة بيع', group: G.ONLINE },
  'sales_channels:read': { ar: 'عرض قنوات البيع', group: G.ONLINE },
  'sales_channels:update': { ar: 'تعديل قناة بيع', group: G.ONLINE },
  'sales_channels:delete': { ar: 'حذف قناة بيع', group: G.ONLINE },
  'view:sales_channels': { ar: 'الوصول إلى صفحة قنوات البيع', group: G.ONLINE, active: false },

  // ── Online orders ──
  'online_orders:create': { ar: 'إنشاء طلب أونلاين', group: G.ONLINE },
  'online_orders:read': { ar: 'عرض طلبات الأونلاين', group: G.ONLINE },
  'online_orders:update': { ar: 'تعديل طلب أونلاين', group: G.ONLINE },
  'online_orders:update_status': { ar: 'بدء معالجة الطلب الأونلاين', group: G.ONLINE },
  'online_orders:confirm': { ar: 'تأكيد طلب أونلاين', group: G.ONLINE },
  'online_orders:prepare': { ar: 'تجهيز طلب أونلاين', group: G.ONLINE },
  'online_orders:deliver': { ar: 'تسليم طلب أونلاين', group: G.ONLINE },
  'online_orders:cancel': { ar: 'إلغاء طلب أونلاين', group: G.ONLINE },
  'online_orders:return': { ar: 'إرجاع طلب أونلاين', group: G.ONLINE },
  'online_orders:convert': { ar: 'تحويل الطلب إلى فاتورة', group: G.ONLINE },
  'online_orders:delete': { ar: 'حذف طلب أونلاين', group: G.ONLINE },
  'view:online_orders': { ar: 'الوصول إلى صفحة طلبات الأونلاين', group: G.ONLINE, active: false },

  // ── Delivery ──
  'delivery_providers:read': { ar: 'عرض شركات التوصيل', group: G.DELIVERY },
  'delivery_providers:manage': { ar: 'إدارة شركات التوصيل', group: G.DELIVERY },
  'delivery_webhooks:view': { ar: 'عرض سجل الويبهوك (تشخيص)', group: G.DELIVERY },
  'delivery_shipments:read': { ar: 'عرض الشحنات', group: G.DELIVERY },
  'delivery_shipments:create': { ar: 'إنشاء شحنة', group: G.DELIVERY },
  // Legacy combined gate — hidden from the UI; replaced by the finer keys below.
  'delivery_shipments:update': { ar: 'تحديث/إلغاء شحنة (عام)', group: G.DELIVERY, active: false },
  'delivery_shipments:cancel': { ar: 'إلغاء شحنة', group: G.DELIVERY },
  'delivery_shipments:sync': { ar: 'مزامنة حالة الشحنات', group: G.DELIVERY },
  'delivery_shipments:print_label': { ar: 'طباعة ملصق الشحنة', group: G.DELIVERY },
  'delivery_shipments:change_provider': { ar: 'تغيير شركة التوصيل', group: G.DELIVERY },
  'delivery_logs:view': { ar: 'عرض سجل إجراءات التوصيل', group: G.DELIVERY },
  'view:delivery': { ar: 'الوصول إلى صفحة التوصيل', group: G.DELIVERY, active: false },

  // ── Inventory / branches ──
  'inventory:read': { ar: 'عرض المخزون', group: G.INVENTORY },
  'inventory:adjust': { ar: 'تعديل/جرد المخزون', group: G.INVENTORY },
  'inventory:transfer': { ar: 'طلب تحويل بين المخازن', group: G.INVENTORY },
  'inventory:manage': { ar: 'إدارة الفروع والمخازن', group: G.INVENTORY },
  'branches:set_default_warehouse': { ar: 'تغيير المخزن الافتراضي للفرع', group: G.INVENTORY },
  'approve_warehouse_transfer': { ar: 'الموافقة على تحويلات المخازن', group: G.INVENTORY },
  'manage_all_branches': { ar: 'إدارة كل الفروع', group: G.INVENTORY },
  'switch_branch_context': { ar: 'تبديل الفرع الحالي', group: G.INVENTORY },
  'switch_warehouse_context': { ar: 'تبديل المخزن الحالي', group: G.INVENTORY },
  'view:inventory': { ar: 'الوصول إلى صفحة المخزون', group: G.INVENTORY },

  // ── Purchases / suppliers ──
  'purchases:create': { ar: 'إضافة فاتورة شراء', group: G.PURCHASES },
  'purchases:read': { ar: 'عرض المشتريات', group: G.PURCHASES },
  'purchases:return': { ar: 'مرتجع شراء', group: G.PURCHASES },
  'purchases:cancel': { ar: 'إلغاء فاتورة شراء', group: G.PURCHASES },
  'view:purchases': { ar: 'الوصول إلى صفحة المشتريات', group: G.PURCHASES },
  'suppliers:create': { ar: 'إضافة مورد', group: G.PURCHASES },
  'suppliers:read': { ar: 'عرض الموردين', group: G.PURCHASES },
  'suppliers:update': { ar: 'تعديل مورد', group: G.PURCHASES },
  'suppliers:delete': { ar: 'حذف مورد', group: G.PURCHASES },
  'view:suppliers': { ar: 'الوصول إلى صفحة الموردين', group: G.PURCHASES },

  // ── Treasury / vouchers ──
  'treasury:read': { ar: 'عرض الخزينة', group: G.TREASURY },
  'treasury:manage': { ar: 'إدارة الصناديق والبنوك', group: G.TREASURY },
  'treasury:transfer': { ar: 'تحويلات الخزينة', group: G.TREASURY },
  'vouchers:create_receipt': { ar: 'إنشاء سند قبض', group: G.TREASURY },
  'vouchers:create_payment': { ar: 'إنشاء سند صرف', group: G.TREASURY },
  'vouchers:cancel': { ar: 'إلغاء سند', group: G.TREASURY },
  'view:treasury': { ar: 'الوصول إلى صفحة الخزينة', group: G.TREASURY },

  // ── General ledger ──
  'gl:read': { ar: 'عرض القيود اليومية', group: G.ACCOUNTING },
  'gl:manage_accounts': { ar: 'إدارة شجرة الحسابات', group: G.ACCOUNTING },
  'gl:post_manual': { ar: 'تسجيل قيد يدوي', group: G.ACCOUNTING },
  'gl:manage_system_accounts': { ar: 'ربط الحسابات النظامية', group: G.ACCOUNTING },
  'gl:repair_postings': { ar: 'إصلاح ترحيلات القيود', group: G.ACCOUNTING },
  'view:gl': { ar: 'الوصول إلى المحاسبة المتقدمة', group: G.ACCOUNTING },
  'opening_balances:manage': { ar: 'إدارة الأرصدة الافتتاحية', group: G.ACCOUNTING },

  // ── Expenses ──
  'expenses:create': { ar: 'إضافة مصروف', group: G.TREASURY },
  'expenses:read': { ar: 'عرض المصاريف', group: G.TREASURY },
  'expenses:update': { ar: 'تعديل مصروف', group: G.TREASURY },
  'expenses:delete': { ar: 'حذف مصروف', group: G.TREASURY },
  'view:expenses': { ar: 'الوصول إلى صفحة المصاريف', group: G.TREASURY },

  // ── Reports ──
  'reports:read_profit': { ar: 'عرض تقارير الأرباح', group: G.REPORTS },
  'reports:read_financial': { ar: 'عرض التقارير المالية', group: G.REPORTS },
  // Grants visibility over EVERY user's operations in reports; without it a user
  // only sees reports for the operations they personally performed.
  'reports:view_all_users': { ar: 'عرض تقارير جميع المستخدمين', group: G.REPORTS },
  'online_commerce_reports:read': { ar: 'عرض تقارير التجارة الأونلاين', group: G.REPORTS },
  'delivery_reports:view': { ar: 'عرض تقارير الشحن', group: G.REPORTS },
  'view:reports': { ar: 'الوصول إلى صفحة التقارير', group: G.REPORTS },
  'view:online_commerce_reports': { ar: 'الوصول إلى تقارير التجارة الأونلاين', group: G.REPORTS, active: false },
  'view:delivery_reports': { ar: 'الوصول إلى تقارير الشحن', group: G.REPORTS, active: false },

  // ── Users / roles ──
  'users:create': { ar: 'إضافة مستخدم', group: G.USERS },
  'users:read': { ar: 'عرض المستخدمين', group: G.USERS },
  'users:update': { ar: 'تعديل مستخدم', group: G.USERS },
  'users:delete': { ar: 'حذف مستخدم', group: G.USERS },
  'users:manage': { ar: 'إدارة المستخدمين', group: G.USERS },
  'view:users': { ar: 'الوصول إلى صفحة المستخدمين', group: G.USERS },
  'roles:read': { ar: 'عرض الأدوار والصلاحيات', group: G.USERS },
  'roles:manage': { ar: 'إدارة الأدوار والصلاحيات', group: G.USERS },
  'view:roles': { ar: 'الوصول إلى صفحة الأدوار', group: G.USERS },
  'view:permissions': { ar: 'الوصول إلى صفحة الصلاحيات', group: G.USERS, active: false },

  // ── Settings / system ──
  'settings:read': { ar: 'عرض الإعدادات', group: G.SETTINGS },
  'settings:update': { ar: 'تعديل الإعدادات', group: G.SETTINGS },
  'settings:manage': { ar: 'إدارة الإعدادات', group: G.SETTINGS },
  'settings:create': { ar: 'إضافة إعداد', group: G.SETTINGS, active: false },
  'settings:delete': { ar: 'حذف إعداد', group: G.SETTINGS, active: false },
  'settings:read_public': { ar: 'قراءة الإعدادات العامة', group: G.SETTINGS, active: false },
  'view:settings': { ar: 'الوصول إلى صفحة الإعدادات', group: G.SETTINGS },
  'view:audit': { ar: 'عرض سجل النشاط', group: G.SETTINGS },
  'audit:read': { ar: 'قراءة سجل التدقيق', group: G.SETTINGS },
  'audit:delete': { ar: 'حذف سجل التدقيق', group: G.SETTINGS },
  'manage_feature_toggles': { ar: 'إدارة الميزات والنمط', group: G.SETTINGS },
  'app_mode:upgrade': { ar: 'ترقية نمط البرنامج', group: G.SETTINGS },

  // ── Legacy backward-compat aliases (hidden from UI, still honoured) ──
  'create:sales': { ar: 'إضافة فاتورة', group: G.SALES, active: false },
  'manage:sales': { ar: 'إدارة المبيعات', group: G.SALES, active: false },
  'delete:sales': { ar: 'حذف فاتورة', group: G.SALES, active: false },
  'create:products': { ar: 'إضافة منتج', group: G.PRODUCTS, active: false },
  'manage:products': { ar: 'إدارة المنتجات', group: G.PRODUCTS, active: false },
  'update:products': { ar: 'تعديل المنتجات', group: G.PRODUCTS, active: false },
  'create:customers': { ar: 'إضافة عميل', group: G.CUSTOMERS, active: false },
  'manage:customers': { ar: 'إدارة العملاء', group: G.CUSTOMERS, active: false },
  'update:customers': { ar: 'تعديل عميل', group: G.CUSTOMERS, active: false },
  'read:reports': { ar: 'عرض التقارير', group: G.REPORTS, active: false },
});

export const PERMISSION_GROUPS = Object.freeze(Object.values(G));

/** Catalog entry for a key (with a safe generic fallback). */
export function catalogEntry(key) {
  return PERMISSION_CATALOG[key] || { ar: key, group: G.SETTINGS, active: false };
}
