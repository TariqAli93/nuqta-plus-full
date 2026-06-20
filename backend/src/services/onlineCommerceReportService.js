import { getDb } from '../db.js';
import {
  sales,
  saleItems,
  saleReturns,
  saleReturnItems,
  products,
  salesChannels,
  onlineOrders,
  currencySettings,
} from '../models/index.js';
import { and, eq, ne, gte, lte, sql } from 'drizzle-orm';
import { branchFilterFor } from './scopeService.js';
import { isValidOrderStatus } from '../constants/orders.js';

/**
 * Online Commerce reports — analytics over the sales-channel dimension and the
 * online-orders fulfilment funnel.
 *
 * Conventions reused from reportService:
 *  - Money is grouped PER CURRENCY and never summed across currencies.
 *  - Revenue/profit exclude cancelled + synthetic opening-balance sales.
 *  - COGS uses the cost captured at sale time (sale_items.unit_cost_price),
 *    falling back to the product base cost for legacy rows.
 *  - Channel reports cover sales attributed to a channel (channel_id NOT NULL),
 *    i.e. sales converted from online orders.
 */

// COGS at the cost frozen on the sale line (mirrors reportService.SOLD_COGS).
const SOLD_COGS = sql`COALESCE(SUM(
  CASE WHEN ${saleItems.unitCostPrice} IS NOT NULL
       THEN ${saleItems.unitCostPrice}::numeric * ${saleItems.quantity}
       ELSE COALESCE(${products.costPrice}::numeric, 0) * COALESCE(NULLIF(${saleItems.baseQuantity}, 0), ${saleItems.quantity})
  END), 0)`;

const RETURNED_COGS = sql`COALESCE(SUM(
  CASE WHEN ${saleItems.unitCostPrice} IS NOT NULL
       THEN ${saleItems.unitCostPrice}::numeric * ${saleReturnItems.quantity}
       ELSE COALESCE(${products.costPrice}::numeric, 0) * COALESCE(NULLIF(${saleReturnItems.baseQuantity}, 0), ${saleReturnItems.quantity})
  END), 0)`;

const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const num = (v) => (v == null ? 0 : Number(v) || 0);

/** Resolve the branch a report is scoped to (null = all, -1 = no access). */
function resolveBranch(filters, actingUser) {
  const allowed = branchFilterFor(actingUser);
  if (allowed === null) return filters.branchId ? Number(filters.branchId) : null;
  if (allowed.length === 0) return -1;
  return Number(allowed[0]);
}

/** Inclusive date-range conditions on a timestamp column (cast to ::date). */
function dateConds(col, from, to) {
  const c = [];
  if (from) c.push(gte(sql`${col}::date`, from));
  if (to) c.push(lte(sql`${col}::date`, to));
  return c;
}

export class OnlineCommerceReportService {
  /**
   * Reports 1, 6 (and the inputs to 7): per channel + currency gross sales,
   * returns and net revenue. Returns both the "sales by channel" and
   * "revenue by channel" shapes plus a keyed index for the profit report.
   */
  async _salesRevenueByChannel(filters, actingUser) {
    const db = await getDb();
    const from = ymd(filters.dateFrom);
    const to = ymd(filters.dateTo);
    const branchId = resolveBranch(filters, actingUser);

    const salesScope = () => {
      const c = [
        ne(sales.status, 'cancelled'),
        sql`COALESCE(${sales.isOpeningBalance}, false) = false`,
        ...dateConds(sales.createdAt, from, to),
      ];
      if (branchId === -1) c.push(sql`1=0`);
      else if (branchId != null) c.push(eq(sales.branchId, branchId));
      if (filters.currency && filters.currency !== 'ALL') c.push(eq(sales.currency, filters.currency));
      if (filters.channelId) c.push(eq(sales.channelId, Number(filters.channelId)));
      return c;
    };

    const grossRows = await db
      .select({
        channelId: sales.channelId,
        channelCode: salesChannels.code,
        channelName: salesChannels.name,
        currency: sales.currency,
        salesCount: sql`COUNT(*)`,
        grossSales: sql`COALESCE(SUM(${sales.total}::numeric), 0)`,
      })
      .from(sales)
      .innerJoin(salesChannels, eq(sales.channelId, salesChannels.id))
      .where(and(...salesScope()))
      .groupBy(sales.channelId, salesChannels.code, salesChannels.name, sales.currency);

    const returnRows = await db
      .select({
        channelId: sales.channelId,
        currency: sales.currency,
        returns: sql`COALESCE(SUM(${saleReturns.returnedValue}::numeric), 0)`,
      })
      .from(saleReturns)
      .innerJoin(sales, eq(saleReturns.saleId, sales.id))
      .innerJoin(salesChannels, eq(sales.channelId, salesChannels.id))
      .where(and(...salesScope()))
      .groupBy(sales.channelId, sales.currency);

    const returnsByKey = new Map();
    for (const r of returnRows) returnsByKey.set(`${r.channelId}|${r.currency}`, num(r.returns));

    const salesByChannel = [];
    const revenueByChannel = [];
    const index = new Map(); // key → { channelId, code, name, currency, gross, returns, net }
    for (const g of grossRows) {
      const key = `${g.channelId}|${g.currency}`;
      const gross = num(g.grossSales);
      const returns = returnsByKey.get(key) || 0;
      const net = gross - returns;
      const base = {
        channelId: g.channelId,
        channelCode: g.channelCode,
        channelName: g.channelName,
        currency: g.currency,
      };
      salesByChannel.push({ ...base, salesCount: num(g.salesCount), grossSales: gross });
      revenueByChannel.push({ ...base, grossSales: gross, returns, netRevenue: net });
      index.set(key, { ...base, gross, returns, net });
    }
    return { salesByChannel, revenueByChannel, index, scope: { from, to, branchId } };
  }

  /** Reports 2, 3, 4, 5: orders / delivered / returned / return % by channel. */
  async ordersByChannel(filters, actingUser) {
    const db = await getDb();
    const from = ymd(filters.dateFrom);
    const to = ymd(filters.dateTo);

    // Branch scope (same resolver as the sales side). -1 → no access.
    const branch = resolveBranch(filters, actingUser);
    const emptySummary = {
      totalOrders: 0,
      newCount: 0,
      delivered: 0,
      returned: 0,
      cancelled: 0,
      totalOrderValue: 0,
      returnPercentage: 0,
    };
    if (branch === -1) return { ordersByChannel: [], summary: emptySummary };

    const conds = [...dateConds(onlineOrders.createdAt, from, to)];
    if (filters.channelId) conds.push(eq(onlineOrders.channelId, Number(filters.channelId)));
    if (branch !== null) conds.push(eq(onlineOrders.branchId, branch));
    if (filters.status && isValidOrderStatus(filters.status)) {
      conds.push(eq(onlineOrders.status, filters.status));
    }
    if (filters.userId) conds.push(eq(onlineOrders.createdBy, Number(filters.userId)));

    const rows = await db
      .select({
        channelId: onlineOrders.channelId,
        channelCode: salesChannels.code,
        channelName: salesChannels.name,
        // "عدد الطلبات" and value EXCLUDE cancelled orders — a cancelled order is
        // never a real sale (spec: cancelled must not count as sales).
        ordersCount: sql`COALESCE(SUM(CASE WHEN ${onlineOrders.status} <> 'CANCELLED' THEN 1 ELSE 0 END), 0)`,
        totalOrderValue: sql`COALESCE(SUM(CASE WHEN ${onlineOrders.status} <> 'CANCELLED' THEN ${onlineOrders.totalAmount}::numeric ELSE 0 END), 0)`,
        newCount: sql`COALESCE(SUM(CASE WHEN ${onlineOrders.status} = 'NEW' THEN 1 ELSE 0 END), 0)`,
        delivered: sql`COALESCE(SUM(CASE WHEN ${onlineOrders.status} = 'DELIVERED' THEN 1 ELSE 0 END), 0)`,
        returned: sql`COALESCE(SUM(CASE WHEN ${onlineOrders.status} = 'RETURNED' THEN 1 ELSE 0 END), 0)`,
        cancelled: sql`COALESCE(SUM(CASE WHEN ${onlineOrders.status} = 'CANCELLED' THEN 1 ELSE 0 END), 0)`,
      })
      .from(onlineOrders)
      .innerJoin(salesChannels, eq(onlineOrders.channelId, salesChannels.id))
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(onlineOrders.channelId, salesChannels.code, salesChannels.name);

    // Return % = returned / (delivered + returned). Undelivered orders don't
    // count against the rate (they haven't completed the funnel yet).
    const rate = (delivered, returned) => {
      const settled = delivered + returned;
      return settled > 0 ? Number(((returned / settled) * 100).toFixed(2)) : 0;
    };

    const byChannel = rows.map((r) => {
      const delivered = num(r.delivered);
      const returned = num(r.returned);
      return {
        channelId: r.channelId,
        channelCode: r.channelCode,
        channelName: r.channelName,
        ordersCount: num(r.ordersCount),
        totalOrderValue: num(r.totalOrderValue),
        newCount: num(r.newCount),
        delivered,
        returned,
        cancelled: num(r.cancelled),
        returnPercentage: rate(delivered, returned),
      };
    });

    const summary = byChannel.reduce(
      (acc, c) => {
        acc.totalOrders += c.ordersCount;
        acc.newCount += c.newCount;
        acc.delivered += c.delivered;
        acc.returned += c.returned;
        acc.cancelled += c.cancelled;
        acc.totalOrderValue += c.totalOrderValue;
        return acc;
      },
      { ...emptySummary }
    );
    summary.returnPercentage = rate(summary.delivered, summary.returned);

    return { ordersByChannel: byChannel, summary };
  }

  /** Report 7: profit by channel = net revenue − net COGS, per currency. */
  async profitByChannel(filters, actingUser) {
    const db = await getDb();
    const { index, scope } = await this._salesRevenueByChannel(filters, actingUser);
    const { from, to, branchId } = scope;

    const scopedSales = (extra = []) => {
      const c = [
        ne(sales.status, 'cancelled'),
        sql`COALESCE(${sales.isOpeningBalance}, false) = false`,
        ...dateConds(sales.createdAt, from, to),
        ...extra,
      ];
      if (branchId === -1) c.push(sql`1=0`);
      else if (branchId != null) c.push(eq(sales.branchId, branchId));
      if (filters.currency && filters.currency !== 'ALL') c.push(eq(sales.currency, filters.currency));
      if (filters.channelId) c.push(eq(sales.channelId, Number(filters.channelId)));
      return c;
    };

    const soldRows = await db
      .select({ channelId: sales.channelId, currency: sales.currency, cogs: SOLD_COGS })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(salesChannels, eq(sales.channelId, salesChannels.id))
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(and(...scopedSales()))
      .groupBy(sales.channelId, sales.currency);

    const returnedRows = await db
      .select({ channelId: sales.channelId, currency: sales.currency, cogs: RETURNED_COGS })
      .from(saleReturnItems)
      .innerJoin(saleReturns, eq(saleReturnItems.returnId, saleReturns.id))
      .innerJoin(sales, eq(saleReturns.saleId, sales.id))
      .innerJoin(salesChannels, eq(sales.channelId, salesChannels.id))
      // Read the frozen sale-time cost from the original sale line; fall back to
      // the product base cost (legacy rows) — matches reportService.RETURNED_COGS.
      .leftJoin(saleItems, eq(saleReturnItems.saleItemId, saleItems.id))
      .leftJoin(products, eq(saleReturnItems.productId, products.id))
      .where(and(...scopedSales()))
      .groupBy(sales.channelId, sales.currency);

    const soldByKey = new Map();
    for (const r of soldRows) soldByKey.set(`${r.channelId}|${r.currency}`, num(r.cogs));
    const retByKey = new Map();
    for (const r of returnedRows) retByKey.set(`${r.channelId}|${r.currency}`, num(r.cogs));

    const profitByChannel = [];
    for (const [key, row] of index) {
      const netCogs = (soldByKey.get(key) || 0) - (retByKey.get(key) || 0);
      const grossProfit = row.net - netCogs;
      profitByChannel.push({
        channelId: row.channelId,
        channelCode: row.channelCode,
        channelName: row.channelName,
        currency: row.currency,
        netRevenue: row.net,
        cogs: netCogs,
        grossProfit,
        margin: row.net > 0 ? Number(((grossProfit / row.net) * 100).toFixed(2)) : 0,
      });
    }
    return { profitByChannel };
  }

  /** The active base currency code, used to pick a single bucket for widgets. */
  async _baseCurrency() {
    const db = await getDb();
    const [row] = await db
      .select({ code: currencySettings.currencyCode })
      .from(currencySettings)
      .where(and(eq(currencySettings.isBaseCurrency, true), eq(currencySettings.isActive, true)))
      .limit(1);
    return row?.code || null;
  }

  /**
   * Compact dashboard widgets:
   *   topChannel (by order volume), topRevenueChannel, topProfitChannel,
   *   deliverySuccessRate, returnRate.
   *
   * Revenue/profit "top" are picked WITHIN a single currency (no cross-currency
   * comparison): the filter's currency, else the base currency, else the
   * currency with the most revenue. Profit is omitted unless includeProfit.
   */
  async widgets(filters, actingUser, { includeProfit = true } = {}) {
    const [salesRev, orders] = await Promise.all([
      this._salesRevenueByChannel(filters, actingUser),
      this.ordersByChannel(filters, actingUser),
    ]);

    const maxBy = (rows, field) =>
      rows.reduce((best, r) => (best == null || r[field] > best[field] ? r : best), null);

    // Resolve the currency bucket to rank money widgets in.
    let currency = filters.currency && filters.currency !== 'ALL' ? filters.currency : null;
    if (!currency) currency = await this._baseCurrency();
    if (!currency) {
      // Fall back to the currency with the highest gross revenue.
      const byCur = {};
      for (const r of salesRev.revenueByChannel) byCur[r.currency] = (byCur[r.currency] || 0) + r.grossSales;
      currency = Object.entries(byCur).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    const inCurrency = (rows) => (currency ? rows.filter((r) => r.currency === currency) : rows);

    const top = maxBy(orders.ordersByChannel, 'ordersCount');
    const topRev = maxBy(inCurrency(salesRev.revenueByChannel), 'netRevenue');

    let topProfitChannel = null;
    let netProfit = 0;
    if (includeProfit) {
      const { profitByChannel } = await this.profitByChannel(filters, actingUser);
      const tp = maxBy(inCurrency(profitByChannel), 'grossProfit');
      topProfitChannel = tp
        ? { channelId: tp.channelId, channelName: tp.channelName, grossProfit: tp.grossProfit, currency: tp.currency }
        : null;
      // Net online profit in the ranking currency (spec dashboard metric).
      netProfit = inCurrency(profitByChannel).reduce((s, r) => s + (Number(r.grossProfit) || 0), 0);
    }

    const { delivered, returned } = orders.summary;
    const settled = delivered + returned;
    const round = (n) => Number(n.toFixed(2));

    // Total online sales = net revenue in the ranking currency (excludes
    // cancelled sales; returns already subtracted in revenueByChannel).
    const totalSales = inCurrency(salesRev.revenueByChannel).reduce(
      (s, r) => s + (Number(r.netRevenue) || 0),
      0
    );

    return {
      currency,
      profitVisible: includeProfit,
      topChannel: top
        ? { channelId: top.channelId, channelName: top.channelName, ordersCount: top.ordersCount }
        : null,
      topRevenueChannel: topRev
        ? { channelId: topRev.channelId, channelName: topRev.channelName, netRevenue: topRev.netRevenue, currency: topRev.currency }
        : null,
      topProfitChannel,
      deliverySuccessRate: settled > 0 ? round((delivered / settled) * 100) : 0,
      returnRate: settled > 0 ? round((returned / settled) * 100) : 0,
      // Headline counts + money for the dashboard. `completed` = delivered.
      totals: {
        ...orders.summary,
        completed: orders.summary.delivered,
        totalSales: round(totalSales),
        netProfit: round(netProfit),
        currency,
      },
    };
  }

  /** Reports 1–6 in one payload (no profit — that's permission-gated separately). */
  async getOverview(filters, actingUser) {
    const [salesRev, orders] = await Promise.all([
      this._salesRevenueByChannel(filters, actingUser),
      this.ordersByChannel(filters, actingUser),
    ]);
    return {
      filters: {
        dateFrom: ymd(filters.dateFrom),
        dateTo: ymd(filters.dateTo),
        channelId: filters.channelId ? Number(filters.channelId) : null,
        currency: filters.currency || 'ALL',
        status: filters.status || null,
        userId: filters.userId ? Number(filters.userId) : null,
      },
      salesByChannel: salesRev.salesByChannel, // #1
      ordersByChannel: orders.ordersByChannel, // #2
      ordersSummary: orders.summary, // #3, #4, #5 (delivered / returned / return %)
      revenueByChannel: salesRev.revenueByChannel, // #6
    };
  }
}

export default new OnlineCommerceReportService();
