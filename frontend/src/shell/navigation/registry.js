/**
 * Central navigation registry.
 *
 * The single source of truth for the desktop navigation drawer AND the command
 * palette's "open module" commands (derived in commands/navCommands.js). Nav
 * items are declared here as plain data and rendered generically by
 * <DesktopNavigation> via the <useNavigation> service — NO nav items are
 * hand-written in any Vue template, and NO permission logic lives in a template.
 *
 * Each `route` maps to an existing Vue Router path; renaming a `label` never
 * changes a path or a permission gate. Gating fields MIRROR the route guard
 * (meta.permission / feature / capability) so "visible ⟺ accessible".
 *
 * Labels stay deliberately owner-friendly (no raw accounting jargon): e.g.
 * "التسجيلات المالية" not «القيود اليومية», "ترتيب الحسابات" not «دليل الحسابات».
 *
 * @typedef {Object} NavigationItem
 * @property {string}            id          Stable unique id (kebab-case).
 * @property {string}            label       Arabic display label.
 * @property {string}            [icon]      mdi-* icon name.
 * @property {string}            [route]     In-app router path to navigate to.
 * @property {string}            [report]    Quick-question report type to open
 *                                           in a standalone window (instead of
 *                                           `route`).
 * @property {string}            [commandId] Reserved: a command to invoke
 *                                           instead of navigating.
 * @property {string|string[]}   [permission] RBAC key(s); array = ANY-of.
 * @property {string}            [feature]   Feature flag that must be on.
 * @property {string[]}          [anyFeature] Show if ANY listed flag is on.
 * @property {string}            [capability] Backend capability that must be true.
 * @property {string[]}          [roles]     Explicit role allow-list (rare).
 * @property {string[]}          [keywords]  Extra search terms for the palette.
 * @property {number}            [order]     Sort order within its level.
 * @property {NavigationItem[]}  [children]  Sub-items (makes this a group).
 * @property {string|number}     [badge]     Static badge value (dynamic badges
 *                                           are layered on by the service).
 * @property {boolean}           [hidden]    Force-hide regardless of gates.
 * @property {boolean}           [pinnable]  Whether the user may pin it
 *                                           (defaults true for leaf routes).
 */

/** @type {NavigationItem[]} */
export const navigationRegistry = [
  // ── الرئيسية ───────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'الرئيسية',
    icon: 'mdi-view-dashboard-outline',
    route: '/',
    order: 10,
    keywords: ['dashboard', 'home', 'رئيسية', 'لوحة', 'لوحة التحكم'],
  },

  // ── المبيعات ───────────────────────────────────────────────────────────
  {
    id: 'sales',
    label: 'المبيعات',
    icon: 'mdi-cart-outline',
    order: 20,
    children: [
      {
        id: 'sell-pos',
        label: 'نقطة البيع',
        icon: 'mdi-cash-register',
        route: '/sales/pos',
        permission: 'sales:create',
        feature: 'pos',
        capability: 'canUsePOS',
        keywords: ['pos', 'sell', 'نقطة بيع', 'كاشير', 'بيع'],
      },
      {
        id: 'sell-installment',
        label: 'فاتورة مبيعات',
        icon: 'mdi-cart-plus',
        route: '/sales/new',
        permission: 'sales:create',
        keywords: [
          'new sale',
          'invoice',
          'فاتورة بيع',
          'فاتورة جديدة',
          'بيع جديد',
          'نقدي',
          'cash',
          'installment',
          'تقسيط',
          'اقساط',
          'أقساط',
        ],
      },
      {
        id: 'invoices',
        label: 'الفواتير',
        icon: 'mdi-receipt-text-outline',
        route: '/sales',
        permission: 'view:sales',
        keywords: ['invoices', 'sales', 'فواتير', 'مبيعات'],
      },
      {
        id: 'customers-list',
        label: 'العملاء',
        icon: 'mdi-account-multiple',
        route: '/customers',
        permission: 'view:customers',
        keywords: ['customers', 'عملاء', 'زبائن'],
      },
      {
        id: 'collections',
        label: 'قبض الديون',
        icon: 'mdi-hand-coin-outline',
        route: '/collections',
        permission: 'sales:read',
        keywords: ['collections', 'debts', 'قبض', 'ديون', 'تحصيل'],
      },
    ],
  },

  // ── التجارة الأونلاين ──────────────────────────────────────────────────
  {
    id: 'online-commerce',
    label: 'البيع اونلاين',
    icon: 'mdi-storefront-outline',
    order: 30,
    children: [
      {
        id: 'online-orders',
        label: 'الطلبات الأونلاين',
        icon: 'mdi-cart-arrow-down',
        route: '/online-orders',
        permission: 'online_orders:read',
        feature: 'onlineOrders',
        keywords: ['online orders', 'طلبات', 'اونلاين'],
      },
      {
        id: 'sales-channels',
        label: 'قنوات البيع',
        icon: 'mdi-bullhorn-variant-outline',
        route: '/sales-channels',
        permission: 'sales_channels:read',
        feature: 'onlineOrders',
        keywords: ['channels', 'قنوات', 'منصات'],
      },
      {
        id: 'delivery-shipments',
        label: 'الشحنات والتتبع',
        icon: 'mdi-truck-fast-outline',
        route: '/delivery/shipments',
        permission: 'delivery_shipments:read',
        feature: 'shipping',
        keywords: ['shipping', 'tracking', 'شحن', 'تتبع', 'توصيل'],
      },
      {
        id: 'delivery-providers',
        label: 'شركات النقل',
        icon: 'mdi-truck-outline',
        route: '/settings/integrations/delivery-providers',
        permission: 'delivery_providers:read',
        feature: 'shipping',
        keywords: ['carriers', 'شركات نقل', 'مندوب'],
      },
      {
        id: 'online-commerce-reports',
        label: 'تقارير التجارة الأونلاين والشحن',
        icon: 'mdi-chart-areaspline',
        route: '/reports/online-commerce-shipping',
        // ANY of the two report permissions opens the page; each tab self-gates.
        permission: ['online_commerce_reports:read', 'delivery_reports:view'],
        anyFeature: ['onlineOrders', 'shipping'],
        keywords: ['online reports', 'تقارير اونلاين', 'شحن'],
      },
    ],
  },

  // ── البضاعة والمخزون ───────────────────────────────────────────────────
  {
    id: 'stock',
    label: 'البضاعة والمخزون',
    icon: 'mdi-package-variant-closed',
    order: 40,
    children: [
      {
        id: 'products',
        label: 'البضاعة',
        icon: 'mdi-package-variant',
        route: '/products',
        permission: 'view:products',
        keywords: ['products', 'بضاعة', 'منتجات', 'اصناف'],
      },
      {
        id: 'categories',
        label: 'الفئات',
        icon: 'mdi-shape-outline',
        route: '/categories',
        permission: 'view:categories',
        keywords: ['categories', 'تصنيفات', 'أصناف'],
      },
      {
        id: 'inventory',
        label: 'المخزون',
        icon: 'mdi-warehouse',
        route: '/inventory',
        permission: 'view:inventory',
        feature: 'inventory',
        keywords: ['inventory', 'stock', 'مخزون'],
      },
      {
        id: 'inventory-movements',
        label: 'حركات المخزون',
        icon: 'mdi-history',
        route: '/inventory/movements',
        permission: 'view:inventory',
        feature: 'inventory',
        keywords: ['movements', 'حركات', 'جرد', 'تسوية'],
      },
      {
        id: 'inventory-transfer',
        label: 'نقل بين المخازن',
        icon: 'mdi-transfer',
        route: '/inventory/transfer',
        permission: 'inventory:transfer',
        feature: 'inventoryTransfers',
        capability: 'canTransferStock',
        keywords: ['transfer', 'نقل', 'تحويل مخزون'],
      },
      {
        id: 'inventory-transfer-requests',
        label: 'طلبات النقل',
        icon: 'mdi-check-decagram',
        route: '/inventory/transfers',
        permission: 'inventory:transfer',
        feature: 'inventoryTransfers',
        keywords: ['transfer requests', 'طلبات نقل'],
      },
      {
        id: 'inventory-low-stock',
        label: 'البضاعة القليلة',
        icon: 'mdi-alert-outline',
        route: '/inventory/low-stock',
        permission: 'view:inventory',
        feature: 'inventory',
        keywords: ['low stock', 'قليلة', 'نواقص'],
      },
      {
        id: 'inventory-expiry',
        label: 'تنبيهات الصلاحية',
        icon: 'mdi-calendar-alert',
        route: '/inventory/expiry-alerts',
        permission: 'view:inventory',
        feature: 'inventory',
        keywords: ['expiry', 'صلاحية', 'انتهاء'],
      },
    ],
  },

  // ── المشتريات والموردين ────────────────────────────────────────────────
  {
    id: 'purchases',
    label: 'المشتريات والموردين',
    icon: 'mdi-truck-delivery-outline',
    anyFeature: ['purchases', 'suppliers'],
    order: 50,
    children: [
      {
        id: 'purchases-list',
        label: 'فواتير الشراء',
        icon: 'mdi-cart-arrow-down',
        route: '/purchases',
        permission: 'view:purchases',
        feature: 'purchases',
        capability: 'canUsePurchases',
        keywords: ['purchases', 'مشتريات', 'شراء'],
      },
      {
        id: 'suppliers',
        label: 'الموردين',
        icon: 'mdi-account-group-outline',
        route: '/suppliers',
        permission: 'view:suppliers',
        feature: 'suppliers',
        capability: 'canUseSuppliers',
        keywords: ['suppliers', 'موردين', 'موردون'],
      },
    ],
  },

  // ── المالية والمحاسبة (المالية + المحاسبة المتقدمة مدموجتان) ────────────
  {
    id: 'finance',
    label: 'المالية والمحاسبة',
    icon: 'mdi-cash-multiple',
    order: 60,
    children: [
      {
        id: 'cashboxes',
        label: 'الصناديق',
        icon: 'mdi-safe-square-outline',
        route: '/treasury/cashboxes',
        permission: 'view:treasury',
        feature: 'treasury',
        capability: 'canUseTreasury',
        keywords: ['cash', 'treasury', 'صناديق', 'خزينة'],
      },
      {
        id: 'vouchers',
        label: 'وصولات القبض والدفع',
        icon: 'mdi-receipt-text-check-outline',
        route: '/treasury/vouchers',
        permission: 'view:treasury',
        feature: 'treasury',
        capability: 'canUseTreasury',
        keywords: ['vouchers', 'وصولات', 'سند', 'قبض', 'دفع'],
      },
      {
        id: 'treasury-transfers',
        label: 'التحويل بين الصناديق',
        icon: 'mdi-bank-transfer',
        route: '/treasury/transfers',
        permission: 'view:treasury',
        feature: 'treasury',
        capability: 'canUseTreasury',
        keywords: ['transfer', 'تحويل', 'صناديق'],
      },
      {
        id: 'bank-accounts',
        label: 'الحساب المصرفي',
        icon: 'mdi-bank',
        route: '/treasury/bank-accounts',
        permission: 'view:treasury',
        feature: 'bankAccounts',
        capability: 'canUseBankAccounts',
        keywords: ['bank', 'بنك', 'مصرف'],
      },
      {
        id: 'expenses',
        label: 'المصاريف',
        icon: 'mdi-cash-minus',
        route: '/expenses',
        permission: 'expenses:read',
        keywords: ['expenses', 'مصاريف', 'مصروف'],
      },
      {
        id: 'recurring-expenses',
        label: 'المصاريف الثابتة',
        icon: 'mdi-calendar-sync',
        route: '/recurring-expenses',
        permission: 'recurring_expenses:read',
        keywords: ['recurring', 'ثابتة', 'شهرية'],
      },
      {
        id: 'accounting-periods',
        label: 'فترات العمل',
        icon: 'mdi-book-clock-outline',
        route: '/accounting-periods',
        permission: 'accounting_periods:read',
        keywords: ['periods', 'فترات', 'اقفال', 'إقفال'],
      },
      {
        id: 'cash-box-report',
        label: 'حركة وتقرير الصندوق',
        icon: 'mdi-cash-register',
        // Opens the merged cash-box report window instead of navigating in-app.
        report: 'cash-box',
        permission: 'reports:read_financial',
        pinnable: false,
        keywords: ['cash report', 'حركة الصندوق', 'تقرير الصندوق'],
      },
      // ── المحاسبة المتقدمة (gated generalLedger + canUseGL) ──────────────
      {
        id: 'gl-accounts',
        label: 'ترتيب الحسابات',
        icon: 'mdi-file-tree',
        route: '/gl/accounts',
        permission: 'gl:read',
        feature: 'generalLedger',
        capability: 'canUseGL',
        keywords: ['accounts', 'حسابات', 'ترتيب'],
      },
      {
        id: 'gl-journal',
        label: 'التسجيلات المالية',
        icon: 'mdi-book-open-variant',
        route: '/gl/journal',
        permission: 'gl:read',
        feature: 'generalLedger',
        capability: 'canUseGL',
        keywords: ['journal', 'تسجيلات', 'قيود'],
      },
      {
        id: 'gl-system-accounts',
        label: 'ربط الحسابات',
        icon: 'mdi-link-variant',
        route: '/gl/system-accounts',
        permission: 'gl:manage_system_accounts',
        feature: 'generalLedger',
        capability: 'canUseGL',
        keywords: ['system accounts', 'ربط حسابات'],
      },
      {
        id: 'gl-opening-balances',
        label: 'رصيد بداية التشغيل',
        icon: 'mdi-clipboard-list-outline',
        route: '/settings/opening-balances',
        permission: 'opening_balances:manage',
        feature: 'generalLedger',
        keywords: ['opening balances', 'رصيد افتتاحي', 'بداية'],
      },
      {
        id: 'gl-posting-failures',
        label: 'تسجيلات تحتاج مراجعة',
        icon: 'mdi-wrench-clock',
        route: '/gl/posting-failures',
        permission: 'gl:repair_postings',
        feature: 'generalLedger',
        capability: 'canUseGL',
        keywords: ['posting failures', 'مراجعة', 'اخطاء'],
      },
    ],
  },

  // ── التقارير ───────────────────────────────────────────────────────────
  {
    id: 'reports',
    label: 'التقارير',
    icon: 'mdi-chart-box-outline',
    order: 70,
    children: [
      // {
      //   id: 'reports-detailed',
      //   label: 'تقارير مفصّلة',
      //   icon: 'mdi-file-chart-outline',
      //   route: '/reports',
      //   permission: 'view:reports',
      //   keywords: ['reports', 'تقارير', 'مفصلة'],
      // },
      {
        id: 'reports-financial',
        label: 'الربح والخسارة والوضع المالي',
        icon: 'mdi-finance',
        route: '/reports/financial',
        permission: 'reports:read_financial',
        feature: 'financialReports',
        capability: 'canViewFinancialReports',
        keywords: ['profit loss', 'ربح', 'خسارة', 'مركز مالي'],
      },
      {
        id: 'reports-inventory-valuation',
        label: 'قيمة المخزون حسب السعر',
        icon: 'mdi-chart-bar',
        route: '/reports/inventory-valuation',
        permission: 'view:inventory',
        feature: 'inventory',
        keywords: ['valuation', 'قيمة المخزون', 'تقييم'],
      },
      {
        id: 'report-sales',
        label: 'تقرير المبيعات',
        icon: 'mdi-chart-line',
        report: 'sales',
        permission: 'sales:read',
        pinnable: false,
        keywords: ['sales report', 'تقرير مبيعات'],
      },
      {
        id: 'report-profit',
        label: 'تقرير الأرباح',
        icon: 'mdi-chart-areaspline',
        report: 'profit',
        permission: 'reports:read_profit',
        pinnable: false,
        keywords: ['profit report', 'تقرير ارباح', 'أرباح'],
      },
      {
        id: 'report-debts',
        label: 'تقرير الديون',
        icon: 'mdi-account-cash-outline',
        report: 'debts',
        permission: 'sales:read',
        pinnable: false,
        keywords: ['debts report', 'تقرير ديون', 'مديونية'],
      },
      {
        id: 'report-expenses',
        label: 'تقرير المصاريف',
        icon: 'mdi-chart-bar-stacked',
        report: 'expenses',
        permission: 'view:expenses',
        pinnable: false,
        keywords: ['expenses report', 'تقرير مصاريف'],
      },
    ],
  },

  // ── الإدارة ────────────────────────────────────────────────────────────
  {
    id: 'admin',
    label: 'الإدارة',
    icon: 'mdi-cog-outline',
    order: 80,
    children: [
      {
        id: 'users',
        label: 'الموظفون',
        icon: 'mdi-account-cog-outline',
        route: '/users',
        permission: 'view:users',
        keywords: ['users', 'موظفين', 'مستخدمين'],
      },
      {
        id: 'roles',
        label: 'الأدوار والصلاحيات',
        icon: 'mdi-shield-account-outline',
        route: '/roles',
        permission: 'roles:read',
        keywords: ['roles', 'permissions', 'ادوار', 'صلاحيات'],
      },
      {
        id: 'branches-warehouses',
        label: 'الفروع والمخازن',
        icon: 'mdi-store-outline',
        route: '/inventory/settings',
        permission: 'inventory:manage',
        anyFeature: ['multiBranch', 'multiWarehouse'],
        keywords: ['branches', 'warehouses', 'فروع', 'مخازن'],
      },
      {
        id: 'feature-flags',
        label: 'إعدادات الميزات والنمط',
        icon: 'mdi-toggle-switch-outline',
        route: '/settings/feature-flags',
        permission: 'manage_feature_toggles',
        keywords: ['features', 'flags', 'ميزات', 'نمط'],
      },
    ],
  },
];

/**
 * Fixed footer items (rendered pinned at the bottom of the drawer, NOT in the
 * scrolling tree). The current-user block and logout are dedicated footer UI
 * (they need auth state + a logout action), so only the plain route links live
 * here. Gated by the same {@link useNavigation} `passes()` filter.
 *
 * @type {NavigationItem[]}
 */
export const navigationFooter = [
  {
    id: 'settings',
    label: 'الإعدادات',
    icon: 'mdi-cog-outline',
    route: '/settings',
    permission: 'view:settings',
    pinnable: false,
    keywords: ['settings', 'اعدادات', 'إعدادات'],
  },
  {
    id: 'about',
    label: 'حول البرنامج',
    icon: 'mdi-information-outline',
    route: '/about',
    pinnable: false,
    keywords: ['about', 'version', 'حول', 'اصدار', 'إصدار'],
  },
];

/**
 * Titles for routes that are intentionally NOT in the nav rail, so the title
 * bar / command bar still show a correct heading. (Footer routes — /settings,
 * /about — resolve via the service's footer-aware lookup.)
 */
export const extraRouteTitles = {
  '/profile': 'الملف الشخصي',
  '/notifications': 'التنبيهات',
  '/forbidden': 'ممنوع الوصول',
  '/setup': 'إعداد النظام',
};

export const APP_TITLE = 'نقطة بلس';
