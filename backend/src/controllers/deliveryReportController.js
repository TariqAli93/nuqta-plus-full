import deliveryReportService from '../services/deliveryReportService.js';

export class DeliveryReportController {
  /** KPIs + breakdowns (status / provider / cost-per-currency / late). */
  async overview(request, reply) {
    const data = await deliveryReportService.getOverview(request.query);
    return reply.send({ success: true, data });
  }

  async byProvider(request, reply) {
    const data = await deliveryReportService.byProvider(request.query);
    return reply.send({ success: true, data });
  }

  async byStatus(request, reply) {
    const data = await deliveryReportService.byStatus(request.query);
    return reply.send({ success: true, data });
  }

  async byDate(request, reply) {
    const data = await deliveryReportService.byDate(request.query);
    return reply.send({ success: true, data });
  }

  async late(request, reply) {
    const data = await deliveryReportService.lateShipments(request.query);
    return reply.send({ success: true, data });
  }

  /** Shipping cost totals per currency. */
  async cost(request, reply) {
    const data = await deliveryReportService.totalShippingCost(request.query);
    return reply.send({ success: true, data });
  }
}
