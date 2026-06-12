import reportController from '../controllers/reportController.js';
import posReportsController from '../controllers/posReportsController.js';

export default async function reportRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // ── Quick-question report windows (الأسئلة السريعة) ───────────────────────
  // Each opens in its own Electron window. RBAC: the dashboard hides the card
  // when the user lacks the permission; the route below returns 403 if hit
  // directly. Branch/warehouse/shift scoping is applied inside the service.
  // Namespaced under /quick to avoid colliding with the legacy /profit route.
  const quick = [
    ['/quick/sales', 'sales:read', 'sales'],
    ['/quick/profit', 'reports:read_profit', 'profit'],
    ['/quick/top-products', 'reports:read_profit', 'topProducts'],
    ['/quick/debts', 'sales:read', 'debts'],
    ['/quick/cash-box', 'reports:read_financial', 'cashBox'],
    ['/quick/expenses', 'view:expenses', 'expenses'],
    ['/quick/cash-movement', 'reports:read_financial', 'cashMovement'],
  ];
  for (const [path, permission, method] of quick) {
    fastify.get(path, {
      onRequest: [fastify.authenticate, fastify.authorize(permission)],
      handler: posReportsController[method].bind(posReportsController),
      schema: {
        description: `Quick report: ${method} (from/to/branchId/cashSessionId/page/limit/search)`,
        tags: ['reports'],
        security: [{ bearerAuth: [] }],
      },
    });
  }

  fastify.get('/dashboard', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: reportController.dashboard.bind(reportController),
    schema: {
      description: 'Accounting dashboard report (branch-aware)',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/export/excel', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: reportController.exportExcel.bind(reportController),
    schema: {
      description: 'Export accounting report as Excel-compatible workbook',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/export/pdf', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: reportController.exportPdf.bind(reportController),
    schema: {
      description: 'Export accounting report as PDF',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/aging', {
    onRequest: [fastify.authenticate, fastify.authorize('sales:read')],
    handler: reportController.aging.bind(reportController),
    schema: {
      description:
        'Receivables aging buckets (0-7, 8-30, 31-60, 61+) — branch-scoped.',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/profit', {
    onRequest: [fastify.authenticate, fastify.authorize('manage:sales')],
    handler: reportController.profit.bind(reportController),
    schema: {
      description:
        'Profit report — revenue, COGS, expenses, gross/net profit by branch and period.',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });

  fastify.get('/inventory-valuation', {
    onRequest: [fastify.authenticate, fastify.authorize('inventory:read')],
    handler: reportController.inventoryValuation.bind(reportController),
    schema: {
      description:
        'Inventory valuation by price tier (قيمة المخزون حسب نوع التسعيرة) — stock value at retail/wholesale/agent + cost, grouped by currency, filtered by branch/warehouse/product/category.',
      tags: ['reports'],
      security: [{ bearerAuth: [] }],
    },
  });
}
