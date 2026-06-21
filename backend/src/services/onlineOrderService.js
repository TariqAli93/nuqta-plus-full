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
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_RETURNED,
  ORDER_STATUS_CANCELLED,
  ORDER_EDITABLE_STATUSES,
  ORDER_TERMINAL_STATUSES,
  isValidOrderStatus,
  canTransition,
  isSaleBacked,
  statusCommitsSale,
  orderStatusLabel,
} from '../constants/orders.js';
import { normalizeIraqPhone } from '../utils/phone.js';
import { SaleService } from './saleService.js';
import { CustomerService } from './customerService.js';
import { createLogger } from '../utils/logger.js';

const saleService = new SaleService();
const customerService = new CustomerService();

const log = createLogger('OnlineOrderService');

/** Derive the order's payment status (الدفع) from its linked sale totals. */
function derivePaymentStatus(row) {
  // No linked sale yet → nothing to pay against.
  if (!row || row.saleId == null) return 'UNPAID';
  // A fully-returned order shows as refunded regardless of original payment.
  if (row.status === ORDER_STATUS_RETURNED) return 'REFUNDED';
  const total = Number(row.saleTotal) || 0;
  const paid = Number(row.salePaidAmount) || 0;
  if (paid <= 0) return 'UNPAID';
  if (paid + 0.0001 >= total) return 'PAID';
  return 'PARTIAL';
}

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
          customerId: orderData.customerId ?? null,
          customerName: orderData.customerName,
          customerPhone: orderData.customerPhone ?? null,
          customerAddress: orderData.customerAddress ?? null,
          province: orderData.province ?? null,
          notes: orderData.notes ?? null,
          branchId: orderData.branchId ?? null,
          warehouseId: orderData.warehouseId ?? null,
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
    const { page = 1, limit = 20, search, status, channelId, dateFrom, dateTo, branchId, createdBy } =
      filters;

    const conditions = [];
    if (status && isValidOrderStatus(status)) {
      conditions.push(eq(onlineOrders.status, status));
    }
    if (channelId) {
      conditions.push(eq(onlineOrders.channelId, Number(channelId)));
    }
    if (branchId) {
      conditions.push(eq(onlineOrders.branchId, Number(branchId)));
    }
    if (createdBy) {
      conditions.push(eq(onlineOrders.createdBy, Number(createdBy)));
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
        customerId: onlineOrders.customerId,
        customerName: onlineOrders.customerName,
        customerPhone: onlineOrders.customerPhone,
        customerAddress: onlineOrders.customerAddress,
        province: onlineOrders.province,
        notes: onlineOrders.notes,
        branchId: onlineOrders.branchId,
        warehouseId: onlineOrders.warehouseId,
        status: onlineOrders.status,
        totalAmount: onlineOrders.totalAmount,
        createdBy: onlineOrders.createdBy,
        createdAt: onlineOrders.createdAt,
        updatedAt: onlineOrders.updatedAt,
        convertedSaleId: sales.id,
        convertedInvoiceNumber: sales.invoiceNumber,
        // Payment snapshot from the linked sale → drives the order's payment
        // status badge (غير مدفوع / جزئي / مدفوع / مسترجع).
        saleId: sales.id,
        saleTotal: sales.total,
        salePaidAmount: sales.paidAmount,
        saleStatus: sales.status,
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
      data: results.map((row) => ({ ...row, paymentStatus: derivePaymentStatus(row) })),
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
        customerId: onlineOrders.customerId,
        customerName: onlineOrders.customerName,
        customerPhone: onlineOrders.customerPhone,
        customerAddress: onlineOrders.customerAddress,
        province: onlineOrders.province,
        notes: onlineOrders.notes,
        branchId: onlineOrders.branchId,
        warehouseId: onlineOrders.warehouseId,
        status: onlineOrders.status,
        totalAmount: onlineOrders.totalAmount,
        createdBy: onlineOrders.createdBy,
        createdByName: users.fullName,
        createdAt: onlineOrders.createdAt,
        updatedAt: onlineOrders.updatedAt,
        convertedSaleId: sales.id,
        convertedInvoiceNumber: sales.invoiceNumber,
        // Payment snapshot from the linked sale.
        saleId: sales.id,
        saleTotal: sales.total,
        salePaidAmount: sales.paidAmount,
        saleRemainingAmount: sales.remainingAmount,
        saleStatus: sales.status,
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
    order.paymentStatus = derivePaymentStatus(order);

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
        'customerId',
        'customerName',
        'customerPhone',
        'customerAddress',
        'province',
        'notes',
        'branchId',
        'warehouseId',
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
  async updateStatus(id, nextStatus, actingUser = null, note = null, options = {}) {
    const orderId = Number(id);
    const userId = typeof actingUser === 'object' && actingUser !== null ? actingUser.id : actingUser;

    if (!isValidOrderStatus(nextStatus)) {
      throw new ValidationError(`Unknown order status: ${nextStatus}`);
    }

    // Load the full order (items + linked-sale link + branch/warehouse). The
    // financial/stock side effects below run through the proven sales engine in
    // their OWN transactions, so we don't wrap them in the order tx — we sequence
    // them: do the money/stock op first, then flip the order status.
    const order = await this.getById(orderId);

    // Same status → no-op (no history noise).
    if (order.status === nextStatus) return order;
    if (!canTransition(order.status, nextStatus)) {
      throw new ConflictError(
        `لا يمكن نقل الطلب من "${orderStatusLabel(order.status)}" إلى "${orderStatusLabel(nextStatus)}".`
      );
    }

    // ── Side effects via the sales engine ────────────────────────────────────
    let sideNote = null;
    if (statusCommitsSale(nextStatus)) {
      // CONFIRM (مؤكد): create the linked sale → deducts stock (FIFO) with an
      // oversell guard. Idempotent if a sale somehow already exists.
      if (!order.convertedSaleId) {
        const sale = await this._buildAndCreateSale(order, options, actingUser);
        sideNote = `تم تأكيد الطلب وإنشاء الفاتورة ${sale.invoiceNumber} وخصم المخزون`;
      }
    } else if (nextStatus === ORDER_STATUS_CANCELLED && isSaleBacked(order.status)) {
      // CANCEL a confirmed (sale-backed, not yet delivered) order → cancel the
      // linked sale, which restores the deducted stock.
      if (order.convertedSaleId) {
        await saleService.cancel(order.convertedSaleId, userId);
        sideNote = 'تم إلغاء الطلب وإرجاع الكميات إلى المخزون';
      }
    } else if (nextStatus === ORDER_STATUS_RETURNED && order.convertedSaleId) {
      // RETURN (full) → create a sale return for every line, restoring stock and
      // reducing revenue/profit. Partial returns go through returnOrder().
      await this._returnLinkedSaleFull(order.convertedSaleId, actingUser, note);
      sideNote = 'تم إرجاع الطلب بالكامل وإعادة الكميات إلى المخزون';
    }

    // ── Flip the order status + append history (single small transaction) ─────
    await withTransaction(async (tx) => {
      // Re-read inside the tx to guard against a concurrent change.
      const [fresh] = await tx
        .select({ status: onlineOrders.status })
        .from(onlineOrders)
        .where(eq(onlineOrders.id, orderId))
        .limit(1);
      if (!fresh) throw new NotFoundError('Online order');
      if (fresh.status === nextStatus) return; // someone else already moved it

      await tx
        .update(onlineOrders)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(onlineOrders.id, orderId));

      await tx.insert(onlineOrderStatusHistory).values({
        orderId,
        fromStatus: order.status,
        toStatus: nextStatus,
        note: note ?? sideNote ?? null,
        changedBy: userId ?? null,
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
  /**
   * Build the linked sale for an order and create it via SaleService.create()
   * — so the invoice, sale items, FIFO stock deduction (with oversell guard),
   * payment, treasury and GL postings all happen inside the sales engine's own
   * transaction. The sale carries `channelId` (channel origin) and
   * `onlineOrderId` (sale → order link). Double creation is prevented by a
   * pre-check AND the UNIQUE index on sales.online_order_id (race-safe).
   *
   * Shared by the CONFIRM transition (updateStatus) and the legacy convert API.
   * Throws Arabic ValidationError on insufficient stock (oversell guard).
   */
  async _buildAndCreateSale(order, options = {}, user) {
    const userId = typeof user === 'object' && user !== null ? user.id : user;

    if (order.convertedSaleId) {
      const err = new ConflictError(
        `تم تأكيد هذا الطلب مسبقاً وأُنشئت له الفاتورة ${order.convertedInvoiceNumber}.`
      );
      err.code = 'ORDER_ALREADY_CONVERTED';
      throw err;
    }
    if (!order.items || order.items.length === 0) {
      throw new ValidationError('لا يمكن تأكيد طلب لا يحتوي على أي منتجات.');
    }
    // Sales deduct stock per product, so every line must map to a real product.
    const orphan = order.items.find((it) => !it.productId);
    if (orphan) {
      throw new ValidationError(
        `الصنف "${orphan.productName}" غير مرتبط بمنتج في الكتالوج — اربطه بمنتج قبل التأكيد.`
      );
    }

    // Link/create the customer so the invoice + debts carry real customer info.
    // Prefer the explicitly-chosen customer; fall back to phone-based resolve.
    const customerId = order.customerId || (await this._resolveCustomerId(order, userId));

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
      // Prefer the order's stored branch/warehouse; allow an explicit override.
      branchId: options.branchId ?? order.branchId ?? undefined,
      warehouseId: options.warehouseId ?? order.warehouseId ?? undefined,
      notes: `طلب أونلاين ${order.orderNumber}`,
    };

    try {
      return await saleService.create(saleData, user);
    } catch (err) {
      // Race-safe backstop: a concurrent confirm already linked this order.
      if (err?.code === '23505') {
        const conflict = new ConflictError('تم تأكيد هذا الطلب مسبقاً وأُنشئت له فاتورة.');
        conflict.code = 'ORDER_ALREADY_CONVERTED';
        throw conflict;
      }
      throw err; // oversell ValidationError (Arabic) and others bubble up
    }
  }

  /** Create a FULL sale return for every line of the linked sale (restores stock). */
  async _returnLinkedSaleFull(saleId, user, reason = null) {
    const sale = await saleService.getById(saleId);
    const items = (sale.items || [])
      .filter((it) => Number(it.quantity) > 0)
      .map((it) => ({ saleItemId: it.id, quantity: Number(it.quantity) }));
    if (items.length === 0) return null;
    // Refund the paid portion so a fully-paid order can be returned (see
    // returnOrder). For an unpaid order this resolves to 0 (debt write-off only).
    const refundAmount = this._defaultRefundFor(sale, items);
    return saleService.createReturn(
      saleId,
      { items, reason: reason || 'إرجاع طلب أونلاين', refundAmount },
      user
    );
  }

  /**
   * Default cash refund for an online-order return: the customer must be made
   * whole. Remaining debt is written off first; the already-paid remainder of
   * the returned goods' value is refunded. Online sales are cash (no interest),
   * so the goods subtotal is the returned value. Bounded by what was paid.
   */
  _defaultRefundFor(sale, items) {
    const remaining = Number(sale.remainingAmount || 0);
    const paid = Number(sale.paidAmount || 0);
    const valueOf = (it) => {
      const m = (sale.items || []).find(
        (s) =>
          (it.saleItemId != null && s.id === it.saleItemId) ||
          (it.productId != null && s.productId === it.productId)
      );
      if (!m) return 0;
      const qty = Number(m.quantity) || 0;
      const perUnit = qty > 0 ? Number(m.subtotal || 0) / qty : Number(m.unitPrice || 0);
      return perUnit * (Number(it.quantity) || 0);
    };
    const returnedValue = items.reduce((acc, it) => acc + valueOf(it), 0);
    return Math.min(paid, Math.max(0, returnedValue - remaining));
  }

  /**
   * Legacy convert-to-invoice endpoint. Kept for backward compatibility; with
   * the confirm-creates-sale flow this simply ensures a sale exists for an
   * already-confirmed order. Prefer moving the order to CONFIRMED instead.
   */
  async convertToSale(id, options = {}, user) {
    const orderId = Number(id);
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const db = await getDb();

    const order = await this.getById(orderId);
    const sale = await this._buildAndCreateSale(order, options, user);

    try {
      await db.insert(onlineOrderStatusHistory).values({
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        note: `تم إنشاء الفاتورة ${sale.invoiceNumber}`,
        changedBy: userId ?? null,
      });
      saveDatabase();
    } catch (err) {
      log.warn('Sale created but status-history note failed', err);
    }

    return { sale, order: await this.getById(orderId) };
  }

  /**
   * Partial (or full) return against a confirmed/delivered online order. Maps
   * the requested items onto the linked sale and delegates to
   * SaleService.createReturn — which restores stock and reduces revenue/profit.
   * When the whole order is returned, the order status moves to RETURNED.
   */
  async returnOrder(id, returnData, user) {
    const orderId = Number(id);
    const userId = typeof user === 'object' && user !== null ? user.id : user;
    const order = await this.getById(orderId);

    if (!order.convertedSaleId) {
      throw new ConflictError('لا يمكن إرجاع طلب لم يُؤكَّد بعد (لا توجد فاتورة مرتبطة).');
    }
    if (!isSaleBacked(order.status)) {
      throw new ConflictError('لا يمكن إرجاع الطلب في حالته الحالية.');
    }
    if (!Array.isArray(returnData.items) || returnData.items.length === 0) {
      throw new ValidationError('يجب تحديد صنف واحد على الأقل للإرجاع.');
    }

    const items = returnData.items.map((it) => ({
      saleItemId: it.saleItemId ?? undefined,
      productId: it.productId ?? undefined,
      quantity: Number(it.quantity),
    }));
    // A confirmed order's sale is paid in full at confirm time, so a return must
    // refund the customer (remaining debt is 0). Default the refund to the
    // paid-back portion when the caller didn't specify one — otherwise the sale
    // engine rejects the return (returned value exceeds debt + refund).
    const refundAmount =
      returnData.refundAmount != null
        ? returnData.refundAmount
        : this._defaultRefundFor(await saleService.getById(order.convertedSaleId), items);

    const result = await saleService.createReturn(
      order.convertedSaleId,
      {
        items,
        reason: returnData.reason || 'إرجاع طلب أونلاين',
        refundAmount,
        refundMethod: returnData.refundMethod,
        refundReference: returnData.refundReference,
      },
      user
    );

    // If everything sold has now been returned, flip the order to RETURNED.
    // Returned-per-line is summed from the sale's return records (getById →
    // `returns[].items[]`), so we don't depend on a derived per-item field.
    const sale = await saleService.getById(order.convertedSaleId);
    const returnedByItem = {};
    for (const ret of sale.returns || []) {
      for (const it of ret.items || []) {
        if (it.saleItemId == null) continue;
        returnedByItem[it.saleItemId] =
          (returnedByItem[it.saleItemId] || 0) + Number(it.quantity || 0);
      }
    }
    const fullyReturned =
      Array.isArray(sale.items) &&
      sale.items.length > 0 &&
      sale.items.every(
        (it) => (returnedByItem[it.id] || 0) >= Number(it.quantity || 0)
      );

    if (fullyReturned && order.status !== ORDER_STATUS_RETURNED) {
      await withTransaction(async (tx) => {
        await tx
          .update(onlineOrders)
          .set({ status: ORDER_STATUS_RETURNED, updatedAt: new Date() })
          .where(eq(onlineOrders.id, orderId));
        await tx.insert(onlineOrderStatusHistory).values({
          orderId,
          fromStatus: order.status,
          toStatus: ORDER_STATUS_RETURNED,
          note: 'إرجاع كامل للطلب',
          changedBy: userId ?? null,
        });
        saveDatabase();
      });
    }

    return { return: result, order: await this.getById(orderId) };
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
