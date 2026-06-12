import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import * as uiAccess from '@/auth/uiAccess.js';

// Layouts
import MainLayout from '@/layouts/MainLayout.vue';
import AuthLayout from '@/layouts/AuthLayout.vue';

// Views
import Activation from '@/views/Activation.vue';
import ServerSetup from '@/views/ServerSetup.vue';
import Login from '@/views/auth/Login.vue';
import Dashboard from '@/views/Dashboard.vue';
import Customers from '@/views/customers/Customers.vue';
import CustomerForm from '@/views/customers/CustomerForm.vue';
import CustomerProfile from '@/views/customers/CustomerProfile.vue';
import Products from '@/views/products/Products.vue';
import ProductForm from '@/views/products/ProductForm.vue';
import Categories from '@/views/categories/Categories.vue';
import Sales from '@/views/sales/Sales.vue';
import NewSale from '@/views/sales/NewSale.vue';
import SaleDetails from '@/views/sales/SaleDetails.vue';
import PosScreen from '@/views/sales/PosScreen.vue';
import ShiftReport from '@/views/sales/ShiftReport.vue';
import Reports from '@/views/Reports.vue';
import SimpleReports from '@/views/reports/SimpleReports.vue';
import Settings from '@/views/Settings.vue';
import Notifications from '@/views/Notifications.vue';
import Users from '@/views/users/Users.vue';
import Forbidden from '@/views/errors/Forbidden.vue'; // 👈 صفحة 403
import Profile from '@/views/Profile.vue';
import About from '@/views/About.vue';
import Inventory from '@/views/inventory/Inventory.vue';
import StockMovements from '@/views/inventory/StockMovements.vue';
import StockTransfer from '@/views/inventory/StockTransfer.vue';
import LowStock from '@/views/inventory/LowStock.vue';
import BranchesWarehouses from '@/views/inventory/BranchesWarehouses.vue';
import TransferRequests from '@/views/inventory/TransferRequests.vue';
import ExpiryAlerts from '@/views/inventory/ExpiryAlerts.vue';
import FeatureFlags from '@/views/settings/FeatureFlags.vue';
import SetupWizard from '@/views/settings/SetupWizard.vue';
import Collections from '@/views/collections/Collections.vue';
import Expenses from '@/views/expenses/Expenses.vue';
import AccountingPeriods from '@/views/accounting/AccountingPeriods.vue';
import Cashboxes from '@/views/treasury/Cashboxes.vue';
import CashboxLedger from '@/views/treasury/CashboxLedger.vue';
import Vouchers from '@/views/treasury/Vouchers.vue';
import TreasuryTransfers from '@/views/treasury/TreasuryTransfers.vue';
import BankAccounts from '@/views/treasury/BankAccounts.vue';
import Suppliers from '@/views/suppliers/Suppliers.vue';
import SupplierProfile from '@/views/suppliers/SupplierProfile.vue';
import Purchases from '@/views/purchases/Purchases.vue';
import NewPurchase from '@/views/purchases/NewPurchase.vue';
import PurchaseDetails from '@/views/purchases/PurchaseDetails.vue';
import ChartOfAccounts from '@/views/gl/ChartOfAccounts.vue';
import JournalEntries from '@/views/gl/JournalEntries.vue';
import SystemAccounts from '@/views/gl/SystemAccounts.vue';
import PostingFailures from '@/views/gl/PostingFailures.vue';
import FinancialReports from '@/views/reports/FinancialReports.vue';
import InventoryValuation from '@/views/reports/InventoryValuation.vue';
import OpeningBalances from '@/views/settings/OpeningBalances.vue';
// Standalone "quick question" report windows (opened in their own Electron window).
import SalesReportPage from '@/views/reports/SalesReportPage.vue';
import ProfitReportPage from '@/views/reports/ProfitReportPage.vue';
import TopProductsReportPage from '@/views/reports/TopProductsReportPage.vue';
import DebtsReportPage from '@/views/reports/DebtsReportPage.vue';
import CashBoxReportPage from '@/views/reports/CashBoxReportPage.vue';
import ExpensesReportPage from '@/views/reports/ExpensesReportPage.vue';
import CashMovementReportPage from '@/views/reports/CashMovementReportPage.vue';

const routes = [
  {
    path: '/activation',
    name: 'Activation',
    component: Activation,
  },
  {
    path: '/server-setup',
    name: 'ServerSetup',
    component: ServerSetup,
  },
  {
    path: '/auth',
    component: AuthLayout,
    children: [
      {
        path: 'login',
        name: 'Login',
        component: Login,
        meta: { requiresGuest: true },
      },
    ],
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: Dashboard },
      {
        path: 'customers',
        name: 'Customers',
        component: Customers,
      },
      {
        path: 'customers/new',
        name: 'NewCustomer',
        component: CustomerForm,
        meta: { requiresWrite: true },
      },
      {
        path: 'customers/:id/edit',
        name: 'EditCustomer',
        component: CustomerForm,
        meta: { requiresWrite: true },
      },
      {
        path: 'customers/:id',
        name: 'CustomerProfile',
        component: CustomerProfile,
      },
      {
        path: 'products',
        name: 'Products',
        component: Products,
      },
      {
        path: 'products/new',
        name: 'NewProduct',
        component: ProductForm,
        meta: { requiresManageProducts: true },
      },
      {
        path: 'products/:id/edit',
        name: 'EditProduct',
        component: ProductForm,
        meta: { requiresManageProducts: true },
      },
      {
        path: 'categories',
        name: 'Categories',
        component: Categories,
      },
      { path: 'sales', name: 'Sales', component: Sales },
      {
        path: 'sales/pos',
        name: 'PosScreen',
        component: PosScreen,
        // POS depends on the `pos` feature flag + canUsePOS capability.
        meta: { requiresCreateSales: true, feature: 'pos', capability: 'canUsePOS' },
      },
      {
        path: 'sales/new',
        name: 'NewSale',
        component: NewSale,
        // /sales/new is the installment-sale entry point; gate it by the
        // installments feature flag + capability.
        meta: {
          requiresCreateSales: true,
          feature: 'installments',
          capability: 'canUseInstallments',
        },
      },
      {
        path: 'sales/shifts',
        name: 'ShiftReport',
        component: ShiftReport,
        meta: { requiresCreateSales: true },
      },
      {
        path: 'collections',
        name: 'Collections',
        component: Collections,
        // Same gate as adding a payment elsewhere — backend enforces the
        // `sales:read` / `sales:update` pair authoritatively.
        meta: { requiresCreateSales: true },
      },
      {
        path: 'sales/:id',
        name: 'SaleDetails',
        component: SaleDetails,
      },
      {
        path: 'reports',
        name: 'Reports',
        component: Reports,
      },
      // {
      //   path: 'reports/simple',
      //   name: 'SimpleReports',
      //   component: SimpleReports,
      //   meta: { permission: 'view:reports' },
      // },
      {
        path: 'expenses',
        name: 'Expenses',
        component: Expenses,
        meta: { requiresWrite: true },
      },
      {
        path: 'accounting-periods',
        name: 'AccountingPeriods',
        component: AccountingPeriods,
      },
      // ── الخزينة (treasury) ─────────────────────────────────────────────
      {
        path: 'treasury/cashboxes',
        name: 'Cashboxes',
        component: Cashboxes,
        meta: { feature: 'treasury', capability: 'canUseTreasury' },
      },
      {
        path: 'treasury/cashboxes/:id/ledger',
        name: 'CashboxLedger',
        component: CashboxLedger,
        meta: { feature: 'treasury', capability: 'canUseTreasury' },
      },
      {
        path: 'treasury/vouchers',
        name: 'Vouchers',
        component: Vouchers,
        meta: { feature: 'treasury', capability: 'canUseTreasury' },
      },
      {
        path: 'treasury/transfers',
        name: 'TreasuryTransfers',
        component: TreasuryTransfers,
        meta: { feature: 'treasury', capability: 'canUseTreasury' },
      },
      {
        path: 'treasury/bank-accounts',
        name: 'BankAccounts',
        component: BankAccounts,
        meta: { feature: 'bankAccounts', capability: 'canUseBankAccounts' },
      },
      // ── المشتريات والموردون (suppliers + purchases) ─────────────────────
      {
        path: 'suppliers',
        name: 'Suppliers',
        component: Suppliers,
        meta: { feature: 'suppliers', capability: 'canUseSuppliers' },
      },
      {
        path: 'suppliers/:id',
        name: 'SupplierProfile',
        component: SupplierProfile,
        meta: { feature: 'suppliers', capability: 'canUseSuppliers' },
      },
      {
        path: 'purchases',
        name: 'Purchases',
        component: Purchases,
        meta: { feature: 'purchases', capability: 'canUsePurchases' },
      },
      {
        path: 'purchases/new',
        name: 'NewPurchase',
        component: NewPurchase,
        meta: { feature: 'purchases', capability: 'canUsePurchases' },
      },
      {
        path: 'purchases/:id',
        name: 'PurchaseDetails',
        component: PurchaseDetails,
        meta: { feature: 'purchases', capability: 'canUsePurchases' },
      },
      // ── المحاسبة (general ledger) ───────────────────────────────────────
      {
        path: 'gl/accounts',
        name: 'ChartOfAccounts',
        component: ChartOfAccounts,
        meta: { feature: 'generalLedger', capability: 'canUseGL' },
      },
      {
        path: 'gl/journal',
        name: 'JournalEntries',
        component: JournalEntries,
        meta: { feature: 'generalLedger', capability: 'canUseGL' },
      },
      {
        path: 'gl/system-accounts',
        name: 'SystemAccounts',
        component: SystemAccounts,
        // Coarse route gate (feature + GL capability); the backend enforces the
        // finer gl:manage_system_accounts permission on every call, and the nav
        // menu only surfaces this entry to authorized roles.
        meta: { feature: 'generalLedger', capability: 'canUseGL' },
      },
      {
        path: 'gl/posting-failures',
        name: 'PostingFailures',
        component: PostingFailures,
        meta: { feature: 'generalLedger', capability: 'canUseGL' },
      },
      {
        path: 'reports/financial',
        name: 'FinancialReports',
        component: FinancialReports,
        meta: { feature: 'financialReports', capability: 'canViewFinancialReports' },
      },
      {
        path: 'reports/inventory-valuation',
        name: 'InventoryValuation',
        component: InventoryValuation,
        meta: { feature: 'inventory', permission: 'view:inventory' },
      },
      {
        path: 'settings/opening-balances',
        name: 'OpeningBalances',
        component: OpeningBalances,
        meta: { feature: 'generalLedger', requiresGlobalAdmin: true },
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: Notifications,
      },
      {
        path: 'inventory',
        name: 'Inventory',
        component: Inventory,
        meta: { feature: 'inventory' },
      },
      {
        path: 'inventory/movements',
        name: 'StockMovements',
        component: StockMovements,
        meta: { feature: 'inventory' },
      },
      {
        path: 'inventory/transfer',
        name: 'StockTransfer',
        component: StockTransfer,
        meta: { feature: 'inventoryTransfers', capability: 'canTransferStock' },
      },
      {
        path: 'inventory/low-stock',
        name: 'LowStock',
        component: LowStock,
        meta: { feature: 'inventory' },
      },
      {
        path: 'inventory/transfers',
        name: 'TransferRequests',
        component: TransferRequests,
        meta: { feature: 'inventoryTransfers' },
      },
      {
        path: 'inventory/expiry-alerts',
        name: 'ExpiryAlerts',
        component: ExpiryAlerts,
        meta: { feature: 'inventory' },
      },
      {
        path: 'inventory/settings',
        name: 'BranchesWarehouses',
        component: BranchesWarehouses,
        meta: { requiresManageProducts: true, anyFeature: ['multiBranch', 'multiWarehouse'] },
      },
      {
        path: 'settings/feature-flags',
        name: 'FeatureFlags',
        component: FeatureFlags,
        meta: { requiresGlobalAdmin: true },
      },
      {
        path: 'setup',
        name: 'SetupWizard',
        component: SetupWizard,
        meta: { requiresGlobalAdmin: true },
      },
      { path: 'users', name: 'Users', component: Users, meta: { requiresViewUsers: true } },
      { path: 'profile', name: 'Profile', component: Profile }, // 👈 صفحة الملف الشخصي
      { path: 'settings', name: 'Settings', component: Settings },
      { path: 'about', name: 'About', component: About }, // 👈 صفحة حول البرنامج
      { path: 'forbidden', name: 'Forbidden', component: Forbidden }, // 👈 صفحة 403
    ],
  },
  // ── Standalone report windows (الأسئلة السريعة) ───────────────────────────
  // Top-level (NOT under MainLayout) so each renders as a full, chrome-free
  // desktop report inside its own Electron BrowserWindow. RBAC via meta.permission
  // (guard → Forbidden) plus an in-component gate; backend authorizes too.
  {
    path: '/reports/sales',
    name: 'Report_sales',
    component: SalesReportPage,
    meta: { requiresAuth: true, permission: 'sales:read', standaloneReport: true },
  },
  {
    path: '/reports/profit',
    name: 'Report_profit',
    component: ProfitReportPage,
    meta: { requiresAuth: true, permission: 'reports:read_profit', standaloneReport: true },
  },
  {
    path: '/reports/top-products',
    name: 'Report_top_products',
    component: TopProductsReportPage,
    meta: { requiresAuth: true, permission: 'reports:read_profit', standaloneReport: true },
  },
  {
    path: '/reports/debts',
    name: 'Report_debts',
    component: DebtsReportPage,
    meta: { requiresAuth: true, permission: 'sales:read', standaloneReport: true },
  },
  {
    path: '/reports/cash-box',
    name: 'Report_cash_box',
    component: CashBoxReportPage,
    meta: { requiresAuth: true, permission: 'reports:read_financial', standaloneReport: true },
  },
  {
    path: '/reports/expenses',
    name: 'Report_expenses',
    component: ExpensesReportPage,
    meta: { requiresAuth: true, permission: 'view:expenses', standaloneReport: true },
  },
  {
    path: '/reports/cash-movement',
    name: 'Report_cash_movement',
    component: CashMovementReportPage,
    meta: { requiresAuth: true, permission: 'reports:read_financial', standaloneReport: true },
  },
];

const router = createRouter({
  history: import.meta.env.PROD ? createWebHashHistory() : createWebHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
  const connectionStore = useConnectionStore();

  // Client mode: redirect to ServerSetup if no server connection is configured,
  // unless we're already going there (or to Activation).
  if (
    connectionStore.isClientMode &&
    connectionStore.needsSetup &&
    to.name !== 'ServerSetup' &&
    to.name !== 'Activation'
  ) {
    return next({ name: 'ServerSetup' });
  }

  // Don't allow server-mode users to see the setup screen
  if (to.name === 'ServerSetup' && connectionStore.isServerMode) {
    return next({ name: 'Dashboard' });
  }

  const authStore = useAuthStore();

  // Hydration gate. Protected routes MUST wait for the canonical
  // /auth/session payload before evaluating any feature/capability check —
  // otherwise `can()` and `hasFeature()` would default-deny and bounce
  // legitimate users to Login or Forbidden on every cold reload.
  //
  // Public routes (Login, ServerSetup, Activation) skip the wait so the
  // unauthenticated UI renders immediately.
  const token = localStorage.getItem('token');
  if (to.meta.requiresAuth) {
    if (!token) {
      return next({ name: 'Login' });
    }
    if (!authStore.isHydrated) {
      // refreshSession() de-dupes concurrent callers and only flips
      // isHydrated after a successful payload — so awaiting it here is
      // safe even if multiple navigations race.
      await authStore.refreshSession({ resetInventory: false });
      // 401 → token cleared by refreshSession via clearSessionState.
      if (!authStore.isAuthenticated) {
        return next({ name: 'Login' });
      }
    }
  }

  // 1️⃣ تسجيل الدخول
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'Login' });
  }

  // 2️⃣ التحقق من الصلاحيات بناءً على الدور (role-based)
  const userRole = authStore.user?.role;
  if (userRole) {
    // Check route-specific access requirements
    if (to.meta.requiresViewUsers && !uiAccess.canViewUsers(userRole)) {
      return next({ name: 'Forbidden' });
    }
    if (to.meta.requiresManageProducts && !uiAccess.canManageProducts(userRole)) {
      return next({ name: 'Forbidden' });
    }
    if (to.meta.requiresCreateSales && !uiAccess.canCreateSales(userRole)) {
      return next({ name: 'Forbidden' });
    }
    if (to.meta.requiresWrite && !uiAccess.canWrite(userRole)) {
      return next({ name: 'Forbidden' });
    }
    if (to.meta.requiresGlobalAdmin && !authStore.isGlobalAdmin) {
      return next({ name: 'Forbidden' });
    }

    // Feature-flag gate: hide entire pages when the flag is off. Uses the
    // alias-aware `hasFeature` getter so route meta can use either
    // canonical (warehouseTransfers) or spec (inventoryTransfers) names.
    if (to.meta.feature && !authStore.hasFeature(to.meta.feature)) {
      return next({ name: 'Dashboard' });
    }
    if (
      Array.isArray(to.meta.anyFeature) &&
      to.meta.anyFeature.length > 0 &&
      !to.meta.anyFeature.some((f) => authStore.hasFeature(f))
    ) {
      return next({ name: 'Dashboard' });
    }

    // Capability gate: backend tells us whether this user (with this role,
    // scope, AND feature flag state) can use the page. Block when false —
    // forbidden, not redirect to dashboard, since the user might be on a
    // page they previously could access (e.g. installments just got
    // disabled while they were drafting a sale).
    if (to.meta.capability && !authStore.can(to.meta.capability)) {
      return next({ name: 'Forbidden' });
    }

    // Permission gate (RBAC matrix) — used by the standalone report windows so a
    // user without the report's permission is blocked from deep-linking to it.
    if (to.meta.permission && !authStore.hasPermission(to.meta.permission)) {
      return next({ name: 'Forbidden' });
    }

    // First-run wizard: redirect a global admin with pending setup to the
    // wizard route, except when they're already there.
    if (
      authStore.needsSetupWizard &&
      to.name !== 'SetupWizard' &&
      to.name !== 'Login' &&
      to.name !== 'Forbidden'
    ) {
      return next({ name: 'SetupWizard' });
    }
  }

  // 3️⃣ منع فتح صفحات guest للمستخدمين المسجلين
  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    return next({ name: 'Dashboard' });
  }

  next();
});

export default router;
