import posReportsService from '../services/posReportsService.js';

/**
 * Thin controllers for the dashboard "quick question" report windows. Each maps
 * the shared query string (from/to/branchId/warehouseId/cashSessionId/page/
 * limit/search + report-specific type/filter/customerId) to its service call.
 * Branch scoping + RBAC are enforced in the service / route layer.
 */
function parse(q = {}) {
  return {
    from: q.from || q.dateFrom || null,
    to: q.to || q.dateTo || null,
    branchId: q.branchId ? Number(q.branchId) : null,
    warehouseId: q.warehouseId ? Number(q.warehouseId) : null,
    cashSessionId: q.cashSessionId ? Number(q.cashSessionId) : null,
    customerId: q.customerId ? Number(q.customerId) : null,
    page: q.page ? Number(q.page) : 1,
    limit: q.limit ? Number(q.limit) : 50,
    search: q.search ? String(q.search).trim() : null,
    type: q.type || null,
    filter: q.filter || null,
    // Debts report: party / direction / status facets.
    partyType: q.partyType || null,
    direction: q.direction || null,
    status: q.status || null,
  };
}

class PosReportsController {
  async sales(req, reply) {
    return reply.send({ success: true, data: await posReportsService.sales(parse(req.query), req.user) });
  }
  async profit(req, reply) {
    return reply.send({ success: true, data: await posReportsService.profit(parse(req.query), req.user) });
  }
  async topProducts(req, reply) {
    return reply.send({ success: true, data: await posReportsService.topProducts(parse(req.query), req.user) });
  }
  async debts(req, reply) {
    return reply.send({ success: true, data: await posReportsService.debts(parse(req.query), req.user) });
  }
  async cashBox(req, reply) {
    return reply.send({ success: true, data: await posReportsService.cashBox(parse(req.query), req.user) });
  }
  async expenses(req, reply) {
    return reply.send({ success: true, data: await posReportsService.expenses(parse(req.query), req.user) });
  }
  async cashMovement(req, reply) {
    return reply.send({ success: true, data: await posReportsService.cashMovement(parse(req.query), req.user) });
  }
}

export default new PosReportsController();
