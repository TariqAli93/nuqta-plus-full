/**
 * Online order status enum + allowed transition map.
 * Mirror of frontend/src/constants/orders.js — keep the two in sync.
 *
 * Lifecycle:
 *   NEW → CONFIRMED → PROCESSING → READY_FOR_DELIVERY → DELIVERED
 * RETURNED is reachable only from READY_FOR_DELIVERY. CANCELLED is reachable
 * from ANY non-cancelled state (the escape hatch). CANCELLED is terminal;
 * every other forward path is one-way (no going back).
 */

export const ORDER_STATUS_NEW = 'NEW';
export const ORDER_STATUS_CONFIRMED = 'CONFIRMED';
export const ORDER_STATUS_PROCESSING = 'PROCESSING';
export const ORDER_STATUS_READY_FOR_DELIVERY = 'READY_FOR_DELIVERY';
export const ORDER_STATUS_DELIVERED = 'DELIVERED';
export const ORDER_STATUS_RETURNED = 'RETURNED';
export const ORDER_STATUS_CANCELLED = 'CANCELLED';

export const ORDER_STATUSES = Object.freeze([
  ORDER_STATUS_NEW,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_PROCESSING,
  ORDER_STATUS_READY_FOR_DELIVERY,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_RETURNED,
  ORDER_STATUS_CANCELLED,
]);

export const ORDER_STATUS_DEFAULT = ORDER_STATUS_NEW;

/**
 * Allowed status transitions. The service rejects any move not in this map.
 * CANCELLED is reachable from every non-cancelled state; CANCELLED itself is
 * terminal (empty target list).
 */
export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUS_NEW]: [ORDER_STATUS_CONFIRMED, ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_CONFIRMED]: [ORDER_STATUS_PROCESSING, ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_PROCESSING]: [ORDER_STATUS_READY_FOR_DELIVERY, ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_READY_FOR_DELIVERY]: [
    ORDER_STATUS_DELIVERED,
    ORDER_STATUS_RETURNED,
    ORDER_STATUS_CANCELLED,
  ],
  [ORDER_STATUS_DELIVERED]: [ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_RETURNED]: [ORDER_STATUS_CANCELLED],
  [ORDER_STATUS_CANCELLED]: [],
});

/** Can the order still be edited (header/items)? Only before fulfilment. */
export const ORDER_EDITABLE_STATUSES = Object.freeze([
  ORDER_STATUS_NEW,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_PROCESSING,
]);

export const isValidOrderStatus = (s) => ORDER_STATUSES.includes(s);

export const canTransition = (from, to) =>
  Array.isArray(ORDER_STATUS_TRANSITIONS[from]) && ORDER_STATUS_TRANSITIONS[from].includes(to);
