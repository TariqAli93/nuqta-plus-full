/**
 * Central navigation registry.
 *
 * The single source of truth for the desktop navigation rail. Nav items are
 * declared here as plain data and rendered generically by <DesktopNavigation>
 * via the <useNavigation> service — NO nav items are hand-written in any Vue
 * template, and NO permission logic lives in the template.
 *
 * Each `route` maps to an existing Vue Router path; renaming a `label` never
 * changes a path or a permission gate. Gating fields mirror the router guard so
 * "visible ⟺ accessible".
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
    icon: 'mdi-view-dashboard',
    route: '/',
    order: 10,
  },

  // ── البيع ──────────────────────────────────────────────────────────────
  {
    id: 'sell',
    label: 'البيع',
    icon: 'mdi-point-of-sale',
    order: 20,
    children: [
      {
        id: 'sell-pos',
        label: 'بيع جديد',
        icon: 'mdi-cash-register',
        route: '/sales/pos',
        feature: 'pos',
        capability: 'canUsePOS',
      },
      {
        id: 'sell-installment',
        label: 'بيع بالتقسيط',
        icon: 'mdi-calendar-clock',
        route: '/sales/new',
        feature: 'installments',
        capability: 'canUseInstallments',
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
      },
      {
        id: 'sales-channels',
        label: 'قنوات البيع',
        icon: 'mdi-bullhorn-variant',
        route: '/sales-channels',
        permission: 'sales_channels:read',
        feature: 'onlineOrders',
      },
      {
        id: 'delivery-shipments',
        label: 'الشحنات والتتبع',
        icon: 'mdi-truck-fast',
        route: '/delivery/shipments',
        permission: 'delivery_shipments:read',
        feature: 'shipping',
      },
      {
        id: 'delivery-providers',
        label: 'شركات النقل',
        icon: 'mdi-truck-outline',
        route: '/settings/integrations/delivery-providers',
        permission: 'delivery_providers:read',
        feature: 'shipping',
      },
      {
        id: 'online-commerce-reports',
        label: 'تقارير التجارة الأونلاين والشحن',
        icon: 'mdi-chart-areaspline',
        route: '/reports/online-commerce-shipping',
        // ANY of the two report permissions opens the page; each tab self-gates.
        permission: ['online_commerce_reports:read', 'delivery_reports:view'],
        anyFeature: ['onlineOrders', 'shipping'],
      },
    ],
  },

  // ── الفواتير ───────────────────────────────────────────────────────────
  {
    id: 'invoices',
    label: 'الفواتير',
    icon: 'mdi-receipt-text-outline',
    route: '/sales',
    permission: 'view:sales',
    order: 40,
  },

  // ── العملاء والديون ────────────────────────────────────────────────────
  {
    id: 'customers',
    label: 'العملاء والديون',
    icon: 'mdi-account-group',
    order: 50,
    children: [
      {
        id: 'customers-list',
        label: 'العملاء',
        icon: 'mdi-account-multiple',
        route: '/customers',
        permission: 'view:customers',
      },
      {
        id: 'collections',
        label: 'قبض الديون',
        icon: 'mdi-hand-coin-outline',
        route: '/collections',
        permission: 'view:sales',
      },
    ],
  },

  // ── البضاعة والمخزون ───────────────────────────────────────────────────
  {
    id: 'stock',
    label: 'البضاعة والمخزون',
    icon: 'mdi-package-variant-closed',
    order: 60,
    children: [
      {
        id: 'products',
        label: 'البضاعة',
        icon: 'mdi-package-variant',
        route: '/products',
        permission: 'view:products',
      },
      {
        id: 'categories',
        label: 'التصنيفات',
        icon: 'mdi-shape',
        route: '/categories',
        permission: 'view:categories',
      },
      {
        id: 'inventory',
        label: 'المخزون',
        icon: 'mdi-warehouse',
        route: '/inventory',
        permission: 'view:inventory',
        feature: 'inventory',
      },
      {
        id: 'inventory-movements',
        label: 'حركات المخزون',
        icon: 'mdi-history',
        route: '/inventory/movements',
        permission: 'view:inventory',
        feature: 'inventory',
      },
      {
        id: 'inventory-transfer',
        label: 'نقل بين المخازن',
        icon: 'mdi-transfer',
        route: '/inventory/transfer',
        feature: 'inventoryTransfers',
        capability: 'canTransferStock',
      },
      {
        id: 'inventory-transfer-requests',
        label: 'طلبات النقل',
        icon: 'mdi-check-decagram',
        route: '/inventory/transfers',
        permission: 'inventory:transfer',
        feature: 'inventoryTransfers',
      },
      {
        id: 'inventory-low-stock',
        label: 'البضاعة القليلة',
        icon: 'mdi-alert',
        route: '/inventory/low-stock',
        permission: 'view:inventory',
        feature: 'inventory',
      },
      {
        id: 'inventory-expiry',
        label: 'تنبيهات الصلاحية',
        icon: 'mdi-calendar-alert',
        route: '/inventory/expiry-alerts',
        permission: 'view:inventory',
        feature: 'inventory',
      },
    ],
  },

  // ── المشتريات والموردين ────────────────────────────────────────────────
  {
    id: 'purchases',
    label: 'المشتريات والموردين',
    icon: 'mdi-truck-delivery',
    anyFeature: ['purchases', 'suppliers'],
    order: 70,
    children: [
      {
        id: 'purchases-list',
        label: 'فواتير الشراء',
        icon: 'mdi-cart-arrow-down',
        route: '/purchases',
        permission: 'view:purchases',
        feature: 'purchases',
        capability: 'canUsePurchases',
      },
      {
        id: 'suppliers',
        label: 'الموردين',
        icon: 'mdi-account-group-outline',
        route: '/suppliers',
        permission: 'view:suppliers',
        feature: 'suppliers',
        capability: 'canUseSuppliers',
      },
    ],
  },

  // ── المالية ────────────────────────────────────────────────────────────
  {
    id: 'finance',
    label: 'المالية',
    icon: 'mdi-safe-square-outline',
    order: 80,
    children: [
      {
        id: 'expenses',
        label: 'المصاريف',
        icon: 'mdi-cash-minus',
        route: '/expenses',
        permission: 'expenses:read',
      },
      {
        id: 'recurring-expenses',
        label: 'المصاريف الثابتة',
        icon: 'mdi-calendar-sync',
        route: '/recurring-expenses',
        permission: 'recurring_expenses:read',
      },
      {
        id: 'cash-box-report',
        label: 'حركة وتقرير الصندوق',
        icon: 'mdi-cash-register',
        // Opens the merged cash-box report window instead of navigating in-app.
        report: 'cash-box',
        permission: 'reports:read_financial',
        pinnable: false,
      },
      {
        id: 'cashboxes',
        label: 'الصناديق',
        icon: 'mdi-safe-square-outline',
        route: '/treasury/cashboxes',
        permission: 'view:treasury',
        feature: 'treasury',
      },
      {
        id: 'vouchers',
        label: 'وصولات القبض والدفع',
        icon: 'mdi-receipt-text-check-outline',
        route: '/treasury/vouchers',
        permission: 'view:treasury',
        feature: 'treasury',
      },
      {
        id: 'treasury-transfers',
        label: 'التحويل بين الصناديق',
        icon: 'mdi-bank-transfer',
        route: '/treasury/transfers',
        permission: 'view:treasury',
        feature: 'treasury',
      },
      {
        id: 'bank-accounts',
        label: 'الحساب المصرفي',
        icon: 'mdi-bank',
        route: '/treasury/bank-accounts',
        permission: 'view:treasury',
        feature: 'bankAccounts',
        capability: 'canUseBankAccounts',
      },
      {
        id: 'accounting-periods',
        label: 'فترات العمل',
        icon: 'mdi-book-clock-outline',
        route: '/accounting-periods',
        permission: 'accounting_periods:read',
      },
    ],
  },

  // ── التقارير ───────────────────────────────────────────────────────────
  {
    id: 'reports',
    label: 'التقارير',
    icon: 'mdi-chart-box',
    order: 90,
    children: [
      {
        id: 'reports-detailed',
        label: 'تقارير مفصّلة',
        icon: 'mdi-chart-box-outline',
        route: '/reports',
        permission: 'view:reports',
      },
      {
        id: 'reports-financial',
        label: 'الربح والخسارة والوضع المالي',
        icon: 'mdi-finance',
        route: '/reports/financial',
        permission: 'reports:read_financial',
        feature: 'financialReports',
        capability: 'canViewFinancialReports',
      },
      {
        id: 'reports-inventory-valuation',
        label: 'قيمة المخزون حسب السعر',
        icon: 'mdi-cash-multiple',
        route: '/reports/inventory-valuation',
        permission: 'view:inventory',
        feature: 'inventory',
      },
    ],
  },

  // ── الإدارة ────────────────────────────────────────────────────────────
  {
    id: 'admin',
    label: 'الإدارة',
    icon: 'mdi-cog',
    order: 100,
    children: [
      {
        id: 'users',
        label: 'الموظفون',
        icon: 'mdi-account-cog',
        route: '/users',
        permission: 'view:users',
      },
      {
        id: 'roles',
        label: 'الأدوار والصلاحيات',
        icon: 'mdi-shield-account-outline',
        route: '/roles',
        permission: 'roles:read',
      },
      {
        id: 'branches-warehouses',
        label: 'الفروع والمخازن',
        icon: 'mdi-store',
        route: '/inventory/settings',
        permission: 'inventory:manage',
        anyFeature: ['multiBranch', 'multiWarehouse'],
      },
      {
        id: 'settings',
        label: 'إعدادات النظام',
        icon: 'mdi-tune',
        route: '/settings',
        permission: 'view:settings',
      },
      {
        id: 'feature-flags',
        label: 'إعدادات الميزات والنمط',
        icon: 'mdi-toggle-switch',
        route: '/settings/feature-flags',
        permission: 'manage_feature_toggles',
      },
    ],
  },

  // ── المحاسبة المتقدمة ──────────────────────────────────────────────────
  {
    id: 'gl',
    label: 'المحاسبة المتقدمة',
    icon: 'mdi-bank',
    feature: 'generalLedger',
    capability: 'canUseGL',
    order: 110,
    children: [
      {
        id: 'gl-accounts',
        label: 'ترتيب الحسابات',
        icon: 'mdi-file-tree',
        route: '/gl/accounts',
        permission: 'gl:read',
        feature: 'generalLedger',
      },
      {
        id: 'gl-journal',
        label: 'التسجيلات المالية',
        icon: 'mdi-book-open-variant',
        route: '/gl/journal',
        permission: 'gl:read',
        feature: 'generalLedger',
      },
      {
        id: 'gl-system-accounts',
        label: 'ربط الحسابات',
        icon: 'mdi-link-variant',
        route: '/gl/system-accounts',
        permission: 'gl:manage_system_accounts',
        feature: 'generalLedger',
      },
      {
        id: 'gl-opening-balances',
        label: 'رصيد بداية التشغيل',
        icon: 'mdi-clipboard-list-outline',
        route: '/settings/opening-balances',
        permission: 'opening_balances:manage',
        feature: 'generalLedger',
      },
      {
        id: 'gl-posting-failures',
        label: 'تسجيلات تحتاج مراجعة',
        icon: 'mdi-wrench-clock',
        route: '/gl/posting-failures',
        permission: 'gl:repair_postings',
        feature: 'generalLedger',
      },
    ],
  },

  // ── حول البرنامج ───────────────────────────────────────────────────────
  {
    id: 'about',
    label: 'حول البرنامج',
    icon: 'mdi-information',
    route: '/about',
    order: 120,
    pinnable: false,
  },
];

/**
 * Titles for routes that are intentionally NOT in the nav rail, so the title
 * bar / command bar still show a correct heading. (Migrated verbatim from the
 * previous useNavigationMenu `extraTitles`.)
 */
export const extraRouteTitles = {
  '/profile': 'الملف الشخصي',
  '/notifications': 'التنبيهات',
  '/forbidden': 'ممنوع الوصول',
  '/setup': 'إعداد النظام',
};

export const APP_TITLE = 'نقطة بلس';
