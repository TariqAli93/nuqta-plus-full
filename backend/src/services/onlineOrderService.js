import { getDb, getPool, saveDatabase } from '../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  onlineOrders,
  onlineOrderItems,
  onlineOrderStatusHistory,
  salesChannels,
  sales,
  customers,
  users,
} from '../models/index.js';
import * as schema from '../models/index.js';
import { and, eq, or, like, asc, desc, sql, gte, lte } from 'drizzle-orm';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AppError,
  translateDbConstraintError,
} from '../utils/errors.js';
import {
  ORDER_STATUS_DEFAULT,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_PROCESSING,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_RETURNED,
  ORDER_STATUS_CANCELLED,
  ORDER_EDITABLE_STATUSES,
  isValidOrderStatus,
  canTransition,
} from '../constants/orders.js';

// Order states that can't be transitioned away from by an automated sync.
const ORDER_TERMINAL_STATUSES = [
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_RETURNED,
  ORDER_STATUS_CANCELLED,
];
import { normalizeIraqPhone } from '../utils/phone.js';
import { SaleService } from './saleService.js';
import { CustomerService } from './customerService.js';
import { createLogger } from '../utils/logger.js';

const saleService = new SaleService();
const customerService = new CustomerService();

// An order can be turned into an invoice only while it is CONFIRMED or
// PROCESSING — before it ships and after it's been verified.
const CONVERTIBLE_STATUSES = [ORDER_STATUS_CONFIRMED, ORDER_STATUS_PROCESSING];

const log = createLogger('OnlineOrderService');

async function withTransaction(callback) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txDb = drizzle(client, { schema });
    const result = await callback(txDb);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  finally {
    client.release();
  }
}

const money = (v) => (Number(v) || 0).toFixed(4);

/** Normalise an incoming item and compute its line subtotal (qty × unitPrice). */
function buildItemRow(orderId, item) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  return {
    orderId,
    productId: item.productId ?? null,
    productName: item.productName,
    productSku: item.productSku ?? null,
    quantity,
    unitPrice: money(unitPrice),
    subtotal: money(quantity * unitPrice),
    notes: item.notes ?? null,
  };
}

export class OnlineOrderService {
  /**
   * Create an order (with optional line items) in one transaction. The total
   * is authoritative — Σ item subtotals when items exist, else the provided
   * `totalAmount`. `order_number` and `status` are filled by the DB default.
   */
  async create(orderData, userId) {
    const items = Array.isArray(orderData.items) ? orderData.items : [];

    const computedTotal = items.reduce(
      (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
      0
    );
    const total = items.length > 0 ? computedTotal : Number(orderData.totalAmount) || 0;

    return withTransaction(async (tx) => {
      // order_number + status fall to their DB defaults (sequence / 'NEW').
      const [order] = await tx
        .insert(onlineOrders)
        .values({
          channelId: orderData.channelId,
          customerName: orderData.customerName,
          customerPhone: orderData.customerPhone ?? null,
          customerAddress: orderData.customerAddress ?? null,
          province: orderData.province ?? null,
          notes: orderData.notes ?? null,
          totalAmount: money(total),
          createdBy: userId ?? null,
        })
        .returning();

      let itemRows = [];
      if (items.length > 0) {
        itemRows = await tx
          .insert(onlineOrderItems)
          .values(items.map((it) => buildItemRow(order.id, it)))
          .returning();
      }

      // Seed the status history with the creation record (NULL → 'NEW').
      await tx.insert(onlineOrderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: order.status,
        note: 'تم إنشاء الطلب',
        changedBy: userId ?? null,
      });

      saveDatabase();
      return { ...order, items: itemRows };
    });
  }

  async getAll(filters = {}) {
    const db = await getDb();
    const { page = 1, limit = 20, search, status, channelId, dateFrom, dateTo } = filters;

    const conditions = [];
    if (status && isValidOrderStatus(status)) {
      conditions.push(eq(onlineOrders.status, status));
    }
    if (channelId) {
      conditions.push(eq(onlineOrders.channelId, Number(channelId)));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        or(
          like(onlineOrders.orderNumber, term),
          like(onlineOrders.customerName, term),
          like(onlineOrders.customerPhone, term)
        )
      );
    }
    // Inclusive date range on the creation day. Casting the timestamp to ::date
    // sidesteps time-of-day / timezone edge cases (same pattern as the rest of
    // the codebase) so dateTo includes the whole day.
    if (dateFrom) {
      conditions.push(gte(sql`${onlineOrders.createdAt}::date`, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(sql`${onlineOrders.createdAt}::date`, dateTo));
    }
    const where =
      conditions.length === 0 ? null : conditions.length === 1 ? conditions[0] : and(...conditions);

    let query = db
      .select({
        id: onlineOrders.id,
        orderNumber: onlineOrders.orderNumber,
        channelId: onlineOrders.channelId,
        channelName: salesChannels.name,
        channelColor: salesChannels.color,
        channelIcon: salesChannels.icon,
        customerName: onlineOrders.customerName,
        customerPhone: onlineOrders.customerPhone,
        customerAddress: onlineOrders.customerAddress,
        province: onlineOrders.province,
        notes: onlineOrders.notes,
        status: onlineOrders.status,
        totalAmount: onlineOrders.totalAmount,
        createdBy: onlineOrders.createdBy,
        createdAt: onlineOrders.createdAt,
        updatedAt: onlineOrders.updatedAt,
        convertedSaleId: sales.id,
        convertedInvoiceNumber: sales.invoiceNumber,
      })
      .from(onlineOrders)
      .leftJoin(salesChannels, eq(onlineOrders.channelId, salesChannels.id))
      .leftJoin(sales, eq(sales.onlineOrderId, onlineOrders.id));
    if (where) query = query.where(where);

    let countQuery = db.select({ count: sql`count(*)` }).from(onlineOrders);
    if (where) countQuery = countQuery.where(where);
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    const results = await query
      .orderBy(desc(onlineOrders.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: results,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id) {
    const db = await getDb();

    const [order] = await db
      .select({
        id: onlineOrders.id,
        orderNumber: onlineOrders.orderNumber,
        channelId: onlineOrders.channelId,
        channelName: salesChannels.name,
        channelColor: salesChannels.color,
        channelIcon: salesChannels.icon,
        customerName: onlineOrders.customerName,
        customerPhone: onlineOrders.customerPhone,
        customerAddress: onlineOrders.customerAddress,
        province: onlineOrders.province,
        notes: onlineOrders.notes,
        status: onlineOrders.status,
        totalAmount: onlineOrders.totalAmount,
        createdBy: onlineOrders.createdBy,
        createdByName: users.fullName,
        createdAt: onlineOrders.createdAt,
        updatedAt: onlineOrders.updatedAt,
        convertedSaleId: sales.id,
        convertedInvoiceNumber: sales.invoiceNumber,
      })
      .from(onlineOrders)
      .leftJoin(salesChannels, eq(onlineOrders.channelId, salesChannels.id))
      .leftJoin(users, eq(onlineOrders.createdBy, users.id))
      .leftJoin(sales, eq(sales.onlineOrderId, onlineOrders.id))
      .where(eq(onlineOrders.id, Number(id)))
      .limit(1);

    if (!order) {
      throw new NotFoundError('Online order');
    }

    const items = await db
      .select()
      .from(onlineOrderItems)
      .where(eq(onlineOrderItems.orderId, order.id))
      .orderBy(onlineOrderItems.id);

    const history = await db
      .select({
        id: onlineOrderStatusHistory.id,
        fromStatus: onlineOrderStatusHistory.fromStatus,
        toStatus: onlineOrderStatusHistory.toStatus,
        note: onlineOrderStatusHistory.note,
        changedBy: onlineOrderStatusHistory.changedBy,
        changedByName: users.fullName,
        createdAt: onlineOrderStatusHistory.createdAt,
      })
      .from(onlineOrderStatusHistory)
      .leftJoin(users, eq(onlineOrderStatusHistory.changedBy, users.id))
      .where(eq(onlineOrderStatusHistory.orderId, order.id))
      .orderBy(asc(onlineOrderStatusHistory.createdAt), asc(onlineOrderStatusHistory.id));

    return { ...order, items, history };
  }

  /**
   * Update an order's header fields (and optionally replace its items). Only
   * permitted while the order is still editable (pre-fulfilment). To change
   * the workflow state use `updateStatus`.
   */
  async update(id, orderData) {
    const orderId = Number(id);

    return withTransaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(onlineOrders)
        .where(eq(onlineOrders.id, orderId))
        .limit(1);
      if (!existing) {
        throw new NotFoundError('Online order');
      }
      // A converted order is frozen — editing it would desync from the invoice.
      const [linkedSale] = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(eq(sales.onlineOrderId, orderId))
        .limit(1);
      if (linkedSale) {
        throw new ConflictError('لا يمكن تعديل الطلب بعد تحويله إلى فاتورة.');
      }
      if (!ORDER_EDITABLE_STATUSES.includes(existing.status)) {
        throw new ConflictError(
          `لا يمكن تعديل الطلب بعد أن أصبحت حالته "${existing.status}".`
        );
      }

      const setPayload = { updatedAt: new Date() };
      for (const field of [
        'channelId',
        'customerName',
        'customerPhone',
        'customerAddress',
        'province',
        'notes',
      ]) {
        if (Object.prototype.hasOwnProperty.call(orderData, field)) {
          setPayload[field] = orderData[field] ?? null;
        }
      }

      // Replacing items: wipe and re-insert, then recompute the total.
      let items;
      if (Array.isArray(orderData.items)) {
        await tx.delete(onlineOrderItems).where(eq(onlineOrderItems.orderId, orderId));
        if (orderData.items.length > 0) {
          items = await tx
            .insert(onlineOrderItems)
            .values(orderData.items.map((it) => buildItemRow(orderId, it)))
            .returning();
        } else {
          items = [];
        }
        const total = orderData.items.reduce(
          (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
          0
        );
        setPayload.totalAmount = money(total);
      } else if (Object.prototype.hasOwnProperty.call(orderData, 'totalAmount')) {
        setPayload.totalAmount = money(orderData.totalAmount);
      }

      const [updated] = await tx
        .update(onlineOrders)
        .set(setPayload)
        .where(eq(onlineOrders.id, orderId))
        .returning();

      if (items === undefined) {
        items = await tx
          .select()
          .from(onlineOrderItems)
          .where(eq(onlineOrderItems.orderId, orderId))
          .orderBy(onlineOrderItems.id);
      }

      saveDatabase();
      return { ...updated, items };
    });
  }

  /**
   * Move the order to a new status, enforcing the allowed-transition map, and
   * append a status-history record — both in one transaction so history can
   * never drift from the order's status. An invalid transition is rejected
   * with a 409 and nothing is written.
   */
  async updateStatus(id, nextStatus, changedBy = null, note = null) {
    const orderId = Number(id);

    if (!isValidOrderStatus(nextStatus)) {
      throw new ValidationError(`Unknown order status: ${nextStatus}`);
    }

    await withTransaction(async (tx) => {
      const [existing] = await tx
        .select({ status: onlineOrders.status })
        .from(onlineOrders)
        .where(eq(onlineOrders.id, orderId))
        .limit(1);
      if (!existing) {
        throw new NotFoundError('Online order');
      }

      // Same status → no-op (and no history noise).
      if (existing.status === nextStatus) {
        return;
      }
      if (!canTransition(existing.status, nextStatus)) {
        throw new ConflictError(
          `لا يمكن نقل الطلب من "${existing.status}" إلى "${nextStatus}".`
        );
      }

      await tx
        .update(onlineOrders)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(onlineOrders.id, orderId));

      await tx.insert(onlineOrderStatusHistory).values({
        orderId,
        fromStatus: existing.status,
        toStatus: nextStatus,
        note: note ?? null,
        changedBy: changedBy ?? null,
      });

      saveDatabase();
    });

    return this.getById(orderId);
  }

  /**
   * Authoritative status sync driven by a delivery shipment. The courier is the
   * source of truth for physical delivery, so this BYPASSES the normal forward
   * transition map — a DELIVERED/RETURNED shipment moves the order to the
   * matching status from ANY non-terminal state (it can't, however, override an
   * already-terminal order). Idempotent: a no-op when already at the target.
   * Still records a status-history row, in the same transaction.
   *
   * @returns {boolean} true if a transition was applied, false if skipped.
   */
  async syncStatusFromShipment(id, targetStatus, changedBy = null, note = null) {
    const orderId = Number(id);
    if (![ORDER_STATUS_DELIVERED, ORDER_STATUS_RETURNED].includes(targetStatus)) {
      throw new ValidationError(`Unsupported shipment→order status: ${targetStatus}`);
    }

    return withTransaction(async (tx) => {
      const [existing] = await tx
        .select({ status: onlineOrders.status })
        .from(onlineOrders)
        .where(eq(onlineOrders.id, orderId))
        .limit(1);
      if (!existing) return false; // order vanished — nothing to sync

      // Idempotent: already at target.
      if (existing.status === targetStatus) return false;
      // Never resurrect / flip a terminal order (CANCELLED/DELIVERED/RETURNED).
      if (ORDER_TERMINAL_STATUSES.includes(existing.status)) return false;

      await tx
        .update(onlineOrders)
        .set({ status: targetStatus, updatedAt: new Date() })
        .where(eq(onlineOrders.id, orderId));

      await tx.insert(onlineOrderStatusHistory).values({
        orderId,
        fromStatus: existing.status,
        toStatus: targetStatus,
        note: note ?? 'تحديث تلقائي من حالة الشحنة',
        changedBy: changedBy ?? null,
      });

      saveDatabase();
      return true;
    });
  }

  /**
   * Find or create the customer that an online order's contact details map to,
   * so the resulting invoice carries real customer information (req #5). Matches
   * on normalised Iraq phone first; otherwise creates a new customer record.
   * Returns the customer id (or null when the order has neither name nor phone).
   */
  async _resolveCustomerId(order, userId) {
    const db = await getDb();
    const normalized = normalizeIraqPhone(order.customerPhone);
    if (normalized) {
      const [existing] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.normalizedPhone, normalized))
        .limit(1);
      if (existing) return existing.id;
    }
    const created = await customerService.create(
      {
        name: order.customerName,
        phone: order.customerPhone || null,
        address: order.customerAddress || null,
        city: order.province || null,
        // We already looked for an existing match above; never block on dupes.
        allowDuplicatePhone: true,
      },
      userId
    );
    return created.id;
  }

  /**
   * Convert an online order into a real sale invoice.
   *
   * Reuses SaleService.create() unchanged — so the invoice, sale items, stock
   * deduction, payment, treasury and GL postings all happen inside that
   * service's own transaction (req: "use existing sales services" + "use
   * transactions"). The sale carries `channelId` (preserves the channel source)
   * and `onlineOrderId` (links sale → order). Double conversion is prevented by
   * a pre-check AND the UNIQUE index on sales.online_order_id (race-safe).
   *
   * @param {number} id        online order id
   * @param {object} options   optional payment/branch overrides for the sale
   * @param {object} user      acting user
   */
  async convertToSale(id, options = {}, user) {
    const orderId = Number(id);
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const db = await getDb();

    const order = await this.getById(orderId); // includes items + converted link

    // ── Guards ──────────────────────────────────────────────────────────────
    if (order.convertedSaleId) {
      const err = new ConflictError(
        `تم تحويل هذا الطلب مسبقاً إلى الفاتورة ${order.convertedInvoiceNumber}.`
      );
      err.code = 'ORDER_ALREADY_CONVERTED';
      throw err;
    }
    if (!CONVERTIBLE_STATUSES.includes(order.status)) {
      throw new ConflictError(
        `لا يمكن إنشاء فاتورة لطلب حالته "${order.status}" — يجب أن يكون الطلب مؤكداً أو قيد التجهيز.`
      );
    }
    if (!order.items || order.items.length === 0) {
      throw new ValidationError('لا يمكن تحويل طلب لا يحتوي على أي منتجات.');
    }
    // Sales deduct stock per product, so every line must map to a real product.
    const orphan = order.items.find((it) => !it.productId);
    if (orphan) {
      throw new ValidationError(
        `الصنف "${orphan.productName}" غير مرتبط بمنتج في الكتالوج — لا يمكن تحويله.`
      );
    }

    // Preserve customer information by linking/creating a customer (req #5).
    const customerId = await this._resolveCustomerId(order, userId);

    // Build the sale payload from the order. The channel + order link are
    // stamped on the sale; payment defaults to unpaid unless the caller passes
    // payment details. saleSource stays null so the POS feature gate is skipped.
    const saleData = {
      customerId,
      channelId: order.channelId || null,
      onlineOrderId: order.id,
      saleType: 'CASH',
      paymentType: 'cash',
      items: order.items.map((it) => ({
        productId: it.productId,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        unitId: null,
      })),
      currency: options.currency || undefined,
      paidAmount: Number(options.paidAmount) || 0,
      paymentMethod: options.paymentMethod || 'cash',
      paymentReference: options.paymentReference || null,
      branchId: options.branchId,
      warehouseId: options.warehouseId,
      notes: `محوّل من الطلب الأونلاين ${order.orderNumber}`,
    };

    let sale;
    try {
      sale = await saleService.create(saleData, user);
    } catch (err) {
      // Race-safe backstop: a concurrent conversion already linked this order.
      if (err?.code === '23505') {
        const conflict = new ConflictError('تم تحويل هذا الطلب مسبقاً إلى فاتورة.');
        conflict.code = 'ORDER_ALREADY_CONVERTED';
        throw conflict;
      }
      throw err;
    }

    // Audit the conversion in the order's status history (status itself is left
    // to the delivery workflow — conversion is an orthogonal event).
    try {
      await db.insert(onlineOrderStatusHistory).values({
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        note: `تم التحويل إلى الفاتورة ${sale.invoiceNumber}`,
        changedBy: userId ?? null,
      });
      saveDatabase();
    } catch (err) {
      // The sale (and its link) already committed — a history-note failure must
      // not fail the conversion. Log and move on.
      log.warn('Conversion succeeded but status-history note failed', err);
    }

    return { sale, order: await this.getById(orderId) };
  }

  async delete(id) {
    const db = await getDb();
    const orderId = Number(id);

    // A converted order is part of the financial record — block deletion so the
    // invoice never loses its origin.
    const [linkedSale] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.onlineOrderId, orderId))
      .limit(1);
    if (linkedSale) {
      throw new ConflictError('لا يمكن حذف الطلب بعد تحويله إلى فاتورة.');
    }

    try {
      // Items + status history cascade via their FKs.
      const [deleted] = await db
        .delete(onlineOrders)
        .where(eq(onlineOrders.id, orderId))
        .returning();
      if (!deleted) {
        throw new NotFoundError('Online order');
      }
      saveDatabase();
      return { message: 'Online order deleted successfully' };
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error('Delete of online order failed', err);
      throw (
        translateDbConstraintError(err, {
          fkMessage: 'لا يمكن حذف هذا الطلب لأنه مرتبط ببيانات أخرى مسجلة داخل النظام.',
        }) || new AppError('تعذّر حذف الطلب بسبب خطأ غير متوقع. يرجى المحاولة مرة أخرى.', 500)
      );
    }
  }
}

export const ORDER_DEFAULT_STATUS = ORDER_STATUS_DEFAULT;
