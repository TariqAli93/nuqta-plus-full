/**
 * Nuqta Plus — Realistic Iraqi-market seed generator (محاكاة شركة حقيقية).
 *
 * Builds a fully-interrelated dataset that simulates a multi-branch Iraqi retail
 * company operating for a full year, so reports / dashboards / permissions /
 * accounting can be exercised against believable data before go-live.
 *
 * Scope (per spec):
 *   - 5 branches, 10 warehouses, ~15 users (all real roles)
 *   - 10 categories, 1000+ real Iraqi-market products (cost/retail/wholesale/agent)
 *   - 100 suppliers, 500 customers (retail / wholesale / agent)
 *   - Purchases (received) over 12 months → stock in + supplier dues
 *   - Thousands of sales (نقدي + آجل) over 12 months, multi-line, discounts
 *   - Payments on credit sales (full + partial) → customer debts
 *   - Stock movements: opening, purchase, sale, transfers, adjustments (جرد)
 *   - Operational expenses (إيجار/رواتب/كهرباء/...) over 12 months
 *   - Closed cash sessions (ورديات) per branch per month
 *   - NO installments, NO sale returns, NO purchase returns (per spec)
 *
 * Everything is internally consistent: sale/purchase totals match their lines,
 * payment sums match paid_amount, customer/supplier debt caches match the open
 * balances, and product_stock equals the net of every stock movement.
 *
 * Usage (DB up + migrated):
 *   node scripts/seed-iraqi-market.mjs            # build (truncates operational tables)
 *   node scripts/seed-iraqi-market.mjs --keep     # do NOT truncate first (append)
 *   SEED=42 node scripts/seed-iraqi-market.mjs    # reproducible RNG
 *   PRODUCTS=1200 SALES=8000 node scripts/...      # override volumes
 *
 * Refuses to run in production unless SEED_CONFIRM=true.
 */
import 'dotenv/config';
import { getPool, closeDatabase } from '../src/db.js';
import { hashPassword } from '../src/utils/helpers.js';
import { normalizeIraqPhone } from '../src/utils/phone.js';

// ── Environment guard ───────────────────────────────────────────────────────
const NODE_ENV = process.env.NODE_ENV || 'development';
if (NODE_ENV === 'production' && process.env.SEED_CONFIRM !== 'true') {
  console.error('[seed] refusing to run in production without SEED_CONFIRM=true');
  process.exit(1);
}

const ARGS = new Set(process.argv.slice(2));
const KEEP = ARGS.has('--keep');

// ── Volumes (env-overridable) ───────────────────────────────────────────────
const CFG = {
  products: Number(process.env.PRODUCTS) || 1000,
  suppliers: Number(process.env.SUPPLIERS) || 100,
  customers: Number(process.env.CUSTOMERS) || 500,
  sales: Number(process.env.SALES) || 5000,
  purchases: Number(process.env.PURCHASES) || 600,
  transfers: Number(process.env.TRANSFERS) || 200,
  adjustments: Number(process.env.ADJUSTMENTS) || 300,
  months: 12,
};

// ── Seeded RNG (mulberry32) — reproducible runs ─────────────────────────────
let _s = (Number(process.env.SEED) || 20260611) >>> 0;
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
function sample(arr, k) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

// ── Money / date helpers ────────────────────────────────────────────────────
const D = (n) => String(Number(n || 0).toFixed(4));
const round250 = (v) => Math.max(250, Math.round(Number(v) / 250) * 250); // IQD nicely rounded
const IQD = 'IQD';
const NOW = new Date();
const startOfWindow = new Date(NOW.getTime());
startOfWindow.setMonth(startOfWindow.getMonth() - CFG.months);
const OPENING_DATE = new Date(startOfWindow.getTime() - 7 * 86400000); // a week before window
const fmtDate = (d) => d.toISOString().slice(0, 10);
function randomDateInWindow() {
  // Mild upward trend: ~30% of activity lands in the most recent ~45% of the
  // year, so months grow gently busier without starving the first half (which
  // would otherwise post unrealistic back-to-back losses).
  const t0 = startOfWindow.getTime();
  const span = NOW.getTime() - t0;
  const u = chance(0.3) ? 0.55 + rnd() * 0.45 : rnd();
  const d = new Date(t0 + u * span);
  d.setHours(ri(9, 21), ri(0, 59), ri(0, 59), 0); // business hours
  return d;
}
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Quantities scale INVERSELY with unit cost — cheap goods move in bulk, costly
// electronics in small counts — so inventory value stays realistic (you don't
// stock 600 laptops). Used for opening stock and purchase lines.
function stockQty(cost) {
  if (cost < 2000) return ri(150, 500);
  if (cost < 20000) return ri(40, 180);
  if (cost < 100000) return ri(10, 45);
  if (cost < 400000) return ri(4, 16);
  return ri(1, 6);
}
function purchaseQty(cost) {
  if (cost < 2000) return ri(80, 300);
  if (cost < 20000) return ri(25, 100);
  if (cost < 100000) return ri(6, 30);
  if (cost < 400000) return ri(2, 10);
  return ri(1, 4);
}

// ════════════════════════════════════════════════════════════════════════════
//  Iraqi reference data
// ════════════════════════════════════════════════════════════════════════════
const MALE = ['محمد', 'علي', 'أحمد', 'حسين', 'حسن', 'مصطفى', 'عمر', 'يوسف', 'إبراهيم', 'عبدالله',
  'كرار', 'حيدر', 'مرتضى', 'سجاد', 'أمير', 'زيد', 'عباس', 'صادق', 'باقر', 'كاظم', 'جعفر', 'ليث',
  'وسام', 'رعد', 'ثائر', 'فراس', 'مازن', 'سيف', 'حمزة', 'يعقوب', 'نوار', 'بشار', 'هيثم', 'عمار',
  'مهند', 'أيمن', 'تحسين', 'سعد', 'عدنان', 'كريم', 'جاسم', 'ستار', 'رياض', 'صباح', 'فلاح'];
const FEMALE = ['فاطمة', 'زينب', 'مريم', 'نور', 'رقية', 'زهراء', 'آية', 'سارة', 'هدى', 'رنا', 'شهد',
  'دعاء', 'إسراء', 'نرجس', 'بتول', 'تبارك', 'رغد', 'بان', 'ميس', 'أسماء', 'حنين', 'غفران', 'ضحى'];
const FAMILY = ['العامري', 'الجبوري', 'الدليمي', 'التميمي', 'الخفاجي', 'الزيدي', 'الربيعي', 'الساعدي',
  'الموسوي', 'الحسيني', 'العبيدي', 'الشمري', 'الكناني', 'البياتي', 'العزاوي', 'المالكي', 'الطائي',
  'الكعبي', 'الأسدي', 'الفهداوي', 'الجنابي', 'القيسي', 'الحلفي', 'الغراوي', 'الشويلي', 'المياحي',
  'الزبيدي', 'العقابي', 'الدراجي', 'الحميداوي', 'اللامي', 'الخزرجي', 'الركابي', 'الطائفي'];
const CITIES = [
  { city: 'بغداد', areas: ['الكرادة', 'المنصور', 'الكاظمية', 'الأعظمية', 'زيونة', 'الدورة', 'الشعب', 'البياع', 'الجادرية', 'الحرية'] },
  { city: 'البصرة', areas: ['العشار', 'الجزائر', 'الأصمعي', 'المعقل', 'الزبير', 'أبو الخصيب', 'البراضعية'] },
  { city: 'أربيل', areas: ['عنكاوا', 'المركز', 'دريم سيتي', 'كويستان', 'بنسلاوة'] },
  { city: 'النجف', areas: ['المركز', 'الكوفة', 'حي السلام', 'حي الأنصار', 'حي النصر'] },
  { city: 'كربلاء', areas: ['المركز', 'الحر', 'الحسين', 'العباس', 'حي الموظفين'] },
  { city: 'الموصل', areas: ['المجموعة الثقافية', 'الدواسة', 'النبي يونس', 'الزهور', 'حي الصناعة'] },
  { city: 'الديوانية', areas: ['المركز', 'الجمهوري', 'العروبة', 'حي الأمير'] },
  { city: 'بابل', areas: ['الحلة', 'الإسكان', 'الجمعية', 'حي الأطباء'] },
  { city: 'واسط', areas: ['الكوت', 'الحي', 'العزيزية', 'حي الزهراء'] },
  { city: 'ديالى', areas: ['بعقوبة', 'المقدادية', 'الخالص', 'حي المعلمين'] },
];
const COMPANY_PREFIX = ['شركة', 'مجموعة', 'مؤسسة', 'معمل', 'مخازن', 'وكالة'];
const COMPANY_CORE = ['الرافدين', 'دجلة', 'الفرات', 'النهرين', 'بلاد الرافدين', 'الوركاء', 'الزوراء',
  'عشتار', 'بابل', 'أور', 'سومر', 'الرشيد', 'المعتصم', 'الخليج', 'النخيل', 'السلام', 'الأمين',
  'الوفاء', 'النور', 'الفيحاء', 'المستقبل', 'الإعمار', 'التقدم', 'الريادة', 'الذهبي', 'الماسة'];
const COMPANY_SUFFIX = ['للتجارة العامة', 'للمواد الغذائية', 'للتوزيع', 'للاستيراد والتصدير',
  'للتجارة', 'للصناعات الغذائية', 'للمنظفات', 'للإلكترونيات', 'للمواد الإنشائية', 'التجارية'];

function personName() {
  const male = chance(0.78);
  const first = male ? pick(MALE) : pick(FEMALE);
  return `${first} ${pick(MALE)} ${pick(FAMILY)}`;
}
function iraqiPhone() {
  const prefix = pick(['077', '078', '075', '079']);
  let n = prefix;
  for (let i = 0; i < 8; i++) n += ri(0, 9);
  return n;
}
function normPhone(p) {
  try { return normalizeIraqPhone(p) || p; } catch { return p; }
}
function cityArea() {
  const c = pick(CITIES);
  return { city: c.city, address: `${c.city} - ${pick(c.areas)} - محلة ${ri(100, 940)} - شارع ${ri(1, 60)}` };
}

// ── Product catalog templates (real Iraqi-market goods) ─────────────────────
// Each category: items × brands × sizes → many SKUs. costRange in IQD.
const CATALOG = {
  'مواد غذائية': {
    expiry: true, unit: 'قطعة',
    items: [
      { n: 'رز عنبر', brands: ['الشلب', 'الوركاء', 'بيبسي رايس', 'مزرعتي'], sizes: ['1 كغم', '5 كغم', '10 كغم', '25 كغم'], cost: [1250, 38000] },
      { n: 'سكر', brands: ['الحلو', 'سكر برازيلي', 'المملكة'], sizes: ['1 كغم', '5 كغم', '10 كغم', '50 كغم'], cost: [1000, 45000] },
      { n: 'طحين', brands: ['أبو الشامات', 'الطحان', 'الفخامة'], sizes: ['1 كغم', '5 كغم', '50 كغم'], cost: [1000, 40000] },
      { n: 'زيت طعام', brands: ['زر', 'النخلة', 'عافية', 'الفاخر'], sizes: ['1 لتر', '1.8 لتر', '5 لتر'], cost: [2000, 16000] },
      { n: 'معجون طماطم', brands: ['الدرة', 'رنا', 'تكسير', 'كوبرا'], sizes: ['400 غم', '800 غم'], cost: [1000, 3000] },
      { n: 'شاي', brands: ['الغزالين', 'العطار', 'ليبتون', 'الكبدة'], sizes: ['250 غم', '450 غم', '900 غم'], cost: [2000, 9000] },
      { n: 'معكرونة', brands: ['الموسوي', 'ماما', 'الديك'], sizes: ['400 غم', '500 غم'], cost: [600, 1500] },
      { n: 'بقوليات عدس', brands: ['الريف', 'الخيرات'], sizes: ['1 كغم', '5 كغم'], cost: [1500, 8000] },
      { n: 'حمص', brands: ['الريف', 'الخيرات'], sizes: ['1 كغم', '5 كغم'], cost: [1750, 9000] },
      { n: 'جبن مثلثات', brands: ['بوك', 'بيبي بل', 'بوراك'], sizes: ['8 قطع', '16 قطعة'], cost: [1500, 4500] },
      { n: 'حليب مجفف', brands: ['نيدو', 'سنبلة', 'بريمالاك'], sizes: ['400 غم', '900 غم', '2.5 كغم'], cost: [3500, 26000] },
      { n: 'تمر', brands: ['زهدي', 'الخستاوي', 'البرحي'], sizes: ['1 كغم', '5 كغم'], cost: [1500, 9000] },
      { n: 'عسل طبيعي', brands: ['السدر', 'مراعي'], sizes: ['500 غم', '1 كغم'], cost: [8000, 30000] },
      { n: 'بيض مائدة', brands: ['الدجاجة الذهبية', 'أبراج'], sizes: ['طبق 30'], cost: [4000, 6500] },
    ],
  },
  'مشروبات': {
    expiry: true, unit: 'قطعة',
    items: [
      { n: 'ماء معدني', brands: ['أكوافينا', 'تانيا', 'وارة', 'صافية'], sizes: ['330 مل', '500 مل', '1.5 لتر', 'كارتون 12'], cost: [250, 4000] },
      { n: 'مشروب غازي', brands: ['بيبسي', 'سفن أب', 'ميرندا', 'كوكا كولا'], sizes: ['250 مل', '1 لتر', '2.25 لتر', 'كارتون'], cost: [500, 9000] },
      { n: 'عصير', brands: ['راني', 'سن توب', 'باريز', 'ميلو'], sizes: ['180 مل', '1 لتر'], cost: [500, 2500] },
      { n: 'مشروب طاقة', brands: ['تايغر', 'رد بُل', 'باور هورس'], sizes: ['250 مل'], cost: [750, 2000] },
      { n: 'قهوة سريعة', brands: ['نسكافيه', 'فطور'], sizes: ['علبة 50', 'كيس 200غم'], cost: [3000, 12000] },
    ],
  },
  'مواد تنظيف': {
    expiry: false, unit: 'قطعة',
    items: [
      { n: 'مسحوق غسيل', brands: ['أريال', 'تايد', 'برسيل', 'فيري'], sizes: ['1 كغم', '3 كغم', '6 كغم'], cost: [2000, 16000] },
      { n: 'سائل جلي', brands: ['فيري', 'جيف', 'برسيل'], sizes: ['500 مل', '1 لتر', '2 لتر'], cost: [1000, 4500] },
      { n: 'منظف أرضيات', brands: ['فلاش', 'ديتول', 'كلين'], sizes: ['1 لتر', '2 لتر'], cost: [1250, 4000] },
      { n: 'معطر جو', brands: ['اير ويك', 'غليد'], sizes: ['300 مل'], cost: [1750, 3500] },
      { n: 'مبيض كلوركس', brands: ['كلوركس', 'بريق'], sizes: ['1 لتر', '4 لتر'], cost: [1000, 4000] },
      { n: 'ورق تواليت', brands: ['فاين', 'سوفت'], sizes: ['عبوة 6', 'عبوة 10'], cost: [2500, 7000] },
    ],
  },
  'مواد تجميل': {
    expiry: true, unit: 'قطعة',
    items: [
      { n: 'شامبو', brands: ['هيد آند شولدرز', 'صانسيلك', 'بانتين', 'دوف'], sizes: ['200 مل', '400 مل', '700 مل'], cost: [2000, 8000] },
      { n: 'صابون استحمام', brands: ['لوكس', 'دوف', 'كامي'], sizes: ['قطعة', 'عبوة 4'], cost: [750, 4000] },
      { n: 'كريم ترطيب', brands: ['نيفيا', 'فازلين', 'جونسون'], sizes: ['100 مل', '200 مل'], cost: [2000, 6000] },
      { n: 'معجون أسنان', brands: ['سيجنال', 'كولجيت', 'سنسوداين'], sizes: ['100 مل', '150 مل'], cost: [1500, 5000] },
      { n: 'مزيل عرق', brands: ['ركسونا', 'نيفيا', 'دوف'], sizes: ['50 مل', '150 مل'], cost: [1750, 4500] },
      { n: 'فرشاة أسنان', brands: ['أورال بي', 'كولجيت'], sizes: ['متوسطة', 'ناعمة'], cost: [750, 2500] },
    ],
  },
  'قرطاسية': {
    expiry: false, unit: 'قطعة',
    items: [
      { n: 'دفتر', brands: ['أبو الهول', 'الفارابي', 'إليت'], sizes: ['60 ورقة', '100 ورقة', '200 ورقة'], cost: [500, 3000] },
      { n: 'قلم جاف', brands: ['بيك', 'بنتل', 'باور'], sizes: ['أزرق', 'أسود', 'علبة 12'], cost: [250, 4000] },
      { n: 'قلم رصاص', brands: ['ستيدلر', 'فابر كاستل'], sizes: ['HB', 'علبة 12'], cost: [250, 5000] },
      { n: 'دفتر رسم', brands: ['كانسون', 'إليت'], sizes: ['A4', 'A3'], cost: [1000, 4000] },
      { n: 'ألوان خشبية', brands: ['فابر كاستل', 'دومز'], sizes: ['12 لون', '24 لون'], cost: [2000, 8000] },
      { n: 'لاصق ورقي', brands: ['UHU', 'أمستر'], sizes: ['صغير', 'كبير'], cost: [500, 2500] },
      { n: 'آلة حاسبة', brands: ['كاسيو', 'سيتيزن'], sizes: ['علمية', 'مكتبية'], cost: [6000, 35000] },
    ],
  },
  'مواد كهربائية': {
    expiry: false, unit: 'قطعة',
    items: [
      { n: 'مصباح LED', brands: ['فيلبس', 'أوسرام', 'توشيبا'], sizes: ['9 واط', '12 واط', '18 واط'], cost: [1000, 6000] },
      { n: 'كيبل كهرباء', brands: ['الجزيرة', 'النخبة'], sizes: ['متر 2.5', 'لفة 50م'], cost: [1000, 90000] },
      { n: 'مفتاح كهرباء', brands: ['ليجراند', 'شنايدر'], sizes: ['مفرد', 'مزدوج'], cost: [1500, 7000] },
      { n: 'قاطع كهرباء', brands: ['شنايدر', 'ABB'], sizes: ['16A', '32A', '63A'], cost: [4000, 20000] },
      { n: 'مدد كهرباء', brands: ['الوفاء', 'باور'], sizes: ['3 مخارج', '5 مخارج'], cost: [3000, 12000] },
      { n: 'لمبة ليزر', brands: ['أوبو', 'سامسونك'], sizes: ['20 واط', '30 واط'], cost: [3500, 15000] },
    ],
  },
  'مواد بناء': {
    expiry: false, unit: 'قطعة',
    items: [
      { n: 'إسمنت', brands: ['الكوفة', 'كربلاء', 'المثنى'], sizes: ['كيس 50 كغم'], cost: [6000, 9000] },
      { n: 'صبغ جدران', brands: ['جوتن', 'ناشيونال', 'الفنار'], sizes: ['1 لتر', '4 لتر', '18 لتر'], cost: [4000, 75000] },
      { n: 'سيراميك أرضيات', brands: ['الفجر', 'كاشي بابل'], sizes: ['30×30', '60×60', 'متر مربع'], cost: [4000, 18000] },
      { n: 'أنبوب بلاستيك', brands: ['الزوراء', 'الرافدين'], sizes: ['1/2 إنج', '1 إنج', '2 إنج'], cost: [1500, 12000] },
      { n: 'مسامير', brands: ['النخبة'], sizes: ['كيس 1 كغم', 'علبة'], cost: [1500, 6000] },
      { n: 'سيليكون', brands: ['سوداك', 'بوند'], sizes: ['أنبوب'], cost: [2000, 5000] },
    ],
  },
  'أجهزة إلكترونية': {
    expiry: false, unit: 'قطعة',
    items: [
      { n: 'هاتف ذكي', brands: ['سامسونك', 'شاومي', 'آيفون', 'أوبو', 'ريلمي'], sizes: ['64 جيجا', '128 جيجا', '256 جيجا'], cost: [120000, 1500000] },
      { n: 'سماعة بلوتوث', brands: ['JBL', 'أنكر', 'شاومي'], sizes: ['محمولة', 'كبيرة'], cost: [15000, 120000] },
      { n: 'شاشة LED', brands: ['سامسونك', 'LG', 'توشيبا'], sizes: ['32 إنج', '43 إنج', '55 إنج'], cost: [150000, 850000] },
      { n: 'لابتوب', brands: ['HP', 'ديل', 'لينوفو', 'آسوس'], sizes: ['i5', 'i7'], cost: [550000, 2200000] },
      { n: 'باور بانك', brands: ['أنكر', 'شاومي', 'باور'], sizes: ['10000 مللي', '20000 مللي'], cost: [12000, 45000] },
      { n: 'ساعة ذكية', brands: ['شاومي', 'سامسونك', 'أمازفيت'], sizes: ['عادية', 'برو'], cost: [35000, 250000] },
    ],
  },
  'إكسسوارات موبايل': {
    expiry: false, unit: 'قطعة',
    items: [
      { n: 'شاحن جداري', brands: ['أنكر', 'سامسونك', 'بورت'], sizes: ['18 واط', '25 واط', '33 واط'], cost: [3000, 25000] },
      { n: 'كيبل شحن', brands: ['أنكر', 'بورت', 'يو إس بي'], sizes: ['تايب سي', 'لايتننك', 'مايكرو'], cost: [1500, 12000] },
      { n: 'حافظة موبايل', brands: ['سبيجن', 'عام'], sizes: ['شفاف', 'جلد', 'سيليكون'], cost: [1000, 12000] },
      { n: 'واقي شاشة', brands: ['نيلكين', 'عام'], sizes: ['زجاجي', 'نانو'], cost: [1000, 8000] },
      { n: 'سماعة سلكية', brands: ['سامسونك', 'أنكر'], sizes: ['تايب سي', '3.5 ملم'], cost: [2000, 15000] },
      { n: 'حامل موبايل', brands: ['بازيوس', 'عام'], sizes: ['مكتبي', 'سيارة'], cost: [2500, 10000] },
    ],
  },
  'مواد منزلية': {
    expiry: false, unit: 'قطعة',
    items: [
      { n: 'طقم صحون', brands: ['لومينارك', 'عربي'], sizes: ['12 قطعة', '18 قطعة'], cost: [15000, 65000] },
      { n: 'قدر طبخ', brands: ['تيفال', 'الزهرة'], sizes: ['24 سم', '28 سم', 'طقم'], cost: [12000, 90000] },
      { n: 'كاسات شاي', brands: ['عثمانلي', 'عربي'], sizes: ['طقم 6', 'طقم 12'], cost: [4000, 20000] },
      { n: 'مفرش طاولة', brands: ['عام'], sizes: ['وسط', 'كبير'], cost: [3000, 12000] },
      { n: 'سطل بلاستيك', brands: ['الرائد', 'الأمين'], sizes: ['10 لتر', '20 لتر'], cost: [1500, 6000] },
      { n: 'علاقة ملابس', brands: ['عام'], sizes: ['عبوة 6', 'عبوة 12'], cost: [1500, 5000] },
    ],
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Bulk insert helper (chunked to stay under Postgres' 65535-param limit)
// ════════════════════════════════════════════════════════════════════════════
async function bulkInsert(client, table, cols, rows, { returning = null } = {}) {
  if (rows.length === 0) return [];
  const colCount = cols.length;
  const maxRowsPerStmt = Math.max(1, Math.floor(64000 / colCount));
  const out = [];
  for (let i = 0; i < rows.length; i += maxRowsPerStmt) {
    const chunk = rows.slice(i, i + maxRowsPerStmt);
    const params = [];
    const valuesSql = chunk
      .map((row) => {
        const ph = row.map((v) => { params.push(v); return `$${params.length}`; });
        return `(${ph.join(',')})`;
      })
      .join(',');
    const ret = returning ? ` RETURNING ${returning}` : '';
    const text = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${valuesSql}${ret}`;
    const res = await client.query(text, params);
    if (returning) out.push(...res.rows);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//  Main
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  const pool = await getPool();
  const client = await pool.connect();
  const t0 = Date.now();
  const log = (m) => console.log(`[seed] ${m}`);

  try {
    await client.query('BEGIN');

    // ── Reset operational tables (keep users/settings/currency) ──────────────
    if (!KEEP) {
      log('truncating operational tables…');
      await client.query(`TRUNCATE
        sale_item_stock_entries, sale_return_items, sale_returns, sale_items, payments, sales,
        purchase_return_items, purchase_returns, purchase_items, purchase_invoices,
        installment_actions, installments,
        stock_movements, product_stock_entries, product_stock, warehouse_transfers,
        product_units, products, categories, customers, suppliers, expenses,
        branches, warehouses,
        vouchers, treasury_transfers, cashboxes, bank_accounts,
        journal_entry_lines, journal_entries, gl_posting_failures,
        accounting_period_shifts, accounting_period_report_snapshots, accounting_periods,
        cash_sessions, invoice_sequences, document_sequences,
        credit_events, credit_snapshots, credit_scores,
        notifications, notification_logs
        RESTART IDENTITY CASCADE`);
    }

    // ── Settings & currencies ────────────────────────────────────────────────
    const flags = {
      inventory: true, pos: true, draftInvoices: true, installments: false, creditScore: false,
      multiBranch: true, multiWarehouse: true, warehouseTransfers: true,
      alerts: true, liveOperations: true, accountingPeriods: false, treasury: false,
      agentPricing: true,
    };
    await client.query(
      `INSERT INTO settings (key, value, description) VALUES ('feature_flags', $1, 'seed')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(flags)]
    );
    await client.query(
      `INSERT INTO settings (key, value, description) VALUES ('setup_mode', 'done', 'seed')
       ON CONFLICT (key) DO UPDATE SET value = 'done'`
    );
    await client.query(
      `INSERT INTO settings (key, value, description) VALUES ('tax_rate', '0', 'seed: نسبة الضريبة الافتراضية')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );
    for (const [code, name, sym, rate, base] of [
      ['IQD', 'دينار عراقي', 'د.ع', 1, true],
      ['USD', 'دولار أمريكي', '$', 1310, false],
    ]) {
      await client.query(
        `INSERT INTO currency_settings (currency_code, currency_name, symbol, exchange_rate, is_base_currency, is_active)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (currency_code) DO UPDATE SET exchange_rate = EXCLUDED.exchange_rate, is_base_currency = EXCLUDED.is_base_currency`,
        [code, name, sym, D(rate), base]
      );
    }

    // ── Branches & warehouses ────────────────────────────────────────────────
    const branchDefs = [
      { name: 'الفرع الرئيسي - بغداد', city: 'بغداد' },
      { name: 'فرع البصرة', city: 'البصرة' },
      { name: 'فرع أربيل', city: 'أربيل' },
      { name: 'فرع النجف', city: 'النجف' },
      { name: 'فرع كربلاء', city: 'كربلاء' },
    ];
    const branchRows = await bulkInsert(client, 'branches', ['name', 'address', 'is_active', 'created_at'],
      branchDefs.map((b) => [b.name, `${b.city} - الشارع التجاري`, true, OPENING_DATE]), { returning: 'id' });
    const branchIds = branchRows.map((r) => r.id);

    const whRows = [];
    const whByBranch = {}; // branchId -> [warehouseId,...]
    branchIds.forEach((bid, idx) => {
      whByBranch[bid] = [];
      whRows.push([`مخزن ${branchDefs[idx].city} الرئيسي`, bid, true, OPENING_DATE]);
      whRows.push([`مخزن ${branchDefs[idx].city} الفرعي`, bid, true, OPENING_DATE]);
    });
    const warehouseRows = await bulkInsert(client, 'warehouses', ['name', 'branch_id', 'is_active', 'created_at'],
      whRows, { returning: 'id, branch_id' });
    const warehouseIds = warehouseRows.map((r) => r.id);
    warehouseRows.forEach((r) => whByBranch[r.branch_id].push(r.id));
    // Each branch's first warehouse is its default.
    for (const bid of branchIds) {
      await client.query('UPDATE branches SET default_warehouse_id = $1 WHERE id = $2', [whByBranch[bid][0], bid]);
    }

    // ── Users (all real roles) ───────────────────────────────────────────────
    const pwd = await hashPassword('Nuqta@123');
    const userDefs = [];
    userDefs.push({ username: 'admin', full: 'مدير النظام العام', role: 'global_admin', branch: null, wh: null });
    branchIds.forEach((bid, i) => {
      const c = branchDefs[i].city;
      userDefs.push({ username: `manager_${i + 1}`, full: `مدير فرع ${c}`, role: 'branch_manager', branch: bid, wh: null });
      userDefs.push({ username: `cashier_${i + 1}`, full: `كاشير ${c}`, role: 'cashier', branch: bid, wh: whByBranch[bid][0] });
    });
    // shared back-office
    userDefs.push({ username: 'accountant', full: 'المحاسب العام', role: 'manager', branch: branchIds[0], wh: null });
    userDefs.push({ username: 'store_keeper', full: 'أمين المخزن', role: 'manager', branch: branchIds[0], wh: whByBranch[branchIds[0]][0] });
    userDefs.push({ username: 'sales_rep', full: 'موظف المبيعات', role: 'cashier', branch: branchIds[0], wh: whByBranch[branchIds[0]][0] });

    // Users are upserted (NOT truncated) so re-runs keep stable ids and the
    // assigned branch/warehouse is repointed to the freshly-created rows.
    const userByName = {};
    for (const u of userDefs) {
      const res = await client.query(
        `INSERT INTO users (username, password, full_name, phone, role, assigned_branch_id, assigned_warehouse_id, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
         ON CONFLICT (username) DO UPDATE SET
           full_name = EXCLUDED.full_name, role = EXCLUDED.role,
           assigned_branch_id = EXCLUDED.assigned_branch_id,
           assigned_warehouse_id = EXCLUDED.assigned_warehouse_id, is_active = true
         RETURNING id, username, role, assigned_branch_id`,
        [u.username, pwd, u.full, iraqiPhone(), u.role, u.branch, u.wh, OPENING_DATE]
      );
      userByName[u.username] = res.rows[0];
    }
    const adminId = userByName['admin'].id;
    const cashierByBranch = {}; // branchId -> cashier userId
    branchIds.forEach((bid, i) => { cashierByBranch[bid] = userByName[`cashier_${i + 1}`].id; });

    // ── Categories ───────────────────────────────────────────────────────────
    const catNames = Object.keys(CATALOG);
    const catRows = await bulkInsert(client, 'categories', ['name', 'description', 'is_active', 'created_at', 'created_by'],
      catNames.map((n) => [n, `تصنيف ${n}`, true, OPENING_DATE, adminId]), { returning: 'id, name' });
    const catId = Object.fromEntries(catRows.map((r) => [r.name, r.id]));

    // ── Suppliers ────────────────────────────────────────────────────────────
    const usedSupplierNames = new Set();
    const supplierRows = [];
    while (supplierRows.length < CFG.suppliers) {
      let name = `${pick(COMPANY_PREFIX)} ${pick(COMPANY_CORE)} ${pick(COMPANY_SUFFIX)}`;
      if (usedSupplierNames.has(name)) name += ` (${pick(CITIES).city})`;
      if (usedSupplierNames.has(name)) continue;
      usedSupplierNames.add(name);
      const loc = cityArea();
      const ph = iraqiPhone();
      supplierRows.push([name, ph, normPhone(ph), loc.address, loc.city,
        chance(0.3) ? 'مورد رئيسي - تعامل منتظم' : null, '0', '0', true, OPENING_DATE, adminId]);
    }
    const supRes = await bulkInsert(client, 'suppliers',
      ['name', 'phone', 'normalized_phone', 'address', 'city', 'notes', 'total_purchases', 'total_debt', 'is_active', 'created_at', 'created_by'],
      supplierRows, { returning: 'id' });
    const supplierIds = supRes.map((r) => r.id);

    // ── Products (+ base unit) ───────────────────────────────────────────────
    log(`generating ${CFG.products} products…`);
    const perCat = Math.ceil(CFG.products / catNames.length);
    const productRows = [];
    const productMeta = []; // parallel meta: { cost, sell, wholesale, agent, unit, categoryName, name, sku, barcode, tracksExpiry }
    let sku = 1, barcodeSeq = 6280000000001;
    for (const cat of catNames) {
      const def = CATALOG[cat];
      let made = 0;
      // iterate item × brand × size combos (shuffled) until perCat reached
      const combos = [];
      for (const it of def.items) for (const br of it.brands) for (const sz of it.sizes) combos.push({ it, br, sz });
      const ordered = sample(combos, combos.length);
      let ci = 0;
      while (made < perCat && (productRows.length < CFG.products)) {
        const { it, br, sz } = ordered[ci % ordered.length];
        ci++;
        const [cmin, cmax] = it.cost;
        // size index nudges the cost within range so bigger sizes cost more
        const szIdx = it.sizes.indexOf(sz);
        const frac = it.sizes.length > 1 ? szIdx / (it.sizes.length - 1) : rnd();
        const cost = round250(cmin + (cmax - cmin) * (0.35 * frac + 0.65 * rnd()));
        const sell = round250(cost * (1 + 0.18 + rnd() * 0.4));
        const wholesale = round250(Math.max(cost * 1.06, sell * (0.82 + rnd() * 0.08)));
        const agent = round250(Math.max(cost * 1.04, wholesale * (0.92 + rnd() * 0.05)));
        const name = `${it.n} ${br} ${sz}`;
        const skuStr = `NP-${cat.slice(0, 2)}-${String(sku).padStart(5, '0')}`;
        const barcode = String(barcodeSeq++);
        const minStock = ri(5, 30);
        const tracksExpiry = def.expiry && chance(0.85);
        productRows.push([
          name, skuStr, barcode, catId[cat], `${it.n} - ${br}`, D(cost), D(sell), IQD, 'inventory',
          0, minStock, def.unit, br, pick(supplierIds), D(wholesale), D(agent), tracksExpiry,
          'available', minStock, true, OPENING_DATE, adminId,
        ]);
        productMeta.push({ cost, sell, wholesale, agent, unit: def.unit, name, sku: skuStr, barcode, tracksExpiry });
        sku++; made++;
      }
    }
    const prodRes = await bulkInsert(client, 'products',
      ['name', 'sku', 'barcode', 'category_id', 'description', 'cost_price', 'selling_price', 'currency',
        'product_type', 'stock', 'min_stock', 'unit', 'supplier', 'supplier_id', 'wholesale_price', 'agent_price',
        'tracks_expiry', 'status', 'low_stock_threshold', 'is_active', 'created_at', 'created_by'],
      productRows, { returning: 'id' });
    const productIds = prodRes.map((r) => r.id);
    productMeta.forEach((m, i) => { m.id = productIds[i]; });

    // base product_unit for each product
    const unitRows = productMeta.map((m) => [
      m.id, m.unit, '1', true, true, true, m.barcode, D(m.sell), D(m.cost), D(m.wholesale), D(m.agent), true, OPENING_DATE,
    ]);
    const unitRes = await bulkInsert(client, 'product_units',
      ['product_id', 'name', 'conversion_factor', 'is_base', 'is_default_sale', 'is_default_purchase', 'barcode',
        'sale_price', 'cost_price', 'wholesale_price', 'agent_price', 'is_active', 'created_at'],
      unitRows, { returning: 'id, product_id' });
    const unitByProduct = Object.fromEntries(unitRes.map((r) => [r.product_id, r.id]));
    productMeta.forEach((m) => { m.unitId = unitByProduct[m.id]; });

    // ── Distribute products to warehouses with opening stock ─────────────────
    // stockState: key `${productId}:${warehouseId}` -> { qty (available for sale), meta }
    // events: chronological stock events per (product,warehouse)
    const opening = new Map();          // key -> opening qty
    const prodWarehouses = new Map();   // productId -> [warehouseId,...] it is stocked in
    const events = [];                  // { key, productId, warehouseId, at, type, change, refType, refId, by }
    const keyOf = (p, w) => `${p}:${w}`;
    for (const m of productMeta) {
      const k = ri(2, 4);
      const whs = sample(warehouseIds, k);
      prodWarehouses.set(m.id, whs);
      for (const w of whs) {
        const qty = stockQty(m.cost);
        opening.set(keyOf(m.id, w), qty);
        events.push({ key: keyOf(m.id, w), productId: m.id, warehouseId: w, at: OPENING_DATE, type: 'opening_balance', change: qty, refType: null, refId: null, by: adminId });
      }
    }
    const avail = new Map(opening); // remaining sellable from opening (keeps stock non-negative)

    // Sale-line picking pools: ~15% of products stay STAGNANT (never sold);
    // ~18% are HOT (weighted ×3 so they dominate the best-sellers report).
    const stagnantIds = new Set(sample(productMeta, Math.floor(productMeta.length * 0.15)).map((m) => m.id));
    const nonStagnant = productMeta.filter((m) => !stagnantIds.has(m.id));
    const hotIds = new Set(sample(nonStagnant, Math.floor(nonStagnant.length * 0.18)).map((m) => m.id));
    const whProducts = new Map(warehouseIds.map((w) => [w, []])); // warehouse -> sellable product list
    for (const m of productMeta) {
      if (stagnantIds.has(m.id)) continue;
      for (const w of prodWarehouses.get(m.id)) {
        whProducts.get(w).push(m);
        if (hotIds.has(m.id)) { whProducts.get(w).push(m, m); }
      }
    }

    // ── Purchases (received) over 12 months ──────────────────────────────────
    log(`generating ${CFG.purchases} purchases…`);
    const purchaseRows = [];
    const purchaseItemRows = [];
    const supplierAgg = new Map(); // supplierId -> { purchases, debt }
    let purSeq = 1;
    const purchasePlanned = []; // {supplierId, branchId, warehouseId, date, lines:[{m, qty, cost}], paymentType}
    for (let i = 0; i < CFG.purchases; i++) {
      const supplierId = pick(supplierIds);
      const bid = pick(branchIds);
      const wid = pick(whByBranch[bid]);
      const date = randomDateInWindow();
      const lineCount = ri(3, 8);
      const chosen = sample(productMeta, lineCount);
      const lines = chosen.map((m) => {
        const qty = purchaseQty(m.cost); // small/medium/large, scaled by cost
        const cost = round250(m.cost * (0.9 + rnd() * 0.08)); // buy slightly below catalog cost
        return { m, qty, cost };
      });
      const paymentType = chance(0.45) ? 'credit' : 'cash';
      purchasePlanned.push({ supplierId, bid, wid, date, lines, paymentType });
    }
    // sort purchases by date so invoice numbers ascend with time
    purchasePlanned.sort((a, b) => a.date - b.date);
    const purchaseInvoiceIdsByIndex = [];
    for (const p of purchasePlanned) {
      const subtotal = p.lines.reduce((s, l) => s + l.qty * l.cost, 0);
      const discount = chance(0.25) ? round250(subtotal * (rnd() * 0.04)) : 0;
      const total = subtotal - discount;
      const paid = p.paymentType === 'cash' ? total : (chance(0.5) ? round250(total * (rnd() * 0.6)) : 0);
      const remaining = total - paid;
      purchaseRows.push([
        `PUR-${String(purSeq).padStart(6, '0')}`, p.supplierId, `S-${ri(1000, 99999)}`, p.bid, p.wid,
        D(subtotal), D(discount), '0', D(total), IQD, '1', p.paymentType, D(paid), D(remaining),
        'received', false, fmtDate(p.date), null, p.date, adminId,
      ]);
      const agg = supplierAgg.get(p.supplierId) || { purchases: 0, debt: 0 };
      agg.purchases += total; agg.debt += remaining; supplierAgg.set(p.supplierId, agg);
      purSeq++;
    }
    const purRes = await bulkInsert(client, 'purchase_invoices',
      ['invoice_number', 'supplier_id', 'supplier_invoice_number', 'branch_id', 'warehouse_id',
        'subtotal', 'discount', 'tax', 'total', 'currency', 'exchange_rate', 'payment_type', 'paid_amount', 'remaining_amount',
        'status', 'is_opening_balance', 'invoice_date', 'notes', 'created_at', 'created_by'],
      purchaseRows, { returning: 'id' });
    const purchaseInvoiceIds = purRes.map((r) => r.id);
    // purchase items + stock events
    purchasePlanned.forEach((p, idx) => {
      const invId = purchaseInvoiceIds[idx];
      purchaseInvoiceIdsByIndex.push(invId);
      for (const l of p.lines) {
        const sub = l.qty * l.cost;
        const expiry = l.m.tracksExpiry ? fmtDate(new Date(p.date.getTime() + ri(120, 540) * 86400000)) : null;
        purchaseItemRows.push([
          invId, l.m.id, l.m.name, l.m.sku, l.m.barcode, l.qty, D(l.cost), '0', D(sub),
          l.m.unitId, l.m.unit, '1', l.qty, expiry, p.date,
        ]);
        // stock add — ensure the product is registered in this warehouse
        const k = keyOf(l.m.id, p.wid);
        if (!opening.has(k)) { opening.set(k, 0); avail.set(k, 0); prodWarehouses.get(l.m.id).push(p.wid); }
        avail.set(k, (avail.get(k) || 0) + l.qty);
        events.push({ key: k, productId: l.m.id, warehouseId: p.wid, at: p.date, type: 'purchase', change: l.qty, refType: 'purchase', refId: invId, by: adminId });
      }
    });
    await bulkInsert(client, 'purchase_items',
      ['purchase_invoice_id', 'product_id', 'product_name', 'product_sku', 'barcode', 'quantity', 'unit_cost',
        'discount', 'subtotal', 'unit_id', 'unit_name', 'unit_conversion_factor', 'base_quantity', 'expiry_date', 'created_at'],
      purchaseItemRows);

    // ── Customers ────────────────────────────────────────────────────────────
    log(`generating ${CFG.customers} customers…`);
    const customerRows = [];
    for (let i = 0; i < CFG.customers; i++) {
      const isCompany = chance(0.18);
      const name = isCompany ? `${pick(COMPANY_PREFIX)} ${pick(COMPANY_CORE)} ${pick(COMPANY_SUFFIX)}` : personName();
      const loc = cityArea();
      const ph = iraqiPhone();
      const type = (() => { const r = rnd(); return r < 0.7 ? 'retail' : r < 0.9 ? 'wholesale' : 'agent'; })();
      const creditLimit = type === 'retail'
        ? (chance(0.3) ? round250(ri(200, 1500) * 1000) : null)
        : round250(ri(3000, 15000) * 1000);
      customerRows.push([
        name, ph, normPhone(ph), loc.address, loc.city,
        chance(0.2) ? 'عميل دائم' : null, type, creditLimit == null ? null : D(creditLimit),
        '0', '0', true, OPENING_DATE, adminId,
      ]);
    }
    const custRes = await bulkInsert(client, 'customers',
      ['name', 'phone', 'normalized_phone', 'address', 'city', 'notes', 'customer_type', 'credit_limit',
        'total_purchases', 'total_debt', 'is_active', 'created_at', 'created_by'],
      customerRows, { returning: 'id, customer_type' });
    const customerIds = custRes.map((r) => r.id);
    const customerType = Object.fromEntries(custRes.map((r) => [r.id, r.customer_type]));

    // ── Cash sessions (one closed shift per branch per month) ────────────────
    const sessionMap = {}; // `${branchId}:${ym}` -> { id, cashIn }
    const sessionRows = [];
    const sessionKeys = [];
    for (const bid of branchIds) {
      for (let mo = 0; mo <= CFG.months; mo++) {
        const d = new Date(startOfWindow.getTime()); d.setMonth(d.getMonth() + mo);
        if (d > NOW) continue;
        const opened = new Date(d.getFullYear(), d.getMonth(), 1, 9, 0, 0);
        const closed = new Date(d.getFullYear(), d.getMonth() + 1, 0, 22, 0, 0);
        const openCash = round250(ri(100, 500) * 1000);
        sessionKeys.push({ key: `${bid}:${ym(d)}`, openCash });
        sessionRows.push([cashierByBranch[bid], bid, D(openCash), null, null, null, IQD, 'closed',
          'وردية شهرية', (closed > NOW ? null : opened), (closed > NOW ? null : opened), closed > NOW ? null : closed]);
      }
    }
    // columns: user_id, branch_id, opening_cash, closing_cash, expected_cash, variance, currency, status, notes, opened_at(*), _, closed_at
    // NOTE: build with explicit columns below
    const sessionInsert = sessionRows.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[11]]);
    const sessRes = await bulkInsert(client, 'cash_sessions',
      ['user_id', 'branch_id', 'opening_cash', 'closing_cash', 'expected_cash', 'variance', 'currency', 'status', 'notes', 'opened_at', 'closed_at'],
      sessionInsert, { returning: 'id' });
    sessRes.forEach((r, i) => { sessionMap[sessionKeys[i].key] = { id: r.id, openCash: sessionKeys[i].openCash, cashIn: 0 }; });

    // ── Sales over 12 months ─────────────────────────────────────────────────
    log(`generating ${CFG.sales} sales…`);
    const priceFor = (m, type) => type === 'agent' ? m.agent : type === 'wholesale' ? m.wholesale : m.sell;

    const salesPlanned = [];
    for (let i = 0; i < CFG.sales; i++) {
      const bid = pick(branchIds);
      const wid = pick(whByBranch[bid]);
      const date = randomDateInWindow();
      const hasCustomer = chance(0.75);
      const customerId = hasCustomer ? pick(customerIds) : null;
      const tier = customerId ? customerType[customerId] : 'retail';
      const poolWh = whProducts.get(wid);
      const lineCount = Math.min(ri(1, 6), poolWh.length);
      const candidates = [];
      const seen = new Set();
      let guard = 0;
      while (candidates.length < lineCount && guard < lineCount * 5) {
        guard++;
        const m = pick(poolWh);
        if (seen.has(m.id)) continue;
        const k = keyOf(m.id, wid);
        const have = avail.get(k) || 0;
        if (have < 1) continue;
        seen.add(m.id);
        const want = Math.min(have, pick([ri(1, 3), ri(2, 6), ri(4, 10)]));
        avail.set(k, have - want);
        candidates.push({ m, qty: want });
      }
      if (candidates.length === 0) continue;
      salesPlanned.push({ bid, wid, date, customerId, tier, lines: candidates });
    }
    salesPlanned.sort((a, b) => a.date - b.date);

    // sequence per (branch, year)
    const seqByBranchYear = {};
    const branchCode = {}; branchIds.forEach((b, i) => { branchCode[b] = ['BG', 'BA', 'AR', 'NJ', 'KB'][i] || `B${i}`; });
    const saleRows = [];
    const salePlanForItems = [];
    for (const s of salesPlanned) {
      const year = s.date.getFullYear();
      const skey = `${s.bid}:${year}`;
      seqByBranchYear[skey] = (seqByBranchYear[skey] || 0) + 1;
      const invoice = `INV-${branchCode[s.bid]}-${year}-${String(seqByBranchYear[skey]).padStart(5, '0')}`;
      let subtotal = 0;
      const items = s.lines.map((l) => {
        const price = priceFor(l.m, s.tier);
        const lineDisc = chance(0.25) ? round250(price * l.qty * (rnd() * 0.08)) : 0;
        const lineSub = price * l.qty - lineDisc;
        subtotal += lineSub;
        return { ...l, price, lineDisc, lineSub };
      });
      const discount = 0; // per-line discounts already applied
      const total = subtotal;
      const isCredit = s.customerId && chance(0.4);
      let paid;
      if (!isCredit) paid = total;
      else { const r = rnd(); paid = r < 0.35 ? 0 : r < 0.8 ? round250(total * (0.2 + rnd() * 0.5)) : total; }
      const remaining = Math.max(0, total - paid);
      const payType = remaining > 0 ? 'credit' : 'cash';
      const sess = sessionMap[`${s.bid}:${ym(s.date)}`];
      const sessId = (payType === 'cash' && sess) ? sess.id : null;
      const createdBy = cashierByBranch[s.bid];
      if (sessId && paid > 0) sess.cashIn += paid;
      // Column order MUST match the insert below (no remap — avoids index bugs).
      saleRows.push([
        invoice, s.customerId, s.bid, s.wid, sessId, D(subtotal), D(discount), '0', D(total), IQD, '1',
        payType, 'POS', 'CASH', s.tier, D(paid), D(remaining), 'completed', false, s.date, s.date, createdBy,
      ]);
      salePlanForItems.push({ items, date: s.date, customerId: s.customerId, paid, remaining, total, sessId, tier: s.tier, wid: s.wid, createdBy });
    }
    const saleRes = await bulkInsert(client, 'sales',
      ['invoice_number', 'customer_id', 'branch_id', 'warehouse_id', 'cash_session_id', 'subtotal', 'discount', 'tax',
        'total', 'currency', 'exchange_rate', 'payment_type', 'sale_source', 'sale_type', 'price_type', 'paid_amount',
        'remaining_amount', 'status', 'is_opening_balance', 'issued_at', 'created_at', 'created_by'],
      saleRows, { returning: 'id' });
    const saleIds = saleRes.map((r) => r.id);

    const saleItemRows = [];
    const paymentRows = [];
    const custAgg = new Map(); // customerId -> { purchases, debt }
    salePlanForItems.forEach((sp, idx) => {
      const saleId = saleIds[idx];
      for (const it of sp.items) {
        saleItemRows.push([
          saleId, it.m.id, it.m.name, it.m.sku, it.m.barcode, it.qty, D(it.price), D(it.lineDisc), D(it.lineSub),
          it.m.unitId, it.m.unit, '1', it.qty, D(it.m.cost), sp.tier, sp.date,
        ]);
        events.push({ key: keyOf(it.m.id, sp.wid), productId: it.m.id, warehouseId: sp.wid, at: sp.date, type: 'sale', change: -it.qty, refType: 'sale', refId: saleId, by: sp.createdBy });
      }
      // payments for the paid portion
      if (sp.paid > 0) {
        const parts = sp.remaining > 0 && chance(0.5) ? 2 : 1; // partial sometimes in two installments-of-cash
        let left = sp.paid;
        for (let p = 0; p < parts; p++) {
          const amt = p === parts - 1 ? left : round250(sp.paid / parts);
          left -= amt;
          const payDate = new Date(sp.date.getTime() + (p === 0 ? 0 : ri(3, 40) * 86400000));
          paymentRows.push([
            saleId, sp.customerId, D(amt), IQD, '1', 'cash', null, payDate > NOW ? sp.date : payDate, sp.sessId, p === 0 ? 'دفعة عند البيع' : 'دفعة لاحقة', sp.date, sp.createdBy,
          ]);
        }
      }
      if (sp.customerId) {
        const agg = custAgg.get(sp.customerId) || { purchases: 0, debt: 0 };
        agg.purchases += sp.total; agg.debt += sp.remaining; custAgg.set(sp.customerId, agg);
      }
    });
    await bulkInsert(client, 'sale_items',
      ['sale_id', 'product_id', 'product_name', 'product_sku', 'barcode', 'quantity', 'unit_price', 'discount', 'subtotal',
        'unit_id', 'unit_name', 'unit_conversion_factor', 'base_quantity', 'unit_cost_price', 'price_type', 'created_at'],
      saleItemRows);
    await bulkInsert(client, 'payments',
      ['sale_id', 'customer_id', 'amount', 'currency', 'exchange_rate', 'payment_method', 'payment_reference',
        'payment_date', 'cash_session_id', 'notes', 'created_at', 'created_by'],
      paymentRows);

    // ── Warehouse transfers (approved) ───────────────────────────────────────
    log(`generating ${CFG.transfers} transfers + ${CFG.adjustments} adjustments…`);
    const transferRows = [];
    for (let i = 0; i < CFG.transfers; i++) {
      const bid = pick(branchIds);
      const whs = whByBranch[bid];
      if (whs.length < 2) continue;
      const [from, to] = sample(whs, 2);
      // find a product stocked in `from` with available qty
      const m = pick(productMeta);
      if (!prodWarehouses.get(m.id).includes(from)) continue;
      const k = keyOf(m.id, from);
      const have = avail.get(k) || 0;
      if (have < 5) continue;
      const qty = ri(2, Math.min(20, have));
      avail.set(k, have - qty);
      const tk = keyOf(m.id, to);
      if (!opening.has(tk)) { opening.set(tk, 0); avail.set(tk, 0); prodWarehouses.get(m.id).push(to); }
      avail.set(tk, (avail.get(tk) || 0) + qty);
      const date = randomDateInWindow();
      transferRows.push([bid, from, to, m.id, qty, 'approved', cashierByBranch[bid], userByName[`manager_${branchIds.indexOf(bid) + 1}`]?.id || adminId, date, 'نقل بين المخازن', date]);
      events.push({ key: k, productId: m.id, warehouseId: from, at: date, type: 'transfer_out', change: -qty, refType: 'transfer', refId: null, by: cashierByBranch[bid] });
      events.push({ key: tk, productId: m.id, warehouseId: to, at: date, type: 'transfer_in', change: qty, refType: 'transfer', refId: null, by: cashierByBranch[bid] });
    }
    await bulkInsert(client, 'warehouse_transfers',
      ['branch_id', 'from_warehouse_id', 'to_warehouse_id', 'product_id', 'quantity', 'status', 'requested_by', 'approved_by', 'approved_at', 'notes', 'created_at'],
      transferRows);

    // ── Inventory adjustments (جرد / تسويات) ─────────────────────────────────
    for (let i = 0; i < CFG.adjustments; i++) {
      const m = pick(productMeta);
      const whs = prodWarehouses.get(m.id);
      const w = pick(whs);
      const k = keyOf(m.id, w);
      const date = randomDateInWindow();
      const into = chance(0.5);
      if (into) {
        const qty = ri(1, 15);
        avail.set(k, (avail.get(k) || 0) + qty);
        events.push({ key: k, productId: m.id, warehouseId: w, at: date, type: 'manual_adjustment_in', change: qty, refType: 'adjustment', refId: null, by: adminId });
      } else {
        const have = avail.get(k) || 0;
        if (have < 2) continue;
        const qty = ri(1, Math.min(8, have));
        avail.set(k, have - qty);
        events.push({ key: k, productId: m.id, warehouseId: w, at: date, type: 'manual_adjustment_out', change: -qty, refType: 'adjustment', refId: null, by: adminId });
      }
    }

    // ── Resolve stock movements chronologically → product_stock + entries ─────
    log('computing chronological stock movements…');
    const byKey = new Map();
    for (const e of events) {
      if (!byKey.has(e.key)) byKey.set(e.key, []);
      byKey.get(e.key).push(e);
    }
    const movementRows = [];
    const finalStock = new Map(); // key -> { productId, warehouseId, qty }
    for (const [k, list] of byKey) {
      list.sort((a, b) => a.at - b.at || (a.type === 'opening_balance' ? -1 : 1));
      let bal = 0;
      for (const e of list) {
        const before = bal;
        bal += e.change;
        if (bal < 0) bal = 0; // safety: never report negative (opening is large, rarely triggers)
        const after = bal;
        movementRows.push([
          e.productId, e.warehouseId, e.type, after - before, before, after, e.refType, e.refId, null, e.at, e.by,
        ]);
      }
      const [p, w] = k.split(':').map(Number);
      finalStock.set(k, { productId: p, warehouseId: w, qty: bal });
    }
    await bulkInsert(client, 'stock_movements',
      ['product_id', 'warehouse_id', 'movement_type', 'quantity_change', 'quantity_before', 'quantity_after',
        'reference_type', 'reference_id', 'notes', 'created_at', 'created_by'],
      movementRows);

    // product_stock rows + per-product total → products.stock; entries mirror stock
    const stockRows = [];
    const entryRows = [];
    const productTotal = new Map();
    for (const { productId, warehouseId, qty } of finalStock.values()) {
      stockRows.push([productId, warehouseId, qty, NOW]);
      productTotal.set(productId, (productTotal.get(productId) || 0) + qty);
      if (qty > 0) {
        const m = productMeta.find((x) => x.id === productId);
        const expiry = m?.tracksExpiry ? fmtDate(new Date(NOW.getTime() + ri(60, 400) * 86400000)) : null;
        entryRows.push([productId, warehouseId, qty, qty, D(m ? m.cost : 0), expiry, OPENING_DATE, 'active', adminId]);
      }
    }
    await bulkInsert(client, 'product_stock', ['product_id', 'warehouse_id', 'quantity', 'updated_at'], stockRows);
    await bulkInsert(client, 'product_stock_entries',
      ['product_id', 'warehouse_id', 'quantity', 'remaining_quantity', 'cost_price', 'expiry_date', 'received_at', 'status', 'created_by'],
      entryRows);

    // ── Expenses over 12 months ──────────────────────────────────────────────
    log('generating expenses…');
    // amounts are in thousands of IQD (×1000). Salaries are per-employee/month.
    const expenseCats = [
      ['إيجار', [500, 1500]], ['رواتب', [700, 2200]], ['كهرباء', [50, 250]], ['إنترنت', [30, 80]],
      ['وقود', [40, 200]], ['صيانة', [30, 300]], ['ضيافة', [20, 120]], ['نقل', [40, 250]],
    ];
    const expenseRows = [];
    for (const bid of branchIds) {
      for (let mo = 0; mo <= CFG.months; mo++) {
        const d = new Date(startOfWindow.getTime()); d.setMonth(d.getMonth() + mo);
        if (d > NOW) continue;
        for (const [cat, [lo, hi]] of expenseCats) {
          if (cat === 'رواتب') {
            // a few salary lines per branch per month
            for (let s = 0; s < ri(2, 4); s++) {
              const day = new Date(d.getFullYear(), d.getMonth(), ri(1, 28), 12);
              if (day > NOW) continue;
              expenseRows.push([bid, cat, D(round250(ri(lo, hi) * 1000)), IQD, 'راتب موظف', fmtDate(day), 'cash', adminId, day]);
            }
          } else if (chance(0.85)) {
            const day = new Date(d.getFullYear(), d.getMonth(), ri(1, 28), 12);
            if (day > NOW) continue;
            expenseRows.push([bid, cat, D(round250(ri(lo, hi) * 1000)), IQD, `مصروف ${cat}`, fmtDate(day), 'cash', adminId, day]);
          }
        }
      }
    }
    await bulkInsert(client, 'expenses',
      ['branch_id', 'category', 'amount', 'currency', 'note', 'expense_date', 'payment_method', 'created_by', 'created_at'],
      expenseRows);

    // ── Update aggregate caches ──────────────────────────────────────────────
    log('updating caches (product stock, customer/supplier balances, shift totals)…');
    // products.stock
    {
      const entries = [...productTotal.entries()];
      for (let i = 0; i < entries.length; i += 1000) {
        const chunk = entries.slice(i, i + 1000);
        const cases = chunk.map(([pid, q]) => `WHEN ${pid} THEN ${q}`).join(' ');
        const ids = chunk.map(([pid]) => pid).join(',');
        await client.query(`UPDATE products SET stock = CASE id ${cases} ELSE stock END, status = CASE WHEN (CASE id ${cases} ELSE stock END) <= 0 THEN 'out_of_stock' ELSE 'available' END WHERE id IN (${ids})`);
      }
    }
    // customers
    for (const [cid, agg] of custAgg) {
      await client.query('UPDATE customers SET total_purchases = $1, total_debt = $2 WHERE id = $3', [D(agg.purchases), D(agg.debt), cid]);
    }
    // suppliers
    for (const [sid, agg] of supplierAgg) {
      await client.query('UPDATE suppliers SET total_purchases = $1, total_debt = $2 WHERE id = $3', [D(agg.purchases), D(agg.debt), sid]);
    }
    // cash sessions: closing = opening + cashIn, expected = same, small variance
    for (const key of Object.keys(sessionMap)) {
      const s = sessionMap[key];
      const expected = s.openCash + s.cashIn;
      const variance = chance(0.3) ? round250((rnd() - 0.5) * 10000) : 0;
      await client.query('UPDATE cash_sessions SET expected_cash = $1, closing_cash = $2, variance = $3 WHERE id = $4',
        [D(expected), D(expected + variance), D(variance), s.id]);
    }
    // invoice_sequences so the app continues numbering cleanly
    for (const key of Object.keys(seqByBranchYear)) {
      const [bid, year] = key.split(':').map(Number);
      await client.query(
        `INSERT INTO invoice_sequences (branch_id, year, next_value) VALUES ($1,$2,$3)
         ON CONFLICT (branch_id, year) DO UPDATE SET next_value = EXCLUDED.next_value`,
        [bid, year, seqByBranchYear[key] + 1]
      );
    }

    await client.query('COMMIT');

    // ── Summary ──────────────────────────────────────────────────────────────
    const q = async (s) => (await client.query(s)).rows[0];
    const counts = await q(`SELECT
      (SELECT count(*) FROM products) products,
      (SELECT count(*) FROM customers) customers,
      (SELECT count(*) FROM suppliers) suppliers,
      (SELECT count(*) FROM sales) sales,
      (SELECT count(*) FROM sale_items) sale_items,
      (SELECT count(*) FROM payments) payments,
      (SELECT count(*) FROM purchase_invoices) purchases,
      (SELECT count(*) FROM stock_movements) movements,
      (SELECT count(*) FROM expenses) expenses,
      (SELECT count(*) FROM cash_sessions) shifts`);
    const fin = await q(`SELECT
      (SELECT COALESCE(SUM(total),0) FROM sales WHERE status='completed') revenue,
      (SELECT COALESCE(SUM(remaining_amount),0) FROM sales) customer_debt,
      (SELECT COALESCE(SUM(remaining_amount),0) FROM purchase_invoices) supplier_debt,
      (SELECT COALESCE(SUM(amount),0) FROM expenses) total_expenses,
      (SELECT count(*) FROM products WHERE stock <= 0) out_of_stock`);

    console.log('\n[seed] ✓ done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
    console.table(counts);
    console.table(fin);
    console.log('[seed] login: admin / Nuqta@123  (multiBranch + agentPricing ON, IQD)');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed] ✗ failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await closeDatabase().catch(() => {});
  }
}

main();
