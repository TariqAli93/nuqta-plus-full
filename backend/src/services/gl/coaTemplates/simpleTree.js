/**
 * القالب المبسّط (simple_tree) — v1
 *
 * Five classic roots (أصول/خصوم/حقوق ملكية/إيرادات/مصروفات) with the standard
 * children a small-to-medium Iraqi business needs. Hierarchical numeric codes;
 * only leaves are postable. Fully editable after seeding (template data, not
 * DDL) — re-seeding is idempotent via ON CONFLICT (code) DO NOTHING.
 *
 * `systemAccountKeys` maps posting-rule keys → account codes in THIS template.
 */

export const version = 1;

// Arabic display name shown to users. The technical key 'simple_tree' stays
// internal — never surfaced in the UI.
export const label = 'شجرة الحسابات المبسطة';

export const accounts = [
  // ── 1 الأصول ─────────────────────────────────────────────────────────────
  { code: '1', name: 'الأصول', type: 'asset', parent: null, postable: false },
  { code: '11', name: 'الأصول المتداولة', type: 'asset', parent: '1', postable: false },
  { code: '1101', name: 'الصندوق', type: 'asset', parent: '11', postable: true },
  { code: '1102', name: 'المصرف', type: 'asset', parent: '11', postable: true },
  { code: '1103', name: 'المدينون (العملاء)', type: 'asset', parent: '11', postable: true },
  { code: '1104', name: 'المخزون', type: 'asset', parent: '11', postable: true },
  { code: '12', name: 'الأصول الثابتة', type: 'asset', parent: '1', postable: false },
  { code: '1201', name: 'أثاث ومعدات', type: 'asset', parent: '12', postable: true },
  { code: '1202', name: 'وسائط نقل', type: 'asset', parent: '12', postable: true },

  // ── 2 الخصوم ─────────────────────────────────────────────────────────────
  { code: '2', name: 'الخصوم', type: 'liability', parent: null, postable: false },
  { code: '21', name: 'الخصوم المتداولة', type: 'liability', parent: '2', postable: false },
  { code: '2101', name: 'الدائنون (الموردون)', type: 'liability', parent: '21', postable: true },
  { code: '2102', name: 'ضريبة المبيعات المستحقة', type: 'liability', parent: '21', postable: true },
  { code: '22', name: 'قروض طويلة الأجل', type: 'liability', parent: '2', postable: true },

  // ── 3 حقوق الملكية ──────────────────────────────────────────────────────
  { code: '3', name: 'حقوق الملكية', type: 'equity', parent: null, postable: false },
  { code: '31', name: 'رأس المال', type: 'equity', parent: '3', postable: true },
  { code: '32', name: 'الأرباح المحتجزة', type: 'equity', parent: '3', postable: true },
  { code: '33', name: 'رصيد افتتاحي', type: 'equity', parent: '3', postable: true },

  // ── 4 الإيرادات ──────────────────────────────────────────────────────────
  { code: '4', name: 'الإيرادات', type: 'revenue', parent: null, postable: false },
  { code: '41', name: 'إيرادات المبيعات', type: 'revenue', parent: '4', postable: true },
  { code: '42', name: 'مردودات المبيعات', type: 'revenue', parent: '4', postable: true },
  { code: '43', name: 'فوائد الأقساط', type: 'revenue', parent: '4', postable: true },
  { code: '44', name: 'إيرادات أخرى', type: 'revenue', parent: '4', postable: true },
  { code: '45', name: 'فروقات صرف العملة', type: 'revenue', parent: '4', postable: true },
  { code: '46', name: 'خصم مكتسب', type: 'revenue', parent: '4', postable: true },

  // ── 5 المصروفات ──────────────────────────────────────────────────────────
  { code: '5', name: 'المصروفات', type: 'expense', parent: null, postable: false },
  { code: '51', name: 'كلفة البضاعة المباعة', type: 'expense', parent: '5', postable: true },
  { code: '52', name: 'الخصم الممنوح', type: 'expense', parent: '5', postable: true },
  { code: '53', name: 'مصروفات تشغيلية', type: 'expense', parent: '5', postable: false },
  { code: '5301', name: 'إيجار', type: 'expense', parent: '53', postable: true },
  { code: '5302', name: 'رواتب وأجور', type: 'expense', parent: '53', postable: true },
  { code: '5303', name: 'مرافق (ماء/كهرباء/انترنت)', type: 'expense', parent: '53', postable: true },
  { code: '5304', name: 'مستلزمات', type: 'expense', parent: '53', postable: true },
  { code: '5305', name: 'صيانة', type: 'expense', parent: '53', postable: true },
  { code: '5306', name: 'نقل', type: 'expense', parent: '53', postable: true },
  { code: '5307', name: 'تسويق', type: 'expense', parent: '53', postable: true },
  { code: '5308', name: 'ضرائب ورسوم', type: 'expense', parent: '53', postable: true },
  { code: '5309', name: 'مصروفات تشغيلية أخرى', type: 'expense', parent: '53', postable: true },
  { code: '54', name: 'مصروفات أخرى', type: 'expense', parent: '5', postable: true },
  { code: '55', name: 'عجز/زيادة الصندوق', type: 'expense', parent: '5', postable: true },
  { code: '56', name: 'تسويات المخزون', type: 'expense', parent: '5', postable: true },
];

export const systemAccountKeys = {
  cash_default: '1101',
  bank_default: '1102',
  accounts_receivable: '1103',
  inventory: '1104',
  accounts_payable: '2101',
  sales_tax_payable: '2102',
  capital: '31',
  retained_earnings: '32',
  opening_balance_equity: '33',
  sales_revenue: '41',
  sales_returns: '42',
  installment_interest_income: '43',
  other_income: '44',
  currency_exchange_diff: '45',
  purchase_discount: '46',
  cogs: '51',
  sales_discount: '52',
  expenses_default: '5309',
  other_expenses: '54',
  cash_short_over: '55',
  inventory_adjustment: '56',
  'expense_cat:rent': '5301',
  'expense_cat:salary': '5302',
  'expense_cat:utilities': '5303',
  'expense_cat:supplies': '5304',
  'expense_cat:maintenance': '5305',
  'expense_cat:transport': '5306',
  'expense_cat:marketing': '5307',
  'expense_cat:tax': '5308',
  'expense_cat:other': '5309',
};

export default { version, label, accounts, systemAccountKeys };
