/**
 * Config for every quick-question report window. One entry per report drives:
 *   - the dashboard card (title/icon/accent/permission),
 *   - the standalone page (summary cards, table columns, which filters show),
 *   - the backend endpoint (`/reports/<type>`).
 *
 * Keeping this declarative means the 7 pages and the dashboard cards never drift
 * apart, and adding a report is a single config entry + a thin page wrapper.
 *
 * `permission` is the RBAC gate: the dashboard hides the card and the route
 * guard blocks direct navigation when the user lacks it (backend enforces too).
 */

const money = 'money';
const int = 'int';
const date = 'date';
const datetime = 'datetime';

export const REPORT_CONFIGS = {
  sales: {
    type: 'sales',
    title: 'تقرير المبيعات',
    question: 'شكد بعت؟',
    icon: 'mdi-cash-multiple',
    accent: '#2563eb',
    permission: 'sales:read',
    defaultRange: 'today',
    filters: ['date', 'search', 'branch'],
    searchPlaceholder: 'بحث برقم الفاتورة أو اسم العميل',
    summary: [
      { key: 'totalSales', label: 'إجمالي المبيعات', format: money, accent: '#2563eb', big: true },
      { key: 'invoices', label: 'عدد الفواتير', format: int, accent: '#0891b2' },
      { key: 'discounts', label: 'إجمالي الخصومات', format: money, accent: '#d97706' },
      { key: 'netSales', label: 'صافي المبيعات', format: money, accent: '#16a34a' },
    ],
    columns: [
      { key: 'invoice_number', label: 'رقم الفاتورة' },
      { key: 'created_at', label: 'التاريخ', format: date },
      { key: 'customer_name', label: 'العميل' },
      { key: 'total', label: 'المبلغ الكلي', format: money, align: 'end' },
      { key: 'paid_amount', label: 'المدفوع', format: money, align: 'end' },
      { key: 'remaining_amount', label: 'المتبقي', format: money, align: 'end' },
      { key: 'payment_type', label: 'طريقة الدفع', format: 'paymentType' },
      { key: 'status', label: 'الحالة', format: 'status' },
    ],
  },

  profit: {
    type: 'profit',
    title: 'تقرير الأرباح',
    question: 'شكد ربحت؟',
    icon: 'mdi-chart-line',
    accent: '#16a34a',
    permission: 'reports:read_profit',
    defaultRange: 'month',
    filters: ['date', 'branch'],
    summary: [
      { key: 'netSales', label: 'صافي المبيعات', format: money, accent: '#2563eb' },
      { key: 'cogs', label: 'تكلفة البضاعة المباعة', format: money, accent: '#d97706' },
      { key: 'returnedValue', label: 'المرتجعات', format: money, accent: '#dc2626' },
      { key: 'expenses', label: 'المصاريف', format: money, accent: '#9333ea' },
      { key: 'netProfit', label: 'صافي الربح', format: money, accent: '#16a34a', big: true },
    ],
    columns: [
      { key: 'product_name', label: 'المنتج' },
      { key: 'sku', label: 'SKU' },
      { key: 'qty', label: 'الكمية', format: int, align: 'end' },
      { key: 'sales', label: 'إجمالي البيع', format: money, align: 'end' },
      { key: 'cogs', label: 'التكلفة', format: money, align: 'end' },
      { key: 'profit', label: 'الربح', format: money, align: 'end' },
    ],
  },

  'top-products': {
    type: 'top-products',
    title: 'أكثر المنتجات مبيعاً',
    question: 'شنو أكثر بضاعة تنباع؟',
    icon: 'mdi-trophy',
    accent: '#d97706',
    permission: 'reports:read_profit',
    defaultRange: 'month',
    filters: ['date', 'search'],
    searchPlaceholder: 'بحث باسم المنتج أو الباركود أو SKU',
    summary: [
      { key: 'totalQty', label: 'إجمالي الكمية المباعة', format: int, accent: '#d97706', big: true },
      { key: 'totalSales', label: 'إجمالي البيع', format: money, accent: '#2563eb' },
      { key: 'products', label: 'عدد المنتجات', format: int, accent: '#0891b2' },
    ],
    columns: [
      { key: 'product_name', label: 'اسم المنتج' },
      { key: 'sku', label: 'SKU' },
      { key: 'barcode', label: 'الباركود' },
      { key: 'qty_sold', label: 'الكمية المباعة', format: int, align: 'end' },
      { key: 'invoices', label: 'عدد الفواتير', format: int, align: 'end' },
      { key: 'total_sales', label: 'إجمالي البيع', format: money, align: 'end' },
      { key: 'total_profit', label: 'إجمالي الربح', format: money, align: 'end' },
    ],
  },

  debts: {
    type: 'debts',
    title: 'تقرير الديون',
    question: 'شنو عليه دين؟',
    icon: 'mdi-account-cash',
    accent: '#dc2626',
    permission: 'sales:read',
    defaultRange: 'all',
    // Debt facets: party (عميل/وكيل/مورد), direction (لنا/علينا) and status.
    filters: ['partyType', 'direction', 'debtStatus', 'date', 'search', 'branch'],
    defaultPartyType: 'all',
    defaultDirection: 'all',
    defaultDebtStatus: 'all',
    searchPlaceholder: 'بحث بالاسم أو الهاتف أو رقم الفاتورة أو الملاحظات',
    summary: [
      { key: 'totalReceivable', label: 'إجمالي الديون التي لنا', format: money, accent: '#16a34a', big: true },
      { key: 'totalPayable', label: 'إجمالي الديون التي علينا', format: money, accent: '#dc2626', big: true },
      { key: 'netDebt', label: 'صافي الديون', format: 'netDebt', accent: '#2563eb', big: true },
    ],
    columns: [
      { key: 'partyType', label: 'النوع', format: 'partyType' },
      { key: 'partyName', label: 'الاسم' },
      { key: 'phone', label: 'رقم الهاتف' },
      { key: 'totalAmount', label: 'إجمالي الدين', format: money, align: 'end' },
      { key: 'paidAmount', label: 'المدفوع', format: money, align: 'end' },
      { key: 'remainingAmount', label: 'المتبقي', format: money, align: 'end' },
      { key: 'direction', label: 'اتجاه الدين', format: 'direction' },
      { key: 'status', label: 'الحالة', format: 'debtStatus' },
      { key: 'lastTransactionDate', label: 'آخر عملية', format: date },
      { key: 'lastPaymentDate', label: 'آخر دفعة', format: date },
    ],
  },

  // Unified "حركة وتقرير الصندوق": merges the former «تقرير الصندوق» (cash-box
  // position) and «حركة الصندوق» (cash-movement ledger) into one view. The
  // backend `cashBox` endpoint already returns the full position summary AND the
  // movement rows in a single call, and honours the movementType filter — so the
  // two pages were duplicating the same financial domain.
  'cash-box': {
    type: 'cash-box',
    title: 'حركة وتقرير الصندوق',
    question: 'شكد بالصندوق وشنو حركته؟',
    icon: 'mdi-cash-register',
    accent: '#0891b2',
    permission: 'reports:read_financial',
    defaultRange: 'today',
    filters: ['date', 'movementType', 'branch'],
    summary: [
      { key: 'opening', label: 'الرصيد الافتتاحي', format: money, accent: '#64748b' },
      { key: 'totalIn', label: 'الداخل (المقبوضات)', format: money, accent: '#16a34a', big: true },
      { key: 'totalOut', label: 'الخارج (المصروفات والمرتجعات)', format: money, accent: '#dc2626', big: true },
      { key: 'net', label: 'صافي الحركة', format: money, accent: '#2563eb' },
      { key: 'currentBalance', label: 'الرصيد الحالي', format: money, accent: '#0891b2', big: true },
    ],
    columns: [
      { key: 'ts', label: 'التاريخ والوقت', format: datetime },
      { key: 'type_label', label: 'نوع الحركة' },
      { key: 'description', label: 'المصدر / الوصف' },
      { key: 'amount_in', label: 'داخل', format: money, align: 'end' },
      { key: 'amount_out', label: 'خارج', format: money, align: 'end' },
      { key: 'balance_after', label: 'الرصيد بعد الحركة', format: money, align: 'end' },
      { key: 'user_name', label: 'المستخدم' },
      { key: 'branch_name', label: 'الفرع' },
    ],
  },

  expenses: {
    type: 'expenses',
    title: 'تقرير المصروفات',
    question: 'شكد صرفت؟',
    icon: 'mdi-cash-minus',
    accent: '#9333ea',
    permission: 'view:expenses',
    defaultRange: 'month',
    filters: ['date', 'search', 'branch'],
    searchPlaceholder: 'بحث بنوع المصروف أو الوصف',
    summary: [
      { key: 'totalExpenses', label: 'إجمالي المصروفات', format: money, accent: '#9333ea', big: true },
      { key: 'count', label: 'عدد العمليات', format: int, accent: '#0891b2' },
    ],
    breakdownKey: 'byCategory', // chips: { category, amount }
    columns: [
      { key: 'expense_date', label: 'التاريخ', format: date },
      { key: 'category', label: 'نوع المصروف' },
      { key: 'note', label: 'الوصف' },
      { key: 'amount', label: 'المبلغ', format: money, align: 'end' },
      { key: 'user_name', label: 'المستخدم' },
      { key: 'branch_name', label: 'الفرع' },
    ],
  },

  // NOTE: the former `cash-movement` report was merged into `cash-box` above.
  // Old deep-links redirect to it (router) and the Electron launcher aliases the
  // type, so no separate config is needed here.
};

/**
 * Ordered list for the dashboard quick-question cards.
 *
 * `cash-movement` is intentionally absent: it was merged into the unified
 * `cash-box` card («حركة وتقرير الصندوق»). Old deep-links still resolve via the
 * router redirect + Electron launcher alias.
 */
export const REPORT_ORDER = [
  'sales', 'profit', 'top-products', 'debts', 'cash-box', 'expenses',
];

// ── Debts report option sets ────────────────────────────────────────────────
export const PARTY_TYPE_OPTIONS = [
  { value: 'all', title: 'كل الأطراف' },
  { value: 'customer', title: 'العملاء' },
  { value: 'agent', title: 'الوكلاء' },
  { value: 'supplier', title: 'الموردون' },
];

export const DEBT_DIRECTION_OPTIONS = [
  { value: 'all', title: 'كل الاتجاهات' },
  { value: 'receivable', title: 'لنا' },
  { value: 'payable', title: 'علينا' },
];

export const DEBT_STATUS_OPTIONS = [
  { value: 'all', title: 'كل الديون' },
  { value: 'open', title: 'مفتوح' },
  { value: 'partial', title: 'مسدد جزئياً' },
  { value: 'paid', title: 'مسدد بالكامل' },
  { value: 'overdue', title: 'متأخر' },
];

/** Arabic labels + chip colors for the debt row cells. */
export const PARTY_TYPE_LABELS = { customer: 'عميل', agent: 'وكيل', supplier: 'مورد' };
export const DEBT_DIRECTION_LABELS = { receivable: 'لنا', payable: 'علينا' };
export const DEBT_STATUS_LABELS = {
  open: 'مفتوح',
  partial: 'مسدد جزئياً',
  paid: 'مسدد بالكامل',
  overdue: 'متأخر',
};
export const DEBT_STATUS_COLORS = {
  open: 'info',
  partial: 'warning',
  paid: 'success',
  overdue: 'error',
};

export const MOVEMENT_TYPE_OPTIONS = [
  { value: 'all', title: 'الكل' },
  { value: 'receipt', title: 'قبض' },
  { value: 'debt_settlement', title: 'تسديد دين' },
  { value: 'expense', title: 'صرف' },
  { value: 'return', title: 'مرتجع' },
];
