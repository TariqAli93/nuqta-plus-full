/**
 * Delivery shipment statuses + event types — mirror of
 * backend/src/constants/delivery.js. Keep the codes in sync.
 */

export const DELIVERY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
});

export const DELIVERY_STATUSES = Object.values(DELIVERY_STATUS);

/** A shipment in one of these states is done — Sync/Cancel are disabled. */
export const DELIVERY_TERMINAL_STATUSES = Object.freeze([
  DELIVERY_STATUS.DELIVERED,
  DELIVERY_STATUS.RETURNED,
  DELIVERY_STATUS.CANCELLED,
  DELIVERY_STATUS.FAILED,
]);

export const DELIVERY_STATUS_META = Object.freeze({
  PENDING: { label: 'قيد الإنشاء', color: 'blue-grey', icon: 'mdi-clock-outline' },
  SUBMITTED: { label: 'تم الإرسال', color: 'info', icon: 'mdi-send-check-outline' },
  PICKED_UP: { label: 'تم الاستلام', color: 'cyan-darken-1', icon: 'mdi-package-up' },
  IN_TRANSIT: { label: 'قيد النقل', color: 'indigo', icon: 'mdi-truck-fast-outline' },
  OUT_FOR_DELIVERY: { label: 'خارج للتوصيل', color: 'deep-purple', icon: 'mdi-truck-delivery-outline' },
  DELIVERED: { label: 'تم التوصيل', color: 'success', icon: 'mdi-check-circle' },
  RETURNED: { label: 'مرتجع', color: 'orange-darken-3', icon: 'mdi-keyboard-return' },
  CANCELLED: { label: 'ملغي', color: 'error', icon: 'mdi-close-circle-outline' },
  FAILED: { label: 'فشل', color: 'red-darken-3', icon: 'mdi-alert-circle-outline' },
  UNKNOWN: { label: 'غير معروف', color: 'grey', icon: 'mdi-help-circle-outline' },
});

export const DELIVERY_EVENT_META = Object.freeze({
  CREATED: { label: 'تم الإنشاء', icon: 'mdi-plus-circle-outline' },
  STATUS_UPDATE: { label: 'تحديث الحالة', icon: 'mdi-sync' },
  WEBHOOK: { label: 'تحديث من الشركة', icon: 'mdi-webhook' },
  SYNC: { label: 'مزامنة', icon: 'mdi-cloud-sync-outline' },
  CANCELLED: { label: 'إلغاء', icon: 'mdi-close-circle-outline' },
  ERROR: { label: 'خطأ', icon: 'mdi-alert-outline' },
});

export const statusMeta = (s) =>
  DELIVERY_STATUS_META[s] || { label: s || '—', color: 'grey', icon: 'mdi-help-circle-outline' };

export const eventMeta = (t) =>
  DELIVERY_EVENT_META[t] || { label: t || '—', icon: 'mdi-circle-small' };

export const isTerminalStatus = (s) => DELIVERY_TERMINAL_STATUSES.includes(s);

// ── Provider connection status (settings UI) ─────────────────────────────────
export const CONNECTION_STATUS_META = Object.freeze({
  not_configured: { label: 'غير مُهيّأ', color: 'grey', icon: 'mdi-cog-off-outline' },
  connected: { label: 'متصل', color: 'success', icon: 'mdi-check-circle' },
  failed: { label: 'فشل الاتصال', color: 'error', icon: 'mdi-alert-circle' },
});
export const connectionMeta = (s) => CONNECTION_STATUS_META[s] || CONNECTION_STATUS_META.not_configured;

// Boxy environments → base URL (mirror of backend constants/delivery.js).
export const BOXY_BASE_URLS = Object.freeze({
  sandbox: 'https://api-pre.tryboxy.dev',
  production: 'https://api.tryboxy.com',
});

// ── Shipment dialog options ──────────────────────────────────────────────────
export const SHIPMENT_SIZES = Object.freeze(['S', 'M', 'L', 'XL']);
export const SHIPMENT_PAYMENT_TYPES = Object.freeze([
  { value: 'COLLECT_ON_DELIVERY', title: 'الدفع عند الاستلام' },
  { value: 'PREPAID', title: 'مدفوع مسبقاً' },
]);
export const SHIPMENT_FEE_TYPES = Object.freeze([
  { value: 'BY_MERCHANT', title: 'على التاجر' },
  { value: 'BY_CUSTOMER', title: 'على الزبون' },
]);
