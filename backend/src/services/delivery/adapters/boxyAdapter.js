/**
 * BOXY delivery adapter.
 *
 * ⚠️ Boxy (tryboxy.com) does NOT publish a public API. Access is granted per
 * merchant, and the exact endpoints / auth header / request+response shape /
 * status vocabulary / webhook signature scheme come from the merchant API
 * reference Boxy hands you on onboarding. To avoid hard-coding unverified
 * details, EVERYTHING Boxy-specific is driven by the provider's `config` jsonb
 * + encrypted credentials, so finalising the integration is configuration,
 * not a code change. Defaults below follow the most common REST conventions.
 *
 *   config.baseUrl              e.g. "https://api.tryboxy.com"        (required)
 *   config.authScheme           "bearer" | "header"   (default "bearer")
 *   config.authHeaderName       header name when authScheme="header" (default "X-Api-Key")
 *   config.endpoints            { create, status, cancel }           (path overrides)
 *   config.statusMap            { "<boxy status>": "<canonical>" }   (override/extend)
 *   config.codField             COD request field name               (default "cod_amount")
 *   config.idPath               response path → provider shipment id (default "data.id")
 *   config.trackingPath         response path → tracking number      (default "data.tracking_number")
 *   config.trackingUrlPath      response path → tracking url          (default "data.tracking_url")
 *   config.statusPath           response/webhook path → status        (default "status")
 *   config.webhookSignatureHeader  header carrying the HMAC          (default "x-boxy-signature")
 *   config.webhookSignatureAlgo    HMAC algorithm                    (default "sha256")
 *   config.webhookSignaturePrefix  signature prefix                  (default "sha256=")
 *
 * apiKey / webhookSecret are the DECRYPTED values, injected by the service.
 */

import { httpJson, httpJsonWithRetry, pick, buildStatusMapper, verifyHmacSignature } from './baseAdapter.js';
import { DELIVERY_STATUS, boxyBaseUrl } from '../../../constants/delivery.js';

const DEFAULT_ENDPOINTS = {
  create: '/v1/shipments',
  status: '/v1/shipments/:id',
  cancel: '/v1/shipments/:id/cancel',
  // Lightweight authenticated endpoint used by "Test connection".
  ping: '/v1/ping',
};

// Best-effort default mapping of Boxy-style statuses → canonical. Override or
// extend per deployment via config.statusMap once the real status enum is known.
const DEFAULT_STATUS_MAP = {
  pending: DELIVERY_STATUS.SUBMITTED,
  created: DELIVERY_STATUS.SUBMITTED,
  confirmed: DELIVERY_STATUS.SUBMITTED,
  processing: DELIVERY_STATUS.SUBMITTED,
  picked_up: DELIVERY_STATUS.PICKED_UP,
  picked: DELIVERY_STATUS.PICKED_UP,
  in_transit: DELIVERY_STATUS.IN_TRANSIT,
  shipped: DELIVERY_STATUS.IN_TRANSIT,
  on_the_way: DELIVERY_STATUS.IN_TRANSIT,
  out_for_delivery: DELIVERY_STATUS.OUT_FOR_DELIVERY,
  delivered: DELIVERY_STATUS.DELIVERED,
  completed: DELIVERY_STATUS.DELIVERED,
  returned: DELIVERY_STATUS.RETURNED,
  return: DELIVERY_STATUS.RETURNED,
  cancelled: DELIVERY_STATUS.CANCELLED,
  canceled: DELIVERY_STATUS.CANCELLED,
  failed: DELIVERY_STATUS.FAILED,
  rejected: DELIVERY_STATUS.FAILED,
};

export function createBoxyAdapter(provider = {}) {
  const config = provider.config || {};
  const apiKey = provider.apiKey;
  const apiSecret = provider.apiSecret;
  const webhookSecret = provider.webhookSecret;
  // Environment selects the base URL; config.baseUrl is a manual override.
  const baseUrl = (boxyBaseUrl(config.environment) || config.baseUrl || '').replace(/\/+$/, '');
  const endpoints = { ...DEFAULT_ENDPOINTS, ...(config.endpoints || {}) };
  const mapStatus = buildStatusMapper({ ...DEFAULT_STATUS_MAP, ...(config.statusMap || {}) });

  function requireConfig() {
    if (!baseUrl || !apiKey) {
      const err = new Error('BOXY غير مهيأ: يلزم اختيار البيئة وضبط مفتاح الـ API.');
      err.statusCode = 400;
      err.code = 'DELIVERY_PROVIDER_NOT_CONFIGURED';
      throw err;
    }
  }

  // Auth header — bearer token by default; some deployments use a custom header.
  // The API secret (when present) is sent alongside as a configurable header so
  // key+secret auth works once Boxy's exact scheme is confirmed.
  function authHeaders() {
    const h =
      (config.authScheme || 'bearer') === 'header'
        ? { [config.authHeaderName || 'X-Api-Key']: apiKey }
        : { Authorization: `Bearer ${apiKey}` };
    if (apiSecret) h[config.secretHeaderName || 'X-Api-Secret'] = apiSecret;
    return h;
  }

  const url = (path, id) => `${baseUrl}${String(path).replace(':id', encodeURIComponent(id ?? ''))}`;

  function resolveCreateStatus(providerStatus) {
    const mapped = mapStatus(providerStatus);
    return mapped === DELIVERY_STATUS.UNKNOWN ? DELIVERY_STATUS.SUBMITTED : mapped;
  }

  return {
    code: 'BOXY',
    mapStatus,

    async createShipment(shipment) {
      requireConfig();
      const body = {
        reference: shipment.shipmentNumber,
        customer_name: shipment.recipientName,
        customer_phone: shipment.recipientPhone,
        customer_second_phone: shipment.secondaryPhone || undefined,
        city: shipment.province,
        region: shipment.region || undefined,
        address: shipment.recipientAddress,
        description: shipment.description || undefined,
        size: shipment.size || undefined,
        fragile: !!shipment.fragile,
        ready_to_pickup: !!shipment.readyToPickup,
        payment_type: shipment.paymentType || 'COLLECT_ON_DELIVERY',
        fee_type: shipment.feeType || 'BY_MERCHANT',
        [config.codField || 'cod_amount']: Number(shipment.codAmount) || 0,
        notes: shipment.notes || undefined,
      };
      // Create is retried ONLY on connection-level failure (no response) so we
      // never risk a duplicate shipment after the provider has already accepted.
      const res = await httpJsonWithRetry(
        url(endpoints.create),
        { method: 'POST', headers: authHeaders(), body },
        { retryOn: [0] }
      );
      if (!res.ok) {
        return {
          ok: false,
          response: res,
          error: pick(res.body, 'message') || res.error || `HTTP ${res.httpStatus}`,
        };
      }
      const providerStatus = pick(res.body, config.statusPath || 'status', 'created');
      return {
        ok: true,
        providerShipmentId: String(pick(res.body, config.idPath || 'data.id', '') || ''),
        platformCode: pick(res.body, config.platformCodePath || 'data.platform_code') || pick(res.body, 'data.code') || null,
        trackingNumber: pick(res.body, config.trackingPath || 'data.tracking_number'),
        trackingUrl: pick(res.body, config.trackingUrlPath || 'data.tracking_url'),
        providerStatus,
        status: resolveCreateStatus(providerStatus),
        response: res,
      };
    },

    async getStatus(shipment) {
      requireConfig();
      const ref = shipment.providerShipmentId || shipment.trackingNumber;
      const res = await httpJsonWithRetry(url(endpoints.status, ref), { method: 'GET', headers: authHeaders() });
      if (!res.ok) {
        return { ok: false, response: res, error: res.error || `HTTP ${res.httpStatus}` };
      }
      const providerStatus = pick(res.body, config.statusPath || 'status');
      return { ok: true, providerStatus, status: mapStatus(providerStatus), response: res };
    },

    async cancelShipment(shipment) {
      requireConfig();
      const ref = shipment.providerShipmentId || shipment.trackingNumber;
      const res = await httpJsonWithRetry(
        url(endpoints.cancel, ref),
        { method: 'POST', headers: authHeaders() },
        { retryOn: [0] }
      );
      return {
        ok: res.ok,
        response: res,
        error: res.ok ? null : res.error || `HTTP ${res.httpStatus}`,
      };
    },

    /**
     * Probe the configured Boxy environment with the saved credentials. A
     * lightweight authenticated GET — a 2xx means reachable + authorized. Used
     * by the "Test connection" button (always runs server-side).
     */
    async testConnection() {
      requireConfig();
      const res = await httpJson(url(endpoints.ping), { method: 'GET', headers: authHeaders() });
      return {
        ok: res.ok,
        httpStatus: res.httpStatus,
        error: res.ok ? null : pick(res.body, 'message') || res.error || `HTTP ${res.httpStatus}`,
      };
    },

    /**
     * Verify an inbound webhook's HMAC signature over the RAW request body.
     * When no webhook secret is configured the webhook is accepted unverified
     * (operator opted out); when a secret IS set, a missing/incorrect signature
     * is rejected. Header name / algorithm / prefix are configurable.
     */
    verifyWebhook({ rawBody, headers = {} } = {}) {
      if (!webhookSecret) return { ok: true, verified: false };
      const headerName = (config.webhookSignatureHeader || 'x-boxy-signature').toLowerCase();
      const provided = headers[headerName] || headers[config.webhookSignatureHeader || 'x-boxy-signature'];
      const ok = verifyHmacSignature(rawBody, provided, webhookSecret, {
        algo: config.webhookSignatureAlgo || 'sha256',
        prefix: config.webhookSignaturePrefix,
      });
      return { ok, verified: ok };
    },

    /** Map an inbound webhook body into the canonical shape. */
    parseWebhook(payload) {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Empty webhook payload' };
      }
      const providerStatus = pick(payload, config.statusPath || 'status');
      return {
        ok: true,
        // Provider's own unique event id, if any → strongest idempotency key.
        eventId:
          pick(payload, config.eventIdPath || 'event_id') ||
          pick(payload, 'id') ||
          null,
        providerShipmentId:
          pick(payload, config.idPath || 'data.id') || pick(payload, 'shipment_id'),
        trackingNumber:
          pick(payload, config.trackingPath || 'data.tracking_number') ||
          pick(payload, 'tracking_number'),
        providerStatus,
        status: mapStatus(providerStatus),
        occurredAt: pick(payload, 'timestamp') || pick(payload, 'updated_at') || null,
      };
    },
  };
}
