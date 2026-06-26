/**
 * Application command catalog.
 *
 * The single source for module commands. Every command does a REAL action via
 * the unified context (`ctx.app.navigate(target)` / `ctx.app.openReport(type)` /
 * page actions) — never a bare `router.push('/x')` that just opens a page
 * without doing the thing. "Open section" and "run operation" are separate
 * commands (e.g. `settings.backup.open` vs `settings.backup.create`).
 *
 * Pure data — `execute` uses only the injected CommandContext.
 *
 * @type {import('./core.js').AppCommand[]}
 */

// Selection guards (RBAC stays in `permission`; these only gate on selection).
const needsOne = {
  enabled: (ctx) => ctx.selection.length === 1,
  disabledReason: 'حدد عنصراً واحداً أولاً',
};

export const appCatalog = [
  // ══ Application ════════════════════════════════════════════════════════
  {
    id: 'app.check-updates',
    title: 'فحص التحديثات',
    description: 'البحث عن تحديث جديد للتطبيق',
    icon: 'mdi-update',
    group: 'Application',
    keywords: ['update', 'updates', 'تحديث', 'تحديثات'],
    execute: () => window.electronAPI?.checkUpdatesManually?.(),
  },
  {
    id: 'app.about',
    title: 'حول البرنامج',
    icon: 'mdi-information-outline',
    group: 'Application',
    keywords: ['about', 'version', 'حول', 'إصدار', 'اصدار'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'About' }),
  },
  {
    id: 'app.help-shortcuts',
    title: 'اختصارات لوحة المفاتيح',
    icon: 'mdi-keyboard',
    shortcut: '?',
    group: 'Application',
    keywords: ['help', 'shortcuts', 'مساعدة', 'اختصارات'],
    execute: () => window.dispatchEvent(new CustomEvent('open-shortcuts-help')),
  },

  // ══ Navigation (open module) ═══════════════════════════════════════════
  ...[
    { id: 'nav.products', title: 'فتح المنتجات', icon: 'mdi-package-variant', route: '/products', perm: 'view:products', kw: ['products', 'بضاعة', 'منتجات'] },
    { id: 'nav.invoices', title: 'فتح الفواتير', icon: 'mdi-receipt-text-outline', route: '/sales', perm: 'view:sales', kw: ['invoices', 'sales', 'فواتير', 'مبيعات'] },
    { id: 'nav.customers', title: 'فتح العملاء', icon: 'mdi-account-multiple', route: '/customers', perm: 'view:customers', kw: ['customers', 'عملاء'] },
    { id: 'nav.suppliers', title: 'فتح الموردين', icon: 'mdi-truck', route: '/suppliers', perm: 'view:suppliers', kw: ['suppliers', 'موردين', 'موردون'] },
    { id: 'nav.purchases', title: 'فتح المشتريات', icon: 'mdi-cart-arrow-down', route: '/purchases', perm: 'view:purchases', kw: ['purchases', 'مشتريات', 'شراء'] },
    { id: 'nav.inventory', title: 'فتح المخزون', icon: 'mdi-warehouse', route: '/inventory', perm: 'view:inventory', kw: ['inventory', 'stock', 'مخزون'] },
    { id: 'nav.warehouses', title: 'فتح الفروع والمخازن', icon: 'mdi-store', route: '/inventory/settings', perm: 'inventory:manage', kw: ['warehouses', 'branches', 'مخازن', 'فروع'] },
    { id: 'nav.expenses', title: 'فتح المصاريف', icon: 'mdi-cash-minus', route: '/expenses', perm: 'expenses:read', kw: ['expenses', 'مصاريف'] },
    { id: 'nav.treasury', title: 'فتح الصناديق', icon: 'mdi-safe-square-outline', route: '/treasury/cashboxes', perm: 'view:treasury', kw: ['cash', 'treasury', 'صناديق', 'خزينة'] },
    { id: 'nav.gl', title: 'فتح القيود المحاسبية', icon: 'mdi-book-open-variant', route: '/gl/journal', perm: 'gl:read', kw: ['journal', 'gl', 'قيود', 'محاسبة'] },
    { id: 'nav.reports', title: 'فتح التقارير', icon: 'mdi-chart-box', route: '/reports', perm: 'view:reports', kw: ['reports', 'تقارير'] },
    { id: 'nav.users', title: 'فتح المستخدمين', icon: 'mdi-account-cog', route: '/users', perm: 'view:users', kw: ['users', 'مستخدمين', 'موظفين'] },
    { id: 'nav.roles', title: 'فتح الأدوار', icon: 'mdi-shield-account-outline', route: '/roles', perm: 'roles:read', kw: ['roles', 'permissions', 'أدوار', 'صلاحيات'] },
    { id: 'nav.notifications', title: 'فتح التنبيهات', icon: 'mdi-bell-outline', route: '/notifications', perm: null, kw: ['notifications', 'alerts', 'تنبيهات', 'إشعارات'] },
  ].map((m) => ({
    id: m.id,
    title: m.title,
    icon: m.icon,
    group: 'Navigation',
    keywords: m.kw,
    ...(m.perm ? { permission: m.perm } : {}),
    execute: (ctx) => ctx.app.navigate({ path: m.route }),
  })),
  {
    id: 'nav.pos',
    title: 'فتح نقطة البيع',
    icon: 'mdi-cash-register',
    group: 'Sales',
    permission: 'sales:create',
    keywords: ['pos', 'sell', 'نقطة بيع', 'كاشير', 'بيع'],
    execute: (ctx) => ctx.app.navigate({ path: '/sales/pos' }),
  },

  // ══ Products (operations — run real page actions) ══════════════════════
  {
    id: 'products.export',
    title: 'تصدير المنتجات',
    icon: 'mdi-download',
    group: 'Products',
    permission: 'view:products',
    keywords: ['export', 'تصدير', 'products'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Products', action: 'export' }),
  },
  {
    id: 'products.refresh',
    title: 'تحديث قائمة المنتجات',
    icon: 'mdi-refresh',
    group: 'Products',
    permission: 'view:products',
    keywords: ['refresh', 'reload', 'تحديث', 'products'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Products', action: 'refresh' }),
  },
  {
    id: 'products.edit-selected',
    title: 'تعديل المنتج المحدد',
    icon: 'mdi-pencil',
    group: 'Products',
    scope: 'route',
    routes: ['/products'],
    permission: 'products:update',
    keywords: ['edit', 'تعديل'],
    ...needsOne,
    execute: (ctx) => ctx.app.navigate({ path: `/products/${ctx.selection[0]?.id}/edit` }),
  },

  // ══ Customers (operation) ══════════════════════════════════════════════
  {
    id: 'customers.export',
    title: 'تصدير العملاء',
    icon: 'mdi-download',
    group: 'Customers',
    permission: 'view:customers',
    keywords: ['export', 'تصدير', 'customers', 'عملاء'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Customers', action: 'export' }),
  },
  {
    id: 'customers.refresh',
    title: 'تحديث قائمة العملاء',
    icon: 'mdi-refresh',
    group: 'Customers',
    permission: 'view:customers',
    keywords: ['refresh', 'تحديث', 'customers'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Customers', action: 'refresh' }),
  },

  // ══ Inventory ══════════════════════════════════════════════════════════
  {
    id: 'inventory.transfer',
    title: 'تحويل مخزون',
    icon: 'mdi-transfer',
    group: 'Inventory',
    feature: 'inventoryTransfers',
    capability: 'canTransferStock',
    keywords: ['transfer', 'نقل', 'تحويل', 'مخزون'],
    execute: (ctx) => ctx.app.navigate({ path: '/inventory/transfer' }),
  },
  {
    id: 'inventory.low-stock',
    title: 'تنبيهات المخزون المنخفض',
    icon: 'mdi-alert',
    group: 'Inventory',
    permission: 'view:inventory',
    keywords: ['low stock', 'منخفض', 'تنبيهات'],
    execute: (ctx) => ctx.app.navigate({ path: '/inventory/low-stock' }),
  },
  {
    id: 'inventory.refresh',
    title: 'تحديث بيانات المخزون',
    icon: 'mdi-refresh',
    group: 'Inventory',
    permission: 'view:inventory',
    keywords: ['refresh', 'تحديث', 'مخزون'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Inventory', action: 'refresh' }),
  },

  // ══ Accounting ═════════════════════════════════════════════════════════
  {
    id: 'accounting.new-entry',
    title: 'فتح قيد محاسبي جديد',
    icon: 'mdi-book-plus',
    group: 'Accounting',
    permission: 'gl:read',
    keywords: ['journal', 'entry', 'قيد', 'جديد'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'JournalEntries', action: 'create' }),
  },
  {
    id: 'accounting.periods',
    title: 'فتح فترات العمل',
    icon: 'mdi-book-clock-outline',
    group: 'Accounting',
    permission: 'accounting_periods:read',
    keywords: ['periods', 'فترات', 'محاسبة'],
    execute: (ctx) => ctx.app.navigate({ path: '/accounting-periods' }),
  },
  {
    id: 'accounting.add-expense',
    title: 'إضافة مصروف',
    icon: 'mdi-cash-plus',
    group: 'Accounting',
    permission: 'expenses:create',
    keywords: ['expense', 'مصروف', 'إضافة'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Expenses', action: 'create' }),
  },
  {
    id: 'accounting.financial-reports',
    title: 'فتح التقارير المالية',
    icon: 'mdi-finance',
    group: 'Accounting',
    permission: 'reports:read_financial',
    feature: 'financialReports',
    keywords: ['financial', 'مالية', 'ربح', 'خسارة'],
    execute: (ctx) => ctx.app.navigate({ path: '/reports/financial' }),
  },

  // ══ Reports (open the standalone report window — real execution) ═══════
  ...[
    { id: 'reports.sales', title: 'تشغيل تقرير المبيعات', type: 'sales', perm: 'sales:read', kw: ['sales report', 'تقرير مبيعات'] },
    { id: 'reports.profit', title: 'تشغيل تقرير الأرباح', type: 'profit', perm: 'reports:read_profit', kw: ['profit report', 'تقرير أرباح', 'ربح'] },
    { id: 'reports.top-products', title: 'تشغيل تقرير أكثر المنتجات', type: 'top-products', perm: 'reports:read_profit', kw: ['top products', 'أكثر المنتجات'] },
    { id: 'reports.debts', title: 'تشغيل تقرير الديون', type: 'debts', perm: 'sales:read', kw: ['debts report', 'تقرير ديون', 'مديونية'] },
    { id: 'reports.cash-box', title: 'تشغيل تقرير الصندوق', type: 'cash-box', perm: 'reports:read_financial', kw: ['cash box report', 'تقرير الصندوق'] },
    { id: 'reports.expenses', title: 'تشغيل تقرير المصاريف', type: 'expenses', perm: 'view:expenses', kw: ['expenses report', 'تقرير مصاريف'] },
  ].map((r) => ({
    id: r.id,
    title: r.title,
    icon: 'mdi-chart-box-outline',
    group: 'Reports',
    permission: r.perm,
    keywords: r.kw,
    execute: (ctx) => ctx.app.openReport(r.type),
  })),
  {
    id: 'reports.inventory-valuation',
    title: 'فتح تقرير قيمة المخزون',
    icon: 'mdi-cash-multiple',
    group: 'Reports',
    permission: 'view:inventory',
    feature: 'inventory',
    keywords: ['inventory valuation', 'قيمة المخزون'],
    execute: (ctx) => ctx.app.navigate({ path: '/reports/inventory-valuation' }),
  },

  // ══ Administration ═════════════════════════════════════════════════════
  {
    id: 'admin.add-user',
    title: 'إضافة مستخدم',
    icon: 'mdi-account-plus',
    group: 'Administration',
    scope: 'route',
    routes: ['/users'],
    permission: 'view:users',
    keywords: ['add user', 'مستخدم جديد', 'موظف'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Users', action: 'create' }),
  },
  {
    id: 'admin.feature-flags',
    title: 'فتح إعدادات الميزات',
    icon: 'mdi-toggle-switch',
    group: 'Administration',
    permission: 'manage_feature_toggles',
    keywords: ['features', 'flags', 'ميزات'],
    execute: (ctx) => ctx.app.navigate({ path: '/settings/feature-flags' }),
  },

  // ══ Settings (open-section vs run-operation — the headline) ════════════
  {
    id: 'settings.company.open',
    title: 'فتح إعدادات الشركة',
    icon: 'mdi-domain',
    group: 'Settings',
    permission: 'view:settings',
    keywords: ['company settings', 'الشركة', 'إعدادات عامة', 'general'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'company' }),
  },
  {
    id: 'settings.currency.open',
    title: 'فتح إعدادات العملة',
    icon: 'mdi-currency-usd',
    group: 'Settings',
    permission: 'view:settings',
    keywords: ['currency', 'عملة', 'صرف'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'currency' }),
  },
  {
    id: 'settings.messaging.open',
    title: 'فتح إعدادات الرسائل والإشعارات',
    icon: 'mdi-message-text',
    group: 'Settings',
    permission: 'settings:manage',
    keywords: ['email', 'messaging', 'بريد', 'رسائل', 'واتساب'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'messaging' }),
  },
  {
    id: 'settings.backup.open',
    title: 'فتح إعدادات النسخ الاحتياطي',
    description: 'الانتقال مباشرة إلى تبويب النسخ الاحتياطي',
    icon: 'mdi-backup-restore',
    group: 'Settings',
    permission: 'view:settings',
    keywords: ['backup', 'restore', 'نسخة', 'نسخ احتياطي', 'إعدادات النسخ', 'save backup'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'backup' }),
  },
  {
    id: 'settings.backup.create',
    title: 'إنشاء نسخة احتياطية الآن',
    description: 'فتح تبويب النسخ ثم بدء عملية النسخ',
    icon: 'mdi-content-save',
    group: 'Settings',
    permission: 'view:settings',
    keywords: ['create backup', 'نسخة احتياطية', 'إنشاء نسخة', 'export database', 'حفظ'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'backup', action: 'backup.create' }),
  },
  {
    id: 'settings.backup.restore',
    title: 'استعادة نسخة احتياطية',
    description: 'فتح تبويب النسخ ثم اختيار ملف للاستعادة',
    icon: 'mdi-restore',
    group: 'Settings',
    permission: 'view:settings',
    keywords: ['restore', 'استعادة', 'استرجاع', 'import backup', 'استرجاع قاعدة البيانات'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'backup', action: 'backup.restore' }),
  },
  {
    id: 'settings.license.open',
    title: 'فتح إعدادات الترخيص',
    icon: 'mdi-license',
    group: 'Settings',
    permission: 'view:settings',
    keywords: ['license', 'ترخيص', 'تفعيل'],
    execute: (ctx) => ctx.app.navigate({ routeName: 'Settings', tab: 'license' }),
  },
];
