/**
 * CUSTOM / manual delivery adapter.
 *
 * For couriers with no API: the shipment is "submitted" locally (the operator
 * tracks it manually and advances the status by hand), and a generic webhook
 * shape is accepted so even a simple external script can push updates.
 *
 * If config.baseUrl + apiKey are present this still behaves manually — the
 * generic shape is intentionally minimal. A real provider should get its own
 * adapter instead of overloading CUSTOM.
 */

import { buildStatusMapper, pick, verifyHmacSignature } from './baseAdapter.js';
import { DELIVERY_STATUS } from '../../../constants/delivery.js';

const GENERIC_STATUS_MAP = {
  submitted: DELIVERY_STATUS.SUBMITTED,
  picked_up: DELIVERY_STATUS.PICKED_UP,
  in_transit: DELIVERY_STATUS.IN_TRANSIT,
  out_for_delivery: DELIVERY_STATUS.OUT_FOR_DELIVERY,
  delivered: DELIVERY_STATUS.DELIVERED,
  returned: DELIVERY_STATUS.RETURNED,
  cancelled: DELIVERY_STATUS.CANCELLED,
  failed: DELIVERY_STATUS.FAILED,
};

export function createCustomAdapter(provider = {}) {
  const config = provider.config || {};
  const mapStatus = buildStatusMapper({ ...GENERIC_STATUS_MAP, ...(config.statusMap || {}) });

  return {
    code: provider.code || 'CUSTOM',
    mapStatus,

    // Manual provider: accept the dispatch locally. The operator fills the
    // tracking number later via an update if the courier provides one.
    async createShipment(shipment) {
      return {
        ok: true,
        providerShipmentId: shipment.shipmentNumber,
        trackingNumber: null,
        trackingUrl: null,
        providerStatus: 'submitted',
        status: DELIVERY_STATUS.SUBMITTED,
        response: { manual: true },
      };
    },

    // Nothing to poll — status is driven manually / by webhook.
    async getStatus(shipment) {
      return { ok: true, status: shipment.status, providerStatus: null, response: { manual: true } };
    },

    async cancelShipment() {
      return { ok: true, response: { manual: true } };
    },

    // Optional HMAC verification when the operator set a webhook secret.
    verifyWebhook({ rawBody, headers = {} } = {}) {
      const secret = provider.webhookSecret;
      if (!secret) return { ok: true, verified: false };
      const headerName = (config.webhookSignatureHeader || 'x-webhook-signature').toLowerCase();
      const provided = headers[headerName];
      const ok = verifyHmacSignature(rawBody, provided, secret, {
        algo: config.webhookSignatureAlgo || 'sha256',
        prefix: config.webhookSignaturePrefix,
      });
      return { ok, verified: ok };
    },

    parseWebhook(payload) {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Empty webhook payload' };
      }
      const providerStatus = pick(payload, 'status');
      return {
        ok: true,
        eventId: pick(payload, 'event_id') || pick(payload, 'id') || null,
        providerShipmentId: pick(payload, 'shipment_id') || pick(payload, 'reference'),
        trackingNumber: pick(payload, 'tracking_number'),
        providerStatus,
        status: mapStatus(providerStatus),
        occurredAt: pick(payload, 'timestamp') || null,
      };
    },
  };
}
