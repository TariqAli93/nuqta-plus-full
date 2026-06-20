import onlineCommerceReportService from '../services/onlineCommerceReportService.js';
import { hasPermission } from '../auth/permissionMatrix.js';

export class OnlineCommerceReportController {
  /** Dashboard widgets — top channel / revenue / profit + delivery success & return rate. */
  async widgets(request, reply) {
    // Profit-by-channel is profit-sensitive: only include it when allowed.
    const includeProfit = hasPermission('reports:read_profit', request.user?.role);
    const data = await onlineCommerceReportService.widgets(request.query, request.user, {
      includeProfit,
    });
    return reply.send({ success: true, data });
  }

  /** Reports 1–6: sales / orders / delivered / returned / return % / revenue by channel. */
  async overview(request, reply) {
    const data = await onlineCommerceReportService.getOverview(request.query, request.user);
    return reply.send({ success: true, data });
  }

  /** Report 7: profit by channel (profit-sensitive → separate permission). */
  async profit(request, reply) {
    const data = await onlineCommerceReportService.profitByChannel(request.query, request.user);
    return reply.send({ success: true, data });
  }
}
