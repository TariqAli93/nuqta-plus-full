import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Navigation menu composable.
 *
 * The sidebar is organised by *business domain* (Sales / Products / Inventory /
 * Finance / Administration) instead of an abstract "Operations" bucket, so a
 * non-technical shop owner can predict where each task lives. Each item can
 * declare:
 *
 *   - `permission`: RBAC permission required (checked via permissionMatrix)
 *   - `feature`:    feature flag that must be enabled
 *   - `capability`: backend-issued capability flag that must be true (preferred —
 *                   already accounts for both feature flags AND role)
 *   - `roles`:      explicit allow-list of roles (rarely used)
 *   - `group`:      sub-items for a collapsible group
 *
 * A section is hidden entirely when all of its items are hidden.
 *
 * NOTE: titles here are display labels only — every `to` maps to an existing
 * route. Renaming a label never changes a path or a permission gate.
 */
export function useNavigationMenu() {
  const authStore = useAuthStore();

  const sections = [
    // ── الرئيسية ───────────────────────────────────────────────────────────
    {
      title: 'الرئيسية',
      icon: 'mdi-view-dashboard',
      to: '/',
      permission: null,
    },

    // ── البيع ──────────────────────────────────────────────────────────────
    {
      title: 'البيع',
      icon: 'mdi-point-of-sale',
      to: '#sell',
      group: {
        items: [
          {
            title: 'بيع جديد',
            icon: 'mdi-cash-register',
            to: '/sales/pos',
            // Defense-in-depth: declare BOTH the feature flag and the capability
            // so the item disappears even if the capability stays true while the
            // flag is off.
            feature: 'pos',
            capability: 'canUsePOS',
          },
          {
            title: 'بيع بالتقسيط',
            icon: 'mdi-calendar-clock',
            to: '/sales/new',
            feature: 'installments',
            capability: 'canUseInstallments',
          },
        ],
      },
    },

    // ── التجارة الأونلاين ──────────────────────────────────────────────────
    // Visible only when the online-orders OR shipping feature is enabled. Each
    // item self-gates by its own feature, so the whole group hides when both
    // features are off (no sub-item survives `checkVisibility`). Permission keys
    // match the backend route guards so "visible ⟺ accessible".
    {
      title: 'البيع اونلاين',
      icon: 'mdi-storefront-outline',
      to: '#online-commerce',
      group: {
        items: [
          {
            title: 'الطلبات الأونلاين',
            icon: 'mdi-cart-arrow-down',
            to: '/online-orders',
            permission: 'online_orders:read',
            feature: 'onlineOrders',
          },
          {
            title: 'قنوات البيع',
            icon: 'mdi-bullhorn-variant',
            to: '/sales-channels',
            permission: 'sales_channels:read',
            feature: 'onlineOrders',
          },
          {
            title: 'الشحنات والتتبع',
            icon: 'mdi-truck-fast',
            to: '/delivery/shipments',
            permission: 'delivery_shipments:read',
            feature: 'shipping',
          },
          {
            title: 'شركات النقل',
            icon: 'mdi-truck-outline',
            to: '/settings/integrations/delivery-providers',
            permission: 'delivery_providers:read',
            feature: 'shipping',
          },
          {
            title: 'تقارير التجارة الأونلاين والشحن',
            icon: 'mdi-chart-areaspline',
            to: '/reports/online-commerce-shipping',
            // ANY of the two report permissions opens the page; each tab inside
            // self-gates by its feature.
            permission: ['online_commerce_reports:read', 'delivery_reports:view'],
            anyFeature: ['onlineOrders', 'shipping'],
          },
        ],
      },
    },

    // ── الفواتير ───────────────────────────────────────────────────────────
    {
      title: 'الفواتير',
      icon: 'mdi-receipt-text-outline',
      to: '/sales',
      permission: 'view:sales',
    },

    // ── العملاء والديون ────────────────────────────────────────────────────
    {
      title: 'العملاء والديون',
      icon: 'mdi-account-group',
      to: '#customers',
      group: {
        items: [
          {
            title: 'العملاء',
            icon: 'mdi-account-multiple',
            to: '/customers',
            permission: 'view:customers',
          },
          {
            // Debt collection — قبض الديون.
            title: 'قبض الديون',
            icon: 'mdi-hand-coin-outline',
            to: '/collections',
            permission: 'view:sales',
          },
        ],
      },
    },

    // ── البضاعة والمخزون ───────────────────────────────────────────────────
    {
      title: 'البضاعة والمخزون',
      icon: 'mdi-package-variant-closed',
      to: '#stock',
      group: {
        items: [
          {
            title: 'البضاعة',
            icon: 'mdi-package-variant',
            to: '/products',
            permission: 'view:products',
          },
          {
            title: 'التصنيفات',
            icon: 'mdi-shape',
            to: '/categories',
            permission: 'view:categories',
          },
          {
            title: 'المخزون',
            icon: 'mdi-warehouse',
            to: '/inventory',
            permission: 'view:inventory',
            feature: 'inventory',
          },
          {
            title: 'حركات المخزون',
            icon: 'mdi-history',
            to: '/inventory/movements',
            permission: 'view:inventory',
            feature: 'inventory',
          },
          {
            title: 'نقل بين المخازن',
            icon: 'mdi-transfer',
            to: '/inventory/transfer',
            feature: 'inventoryTransfers',
            capability: 'canTransferStock',
          },
          {
            title: 'طلبات النقل',
            icon: 'mdi-check-decagram',
            to: '/inventory/transfers',
            permission: 'inventory:transfer',
            feature: 'inventoryTransfers',
          },
          {
            title: 'البضاعة القليلة',
            icon: 'mdi-alert',
            to: '/inventory/low-stock',
            permission: 'view:inventory',
            feature: 'inventory',
          },
          {
            title: 'تنبيهات الصلاحية',
            icon: 'mdi-calendar-alert',
            to: '/inventory/expiry-alerts',
            permission: 'view:inventory',
            feature: 'inventory',
          },
        ],
      },
    },

    // ── المشتريات والموردين (only when purchases/suppliers are enabled) ─────
    {
      title: 'المشتريات والموردين',
      icon: 'mdi-truck-delivery',
      to: '#purchases',
      anyFeature: ['purchases', 'suppliers'],
      group: {
        items: [
          {
            title: 'فواتير الشراء',
            icon: 'mdi-cart-arrow-down',
            to: '/purchases',
            permission: 'view:purchases',
            feature: 'purchases',
            capability: 'canUsePurchases',
          },
          {
            title: 'الموردين',
            icon: 'mdi-account-group-outline',
            to: '/suppliers',
            permission: 'view:suppliers',
            feature: 'suppliers',
            capability: 'canUseSuppliers',
          },
        ],
      },
    },

    // ── المالية ────────────────────────────────────────────────────────────
    // No group-level feature gate: each item carries its own gate.
    {
      title: 'المالية',
      icon: 'mdi-safe-square-outline',
      to: '#finance',
      group: {
        items: [
          {
            title: 'المصاريف',
            icon: 'mdi-cash-minus',
            to: '/expenses',
            permission: 'expenses:read',
          },
          {
            title: 'المصاريف الثابتة',
            icon: 'mdi-calendar-sync',
            to: '/recurring-expenses',
            permission: 'recurring_expenses:read',
          },
          {
            // Unified «حركة وتقرير الصندوق» — opens the merged cash-box report
            // window (same launcher the dashboard quick-question card uses).
            // `report` (instead of `to`) tells the drawer to open a report
            // window rather than navigate in-app.
            title: 'حركة وتقرير الصندوق',
            icon: 'mdi-cash-register',
            report: 'cash-box',
            permission: 'reports:read_financial',
          },
          {
            title: 'الصناديق',
            icon: 'mdi-safe-square-outline',
            to: '/treasury/cashboxes',
            permission: 'view:treasury',
            feature: 'treasury',
          },
          {
            // Voucher = وصل قبض/دفع.
            title: 'وصولات القبض والدفع',
            icon: 'mdi-receipt-text-check-outline',
            to: '/treasury/vouchers',
            permission: 'view:treasury',
            feature: 'treasury',
          },
          {
            title: 'التحويل بين الصناديق',
            icon: 'mdi-bank-transfer',
            to: '/treasury/transfers',
            permission: 'view:treasury',
            feature: 'treasury',
          },
          {
            title: 'الحساب المصرفي',
            icon: 'mdi-bank',
            to: '/treasury/bank-accounts',
            permission: 'view:treasury',
            feature: 'bankAccounts',
            capability: 'canUseBankAccounts',
          },
          {
            title: 'فترات العمل',
            icon: 'mdi-book-clock-outline',
            to: '/accounting-periods',
            permission: 'accounting_periods:read',
          },
        ],
      },
    },

    // ── التقارير ───────────────────────────────────────────────────────────
    {
      title: 'التقارير',
      icon: 'mdi-chart-box',
      to: '#reports',
      group: {
        items: [
          {
            title: 'تقارير مفصّلة',
            icon: 'mdi-chart-box-outline',
            to: '/reports',
            permission: 'view:reports',
          },
          // Online-commerce + shipping reports moved to the «التجارة الأونلاين»
          // group as a single unified page.
          {
            title: 'الربح والخسارة والوضع المالي',
            icon: 'mdi-finance',
            to: '/reports/financial',
            permission: 'reports:read_financial',
            feature: 'financialReports',
            capability: 'canViewFinancialReports',
          },
          {
            title: 'قيمة المخزون حسب السعر',
            icon: 'mdi-cash-multiple',
            to: '/reports/inventory-valuation',
            permission: 'view:inventory',
            feature: 'inventory',
          },
        ],
      },
    },

    // ── الإدارة ────────────────────────────────────────────────────────────
    // قنوات البيع + شركات النقل moved to «التجارة الأونلاين».
    {
      title: 'الإدارة',
      icon: 'mdi-cog',
      to: '#admin',
      group: {
        items: [
          { title: 'الموظفون', icon: 'mdi-account-cog', to: '/users', permission: 'view:users' },
          {
            title: 'الأدوار والصلاحيات',
            icon: 'mdi-shield-account-outline',
            to: '/roles',
            permission: 'roles:read',
          },
          {
            title: 'الفروع والمخازن',
            icon: 'mdi-store',
            to: '/inventory/settings',
            permission: 'inventory:manage',
            anyFeature: ['multiBranch', 'multiWarehouse'],
          },
          {
            title: 'إعدادات النظام',
            icon: 'mdi-tune',
            to: '/settings',
            permission: 'view:settings',
          },
          {
            title: 'إعدادات الميزات والنمط',
            icon: 'mdi-toggle-switch',
            to: '/settings/feature-flags',
            permission: 'manage_feature_toggles',
          },
        ],
      },
    },

    // ── المحاسبة المتقدمة (general ledger — full mode + manager/accountant) ──
    // Hidden for cashiers and in simple mode (generalLedger is full-only and
    // canUseGL is manager+).
    {
      title: 'المحاسبة المتقدمة',
      icon: 'mdi-bank',
      to: '#gl',
      feature: 'generalLedger',
      capability: 'canUseGL',
      group: {
        items: [
          {
            title: 'ترتيب الحسابات',
            icon: 'mdi-file-tree',
            to: '/gl/accounts',
            permission: 'gl:read',
            feature: 'generalLedger',
          },
          {
            title: 'التسجيلات المالية',
            icon: 'mdi-book-open-variant',
            to: '/gl/journal',
            permission: 'gl:read',
            feature: 'generalLedger',
          },
          {
            title: 'ربط الحسابات',
            icon: 'mdi-link-variant',
            to: '/gl/system-accounts',
            permission: 'gl:manage_system_accounts',
            feature: 'generalLedger',
          },
          {
            title: 'رصيد بداية التشغيل',
            icon: 'mdi-clipboard-list-outline',
            to: '/settings/opening-balances',
            permission: 'opening_balances:manage',
            feature: 'generalLedger',
          },
          {
            title: 'تسجيلات تحتاج مراجعة',
            icon: 'mdi-wrench-clock',
            to: '/gl/posting-failures',
            permission: 'gl:repair_postings',
            feature: 'generalLedger',
          },
        ],
      },
    },

    { title: 'حول البرنامج', icon: 'mdi-information', to: '/about', permission: null },
  ];

  /** True if the menu entry should be visible for the current user. */
  const checkVisibility = (item, userRole) => {
    // Feature flag gate (single flag) — alias-aware via store getter.
    if (item.feature && !authStore.hasFeature(item.feature)) return false;

    // "anyFeature" gate — show if ANY listed flag is enabled
    if (Array.isArray(item.anyFeature) && item.anyFeature.length > 0) {
      const anyOn = item.anyFeature.some((f) => authStore.hasFeature(f));
      if (!anyOn) return false;
    }

    // Capability gate — backend-issued, accounts for role + feature flags.
    // This is the preferred check; permission/feature gates remain as
    // fallbacks for items the backend doesn't expose a capability for yet.
    if (item.capability && !authStore.can(item.capability)) return false;

    // Role allow-list
    if (Array.isArray(item.roles) && item.roles.length && !item.roles.includes(userRole)) {
      return false;
    }

    // Dynamic RBAC permission check (DB-backed, via the auth store).
    if (item.permission && !authStore.hasPermission(item.permission)) {
      return false;
    }

    return true;
  };

  const filteredMenu = computed(() => {
    const userRole = authStore.user?.role;
    if (!userRole) return [];

    return sections
      .map((item) => {
        // Non-group: single item
        if (!item.group) {
          return checkVisibility(item, userRole) ? item : null;
        }

        // Group-level checks (e.g. hide the whole Inventory group when inventory is off)
        if (item.feature && !authStore.hasFeature(item.feature)) return null;
        if (item.capability && !authStore.can(item.capability)) return null;
        if (item.permission && !authStore.hasPermission(item.permission)) return null;

        const allowedSubs = item.group.items.filter((sub) => checkVisibility(sub, userRole));
        if (allowedSubs.length === 0) return null;
        return { ...item, group: { items: allowedSubs } };
      })
      .filter(Boolean);
  });

  const findMenuItemByPath = (path) => {
    for (const item of sections) {
      if (item.to === path) return item;
      if (item.group) {
        const sub = item.group.items.find((s) => s.to === path);
        if (sub) return sub;
      }
    }
    return null;
  };

  // Titles for routes that are intentionally NOT in the sidebar menu, so the
  // app-bar still shows a correct heading instead of falling back to the
  // dashboard label.
  const extraTitles = {
    '/profile': 'الملف الشخصي',
    '/notifications': 'التنبيهات',
    '/forbidden': 'ممنوع الوصول',
    '/setup': 'إعداد النظام',
  };

  const getPageTitle = (path) => {
    const exact = findMenuItemByPath(path);
    if (exact) return exact.title;

    if (extraTitles[path]) return extraTitles[path];

    // Longest-prefix match on a path-segment boundary so a parent like
    // '/sales' still labels '/sales/new', while '/' (dashboard) never
    // swallows unrelated routes such as '/profile' or '/notifications'.
    const allItems = sections.flatMap((s) => (s.group ? s.group.items : [s]));
    const match = allItems
      .filter((i) => i.to && i.to !== '/' && (path === i.to || path.startsWith(`${i.to}/`)))
      .sort((a, b) => b.to.length - a.to.length)[0];
    return match?.title || 'نقطة بلس';
  };

  return {
    menuItems: sections,
    filteredMenu,
    findMenuItemByPath,
    getPageTitle,
  };
}
