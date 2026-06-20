/**
 * Inbound integration source registry (EXTENSION POINT — all stubs for now).
 *
 * Maps an INTEGRATION_SOURCE key → an adapter factory. TODAY every entry is a
 * 501 stub (createUnsupportedSource) — no integration is implemented. To add a
 * real one: write `create<Name>Source(integration)` per the sourceAdapter.js
 * contract and swap its entry below. Nothing else in the app changes — the
 * ingestion pipeline only ever calls `resolveSource(integration)`.
 *
 * This is the SAME shape as the delivery adapter registry, so the team has one
 * mental model for "plug in an external provider".
 */

import { createUnsupportedSource } from './sourceAdapter.js';
import { INTEGRATION_SOURCE, INTEGRATION_CATALOG } from '../../constants/integrations.js';

const REGISTRY = {
  // ── Social / messaging leads ──────────────────────────────────────────────
  [INTEGRATION_SOURCE.FACEBOOK_LEADS]: (i) => createUnsupportedSource('FACEBOOK_LEADS', 'Facebook Leads', i),
  [INTEGRATION_SOURCE.WHATSAPP]: (i) => createUnsupportedSource('WHATSAPP', 'WhatsApp API', i),
  [INTEGRATION_SOURCE.TELEGRAM]: (i) => createUnsupportedSource('TELEGRAM', 'Telegram Bot', i),
  // ── E-commerce stores ─────────────────────────────────────────────────────
  [INTEGRATION_SOURCE.SHOPIFY]: (i) => createUnsupportedSource('SHOPIFY', 'Shopify', i),
  [INTEGRATION_SOURCE.WOOCOMMERCE]: (i) => createUnsupportedSource('WOOCOMMERCE', 'WooCommerce', i),
  [INTEGRATION_SOURCE.CUSTOM_STORE]: (i) => createUnsupportedSource('CUSTOM_STORE', 'Custom Store API', i),
};

/** Source keys that have a real (non-stub) implementation. Empty until built. */
export const IMPLEMENTED_SOURCES = Object.freeze([]);

/** Catalog metadata + implementation status — for an admin "integrations" list. */
export function listSources() {
  return Object.keys(REGISTRY).map((key) => ({
    key,
    ...INTEGRATION_CATALOG[key],
    implemented: IMPLEMENTED_SOURCES.includes(key),
  }));
}

/**
 * Resolve the adapter for an integration row (future: with decrypted secrets).
 * Throws 400 when no adapter is registered for the key.
 */
export function resolveSource(integration) {
  const key = typeof integration === 'string' ? integration : integration?.key;
  const factory = REGISTRY[key];
  if (!factory) {
    const err = new Error(`لا يوجد محوّل (adapter) للمصدر "${key}".`);
    err.statusCode = 400;
    err.code = 'INTEGRATION_SOURCE_NOT_FOUND';
    throw err;
  }
  return factory(typeof integration === 'string' ? {} : integration);
}
