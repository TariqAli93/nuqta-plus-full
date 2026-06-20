/**
 * Delivery integration enums — providers, canonical shipment statuses, and
 * event types. Mirror of frontend/src/constants/delivery.js (keep in sync).
 *
 * Each delivery company speaks its own status vocabulary; the PROVIDER ADAPTER
 * maps those onto this canonical set so the rest of the system (and reports)
 * only ever deal with one status model.
 */

// ── Providers ───────────────────────────────────────────────────────────────
export const DELIVERY_PROVIDER = Object.freeze({
  BOXY: 'BOXY',
  ALZAEEM: 'ALZAEEM',
  ALWASEET: 'ALWASEET',
  HI_EXPRESS: 'HI_EXPRESS',
  DHL: 'DHL',
  CUSTOM: 'CUSTOM',
});
export const DELIVERY_PROVIDERS = Object.freeze(Object.values(DELIVERY_PROVIDER));

// ── Canonical shipment status ────────────────────────────────────────────────
export const DELIVERY_STATUS = Object.freeze({
  PENDING: 'PENDING', // created locally, not yet accepted by the provider
  SUBMITTED: 'SUBMITTED', // provider accepted; tracking issued
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED', // provider rejected the create / a hard error
  UNKNOWN: 'UNKNOWN', // provider status we couldn't map
});
export const DELIVERY_STATUSES = Object.freeze(Object.values(DELIVERY_STATUS));

/** A shipment in one of these states is done — no further provider action. */
export const DELIVERY_TERMINAL_STATUSES = Object.freeze([
  DELIVERY_STATUS.DELIVERED,
  DELIVERY_STATUS.RETURNED,
  DELIVERY_STATUS.CANCELLED,
  DELIVERY_STATUS.FAILED,
]);

// ── Event types (delivery_events.event_type) ─────────────────────────────────
export const DELIVERY_EVENT_TYPE = Object.freeze({
  CREATED: 'CREATED',
  STATUS_UPDATE: 'STATUS_UPDATE',
  WEBHOOK: 'WEBHOOK',
  SYNC: 'SYNC',
  CANCELLED: 'CANCELLED',
  ERROR: 'ERROR',
});

// ── Action log types (delivery_action_logs.action) ───────────────────────────
// Outbound provider calls we make (distinct from delivery_events, the canonical
// status timeline, and delivery_webhook_logs, which is inbound-only). Each entry
// records the request/response of one adapter call for audit/debugging.
export const DELIVERY_ACTION = Object.freeze({
  CREATE: 'CREATE',
  CANCEL: 'CANCEL',
  SYNC: 'SYNC',
  LABEL: 'LABEL',
  QUOTE: 'QUOTE',
  STATUS: 'STATUS',
});
export const DELIVERY_ACTIONS = Object.freeze(Object.values(DELIVERY_ACTION));

export const isValidDeliveryStatus = (s) => DELIVERY_STATUSES.includes(s);
export const isTerminalDeliveryStatus = (s) => DELIVERY_TERMINAL_STATUSES.includes(s);

// ── Boxy environments ────────────────────────────────────────────────────────
// Selecting the environment drives the API base URL (shown read-only in the UI).
export const BOXY_ENVIRONMENTS = Object.freeze({
  sandbox: 'https://api-pre.tryboxy.dev',
  production: 'https://api.tryboxy.com',
});
export const boxyBaseUrl = (environment) => BOXY_ENVIRONMENTS[environment] || null;
