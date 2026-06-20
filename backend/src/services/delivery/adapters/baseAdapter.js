/**
 * Delivery provider adapter contract.
 *
 * Every adapter is a factory `create<Name>Adapter(provider)` that returns an
 * object implementing this interface. The rest of the system never imports a
 * concrete adapter — only the abstract shape resolved through the registry
 * (./index.js). This mirrors the notifications/providers pattern.
 *
 * `provider` is the delivery_providers row with the API key already DECRYPTED
 * by the service: { code, adapterKey, config, apiKey, webhookSecret }.
 *
 * Contract (all monetary/status values use the canonical model in
 * src/constants/delivery.js):
 *
 *   code: string
 *
 *   async createShipment(shipment) -> {
 *     ok, providerShipmentId, trackingNumber, trackingUrl,
 *     status, providerStatus, response, error
 *   }
 *
 *   async getStatus(shipment) -> {
 *     ok, status, providerStatus, response, error
 *   }
 *
 *   async cancelShipment(shipment) -> { ok, response, error }
 *
 *   parseWebhook(payload, headers) -> {
 *     ok, providerShipmentId, trackingNumber,
 *     status, providerStatus, occurredAt, error
 *   }
 *
 *   mapStatus(providerStatus) -> canonical DELIVERY_STATUS
 */

import crypto from 'crypto';
import { DELIVERY_STATUS } from '../../../constants/delivery.js';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Verify an HMAC webhook signature in constant time.
 *
 * The industry-standard scheme: `HMAC-<algo>(rawBody, secret)` hex-encoded,
 * sent in a header, optionally prefixed (e.g. "sha256="). The header name,
 * algorithm and prefix are all configurable so this matches whatever Boxy's
 * real scheme turns out to be without a code change.
 *
 * Returns true when the computed signature matches the provided one.
 */
export function verifyHmacSignature(rawBody, providedSignature, secret, opts = {}) {
  if (!secret) return false;
  if (providedSignature == null || rawBody == null) return false;
  const algo = opts.algo || 'sha256';
  const prefix = opts.prefix ?? `${algo}=`;
  let provided = String(providedSignature).trim();
  if (prefix && provided.startsWith(prefix)) provided = provided.slice(prefix.length);

  const expected = crypto
    .createHmac(algo, secret)
    .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
    .digest('hex');

  // Length-guard before timingSafeEqual (it throws on length mismatch).
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

/** Minimal JSON-over-HTTP helper with a timeout. Never throws on HTTP status. */
export async function httpJson(url, { method = 'POST', headers = {}, body, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { ok: res.ok, httpStatus: res.status, body: parsed };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      body: null,
      error: err.name === 'AbortError' ? 'Request timed out' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Read a value at a dotted path ("data.tracking.number") with a fallback. */
export function pick(obj, path, fallback = null) {
  if (!obj || !path) return fallback;
  const val = String(path)
    .split('.')
    .reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  return val == null ? fallback : val;
}

/**
 * Build a status mapper from a { providerStatus: canonical } dictionary.
 * Matching is case-insensitive; unknown statuses fall to UNKNOWN.
 */
export function buildStatusMapper(dictionary = {}) {
  const norm = {};
  for (const [k, v] of Object.entries(dictionary)) norm[String(k).toLowerCase()] = v;
  return (providerStatus) => norm[String(providerStatus ?? '').toLowerCase()] || DELIVERY_STATUS.UNKNOWN;
}

/**
 * Stub adapter for a provider whose real integration hasn't been built yet
 * (ALZAEEM / ALWASEET / HI_EXPRESS). It is registered so the provider is a
 * first-class, listable entity — but any operation fails loudly with 501 so
 * nothing silently no-ops. Replace with a real factory to go live.
 */
export function createUnsupportedAdapter(code, label) {
  const notImplemented = () => {
    const err = new Error(`تكامل شركة التوصيل "${label || code}" غير مفعّل بعد.`);
    err.statusCode = 501;
    err.code = 'DELIVERY_PROVIDER_NOT_IMPLEMENTED';
    throw err;
  };
  return {
    code,
    async createShipment() {
      notImplemented();
    },
    async getStatus() {
      notImplemented();
    },
    async cancelShipment() {
      notImplemented();
    },
    parseWebhook() {
      return { ok: false, error: `Provider ${code} not implemented` };
    },
    mapStatus() {
      return DELIVERY_STATUS.UNKNOWN;
    },
  };
}
