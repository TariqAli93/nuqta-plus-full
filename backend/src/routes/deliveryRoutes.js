import { DeliveryController } from '../controllers/deliveryController.js';

const c = new DeliveryController();

/**
 * Delivery integration routes.
 *
 * Management + shipment endpoints are authenticated per-route. The webhook
 * endpoint is intentionally UNAUTHENTICATED (providers can't carry a JWT) — it
 * is verified instead by the per-provider shared secret inside the service.
 */
export default async function deliveryRoutes(fastify) {
  // Capture the raw JSON body (scoped to this plugin) so webhook HMAC signatures
  // can be verified over the exact bytes the provider signed. Still parses into
  // `request.body` for every delivery route as usual.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err);
    }
  });

  const auth = (perm) => ({
    onRequest: [fastify.authenticate, fastify.authorize(perm)],
  });
  const tag = { tags: ['delivery'], security: [{ bearerAuth: [] }] };

  // ── Providers ──────────────────────────────────────────────────────────────
  fastify.get('/providers', { ...auth('delivery_providers:read'), handler: c.listProviders,
    schema: { description: 'List delivery providers', ...tag } });
  fastify.get('/providers/:id', { ...auth('delivery_providers:read'), handler: c.getProvider,
    schema: { description: 'Get a delivery provider', ...tag } });
  fastify.put('/providers/:id', { ...auth('delivery_providers:manage'), handler: c.updateProvider,
    schema: { description: 'Update a delivery provider (settings + credentials)', ...tag } });
  fastify.post('/providers/:id/test', { ...auth('delivery_providers:manage'), handler: c.testConnection,
    schema: { description: 'Test a delivery provider connection (server-side)', ...tag } });
  fastify.post('/providers/:id/default', { ...auth('delivery_providers:manage'), handler: c.setDefaultProvider,
    schema: { description: 'Set a provider as the default carrier', ...tag } });

  // ── Shipments ───────────────────────────────────────────────────────────────
  fastify.post('/shipments', { ...auth('delivery_shipments:create'), handler: c.createShipment,
    schema: { description: 'Create + dispatch a shipment for an online order', ...tag } });
  fastify.post('/quote', { ...auth('delivery_shipments:create'), handler: c.quote,
    schema: { description: 'Quote shipping cost (provider optional → default)', ...tag } });
  fastify.get('/shipments', { ...auth('delivery_shipments:read'), handler: c.listShipments,
    schema: { description: 'List shipments', ...tag } });
  fastify.get('/shipments/:id', { ...auth('delivery_shipments:read'), handler: c.getShipment,
    schema: { description: 'Get a shipment with its event log', ...tag } });
  fastify.post('/shipments/:id/sync', { ...auth('delivery_shipments:sync'), handler: c.syncShipment,
    schema: { description: 'Poll the provider and update the shipment status', ...tag } });
  fastify.post('/shipments/:id/cancel', { ...auth('delivery_shipments:cancel'), handler: c.cancelShipment,
    schema: { description: 'Cancel a shipment', ...tag } });
  fastify.get('/shipments/:id/label', { ...auth('delivery_shipments:print_label'), handler: c.shipmentLabel,
    schema: { description: 'Get a printable shipment label URL (if supported)', ...tag } });

  // ── Webhook logs (debugging) ────────────────────────────────────────────────
  fastify.get('/webhook-logs', { ...auth('delivery_webhooks:view'), handler: c.webhookLogs,
    schema: { description: 'List inbound webhook logs (debugging)', ...tag } });
  fastify.get('/action-logs', { ...auth('delivery_logs:view'), handler: c.actionLogs,
    schema: { description: 'List outbound action logs (audit)', ...tag } });

  // ── Webhook (no auth — verified by provider shared secret) ──────────────────
  fastify.post('/webhooks/:providerCode', {
    handler: c.webhook,
    schema: { description: 'Inbound provider status webhook', tags: ['delivery'] },
  });
}
