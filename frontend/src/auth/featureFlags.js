/**
 * Feature-flag helper — single, central place for feature-gating decisions and
 * the Arabic labels of every optional module.
 *
 * Mirrors `auth/permissions.js`: the frontend asks the auth store (which holds
 * the `featureFlags` map hydrated at login/session). The backend
 * `requireFeature()` middleware remains the authoritative gate — these helpers
 * only decide what to render / route and how to phrase the "feature disabled"
 * message.
 *
 * Companion central helpers:
 *   - `auth/permissions.js`       → permission/role access decisions
 *   - `composables/useFeatureGate`→ per-element {visible,disabled,reason} for buttons
 *   - `composables/useNavigationMenu` → the navigation tree (feature/permission aware)
 */

import { useAuthStore } from '@/stores/auth';

const store = () => useAuthStore();

/**
 * Arabic display labels for every feature flag. Used by the router guard, the
 * Forbidden page, and `useFeatureGate` so the "feature disabled" wording is
 * defined in ONE place instead of being scattered across components.
 */
export const FEATURE_LABELS = Object.freeze({
  pos: 'نقطة البيع',
  installments: 'البيع بالتقسيط',
  creditScore: 'التقييم الائتماني',
  draftInvoices: 'فواتير المسودة',
  inventory: 'المخزون',
  multiBranch: 'تعدد الفروع',
  multiWarehouse: 'تعدد المخازن',
  warehouseTransfers: 'التحويلات المخزنية',
  inventoryTransfers: 'التحويلات المخزنية',
  accountingPeriods: 'الفترات المحاسبية',
  alerts: 'التنبيهات',
  liveOperations: 'العمليات الحية',
  treasury: 'الصندوق',
  bankAccounts: 'الحسابات المصرفية',
  suppliers: 'الموردون',
  purchases: 'المشتريات',
  generalLedger: 'المحاسبة المتقدمة',
  manualJournal: 'القيود اليدوية',
  agentPricing: 'تسعير الوكلاء',
  financialReports: 'التقارير المالية',
  onlineOrders: 'الطلبات الأونلاين',
  shipping: 'الشحن',
});

/** Arabic label for a single feature key (falls back to the raw key). */
export function featureLabel(flag) {
  return FEATURE_LABELS[flag] || flag;
}

/** Arabic labels for a list of feature keys, joined with an Arabic comma. */
export function featureLabels(flags = []) {
  return (Array.isArray(flags) ? flags : [flags]).map(featureLabel).join('، ');
}

/**
 * `canAccessFeature(flag)` — true when the optional module is enabled in the
 * current install's feature flags. Alias-aware via the store getter.
 * @param {string} flag
 */
export function canAccessFeature(flag) {
  if (!flag) return true;
  return store().hasFeature(flag);
}

/** True when AT LEAST ONE of the listed features is enabled. */
export function canAccessAnyFeature(flags = []) {
  const list = Array.isArray(flags) ? flags : [flags];
  if (list.length === 0) return true;
  return list.some((f) => store().hasFeature(f));
}

export default {
  FEATURE_LABELS,
  featureLabel,
  featureLabels,
  canAccessFeature,
  canAccessAnyFeature,
};
