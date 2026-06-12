import { reactive, watch, computed } from 'vue';

/**
 * تفضيلات لوحة القيادة (مركز القيادة) — أي بطاقة أو قسم يظهر للمستخدم.
 *
 * مخزّنة محلياً (localStorage) ومشتركة بين كل مكوّنات الشاشة الرئيسية عبر حالة
 * reactive واحدة (singleton) حتى يبقى زر "تخصيص" متزامناً مع ما يُعرض فعلياً.
 * الرؤية النهائية لأي عنصر = تفضيل المستخدم  ✕  صلاحيته (الصلاحيات تُفحص في
 * المكوّنات نفسها، وهذه الطبقة تخصّ تفضيل العرض فقط).
 */

const STORAGE_KEY = 'nuqta-dashboard-prefs';

// القيم الافتراضية: كل شيء ظاهر.
const DEFAULTS = {
  kpis: {
    sales: true, // مبيعات اليوم
    profit: true, // أرباح اليوم
    invoices: true, // عدد فواتير اليوم
    customers: true, // عدد العملاء
    inventory: true, // قيمة البضاعة في المخازن
    dues: true, // المبالغ المستحقة
  },
  sections: {
    quickActions: true, // العمليات السريعة
    performance: true, // مؤشرات الأداء والرسوم
    alerts: true, // مركز التنبيهات
    activity: true, // النشاط الحديث
  },
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    // دمج عميق متسامح: أي مفتاح جديد يُضاف لاحقاً يأخذ قيمته الافتراضية.
    return {
      kpis: { ...DEFAULTS.kpis, ...(parsed.kpis || {}) },
      sections: { ...DEFAULTS.sections, ...(parsed.sections || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

// حالة وحيدة مشتركة على مستوى التطبيق.
const prefs = reactive(loadPrefs());

let persisting = false;
function ensurePersistence() {
  if (persisting) return;
  persisting = true;
  watch(
    prefs,
    (val) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
      } catch {
        /* تجاهل امتلاء أو حظر التخزين */
      }
    },
    { deep: true }
  );
}

export function useDashboardPrefs() {
  ensurePersistence();

  const anyKpiVisible = computed(() => Object.values(prefs.kpis).some(Boolean));

  function reset() {
    Object.assign(prefs.kpis, DEFAULTS.kpis);
    Object.assign(prefs.sections, DEFAULTS.sections);
  }

  return { prefs, anyKpiVisible, reset };
}

export default useDashboardPrefs;
