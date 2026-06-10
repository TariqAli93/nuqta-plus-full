/**
 * قالب النظام المحاسبي الموحد العراقي (iraqi_unified) — v1
 *
 * تكييف عملي يتبع التصنيفات والترقيم الرئيسي للنظام المحاسبي الموحد المعتمد
 * في العراق (مجموعات: 1 الموجودات، 2 المطلوبات وحقوق الملكية، 3 الاستخدامات/
 * المصروفات، 4 الموارد/الإيرادات) مع الحسابات الفرعية الشائعة في دليل
 * الحسابات الموحد (16 المدينون، 18 النقود، 26 الدائنون، 31 الرواتب...).
 *
 * ملاحظة: القالب بيانات قابلة للتعديل بالكامل بعد البذر — أي فروقات مع نسخة
 * الدليل المعتمدة لدى جهة التدقيق تُصحَّح من شاشة شجرة الحسابات دون أي تغيير
 * برمجي. الإصدار مرقّم لتسهيل التحديثات المستقبلية.
 */

export const version = 1;

export const accounts = [
  // ── 1 الموجودات ──────────────────────────────────────────────────────────
  { code: '1', name: 'الموجودات', type: 'asset', parent: null, postable: false },
  { code: '11', name: 'الموجودات الثابتة', type: 'asset', parent: '1', postable: false },
  { code: '111', name: 'أراضٍ ومبانٍ', type: 'asset', parent: '11', postable: true },
  { code: '113', name: 'آلات ومعدات', type: 'asset', parent: '11', postable: true },
  { code: '114', name: 'وسائط نقل', type: 'asset', parent: '11', postable: true },
  { code: '115', name: 'أثاث وأجهزة مكاتب', type: 'asset', parent: '11', postable: true },
  { code: '13', name: 'المخزون', type: 'asset', parent: '1', postable: false },
  { code: '131', name: 'مخزون البضائع بقصد البيع', type: 'asset', parent: '13', postable: true },
  { code: '16', name: 'المدينون', type: 'asset', parent: '1', postable: false },
  { code: '161', name: 'مدينون تجاريون (عملاء)', type: 'asset', parent: '16', postable: true },
  { code: '166', name: 'مدينون آخرون', type: 'asset', parent: '16', postable: true },
  { code: '18', name: 'النقود', type: 'asset', parent: '1', postable: false },
  { code: '181', name: 'نقود في الصندوق', type: 'asset', parent: '18', postable: true },
  { code: '183', name: 'نقود لدى المصارف', type: 'asset', parent: '18', postable: true },

  // ── 2 المطلوبات وحقوق الملكية ────────────────────────────────────────────
  { code: '2', name: 'المطلوبات وحقوق الملكية', type: 'liability', parent: null, postable: false },
  { code: '21', name: 'رأس المال', type: 'equity', parent: '2', postable: false },
  { code: '211', name: 'رأس المال المدفوع', type: 'equity', parent: '21', postable: true },
  { code: '22', name: 'الاحتياطيات', type: 'equity', parent: '2', postable: false },
  { code: '221', name: 'فائض (أرباح) متراكم', type: 'equity', parent: '22', postable: true },
  { code: '222', name: 'أرصدة افتتاحية', type: 'equity', parent: '22', postable: true },
  { code: '25', name: 'القروض', type: 'liability', parent: '2', postable: true },
  { code: '26', name: 'الدائنون', type: 'liability', parent: '2', postable: false },
  { code: '261', name: 'دائنون تجاريون (موردون)', type: 'liability', parent: '26', postable: true },
  { code: '266', name: 'ضرائب ورسوم مستحقة', type: 'liability', parent: '26', postable: true },
  { code: '267', name: 'دائنون آخرون', type: 'liability', parent: '26', postable: true },

  // ── 3 الاستخدامات (المصروفات) ────────────────────────────────────────────
  { code: '3', name: 'الاستخدامات (المصروفات)', type: 'expense', parent: null, postable: false },
  { code: '31', name: 'الرواتب والأجور', type: 'expense', parent: '3', postable: true },
  { code: '32', name: 'المستلزمات السلعية', type: 'expense', parent: '3', postable: false },
  { code: '326', name: 'كلفة البضاعة المباعة', type: 'expense', parent: '32', postable: true },
  { code: '327', name: 'مستلزمات سلعية أخرى', type: 'expense', parent: '32', postable: true },
  { code: '33', name: 'المستلزمات الخدمية', type: 'expense', parent: '3', postable: false },
  { code: '331', name: 'إيجارات', type: 'expense', parent: '33', postable: true },
  { code: '332', name: 'ماء وكهرباء واتصالات', type: 'expense', parent: '33', postable: true },
  { code: '333', name: 'صيانة', type: 'expense', parent: '33', postable: true },
  { code: '334', name: 'نقل وانتقال', type: 'expense', parent: '33', postable: true },
  { code: '335', name: 'دعاية وإعلان', type: 'expense', parent: '33', postable: true },
  { code: '339', name: 'مستلزمات خدمية أخرى', type: 'expense', parent: '33', postable: true },
  { code: '37', name: 'الضرائب والرسوم', type: 'expense', parent: '3', postable: true },
  { code: '38', name: 'مصروفات تحويلية أخرى', type: 'expense', parent: '3', postable: false },
  { code: '381', name: 'الخصم الممنوح', type: 'expense', parent: '38', postable: true },
  { code: '382', name: 'عجز/زيادة الصندوق', type: 'expense', parent: '38', postable: true },
  { code: '383', name: 'تسويات المخزون', type: 'expense', parent: '38', postable: true },
  { code: '389', name: 'مصروفات أخرى', type: 'expense', parent: '38', postable: true },

  // ── 4 الموارد (الإيرادات) ────────────────────────────────────────────────
  { code: '4', name: 'الموارد (الإيرادات)', type: 'revenue', parent: null, postable: false },
  { code: '41', name: 'إيراد النشاط الجاري', type: 'revenue', parent: '4', postable: false },
  { code: '411', name: 'إيرادات المبيعات', type: 'revenue', parent: '41', postable: true },
  { code: '417', name: 'مردودات المبيعات (مطروحة)', type: 'revenue', parent: '41', postable: true },
  { code: '43', name: 'إيرادات تشغيل أخرى', type: 'revenue', parent: '4', postable: false },
  { code: '431', name: 'فوائد الأقساط', type: 'revenue', parent: '43', postable: true },
  { code: '432', name: 'خصم مكتسب', type: 'revenue', parent: '43', postable: true },
  { code: '48', name: 'إيرادات تحويلية أخرى', type: 'revenue', parent: '4', postable: false },
  { code: '481', name: 'فروقات صرف العملة', type: 'revenue', parent: '48', postable: true },
  { code: '489', name: 'إيرادات أخرى', type: 'revenue', parent: '48', postable: true },
];

export const systemAccountKeys = {
  cash_default: '181',
  bank_default: '183',
  accounts_receivable: '161',
  inventory: '131',
  accounts_payable: '261',
  sales_tax_payable: '266',
  capital: '211',
  retained_earnings: '221',
  opening_balance_equity: '222',
  sales_revenue: '411',
  sales_returns: '417',
  installment_interest_income: '431',
  other_income: '489',
  currency_exchange_diff: '481',
  purchase_discount: '432',
  cogs: '326',
  sales_discount: '381',
  expenses_default: '339',
  other_expenses: '389',
  cash_short_over: '382',
  inventory_adjustment: '383',
  'expense_cat:rent': '331',
  'expense_cat:salary': '31',
  'expense_cat:utilities': '332',
  'expense_cat:supplies': '327',
  'expense_cat:maintenance': '333',
  'expense_cat:transport': '334',
  'expense_cat:marketing': '335',
  'expense_cat:tax': '37',
  'expense_cat:other': '339',
};

export default { version, accounts, systemAccountKeys };
