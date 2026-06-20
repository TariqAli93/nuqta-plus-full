/**
 * Online order statuses — mirror of backend/src/constants/orders.js.
 * Keep the two in sync (codes, transitions).
 */

export const ORDER_STATUS = Object.freeze({
  NEW: 'NEW',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
});

export const ORDER_STATUSES = Object.values(ORDER_STATUS);

/** Display metadata for status chips (Arabic label, Vuetify color, mdi icon). */
export const ORDER_STATUS_META = Object.freeze({
  NEW: { label: 'جديد', color: 'blue-grey', icon: 'mdi-inbox-arrow-down' },
  CONFIRMED: { label: 'مؤكد', color: 'info', icon: 'mdi-check-circle-outline' },
  PROCESSING: { label: 'قيد التجهيز', color: 'amber-darken-2', icon: 'mdi-progress-wrench' },
  READY_FOR_DELIVERY: { label: 'جاهز للتوصيل', color: 'deep-purple', icon: 'mdi-package-variant-closed' },
  DELIVERED: { label: 'تم التوصيل', color: 'success', icon: 'mdi-truck-check' },
  RETURNED: { label: 'مرتجع', color: 'orange-darken-3', icon: 'mdi-keyboard-return' },
  CANCELLED: { label: 'ملغي', color: 'error', icon: 'mdi-close-circle-outline' },
});

export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY: ['DELIVERED', 'RETURNED', 'CANCELLED'],
  DELIVERED: ['CANCELLED'],
  RETURNED: ['CANCELLED'],
  CANCELLED: [],
});

export const ORDER_EDITABLE_STATUSES = Object.freeze(['NEW', 'CONFIRMED', 'PROCESSING']);

export const statusMeta = (s) =>
  ORDER_STATUS_META[s] || { label: s, color: 'grey', icon: 'mdi-help-circle-outline' };

export const nextStatuses = (s) => ORDER_STATUS_TRANSITIONS[s] || [];

export const isEditableStatus = (s) => ORDER_EDITABLE_STATUSES.includes(s);
