import { getDb } from '../db.js';
import { deliveryShipments, deliveryProviders } from '../models/index.js';
import { and, eq, sql, gte, lte, notInArray } from 'drizzle-orm';
import { DELIVERY_STATUS, DELIVERY_TERMINAL_STATUSES } from '../constants/delivery.js';

/**
 * Delivery / shipping reports (تقارير الشحن).
 *
 * Conventions mirror onlineCommerceReportService:
 *  - Money (shipping cost / COD) is grouped PER CURRENCY and NEVER summed across
 *    currencies (the system has no FX conversion in reports).
 *  - Date range is inclusive on created_at::date.
 *  - Rates guard against divide-by-zero.
 *    · successRate = delivered / (total − cancelled)   (delivery success)
 *    · returnRate  = returned / delivered              (returns vs successful)
 */

const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const num = (v) => (v == null ? 0 : Number(v) || 0);
const round2 = (n) => Number((Number(n) || 0).toFixed(2));

export class DeliveryReportService {
  /** Shared filter conditions (date range + provider + status). */
  _baseConds(filters = {}) {
    const from = ymd(filters.dateFrom);
    const to = ymd(filters.dateTo);
    const conds = [];
    if (from) conds.push(gte(sql`${deliveryShipments.createdAt}::date`, from));
    if (to) conds.push(lte(sql`${deliveryShipments.createdAt}::date`, to));
    if (filters.providerId) conds.push(eq(deliveryShipments.providerId, Number(filters.providerId)));
    if (filters.status) conds.push(eq(deliveryShipments.status, filters.status));
    return conds;
  }

  /** Count of shipments grouped by canonical status. */
  async byStatus(filters = {}) {
    const db = await getDb();
    const conds = this._baseConds(filters);
    const rows = await db
      .select({ status: deliveryShipments.status, count: sql`count(*)` })
      .from(deliveryShipments)
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(deliveryShipments.status);
    return rows.map((r) => ({ status: r.status, count: num(r.count) }));
  }

  /** Per-provider volume + success/return rates. */
  async byProvider(filters = {}) {
    const db = await getDb();
    const conds = this._baseConds(filters);
    const c = (status) =>
      sql`COALESCE(SUM(CASE WHEN ${deliveryShipments.status} = ${status} THEN 1 ELSE 0 END), 0)`;
    const rows = await db
      .select({
        providerId: deliveryShipments.providerId,
        providerName: deliveryProviders.name,
        providerCode: deliveryProviders.code,
        count: sql`count(*)`,
        delivered: c(DELIVERY_STATUS.DELIVERED),
        returned: c(DELIVERY_STATUS.RETURNED),
        cancelled: c(DELIVERY_STATUS.CANCELLED),
      })
      .from(deliveryShipments)
      .leftJoin(deliveryProviders, eq(deliveryShipments.providerId, deliveryProviders.id))
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(deliveryShipments.providerId, deliveryProviders.name, deliveryProviders.code);
    return rows.map((r) => {
      const count = num(r.count);
      const delivered = num(r.delivered);
      const returned = num(r.returned);
      const cancelled = num(r.cancelled);
      const nonCancelled = count - cancelled;
      return {
        providerId: r.providerId,
        providerName: r.providerName,
        providerCode: r.providerCode,
        count,
        delivered,
        returned,
        cancelled,
        successRate: nonCancelled > 0 ? round2((delivered / nonCancelled) * 100) : 0,
        returnRate: delivered > 0 ? round2((returned / delivered) * 100) : 0,
      };
    });
  }

  /** Shipments per day (created_at). */
  async byDate(filters = {}) {
    const db = await getDb();
    const conds = this._baseConds(filters);
    const day = sql`${deliveryShipments.createdAt}::date`;
    const rows = await db
      .select({ day, count: sql`count(*)` })
      .from(deliveryShipments)
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(day)
      .orderBy(day);
    return rows.map((r) => ({ date: ymd(r.day), count: num(r.count) }));
  }

  /** Shipping cost + COD totals, grouped per currency (never summed across). */
  async totalShippingCost(filters = {}) {
    const db = await getDb();
    const conds = this._baseConds(filters);
    const rows = await db
      .select({
        currency: deliveryShipments.currency,
        totalFee: sql`COALESCE(SUM(${deliveryShipments.deliveryFee}::numeric), 0)`,
        totalCod: sql`COALESCE(SUM(${deliveryShipments.codAmount}::numeric), 0)`,
        count: sql`count(*)`,
      })
      .from(deliveryShipments)
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(deliveryShipments.currency);
    return rows.map((r) => ({
      currency: r.currency,
      totalFee: num(r.totalFee),
      totalCod: num(r.totalCod),
      count: num(r.count),
    }));
  }

  /** Non-terminal shipments older than `days` (overdue). Default 3 days. */
  async lateShipments(filters = {}) {
    const db = await getDb();
    const days = Number(filters.days || process.env.DELIVERY_LATE_DAYS || 3);
    const conds = this._baseConds(filters);
    conds.push(notInArray(deliveryShipments.status, DELIVERY_TERMINAL_STATUSES));
    conds.push(sql`${deliveryShipments.createdAt} < now() - make_interval(days => ${days})`);
    const data = await db
      .select({
        id: deliveryShipments.id,
        shipmentNumber: deliveryShipments.shipmentNumber,
        providerName: deliveryProviders.name,
        status: deliveryShipments.status,
        recipientName: deliveryShipments.recipientName,
        recipientPhone: deliveryShipments.recipientPhone,
        province: deliveryShipments.province,
        createdAt: deliveryShipments.createdAt,
        lastSyncedAt: deliveryShipments.lastSyncedAt,
      })
      .from(deliveryShipments)
      .leftJoin(deliveryProviders, eq(deliveryShipments.providerId, deliveryProviders.id))
      .where(and(...conds))
      .orderBy(deliveryShipments.createdAt);
    return { days, data };
  }

  /** Headline KPIs + the building-block breakdowns in one payload. */
  async getOverview(filters = {}) {
    const byStatus = await this.byStatus(filters);
    const statusMap = {};
    let total = 0;
    for (const s of byStatus) {
      statusMap[s.status] = s.count;
      total += s.count;
    }
    const delivered = statusMap[DELIVERY_STATUS.DELIVERED] || 0;
    const returned = statusMap[DELIVERY_STATUS.RETURNED] || 0;
    const cancelled = statusMap[DELIVERY_STATUS.CANCELLED] || 0;
    const failed = statusMap[DELIVERY_STATUS.FAILED] || 0;
    const nonCancelled = total - cancelled;

    const [byProvider, costByCurrency, late] = await Promise.all([
      this.byProvider(filters),
      this.totalShippingCost(filters),
      this.lateShipments(filters),
    ]);

    return {
      filters: {
        dateFrom: ymd(filters.dateFrom),
        dateTo: ymd(filters.dateTo),
        providerId: filters.providerId ? Number(filters.providerId) : null,
        status: filters.status || null,
      },
      summary: {
        total,
        delivered,
        returned,
        cancelled,
        failed,
        lateCount: late.data.length,
        successRate: nonCancelled > 0 ? round2((delivered / nonCancelled) * 100) : 0,
        returnRate: delivered > 0 ? round2((returned / delivered) * 100) : 0,
      },
      byStatus,
      byProvider,
      costByCurrency,
      lateShipments: late.data,
    };
  }
}

export default new DeliveryReportService();
