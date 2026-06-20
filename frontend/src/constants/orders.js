/**
 * Online order statuses — mirror of backend/src/constants/orders.js.
 * Keep the two in sync (codes, transitions, labels).
 */

export const ORDER_STATUS = Object.freeze({
  NEW: 'NEW',
  PROCESSING: 'PROCESSING',
  CONFIRMED: 'CONFIRMED',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
});

export const ORDER_STATUSES = Object.values(ORDER_STATUS);

/** Display metadata for status chips (Arabic label, Vuetify color, mdi icon). */
export const ORDER_STATUS_META = Object.freeze({
  NEW: { label: 'جديد', color: 'blue-grey', icon: 'mdi-inbox-arrow-down' },
  PROCESSING: { label: 'قيد المعالجة', color: 'amber-darken-2', icon: 'mdi-progress-clock' },
  CONFIRMED: { label: 'مؤكد', color: 'info', icon: 'mdi-check-circle-outline' },
  READY_FOR_DELIVERY: { label: 'قيد التجهيز', color: 'deep-purple', icon: 'mdi-package-variant-closed' },
  OUT_FOR_DELIVERY: { label: 'قيد التوصيل', color: 'cyan-darken-2', icon: 'mdi-truck-fast' },
  DELIVERED: { label: 'مكتمل', color: 'success', icon: 'mdi-truck-check' },
  RETURNED: { label: 'مرتجع', color: 'orange-darken-3', icon: 'mdi-keyboard-return' },
  CANCELLED: { label: 'ملغي', color: 'error', icon: 'mdi-close-circle-outline' },
});

export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  NEW: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED', 'CANCELLED'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
});

export const ORDER_EDITABLE_STATUSES = Object.freeze(['NEW', 'PROCESSING']);

/**
 * Per-transition permission keys (granular RBAC). The status menu shows a
 * transition only when the user holds the matching permission. Mirrors the
 * backend enforcement in onlineOrderService.updateStatus.
 */
export const ORDER_TRANSITION_PERMISSION = Object.freeze({
  PROCESSING: 'online_orders:update_status',
  CONFIRMED: 'online_orders:confirm',
  READY_FOR_DELIVERY: 'online_orders:prepare',
  OUT_FOR_DELIVERY: 'online_orders:deliver',
  DELIVERED: 'online_orders:deliver',
  RETURNED: 'online_orders:return',
  CANCELLED: 'online_orders:cancel',
});

export const statusMeta = (s) =>
  ORDER_STATUS_META[s] || { label: s, color: 'grey', icon: 'mdi-help-circle-outline' };

export const nextStatuses = (s) => ORDER_STATUS_TRANSITIONS[s] || [];

export const isEditableStatus = (s) => ORDER_EDITABLE_STATUSES.includes(s);

export const transitionPermission = (to) =>
  ORDER_TRANSITION_PERMISSION[to] || 'online_orders:update_status';
