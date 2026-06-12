import { getDb, getPool } from '../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../models/index.js';
import {
  suppliers,
  purchaseInvoices,
  purchaseItems,
  purchaseReturns,
  purchaseReturnItems,
  products,
  branches,
  warehouses,
  users,
  vouchers,
} from '../models/index.js';
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { branchFilterFor, enforceBranchScope, isGlobalAdmin } from './scopeService.js';
import accountingPeriodService from './accountingPeriodService.js';
import featureFlagsService from './featureFlagsService.js';
import voucherService from './voucherService.js';
import glPostingService from './gl/glPostingService.js';
import { InventoryService } from './inventoryService.js';
import { resolveUnitSnapshot } from './productUnitService.js';
import { allocateDocumentNumber } from './documentSequenceService.js';
import {
  ensureDefaultBranch,
  getEffectiveWarehouseId,
} from './systemDefaultsService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

function n(v) {
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
  } finally {
    client.release();
  }
}

/**
 * Purchase invoices (فواتير الشراء) — the procurement mirror of saleService.
 *
 * Lifecycle: created as 'received' (goods hit stock immediately — no draft
 * stage in v1) → optionally 'cancelled' (only while its FIFO batches are
 * untouched). Returns live in purchase_returns and never mutate the invoice
 * total. Supplier payments are payment vouchers (سند صرف) and flow through
 * voucherService so cashbox balances stay correct.
 */
export class PurchaseService {
  /**
   * Create + receive a purchase invoice.
   *
   * items[]: {productId, quantity, unitCost (per purchased unit), discount?,
   *           unitId?, expiryDate?}
   */
  async create(input, user) {
    await featureFlagsService.requireFeature('purchases');

    const supplierId = Number(input.supplierId);
    if (!supplierId) throw new ValidationError('المورد مطلوب');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new ValidationError('فاتورة الشراء تحتاج صنفاً واحداً على الأقل');
    }

    const db = await getDb();
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);
    if (!supplier) throw new NotFoundError('Supplier');
    if (supplier.isActive === false) throw new ValidationError('المورد معطل');

    // Branch/warehouse resolution mirrors expenses/sales conventions.
    let branchId;
    if (isGlobalAdmin(user)) {
      branchId = input.branchId ? Number(input.branchId) : await ensureDefaultBranch();
    } else {
      branchId = user?.assignedBranchId || (await ensureDefaultBranch());
    }
    const warehouseId = await getEffectiveWarehouseId({
      warehouseId: input.warehouseId ? Number(input.warehouseId) : null,
      actingUser: user,
    });

    const accountingPeriodId = await accountingPeriodService.resolvePeriodIdForWrite(
      user,
      branchId,
      { require: true, message: 'لا يمكن تسجيل فاتورة شراء — لا يوجد قيد محاسبي مفتوح' }
    );

    const currency = String(input.currency || 'IQD').toUpperCase();
    const exchangeRate = Number(input.exchangeRate) || 1;
    const paymentType = input.paymentType === 'credit' ? 'credit' : 'cash';

    return await withTransaction(async (tx) => {
      // Resolve units + compute totals first so validation fails before any write.
      let subtotal = 0;
      const resolved = [];
      for (const item of input.items) {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);
        const unitCost = Number(item.unitCost);
        if (!productId) throw new ValidationError('صنف بدون منتج');
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new ValidationError('كمية غير صالحة في أحد الأصناف');
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new ValidationError('كلفة غير صالحة في أحد الأصناف');
        }

        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);
        if (!product) throw new ValidationError(`المنتج ${productId} غير موجود`);

        const unit = await resolveUnitSnapshot(tx, productId, item.unitId || null);
        const baseQty = Math.round(quantity * unit.conversionFactor);
        if (!Number.isInteger(baseQty) || baseQty <= 0) {
          throw new ValidationError('الكمية المحوّلة للوحدة الأساسية غير صالحة');
        }

        const itemDiscount = (Number(item.discount) || 0) * quantity;
        const itemSubtotal = quantity * unitCost - itemDiscount;
        subtotal += itemSubtotal;

        resolved.push({
          product,
          unit,
          productId,
          quantity,
          unitCost,
          itemDiscount,
          itemSubtotal,
          baseQty,
          expiryDate: item.expiryDate || null,
        });
      }

      const discount = Number(input.discount) || 0;
      const tax = Number(input.tax) || 0;
      const total = Math.max(0, subtotal - discount + tax);

      let paidAmount;
      if (paymentType === 'cash') {
        paidAmount = input.paidAmount != null ? Number(input.paidAmount) : total;
      } else {
        paidAmount = Number(input.paidAmount) || 0;
      }
      paidAmount = Math.min(Math.max(0, paidAmount), total);
      const remainingAmount = Math.max(0, total - paidAmount);

      const { number } = await allocateDocumentNumber(tx, { docType: 'purchase', branchId });

      const [invoice] = await tx
        .insert(purchaseInvoices)
        .values({
          invoiceNumber: number,
          supplierId,
          supplierInvoiceNumber: input.supplierInvoiceNumber || null,
          branchId,
          warehouseId,
          accountingPeriodId,
          subtotal: String(subtotal),
          discount: String(discount),
          tax: String(tax),
          total: String(total),
          currency,
          exchangeRate: String(exchangeRate),
          paymentType,
          paidAmount: String(paidAmount),
          remainingAmount: String(remainingAmount),
          status: 'received',
          invoiceDate:
            input.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate)
              ? input.invoiceDate
              : today(),
          notes: input.notes || null,
          createdBy: user?.id || null,
        })
        .returning();

      // Line rows + stock-in batches.
      const stockItems = [];
      const lineIds = [];
      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i];
        const [line] = await tx
          .insert(purchaseItems)
          .values({
            purchaseInvoiceId: invoice.id,
            productId: r.productId,
            productName: r.product.name,
            productSku: r.product.sku || null,
            barcode: r.product.barcode || null,
            quantity: r.quantity,
            unitCost: String(r.unitCost),
            discount: String(r.itemDiscount),
            subtotal: String(parseFloat(r.itemSubtotal.toFixed(2))),
            unitId: r.unit.id,
            unitName: r.unit.name,
            unitConversionFactor: String(r.unit.conversionFactor),
            baseQuantity: r.baseQty,
            expiryDate: r.expiryDate,
          })
          .returning({ id: purchaseItems.id });
        lineIds.push(line.id);
        stockItems.push({
          key: i,
          productId: r.productId,
          quantity: r.baseQty,
          unitCost: r.unitCost,
          unitConversionFactor: r.unit.conversionFactor,
          unitId: r.unit.id,
          unitName: r.unit.name,
          unitQuantity: r.quantity,
          expiryDate: r.expiryDate,
        });
      }

      const entryIds = await InventoryService.applyPurchaseStockMovement(tx, {
        purchaseInvoiceId: invoice.id,
        warehouseId,
        items: stockItems,
        userId: user?.id || null,
        accountingPeriodId,
      });
      for (let i = 0; i < lineIds.length; i++) {
        const entryId = entryIds.get(i);
        if (entryId) {
          await tx
            .update(purchaseItems)
            .set({ productStockEntryId: entryId })
            .where(eq(purchaseItems.id, lineIds[i]));
        }
      }

      // Optionally refresh catalog costs to the latest purchase cost.
      if (input.updateCostPrices === true) {
        for (const r of resolved) {
          const baseCost = r.unitCost / (r.unit.conversionFactor || 1);
          await tx
            .update(products)
            .set({ costPrice: String(baseCost), updatedAt: new Date() })
            .where(eq(products.id, r.productId));
        }
      }

      // Supplier caches.
      await tx
        .update(suppliers)
        .set({
          totalPurchases: sql`${suppliers.totalPurchases}::numeric + ${total}`,
          totalDebt: sql`${suppliers.totalDebt}::numeric + ${remainingAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, supplierId));

      // Cash leg: mint the payment voucher (سند صرف) for what was paid now.
      let atReceiptVoucher = null;
      if (paidAmount > 0) {
        atReceiptVoucher = await this.#mintSupplierPaymentVoucher(tx, {
          invoice,
          supplier,
          amount: paidAmount,
          user,
          cashboxId: input.cashboxId || null,
          bankAccountId: input.bankAccountId || null,
        });
      }

      // GL: the purchase credits the FULL total to AP; each payment voucher
      // (incl. the at-receipt one) posts Dr AP / Cr cash — net AP = remaining.
      await glPostingService.postDocument(tx, {
        sourceType: 'purchase',
        sourceId: invoice.id,
        user,
      });
      if (atReceiptVoucher) {
        await glPostingService.postDocument(tx, {
          sourceType: 'voucher',
          sourceId: atReceiptVoucher.id,
          user,
        });
      }

      return this.serializeInvoice(invoice);
    });
  }

  /** Pay a supplier against an open invoice (دفعة لمورد). */
  async addPayment(purchaseId, paymentData, user) {
    await featureFlagsService.requireFeature('purchases');
    const db = await getDb();
    const [invoice] = await db
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, Number(purchaseId)))
      .limit(1);
    if (!invoice) throw new NotFoundError('Purchase invoice');
    enforceBranchScope(user, invoice.branchId);
    if (invoice.status === 'cancelled') {
      throw new ValidationError('لا يمكن الدفع على فاتورة ملغاة');
    }
    await accountingPeriodService.assertWritable(invoice.accountingPeriodId || null);

    const remaining = n(invoice.remainingAmount);
    if (remaining <= 0) throw new ValidationError('الفاتورة مسددة بالكامل');
    const amount = Math.min(Number(paymentData.amount) || 0, remaining);
    if (amount <= 0) throw new ValidationError('مبلغ الدفعة يجب أن يكون أكبر من صفر');

    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, invoice.supplierId))
      .limit(1);

    return await withTransaction(async (tx) => {
      const newPaid = n(invoice.paidAmount) + amount;
      const newRemaining = Math.max(0, remaining - amount);
      await tx
        .update(purchaseInvoices)
        .set({
          paidAmount: String(newPaid),
          remainingAmount: String(newRemaining),
          updatedAt: new Date(),
        })
        .where(eq(purchaseInvoices.id, invoice.id));

      await tx
        .update(suppliers)
        .set({
          totalDebt: sql`${suppliers.totalDebt}::numeric - ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, invoice.supplierId));

      const voucher = await this.#mintSupplierPaymentVoucher(tx, {
        invoice,
        supplier,
        amount,
        user,
        cashboxId: paymentData.cashboxId || null,
        bankAccountId: paymentData.bankAccountId || null,
      });

      // GL: the voucher IS the canonical AP payment — post it.
      if (voucher) {
        await glPostingService.postDocument(tx, {
          sourceType: 'voucher',
          sourceId: voucher.id,
          user,
        });
      }

      return {
        success: true,
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        voucherId: voucher?.id || null,
      };
    });
  }

  /**
   * Supplier payment voucher (سند صرف لمورد). Unlike customer payments there
   * is no separate payments table on the AP side — the voucher IS the
   * canonical payment record, linked to the invoice + supplier.
   */
  async #mintSupplierPaymentVoucher(tx, { invoice, supplier, amount, user, cashboxId, bankAccountId }) {
    if (!(await featureFlagsService.isFeatureEnabled('treasury'))) return null;
    if (bankAccountId) await featureFlagsService.requireFeature('bankAccounts');

    const { number } = await allocateDocumentNumber(tx, {
      docType: 'voucher_payment',
      branchId: invoice.branchId,
    });
    const target = bankAccountId
      ? { method: 'bank', cashboxId: null, bankAccountId: Number(bankAccountId) }
      : {
          method: 'cash',
          cashboxId: cashboxId
            ? Number(cashboxId)
            : await (await import('./systemDefaultsService.js')).ensureDefaultCashbox(
                tx,
                invoice.branchId
              ),
          bankAccountId: null,
        };

    const [voucher] = await tx
      .insert(vouchers)
      .values({
        voucherNumber: number,
        voucherType: 'payment',
        branchId: invoice.branchId,
        accountingPeriodId: invoice.accountingPeriodId || null,
        partyType: 'supplier',
        supplierId: invoice.supplierId,
        purchaseInvoiceId: invoice.id,
        cashboxId: target.cashboxId,
        bankAccountId: target.bankAccountId,
        method: target.method,
        amount: String(amount),
        currency: invoice.currency,
        exchangeRate: invoice.exchangeRate || '1',
        description: `دفعة للمورد ${supplier?.name || ''} عن الفاتورة ${invoice.invoiceNumber}`,
        sourceType: 'purchase_payment',
        voucherDate: today(),
        createdBy: user?.id || null,
      })
      .returning();
    return voucher;
  }

  /** Cancel a received invoice (stock untouched only). */
  async cancel(id, reason, user) {
    await featureFlagsService.requireFeature('purchases');
    const db = await getDb();
    const [invoice] = await db
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, Number(id)))
      .limit(1);
    if (!invoice) throw new NotFoundError('Purchase invoice');
    enforceBranchScope(user, invoice.branchId);
    if (invoice.status === 'cancelled') throw new ValidationError('الفاتورة ملغاة مسبقاً');
    await accountingPeriodService.assertWritable(invoice.accountingPeriodId || null);

    const [hasReturns] = await db
      .select({ id: purchaseReturns.id })
      .from(purchaseReturns)
      .where(eq(purchaseReturns.purchaseInvoiceId, invoice.id))
      .limit(1);
    if (hasReturns) {
      throw new ValidationError('لا يمكن إلغاء فاتورة عليها مرتجعات — عالجها بمرتجع كامل');
    }

    const items = await db
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseInvoiceId, invoice.id));

    return await withTransaction(async (tx) => {
      await InventoryService.reversePurchaseStockMovement(tx, {
        purchaseInvoiceId: invoice.id,
        warehouseId: invoice.warehouseId,
        items: items.map((it) => ({
          productId: it.productId,
          quantity: it.baseQuantity,
          productStockEntryId: it.productStockEntryId,
          unitId: it.unitId,
          unitName: it.unitName,
          unitQuantity: it.quantity,
        })),
        userId: user?.id || null,
      });

      await tx
        .update(suppliers)
        .set({
          totalPurchases: sql`${suppliers.totalPurchases}::numeric - ${n(invoice.total)}`,
          totalDebt: sql`${suppliers.totalDebt}::numeric - ${n(invoice.remainingAmount)}`,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, invoice.supplierId));

      // Cancel any payment vouchers minted for this invoice so cashbox
      // balances get the money back — and reverse their GL entries.
      const cancelledVouchers = await tx
        .update(vouchers)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: user?.id || null,
          cancelReason: 'إلغاء فاتورة الشراء',
        })
        .where(
          and(
            eq(vouchers.purchaseInvoiceId, invoice.id),
            eq(vouchers.status, 'active')
          )
        )
        .returning({ id: vouchers.id });
      for (const v of cancelledVouchers) {
        await glPostingService.reverseEntry(tx, {
          sourceType: 'voucher',
          sourceId: v.id,
          user,
          reason: 'إلغاء فاتورة الشراء',
        });
      }

      const [updated] = await tx
        .update(purchaseInvoices)
        .set({ status: 'cancelled', notes: reason || invoice.notes, updatedAt: new Date() })
        .where(eq(purchaseInvoices.id, invoice.id))
        .returning();

      // GL: reverse the purchase entry itself.
      await glPostingService.reverseEntry(tx, {
        sourceType: 'purchase',
        sourceId: invoice.id,
        user,
        reason: reason || 'إلغاء فاتورة الشراء',
      });

      return this.serializeInvoice(updated);
    });
  }

  /**
   * Return goods to the supplier (مرتجع شراء).
   * items[]: {purchaseItemId, quantity (in the line's purchased unit)}
   * Money split mirrors sale returns: debt is reduced first, the remainder
   * comes back as cash (receipt voucher, sourceType 'purchase_refund').
   */
  async createReturn(purchaseId, returnData, user) {
    await featureFlagsService.requireFeature('purchases');
    const db = await getDb();
    const [invoice] = await db
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, Number(purchaseId)))
      .limit(1);
    if (!invoice) throw new NotFoundError('Purchase invoice');
    enforceBranchScope(user, invoice.branchId);
    if (invoice.status === 'cancelled') {
      throw new ValidationError('لا يمكن إرجاع بضاعة من فاتورة ملغاة');
    }
    await accountingPeriodService.assertWritable(invoice.accountingPeriodId || null);

    if (!Array.isArray(returnData.items) || returnData.items.length === 0) {
      throw new ValidationError('حدد الأصناف المرتجعة');
    }

    const lines = await db
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseInvoiceId, invoice.id));
    const lineById = new Map(lines.map((l) => [l.id, l]));

    // Quantities already returned per line (for over-return validation).
    const prevRows = await db
      .select({
        purchaseItemId: purchaseReturnItems.purchaseItemId,
        qty: sql`COALESCE(SUM(${purchaseReturnItems.quantity}), 0)`,
      })
      .from(purchaseReturnItems)
      .leftJoin(purchaseReturns, eq(purchaseReturnItems.returnId, purchaseReturns.id))
      .where(eq(purchaseReturns.purchaseInvoiceId, invoice.id))
      .groupBy(purchaseReturnItems.purchaseItemId);
    const alreadyReturned = new Map(prevRows.map((r) => [r.purchaseItemId, Number(r.qty)]));

    let returnedValue = 0;
    const resolved = [];
    for (const it of returnData.items) {
      const line = lineById.get(Number(it.purchaseItemId));
      if (!line) throw new ValidationError('صنف مرتجع لا يعود لهذه الفاتورة');
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new ValidationError('كمية مرتجع غير صالحة');
      const maxReturnable = line.quantity - (alreadyReturned.get(line.id) || 0);
      if (qty > maxReturnable) {
        throw new ValidationError(
          `الكمية المرتجعة للصنف "${line.productName}" تتجاوز المتاح (${maxReturnable})`
        );
      }
      const baseQty = Math.round(qty * Number(line.unitConversionFactor || 1));
      const lineValue = qty * n(line.unitCost);
      returnedValue += lineValue;
      resolved.push({ line, qty, baseQty, lineValue });
    }
    returnedValue = parseFloat(returnedValue.toFixed(4));

    // Money split: AP first, cash refund for the remainder (mirror of sales).
    const remaining = n(invoice.remainingAmount);
    let debtReduction = Math.min(returnedValue, remaining);
    let refundAmount = parseFloat((returnedValue - debtReduction).toFixed(4));
    if (returnData.refundMethod === 'credit') {
      // Pure debt write-off requested: cap at the remaining debt.
      debtReduction = Math.min(returnedValue, remaining);
      refundAmount = 0;
    }
    const refundMethod = returnData.refundMethod || (refundAmount > 0 ? 'cash' : 'credit');

    return await withTransaction(async (tx) => {
      const { number } = await allocateDocumentNumber(tx, {
        docType: 'purchase_return',
        branchId: invoice.branchId,
      });

      const [ret] = await tx
        .insert(purchaseReturns)
        .values({
          returnNumber: number,
          purchaseInvoiceId: invoice.id,
          supplierId: invoice.supplierId,
          branchId: invoice.branchId,
          warehouseId: invoice.warehouseId,
          accountingPeriodId: invoice.accountingPeriodId || null,
          cashSessionId: invoice.cashSessionId || null,
          returnedValue: String(returnedValue),
          refundAmount: String(refundAmount),
          debtReduction: String(debtReduction),
          refundMethod,
          refundReference: returnData.refundReference || null,
          currency: invoice.currency,
          reason: returnData.reason || null,
          notes: returnData.notes || null,
          createdBy: user?.id || null,
        })
        .returning();

      for (const r of resolved) {
        await tx.insert(purchaseReturnItems).values({
          returnId: ret.id,
          purchaseItemId: r.line.id,
          productId: r.line.productId,
          productName: r.line.productName,
          quantity: r.qty,
          unitCost: r.line.unitCost,
          subtotal: String(parseFloat(r.lineValue.toFixed(2))),
          unitId: r.line.unitId,
          unitName: r.line.unitName,
          unitConversionFactor: r.line.unitConversionFactor,
          baseQuantity: r.baseQty,
        });
      }

      await InventoryService.applyPurchaseReturnStockMovement(tx, {
        purchaseReturnId: ret.id,
        warehouseId: invoice.warehouseId,
        items: resolved.map((r) => ({
          productId: r.line.productId,
          quantity: r.baseQty,
          productStockEntryId: r.line.productStockEntryId,
          unitId: r.line.unitId,
          unitName: r.line.unitName,
          unitQuantity: r.qty,
        })),
        userId: user?.id || null,
        accountingPeriodId: invoice.accountingPeriodId || null,
      });

      // Invoice debt + supplier cache.
      if (debtReduction > 0) {
        await tx
          .update(purchaseInvoices)
          .set({
            remainingAmount: sql`${purchaseInvoices.remainingAmount}::numeric - ${debtReduction}`,
            updatedAt: new Date(),
          })
          .where(eq(purchaseInvoices.id, invoice.id));
        await tx
          .update(suppliers)
          .set({
            totalDebt: sql`${suppliers.totalDebt}::numeric - ${debtReduction}`,
            updatedAt: new Date(),
          })
          .where(eq(suppliers.id, invoice.supplierId));
      }

      // Cash refund from the supplier → receipt voucher (money IN).
      if (refundAmount > 0 && (await featureFlagsService.isFeatureEnabled('treasury'))) {
        const { number: vNumber } = await allocateDocumentNumber(tx, {
          docType: 'voucher_receipt',
          branchId: invoice.branchId,
        });
        const { ensureDefaultCashbox } = await import('./systemDefaultsService.js');
        const cashboxId = returnData.cashboxId
          ? Number(returnData.cashboxId)
          : await ensureDefaultCashbox(tx, invoice.branchId);
        await tx.insert(vouchers).values({
          voucherNumber: vNumber,
          voucherType: 'receipt',
          branchId: invoice.branchId,
          accountingPeriodId: invoice.accountingPeriodId || null,
          partyType: 'supplier',
          supplierId: invoice.supplierId,
          purchaseInvoiceId: invoice.id,
          cashboxId,
          method: 'cash',
          amount: String(refundAmount),
          currency: invoice.currency,
          exchangeRate: invoice.exchangeRate || '1',
          description: `استرداد نقدي عن مرتجع الشراء ${number}`,
          sourceType: 'purchase_refund',
          voucherDate: today(),
          createdBy: user?.id || null,
        });
      }

      // GL: post the purchase-return entry (Dr cash/AP ↔ Cr inventory).
      await glPostingService.postDocument(tx, {
        sourceType: 'purchase_return',
        sourceId: ret.id,
        user,
      });

      return {
        ...ret,
        returnedValue,
        refundAmount,
        debtReduction,
      };
    });
  }

  async getAll(filters = {}, actingUser = null) {
    const db = await getDb();
    const { page = 1, limit = 25 } = filters;
    const conds = [];
    if (filters.supplierId) conds.push(eq(purchaseInvoices.supplierId, Number(filters.supplierId)));
    if (filters.status) conds.push(eq(purchaseInvoices.status, String(filters.status)));
    if (filters.dateFrom) conds.push(gte(purchaseInvoices.invoiceDate, filters.dateFrom));
    if (filters.dateTo) conds.push(lte(purchaseInvoices.invoiceDate, filters.dateTo));
    if (filters.currency && filters.currency !== 'ALL') {
      conds.push(eq(purchaseInvoices.currency, String(filters.currency)));
    }
    if (filters.unpaidOnly === true) {
      conds.push(ne(purchaseInvoices.status, 'cancelled'));
      conds.push(sql`${purchaseInvoices.remainingAmount}::numeric > 0`);
    }

    const allowed = branchFilterFor(actingUser);
    if (allowed === null) {
      if (filters.branchId) conds.push(eq(purchaseInvoices.branchId, Number(filters.branchId)));
    } else if (allowed.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    } else {
      conds.push(eq(purchaseInvoices.branchId, Number(allowed[0])));
    }

    const where = conds.length ? and(...conds) : undefined;
    const [countRow] = await db
      .select({ count: sql`COUNT(*)` })
      .from(purchaseInvoices)
      .where(where);
    const total = Number(countRow?.count || 0);

    const rows = await db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        supplierId: purchaseInvoices.supplierId,
        supplierName: suppliers.name,
        supplierInvoiceNumber: purchaseInvoices.supplierInvoiceNumber,
        branchId: purchaseInvoices.branchId,
        branchName: branches.name,
        warehouseName: warehouses.name,
        subtotal: purchaseInvoices.subtotal,
        discount: purchaseInvoices.discount,
        tax: purchaseInvoices.tax,
        total: purchaseInvoices.total,
        currency: purchaseInvoices.currency,
        paymentType: purchaseInvoices.paymentType,
        paidAmount: purchaseInvoices.paidAmount,
        remainingAmount: purchaseInvoices.remainingAmount,
        status: purchaseInvoices.status,
        isOpeningBalance: purchaseInvoices.isOpeningBalance,
        invoiceDate: purchaseInvoices.invoiceDate,
        createdAt: purchaseInvoices.createdAt,
        createdByName: users.fullName,
        // Returned vs purchased quantity → lets the list flag a fully-returned
        // invoice (status stays 'received' after a full return).
        purchasedQty: sql`COALESCE((SELECT SUM(pi2.quantity) FROM purchase_items pi2 WHERE pi2.purchase_invoice_id = ${purchaseInvoices.id}), 0)`,
        returnedQty: sql`COALESCE((SELECT SUM(pri.quantity) FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pr.purchase_invoice_id = ${purchaseInvoices.id}), 0)`,
      })
      .from(purchaseInvoices)
      .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .leftJoin(branches, eq(purchaseInvoices.branchId, branches.id))
      .leftJoin(warehouses, eq(purchaseInvoices.warehouseId, warehouses.id))
      .leftJoin(users, eq(purchaseInvoices.createdBy, users.id))
      .where(where)
      .orderBy(desc(purchaseInvoices.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows.map((r) => {
        const purchasedQty = n(r.purchasedQty);
        const returnedQty = n(r.returnedQty);
        return {
          ...this.serializeInvoice(r),
          purchasedQty,
          returnedQty,
          // Fully returned = something was returned and nothing is left to return.
          fullyReturned: returnedQty > 0 && returnedQty >= purchasedQty,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id, actingUser = null) {
    const db = await getDb();
    const [invoice] = await db
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, Number(id)))
      .limit(1);
    if (!invoice) throw new NotFoundError('Purchase invoice');
    enforceBranchScope(actingUser, invoice.branchId);

    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, invoice.supplierId))
      .limit(1);
    const items = await db
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseInvoiceId, invoice.id));
    const returns = await db
      .select()
      .from(purchaseReturns)
      .where(eq(purchaseReturns.purchaseInvoiceId, invoice.id))
      .orderBy(desc(purchaseReturns.id));
    const returnItems = returns.length
      ? await db
          .select()
          .from(purchaseReturnItems)
          .where(
            sql`${purchaseReturnItems.returnId} IN (${sql.join(
              returns.map((r) => sql`${r.id}`),
              sql`, `
            )})`
          )
      : [];

    const paymentVouchers = await db
      .select()
      .from(vouchers)
      .where(
        and(eq(vouchers.purchaseInvoiceId, invoice.id), eq(vouchers.status, 'active'))
      )
      .orderBy(desc(vouchers.id));

    return {
      ...this.serializeInvoice(invoice),
      supplier: supplier || null,
      items: items.map((it) => ({
        ...it,
        unitCost: n(it.unitCost),
        discount: n(it.discount),
        subtotal: n(it.subtotal),
        unitConversionFactor: n(it.unitConversionFactor),
      })),
      returns: returns.map((r) => ({
        ...r,
        returnedValue: n(r.returnedValue),
        refundAmount: n(r.refundAmount),
        debtReduction: n(r.debtReduction),
        items: returnItems
          .filter((ri) => ri.returnId === r.id)
          .map((ri) => ({ ...ri, unitCost: n(ri.unitCost), subtotal: n(ri.subtotal) })),
      })),
      vouchers: paymentVouchers.map((v) => ({ ...v, amount: n(v.amount) })),
    };
  }

  serializeInvoice(row) {
    return {
      ...row,
      subtotal: n(row.subtotal),
      discount: n(row.discount),
      tax: n(row.tax),
      total: n(row.total),
      exchangeRate: n(row.exchangeRate),
      paidAmount: n(row.paidAmount),
      remainingAmount: n(row.remainingAmount),
    };
  }
}

export default new PurchaseService();
