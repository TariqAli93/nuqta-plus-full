import deliveryService from '../services/delivery/deliveryService.js';
import {
  deliveryProviderUpdateSchema,
  deliveryShipmentCreateSchema,
  deliveryQuoteSchema,
} from '../utils/validation.js';

export class DeliveryController {
  // ── Providers ──────────────────────────────────────────────────────────────
  async listProviders(request, reply) {
    const data = await deliveryService.listProviders();
    return reply.send({ success: true, data });
  }

  async getProvider(request, reply) {
    const data = await deliveryService.getProvider(request.params.id);
    return reply.send({ success: true, data });
  }

  async updateProvider(request, reply) {
    const validated = deliveryProviderUpdateSchema.parse(request.body);
    const data = await deliveryService.updateProvider(request.params.id, validated);
    return reply.send({ success: true, data, message: 'Delivery provider updated' });
  }

  async testConnection(request, reply) {
    const result = await deliveryService.testConnection(request.params.id);
    return reply.send({ success: true, ...result });
  }

  async setDefaultProvider(request, reply) {
    const data = await deliveryService.setDefaultProvider(request.params.id);
    return reply.send({ success: true, data, message: 'تم تعيين الشركة الافتراضية' });
  }

  // ── Shipments ───────────────────────────────────────────────────────────────
  async createShipment(request, reply) {
    const validated = deliveryShipmentCreateSchema.parse(request.body);
    const data = await deliveryService.createShipment(validated, request.user);
    return reply.code(201).send({ success: true, data, message: 'Shipment created' });
  }

  /** Quote shipping cost (provider optional → falls back to the default). */
  async quote(request, reply) {
    const { providerId, providerCode, ...input } = deliveryQuoteSchema.parse(request.body);
    const data = await deliveryService.calculateCost({ providerId, providerCode }, input, request.user);
    return reply.send({ success: true, data });
  }

  async listShipments(request, reply) {
    const result = await deliveryService.listShipments(request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async getShipment(request, reply) {
    const data = await deliveryService.getShipmentById(request.params.id);
    return reply.send({ success: true, data });
  }

  async syncShipment(request, reply) {
    const data = await deliveryService.syncStatus(request.params.id, request.user);
    return reply.send({ success: true, data, message: 'Shipment status synced' });
  }

  async cancelShipment(request, reply) {
    const data = await deliveryService.cancelShipment(request.params.id, request.user);
    return reply.send({ success: true, data, message: 'Shipment cancelled' });
  }

  async shipmentLabel(request, reply) {
    const data = await deliveryService.getLabel(request.params.id, request.user);
    return reply.send({ success: true, data });
  }

  /** Debugging: inbound webhook logs. */
  async webhookLogs(request, reply) {
    const result = await deliveryService.listWebhookLogs(request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  /** Audit: outbound action logs (create/cancel/sync/label/quote). */
  async actionLogs(request, reply) {
    const result = await deliveryService.listActionLogs(request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  // ── Webhook (unauthenticated; verified via per-provider shared secret) ──────
  async webhook(request, reply) {
    const result = await deliveryService.handleWebhook(
      request.params.providerCode,
      request.body,
      request.headers,
      request.rawBody // raw bytes, for HMAC signature verification
    );
    return reply.send({ success: true, ...result });
  }
}
