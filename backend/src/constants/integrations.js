/**
 * Online Commerce — inbound integration source catalog (EXTENSION POINTS ONLY).
 *
 * These describe WHERE future orders/leads will arrive FROM. Nothing here is
 * implemented yet: the registry (src/services/integrations/registry.js) maps
 * every source to a 501 stub. See docs/online-commerce-integrations-design.md.
 *
 * Mirror of frontend/src/constants/integrations.js when that lands.
 */

// ── Source keys ───────────────────────────────────────────────────────────
export const INTEGRATION_SOURCE = Object.freeze({
  FACEBOOK_LEADS: 'FACEBOOK_LEADS',
  WHATSAPP: 'WHATSAPP',
  TELEGRAM: 'TELEGRAM',
  SHOPIFY: 'SHOPIFY',
  WOOCOMMERCE: 'WOOCOMMERCE',
  CUSTOM_STORE: 'CUSTOM_STORE',
});
export const INTEGRATION_SOURCES = Object.freeze(Object.values(INTEGRATION_SOURCE));

// What an inbound payload represents.
export const INTEGRATION_KIND = Object.freeze({
  ORDER: 'order', // a real cart/checkout (Shopify, WooCommerce, Custom store)
  LEAD: 'lead', // a contact/intent that becomes a manual order (FB/WhatsApp/Telegram)
});

/**
 * Per-source metadata: which existing sales-channel an order is attributed to
 * (channels are operator-extensible — see [sales-channels]), and the kind of
 * payload. `defaultChannelCode` is a DEFAULT; the resolved channel is always
 * configurable per integration instance. `signatureScheme`/`endpointHint` are
 * intentionally advisory — confirm against each provider's live docs before
 * implementing.
 */
export const INTEGRATION_CATALOG = Object.freeze({
  FACEBOOK_LEADS: {
    label: 'Facebook Leads',
    kind: INTEGRATION_KIND.LEAD,
    defaultChannelCode: 'FACEBOOK',
    signatureScheme: 'hmac-sha256(header: x-hub-signature-256, prefix: "sha256=")',
    endpointHint: 'Graph API leadgen webhook → fetch lead by leadgen_id',
  },
  WHATSAPP: {
    label: 'WhatsApp API',
    kind: INTEGRATION_KIND.LEAD,
    defaultChannelCode: 'WHATSAPP',
    signatureScheme: 'hmac-sha256(header: x-hub-signature-256)',
    endpointHint: 'WhatsApp Cloud API messages webhook',
  },
  TELEGRAM: {
    label: 'Telegram Bot',
    kind: INTEGRATION_KIND.LEAD,
    defaultChannelCode: 'TELEGRAM',
    signatureScheme: 'secret_token (header: x-telegram-bot-api-secret-token)',
    endpointHint: 'Bot API setWebhook → updates',
  },
  SHOPIFY: {
    label: 'Shopify',
    kind: INTEGRATION_KIND.ORDER,
    defaultChannelCode: 'WEBSITE',
    signatureScheme: 'hmac-sha256 base64 (header: x-shopify-hmac-sha256)',
    endpointHint: 'orders/create webhook',
  },
  WOOCOMMERCE: {
    label: 'WooCommerce',
    kind: INTEGRATION_KIND.ORDER,
    defaultChannelCode: 'WEBSITE',
    signatureScheme: 'hmac-sha256 base64 (header: x-wc-webhook-signature)',
    endpointHint: 'order.created webhook',
  },
  CUSTOM_STORE: {
    label: 'Custom Store API',
    kind: INTEGRATION_KIND.ORDER,
    defaultChannelCode: 'WEBSITE',
    signatureScheme: 'hmac-sha256 (configurable header) OR bearer token',
    endpointHint: 'our own documented webhook contract',
  },
});

/**
 * NORMALIZED INBOUND SHAPE — the single contract every source adapter must
 * produce from its raw payload. This is the extension point's DATA contract:
 * the future ingestion pipeline maps this onto online_orders (+ items) via the
 * existing onlineOrderService.create, so adapters never touch the DB directly.
 *
 * @typedef {Object} NormalizedInboundOrder
 * @property {string}  source        - INTEGRATION_SOURCE key
 * @property {string}  externalId    - the source's order/lead id (idempotency key)
 * @property {string}  channelCode   - sales_channels.code to attribute to
 * @property {Object}  customer      - { name, phone, address, province }
 * @property {string} [notes]
 * @property {number} [totalAmount]  - for item-less leads; else Σ items
 * @property {Array}  [items]        - [{ productName, productSku?, quantity, unitPrice, externalProductId? }]
 * @property {Object}  raw           - the original provider payload (audit)
 * @property {string} [occurredAt]   - provider event time, if any
 */
export const NORMALIZED_INBOUND_ORDER_SHAPE = Object.freeze({
  source: 'string',
  externalId: 'string',
  channelCode: 'string',
  customer: { name: 'string', phone: 'string|null', address: 'string|null', province: 'string|null' },
  notes: 'string|null',
  totalAmount: 'number|null',
  items: 'Array<{productName,quantity,unitPrice,productSku?,externalProductId?}>|null',
  raw: 'object',
  occurredAt: 'string|null',
});

export const isValidIntegrationSource = (s) => INTEGRATION_SOURCES.includes(s);
