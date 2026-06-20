import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import { useReportStore } from '@/stores/report';
import { useSaleStore } from '@/stores/sale';
import { useCustomerStore } from '@/stores/customer';
import { useProductStore } from '@/stores/product';
import { useInventoryStore } from '@/stores/inventory';
import { useAuthStore } from '@/stores/auth';
import { useCurrency } from '@/composables/useCurrency';
import { formatCurrency as centralFormatCurrency } from '@/utils/formatters';

/**
 * طبقة بيانات مركز القيادة (الشاشة الرئيسية).
 *
 * تجمع كل ما تحتاجه الشاشة من عدة مصادر دفعة واحدة وتُخرجه كقيم تفاعلية جاهزة:
 *  - مؤشرات اليوم (مبيعات، أرباح، فواتير، عملاء، قيمة المخزون، مستحقات).
 *  - اتجاه آخر ٧ أيام (مبيعات + أرباح) + أفضل المنتجات + أكثر العملاء تعاملاً.
 *  - النشاط الحديث (آخر مبيعات/عملاء/منتجات/حركات مخزون).
 *
 * الحالة وحيدة على مستوى التطبيق (singleton) فتشترك بها كل المكوّنات الفرعية
 * دون إعادة جلب. كل التحويلات بين العملات تُجرى مرة واحدة داخل refresh() باستخدام
 * نسخة عملة مُهيّأة، ثم تُخزَّن النتائج كأرقام جاهزة — حتى لا تعتمد المكوّنات على
 * تهيئة نسخ عملة منفصلة (وإلا اختلّ التحويل في المتاجر بعملة غير الافتراضية).
 */

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// ── حالة مشتركة (module-singleton) ──────────────────────────────────────────
const loading = ref(false);
const loaded = ref(false);
const lastUpdated = ref(null);
const resolvedCurrency = ref('IQD'); // العملة الافتراضية بعد التهيئة

// مؤشرات محسوبة ومحوّلة مسبقاً.
const kpi = ref({
  todaySales: 0,
  todayProfit: null, // null = لا يمكن احتساب الربح (كلفة غير متوفرة)
  invoicesToday: 0,
  totalCustomers: 0,
  inventoryValue: 0,
  customerDebt: 0,
  unpaidToday: 0,
});

const trendDaysRef = ref([]); // [{ key, label, sales, profit|null }] محوّلة
const topProductsRef = ref([]); // [{ productName, totalQuantity, totalRevenue }]
const topCustomersRef = ref([]); // [{ id, name, value }] محوّلة
const counts = ref({ invoicesToday: 0, totalCustomers: 0, totalProducts: 0, totalSales: 0 });
const recent = ref({ sales: [], customers: [], products: [], movements: [] });

export function useDashboardData() {
  // ── تنسيق موحّد بالعملة الافتراضية المُهيّأة ──────────────────────────────
  const formatMoney = (n) => centralFormatCurrency(Number(n) || 0, resolvedCurrency.value);

  // ── المؤشرات (KPIs) كقراءات بسيطة ─────────────────────────────────────────
  const todaySales = computed(() => kpi.value.todaySales);
  const todayProfit = computed(() => kpi.value.todayProfit);
  const profitAvailable = computed(() => kpi.value.todayProfit != null);
  const invoicesToday = computed(() => kpi.value.invoicesToday);
  const totalCustomers = computed(() => kpi.value.totalCustomers);
  const inventoryValue = computed(() => kpi.value.inventoryValue);
  const customerDebt = computed(() => kpi.value.customerDebt);
  const unpaidToday = computed(() => kpi.value.unpaidToday);

  const trendDays = computed(() => trendDaysRef.value);
  const hasProfitTrend = computed(() => trendDaysRef.value.some((d) => d.profit != null));
  const topProducts = computed(() => topProductsRef.value);
  const topCustomers = computed(() => topCustomersRef.value);

  // ── الجلب + كل الحسابات/التحويلات في مكان واحد ────────────────────────────
  async function refresh() {
    loading.value = true;
    try {
      const reportStore = useReportStore();
      const saleStore = useSaleStore();
      const customerStore = useCustomerStore();
      const productStore = useProductStore();
      const inventoryStore = useInventoryStore();
      const authStore = useAuthStore();
      const { defaultCurrency, initialize: initCurrency, convertAmountSync } = useCurrency();

      await initCurrency();
      resolvedCurrency.value = defaultCurrency.value || 'IQD';

      // أدوات تجميع تحوّل كل عملة إلى الافتراضية ثم تجمع.
      const conv = (n, cur) => convertAmountSync(Number(n) || 0, cur || resolvedCurrency.value);
      const sumMap = (map) =>
        map
          ? Object.entries(map).reduce((s, [cur, v]) => {
              const n = Number(v) || 0;
              if (!n) return s;
              return s + (cur && cur !== 'UNKNOWN' ? conv(n, cur) : n);
            }, 0)
          : 0;
      const sumField = (byCur, field) =>
        byCur
          ? Object.entries(byCur).reduce((s, [cur, b]) => s + conv(b?.[field], cur), 0)
          : 0;

      const today = ymd(new Date());
      const tomorrow = ymd(new Date(Date.now() + 86400000));
      const weekAgo = ymd(new Date(Date.now() - 6 * 86400000));
      // Permission gates — each dashboard data source is fetched ONLY when the
      // user can read it, so a user with just `view:dashboard` (but none of the
      // data permissions) never triggers a 403 toast and never sees misleading
      // zero cards. Endpoints: /reports/dashboard, /sales, /sales/top-products →
      // sales:read; customers → customers:read; products → products:read.
      const canSales = authStore.hasPermission(['view:sales', 'sales:read']);
      const canCustomers = authStore.hasPermission(['view:customers', 'customers:read']);
      const canProducts = authStore.hasPermission(['view:products', 'products:read']);
      const canProfit = authStore.hasPermission('reports:read_profit');
      const canInventory =
        authStore.hasPermission('view:inventory') && authStore.hasFeature('inventory');

      const tasks = {
        today: canSales
          ? reportStore.fetchDashboard({ dateFrom: today, dateTo: today }).catch(() => null)
          : Promise.resolve(null),
        week: canSales
          ? reportStore.fetchDashboard({ dateFrom: weekAgo, dateTo: today }).catch(() => null)
          : Promise.resolve(null),
        recentSales: canSales ? saleStore.fetch({ limit: 8 }).catch(() => null) : Promise.resolve(null),
        // قائمة المبيعات تفلتر بـ startDate/endDate (المتحكّم يقارن createdAt
        // مباشرة)، لذا endDate = الغد لالتقاط يوم كامل، وعدد فواتير اليوم = meta.total.
        invoiceCount: canSales
          ? api
              .get('/sales', {
                params: { startDate: today, endDate: tomorrow, limit: 1 },
                meta: { silent: true },
              })
              .catch(() => null)
          : Promise.resolve(null),
        customers: canCustomers ? customerStore.fetch({ limit: 6 }).catch(() => null) : Promise.resolve(null),
        products: canProducts ? productStore.fetch({ limit: 6 }).catch(() => null) : Promise.resolve(null),
        profit: canProfit
          ? reportStore.fetchProfit({ dateFrom: weekAgo, dateTo: today }).catch(() => null)
          : Promise.resolve(null),
        top: canSales
          ? api
              .get('/sales/top-products', { params: { limit: 5 } })
              .then((r) => r?.data || r || [])
              .catch(() => [])
          : Promise.resolve([]),
        movements: canInventory
          ? inventoryStore.fetchMovements({ limit: 6 }).catch(() => null)
          : Promise.resolve(null),
      };

      const entries = Object.entries(tasks);
      const settled = await Promise.allSettled(entries.map(([, p]) => p));
      const out = {};
      entries.forEach(([key], i) => {
        out[key] = settled[i].status === 'fulfilled' ? settled[i].value : null;
      });

      const todayDash = out.today || null;
      const weekDash = out.week || null;

      // صافي ربح اليوم — null إذا تعذّر احتسابه لكل العملات.
      const pl = todayDash?.profitLoss?.byCurrency || {};
      const profitKnown = Object.values(pl).some((b) => b && b.netProfit != null);
      const todayProfitVal = profitKnown
        ? Object.entries(pl).reduce(
            (s, [cur, b]) => (b && b.netProfit != null ? s + conv(b.netProfit, cur) : s),
            0
          )
        : null;

      kpi.value = {
        todaySales: sumField(todayDash?.salesSummary, 'revenue'),
        todayProfit: todayProfitVal,
        invoicesToday: Number(out.invoiceCount?.meta?.total) || 0,
        totalCustomers:
          Number(out.customers?.meta?.total) || (out.customers?.data?.length ?? 0),
        inventoryValue: sumMap((weekDash || todayDash)?.inventory?.stockValueByCurrency),
        customerDebt: sumMap((weekDash || todayDash)?.customersDebt?.totalOutstandingDebt),
        unpaidToday: sumField(todayDash?.salesSummary, 'unpaidBalances'),
      };

      // اتجاه آخر ٧ أيام.
      const salesByDay = new Map();
      for (const r of weekDash?.trends?.salesOverTime || []) {
        salesByDay.set(r.day, (salesByDay.get(r.day) || 0) + conv(r.total, r.currency));
      }
      const profByDay = new Map();
      for (const r of out.profit?.byPeriod || []) {
        if (r.netProfit == null) continue;
        profByDay.set(r.day, (profByDay.get(r.day) || 0) + conv(r.netProfit, r.currency));
      }
      const days = [];
      const now = new Date();
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = ymd(d);
        days.push({
          key,
          label: new Intl.DateTimeFormat('ar-IQ', {
            weekday: 'short',
            numberingSystem: 'latn',
          }).format(d),
          sales: salesByDay.get(key) || 0,
          profit: profByDay.has(key) ? profByDay.get(key) : null,
        });
      }
      trendDaysRef.value = days;

      topProductsRef.value = Array.isArray(out.top) ? out.top : [];

      const payingList = (weekDash || todayDash)?.customersDebt?.topPayingCustomers || [];
      topCustomersRef.value = payingList
        .filter((c) => c.customerName)
        .slice(0, 5)
        .map((c) => ({ id: c.customerId, name: c.customerName, value: conv(c.paid, c.currency) }));

      // النشاط الحديث — رتّب حسب الأحدث.
      const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
      recent.value.sales = (out.recentSales?.data || []).slice().sort(byNewest).slice(0, 8);
      recent.value.customers = (out.customers?.data || []).slice().sort(byNewest).slice(0, 6);
      recent.value.products = (out.products?.data || []).slice().sort(byNewest).slice(0, 6);
      recent.value.movements = Array.isArray(out.movements) ? out.movements.slice(0, 6) : [];

      counts.value = {
        invoicesToday: kpi.value.invoicesToday,
        totalCustomers: kpi.value.totalCustomers,
        totalProducts: Number(out.products?.meta?.total) || recent.value.products.length,
        totalSales: Number(out.recentSales?.meta?.total) || 0,
      };

      lastUpdated.value = new Date();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    loaded,
    lastUpdated,
    resolvedCurrency,
    refresh,
    formatMoney,
    // KPIs
    todaySales,
    todayProfit,
    profitAvailable,
    invoicesToday,
    totalCustomers,
    inventoryValue,
    customerDebt,
    unpaidToday,
    // performance
    trendDays,
    hasProfitTrend,
    topProducts,
    topCustomers,
    // recent activity
    recent,
    counts,
  };
}

export default useDashboardData;
