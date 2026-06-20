/**
 * Online order status enum + allowed transition map.
 * Mirror of frontend/src/constants/orders.js — keep the two in sync.
 *
 * Lifecycle (global-standard fulfilment flow):
 *   NEW → PROCESSING → CONFIRMED → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED
 *
 *   - CONFIRMED ("مؤكد") is the COMMIT point: a linked sale invoice is created
 *     here, which deducts stock (FIFO) and enables payments/returns/profit via
 *     the sales engine.
 *   - CANCELLED is reachable from any pre-DELIVERED state. Cancelling a
 *     sale-backed order (CONFIRMED+) cancels the linked sale and restores stock.
 *   - RETURNED (reachable from OUT_FOR_DELIVERY / DELIVERED) creates a sale
 *     return that restores stock and reduces revenue/profit.
 *   - RETURNED and CANCELLED are terminal.
 */

export const ORDER_STATUS_NEW = 'NEW';
export const ORDER_STATUS_PROCESSING = 'PROCESSING';
export const ORDER_STATUS_CONFIRMED = 'CONFIRMED';
export const ORDER_STATUS_READY_FOR_DELIVERY = 'READY_FOR_DELIVERY';
export const ORDER_STATUS_OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY';
export const ORDER_STATUS_DELIVERED = 'DELIVERED';
export const ORDER_STATUS_RETURNED = 'RETURNED';
export const ORDER_STATUS_CANCELLED = 'CANCELLED';

export const ORDER_STATUSES = Object.freeze([
  ORDER_STATUS_NEW,
  ORDER_STATUS_PROCESSING,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_READY_FOR_DELIVERY,
  ORDER_STATUS_OUT_FOR_DELIVERY,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_RETURNED,
  ORDER_STATUS_CANCELLED,
]);

export const ORDER_STATUS_DEFAULT = ORDER_STATUS_NEW;

/** Arabic display labels — used in backend error messages and the UI. */
export const ORDER_STATUS_LABELS = Object.freeze({
  [ORDER_STATUS_NEW]: 'جديد',
  [ORDER_STATUS_PROCESSING]: 'قيد المعالجة',
  [ORDER_STATUS_CONFIRMED]: 'مؤكد',
  [ORDER_STATUS_READY_FOR_DELIVERY]: 'قيد التجهيز',
  [ORDER_STATUS_OUT_FOR_DELIVERY]: 'قيد التوصيل',
  [ORDER_STATUS_DELIVERED]: 'مكتمل',
  [ORDER_STATUS_RETURNED]: 'مرتجع',
  [ORDER_STATUS_CANCELLED]: 'ملغي',
});

export const orderStatusLabel = (s) => ORDER_STATUS_LABELS[s] || s;

/**
 * Allowed status transitions. The service rejects any move not in this map.
 * Cancellation is allowed up to (but not including) DELIVERED; after delivery
 * the only reversal is a RETURN. CANCELLED and RETURNED are terminal.
 */
export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUS_NEW]: [ORDER_STATUS_PROCESSING, ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_PROCESSING]: [ORDER_STATUS_CONFIRMED, ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_CONFIRMED]: [ORDER_STATUS_READY_FOR_DELIVERY, ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_READY_FOR_DELIVERY]: [ORDER_STATUS_OUT_FOR_DELIVERY, ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_OUT_FOR_DELIVERY]: [
    ORDER_STATUS_DELIVERED,
    ORDER_STATUS_RETURNED,
    ORDER_STATUS_CANCELLED,
  ],
  [ORDER_STATUS_DELIVERED]: [ORDER_STATUS_RETURNED],
  [ORDER_STATUS_RETURNED]: [],
  [ORDER_STATUS_CANCELLED]: [],
});

/** Can the order still be edited (header/items)? Only before the sale exists. */
export const ORDER_EDITABLE_STATUSES = Object.freeze([
  ORDER_STATUS_NEW,
  ORDER_STATUS_PROCESSING,
]);

/**
 * Statuses in which a linked sale invoice EXISTS (created at CONFIRMED). Used to
 * decide whether cancelling must reverse the sale (restore stock) and whether
 * the order is frozen against edits.
 */
export const ORDER_SALE_BACKED_STATUSES = Object.freeze([
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_READY_FOR_DELIVERY,
  ORDER_STATUS_OUT_FOR_DELIVERY,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_RETURNED,
]);

/** Terminal statuses — no further transitions. */
export const ORDER_TERMINAL_STATUSES = Object.freeze([
  ORDER_STATUS_RETURNED,
  ORDER_STATUS_CANCELLED,
]);

/**
 * Granular RBAC: the permission required to MOVE an order INTO each status.
 * Enforced in onlineOrderController.updateStatus (mirrors the frontend menu
 * gating in frontend/src/constants/orders.js).
 */
export const ORDER_TRANSITION_PERMISSION = Object.freeze({
  [ORDER_STATUS_PROCESSING]: 'online_orders:update_status',
  [ORDER_STATUS_CONFIRMED]: 'online_orders:confirm',
  [ORDER_STATUS_READY_FOR_DELIVERY]: 'online_orders:prepare',
  [ORDER_STATUS_OUT_FOR_DELIVERY]: 'online_orders:deliver',
  [ORDER_STATUS_DELIVERED]: 'online_orders:deliver',
  [ORDER_STATUS_RETURNED]: 'online_orders:return',
  [ORDER_STATUS_CANCELLED]: 'online_orders:cancel',
});

export const transitionPermission = (to) =>
  ORDER_TRANSITION_PERMISSION[to] || 'online_orders:update_status';

export const isValidOrderStatus = (s) => ORDER_STATUSES.includes(s);

export const canTransition = (from, to) =>
  Array.isArray(ORDER_STATUS_TRANSITIONS[from]) && ORDER_STATUS_TRANSITIONS[from].includes(to);

/** True when entering `to` should create the linked sale + deduct stock. */
export const statusCommitsSale = (to) => to === ORDER_STATUS_CONFIRMED;

/** True when an order in `status` is backed by a linked sale invoice. */
export const isSaleBacked = (status) => ORDER_SALE_BACKED_STATUSES.includes(status);
