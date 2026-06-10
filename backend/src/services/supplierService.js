import { getDb } from '../db.js';
import {
  suppliers,
  purchaseInvoices,
  purchaseReturns,
  vouchers,
  products,
} from '../models/index.js';
import { and, asc, desc, eq, gt, ilike, ne, or, sql } from 'drizzle-orm';
import featureFlagsService from './featureFlagsService.js';
import { normalizeIraqPhone } from '../utils/phone.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

function n(v) {
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

/**
 * Suppliers (الموردون) — master data + AP (الذمم الدائنة).
 *
 * `suppliers.totalDebt` / `totalPurchases` are CACHES maintained by
 * purchaseService inside its transactions; the authoritative AP for a
 * supplier is Σ purchase_invoices.remaining_amount WHERE status != 'cancelled'
 * (see getDebts / getStatement).
 */
export class SupplierService {
  async create(input, user) {
    await featureFlagsService.requireFeature('suppliers');
    const name = String(input.name || '').trim();
    if (!name) throw new ValidationError('اسم المورد مطلوب');

    const db = await getDb();
    const [existing] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.name, name))
      .limit(1);
    if (existing) throw new ConflictError('يوجد مورد بهذا الاسم مسبقاً');

    const [row] = await db
      .insert(suppliers)
      .values({
        name,
        phone: input.phone || null,
        normalizedPhone: input.phone ? normalizeIraqPhone(input.phone) : null,
        address: input.address || null,
        city: input.city || null,
        notes: input.notes || null,
        isActive: true,
        createdBy: user?.id || null,
      })
      .returning();
    return this.serialize(row);
  }

  async update(id, input, user) {
    const existing = await this.getById(id);
    const db = await getDb();
    const patch = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new ValidationError('اسم المورد مطلوب');
      if (name !== existing.name) {
        const [dup] = await db
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(and(eq(suppliers.name, name), ne(suppliers.id, Number(id))))
          .limit(1);
        if (dup) throw new ConflictError('يوجد مورد بهذا الاسم مسبقاً');
      }
      patch.name = name;
    }
    if (input.phone !== undefined) {
      patch.phone = input.phone || null;
      patch.normalizedPhone = input.phone ? normalizeIraqPhone(input.phone) : null;
    }
    if (input.address !== undefined) patch.address = input.address || null;
    if (input.city !== undefined) patch.city = input.city || null;
    if (input.notes !== undefined) patch.notes = input.notes || null;
    if (input.isActive !== undefined) patch.isActive = !!input.isActive;

    const [row] = await db
      .update(suppliers)
      .set(patch)
      .where(eq(suppliers.id, Number(id)))
      .returning();
    return this.serialize(row);
  }

  async getById(id) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, Number(id)))
      .limit(1);
    if (!row) throw new NotFoundError('Supplier');
    return this.serialize(row);
  }

  async getAll(filters = {}) {
    const db = await getDb();
    const { page = 1, limit = 25, search, hasDebt, includeInactive } = filters;
    const conds = [];
    if (includeInactive !== true) conds.push(eq(suppliers.isActive, true));
    if (search) {
      const like = `%${String(search).trim()}%`;
      conds.push(or(ilike(suppliers.name, like), ilike(suppliers.phone, like)));
    }
    if (hasDebt === true) conds.push(gt(suppliers.totalDebt, '0'));

    const where = conds.length ? and(...conds) : undefined;
    const [countRow] = await db
      .select({ count: sql`COUNT(*)` })
      .from(suppliers)
      .where(where);
    const total = Number(countRow?.count || 0);

    const rows = await db
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(asc(suppliers.name))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows.map((r) => this.serialize(r)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Authoritative AP debts per supplier: open purchase invoices with their
   * remaining amounts (per currency).
   */
  async getDebts(supplierId) {
    const db = await getDb();
    await this.getById(supplierId); // existence

    const invoices = await db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        total: purchaseInvoices.total,
        paidAmount: purchaseInvoices.paidAmount,
        remainingAmount: purchaseInvoices.remainingAmount,
        currency: purchaseInvoices.currency,
        isOpeningBalance: purchaseInvoices.isOpeningBalance,
      })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.supplierId, Number(supplierId)),
          ne(purchaseInvoices.status, 'cancelled'),
          sql`${purchaseInvoices.remainingAmount}::numeric > 0`
        )
      )
      .orderBy(asc(purchaseInvoices.invoiceDate));

    const byCurrency = {};
    for (const inv of invoices) {
      byCurrency[inv.currency] = (byCurrency[inv.currency] || 0) + n(inv.remainingAmount);
    }

    return {
      invoices: invoices.map((i) => ({
        ...i,
        total: n(i.total),
        paidAmount: n(i.paidAmount),
        remainingAmount: n(i.remainingAmount),
      })),
      totalsByCurrency: byCurrency,
    };
  }

  /**
   * Supplier statement (كشف حساب المورد): chronological purchases, returns
   * and payments with running balance per currency.
   */
  async getStatement(supplierId, { dateFrom, dateTo } = {}) {
    const db = await getDb();
    const supplier = await this.getById(supplierId);
    const entries = [];

    const invConds = [
      eq(purchaseInvoices.supplierId, Number(supplierId)),
      ne(purchaseInvoices.status, 'cancelled'),
    ];
    if (dateFrom) invConds.push(sql`${purchaseInvoices.invoiceDate} >= ${dateFrom}`);
    if (dateTo) invConds.push(sql`${purchaseInvoices.invoiceDate} <= ${dateTo}`);
    const invoices = await db.select().from(purchaseInvoices).where(and(...invConds));
    for (const inv of invoices) {
      entries.push({
        kind: 'purchase',
        id: inv.id,
        number: inv.invoiceNumber,
        date: inv.invoiceDate,
        createdAt: inv.createdAt,
        description: inv.isOpeningBalance ? 'رصيد افتتاحي' : 'فاتورة شراء',
        debit: 0,
        credit: n(inv.total), // we owe the supplier more
        cashPaid: n(inv.paidAmount),
        currency: inv.currency,
      });
      // The cash part paid at receipt time reduces what we owe immediately.
      if (n(inv.paidAmount) > 0) {
        entries.push({
          kind: 'purchase_payment_at_receipt',
          id: inv.id,
          number: inv.invoiceNumber,
          date: inv.invoiceDate,
          createdAt: inv.createdAt,
          description: 'دفعة عند الاستلام',
          debit: n(inv.paidAmount),
          credit: 0,
          currency: inv.currency,
        });
      }
    }

    const retConds = [eq(purchaseReturns.supplierId, Number(supplierId))];
    const returns = await db.select().from(purchaseReturns).where(and(...retConds));
    for (const ret of returns) {
      if (n(ret.debtReduction) > 0) {
        entries.push({
          kind: 'purchase_return',
          id: ret.id,
          number: ret.returnNumber,
          date: ret.createdAt ? new Date(ret.createdAt).toISOString().slice(0, 10) : null,
          createdAt: ret.createdAt,
          description: 'مرتجع شراء (خصم من الذمة)',
          debit: n(ret.debtReduction),
          credit: 0,
          currency: ret.currency,
        });
      }
    }

    // Supplier payment vouchers AFTER receipt (سند صرف لمورد).
    const paymentVouchers = await db
      .select()
      .from(vouchers)
      .where(
        and(
          eq(vouchers.supplierId, Number(supplierId)),
          eq(vouchers.voucherType, 'payment'),
          eq(vouchers.status, 'active'),
          eq(vouchers.sourceType, 'purchase_payment')
        )
      );
    for (const v of paymentVouchers) {
      entries.push({
        kind: 'supplier_payment',
        id: v.id,
        number: v.voucherNumber,
        date: v.voucherDate,
        createdAt: v.createdAt,
        description: 'دفعة لمورد',
        debit: n(v.amount),
        credit: 0,
        currency: v.currency,
      });
    }

    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    const running = {};
    for (const e of entries) {
      running[e.currency] = (running[e.currency] || 0) + e.credit - e.debit;
      e.runningBalance = running[e.currency];
    }

    return { supplier, entries, balancesByCurrency: running };
  }

  /** Products supplied by this supplier (via the structured FK). */
  async getProducts(supplierId) {
    const db = await getDb();
    return db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        costPrice: products.costPrice,
        sellingPrice: products.sellingPrice,
        currency: products.currency,
        stock: products.stock,
      })
      .from(products)
      .where(and(eq(products.supplierId, Number(supplierId)), eq(products.isActive, true)))
      .orderBy(asc(products.name));
  }

  async delete(id) {
    const db = await getDb();
    await this.getById(id);
    // Suppliers with purchase history are deactivated, never hard-deleted —
    // invoices keep their FK and history stays reportable.
    const [hasInvoices] = await db
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.supplierId, Number(id)))
      .limit(1);
    if (hasInvoices) {
      await db
        .update(suppliers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(suppliers.id, Number(id)));
      return { success: true, deactivated: true, message: 'تم تعطيل المورد (لديه فواتير مسجلة)' };
    }
    await db.delete(suppliers).where(eq(suppliers.id, Number(id)));
    return { success: true, deactivated: false, message: 'تم حذف المورد' };
  }

  serialize(row) {
    return {
      ...row,
      totalPurchases: n(row.totalPurchases),
      totalDebt: n(row.totalDebt),
    };
  }
}

export default new SupplierService();
