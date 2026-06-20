/**
 * Inbound order/lead SOURCE-ADAPTER contract (EXTENSION POINT — not implemented).
 *
 * Symmetric to the delivery provider-adapter pattern (src/services/delivery):
 * the delivery side pushes shipments OUT to couriers; this side pulls orders/
 * leads IN from sales channels. Every future integration (Shopify, WhatsApp, …)
 * is a factory `create<Name>Source(integration)` returning an object that
 * implements this interface. The rest of the system only ever resolves the
 * abstract shape through the registry (./registry.js) — it never imports a
 * concrete source.
 *
 * `integration` is the (future) integration_sources row with secrets DECRYPTED
 * by the service: { key, channelCode, config, apiKey, webhookSecret }.
 *
 * Contract:
 *
 *   key: string                      // INTEGRATION_SOURCE key
 *   kind: 'order' | 'lead'
 *   channelCode: string              // default sales_channels.code to attribute to
 *
 *   // Verify an inbound webhook over the RAW body (HMAC / secret token).
 *   // Returns { ok, verified }. No secret configured → { ok:true, verified:false }.
 *   verifyWebhook({ rawBody, headers, payload }) -> { ok, verified, error? }
 *
 *   // Map a raw provider payload → NORMALIZED_INBOUND_ORDER_SHAPE.
 *   // (May need an outbound fetch first, e.g. FB leadgen_id → lead details.)
 *   async parseInbound(payload, headers) -> {
 *     ok, externalId, normalized (a NormalizedInboundOrder), error?
 *   }
 *
 *   // OPTIONAL outbound: push our order/shipment status back to the source
 *   // (e.g. mark a Shopify order fulfilled). Omit if the source is one-way.
 *   async pushStatus?(externalId, status, context) -> { ok, response?, error? }
 *
 * The future ingestion service does: resolveSource → verifyWebhook → parseInbound
 * → idempotency check on (source, externalId) → onlineOrderService.create.
 * Adapters NEVER write to the DB themselves.
 */

/**
 * Stub for a source whose real integration isn't built yet. It is registered so
 * the source is a first-class, listable entity, but every operation fails
 * loudly with 501 — nothing silently no-ops. Replace with a real factory to go
 * live. (Mirrors delivery's createUnsupportedAdapter.)
 */
export function createUnsupportedSource(key, label) {
  const notImplemented = () => {
    const err = new Error(`تكامل المصدر "${label || key}" غير مفعّل بعد.`);
    err.statusCode = 501;
    err.code = 'INTEGRATION_SOURCE_NOT_IMPLEMENTED';
    throw err;
  };
  return {
    key,
    label,
    implemented: false,
    verifyWebhook() {
      return { ok: false, verified: false, error: `Source ${key} not implemented` };
    },
    async parseInbound() {
      notImplemented();
    },
  };
}
