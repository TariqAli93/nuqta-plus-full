import { getDb, getPool } from '../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../models/index.js';
import { sales, purchaseInvoices } from '../models/index.js';
import { sql, eq, and } from 'drizzle-orm';
import { ValidationError, ConflictError } from '../utils/errors.js';
import featureFlagsService from './featureFlagsService.js';
import glPostingService from './gl/glPostingService.js';
import systemAccountsService from './gl/systemAccountsService.js';
import { ensureDefaultBranch } from './systemDefaultsService.js';
import { isGlobalAdmin } from './scopeService.js';

/**
 * Opening balances (الأرصدة الافتتاحية).
 *
 * Pre-system customer/supplier debts are recorded as SYNTHETIC opening
 * documents (one service line, paid 0, remaining = debt, is_opening_balance =
 * true) so AR/AP aging, collections, and payment allocation work untouched.
 * These synthetic docs are inserted directly (bypassing the sale/purchase
 * services) so they do NOT post a per-document GL entry — the GL side of ALL
 * opening balances comes from a SINGLE balanced opening journal entry
 * (`generateOpeningEntry`), which avoids double-counting AR/AP.
 */

const n = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);

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

function resolveBranchId(user, requested) {
  if (isGlobalAdmin(user)) return requested ? Number(requested) : null;
  return user?.assignedBranchId || null;
}

export class OpeningBalanceService {
  /**
   * Record a customer's pre-system debt as a synthetic opening sale. Direct
   * insert (no GL post). Returns the created sale row.
   */
  async createCustomerOpening({ customerId, amount, currency = 'IQD', branchId, note }, user) {
    const debt = n(amount);
    if (!customerId) throw new ValidationError('customerId مطلوب');
    if (debt <= 0) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

    const db = await getDb();
    const branch = resolveBranchId(user, branchId) || (await ensureDefaultBranch());
    const invoiceNumber = `OPEN-C${customerId}-${Date.now()}`;

    const [sale] = await db
      .insert(sales)
      .values({
        invoiceNumber,
        customerId: Number(customerId),
        branchId: branch,
        subtotal: String(debt),
        total: String(debt),
        currency,
        paymentType: 'installment',
        saleType: 'INSTALLMENT',
        paidAmount: '0',
        remainingAmount: String(debt),
        status: 'pending',
        isOpeningBalance: true,
        notes: note || 'رصيد افتتاحي سابق',
        issuedAt: new Date(),
        createdBy: user?.id || null,
      })
      .returning();

    await db.insert(schema.saleItems).values({
      saleId: sale.id,
      productName: 'رصيد افتتاحي سابق',
      quantity: 1,
      unitPrice: String(debt),
      subtotal: String(debt),
      baseQuantity: 1,
      unitConversionFactor: '1',
    });

    return sale;
  }

  /**
   * Record a supplier's pre-system balance as a synthetic opening purchase
   * invoice. Direct insert (no GL post). Returns the created invoice row.
   */
  async createSupplierOpening({ supplierId, amount, currency = 'IQD', branchId, note }, user) {
    const debt = n(amount);
    if (!supplierId) throw new ValidationError('supplierId مطلوب');
    if (debt <= 0) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

    const db = await getDb();
    const branch = resolveBranchId(user, branchId) || (await ensureDefaultBranch());
    const invoiceNumber = `OPEN-S${supplierId}-${Date.now()}`;

    const [invoice] = await db
      .insert(purchaseInvoices)
      .values({
        invoiceNumber,
        supplierId: Number(supplierId),
        branchId: branch,
        subtotal: String(debt),
        total: String(debt),
        currency,
        paymentType: 'credit',
        paidAmount: '0',
        remainingAmount: String(debt),
        status: 'received',
        isOpeningBalance: true,
        invoiceDate: new Date().toISOString().slice(0, 10),
        notes: note || 'رصيد افتتاحي سابق',
        createdBy: user?.id || null,
      })
      .returning();

    return invoice;
  }

  /** Whether an opening journal entry already exists (re-run guard). */
  async hasOpeningEntry() {
    const db = await getDb();
    const [row] = await db
      .select({ id: schema.journalEntries.id })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.sourceType, 'opening_balance'),
          eq(schema.journalEntries.status, 'posted')
        )
      )
      .limit(1);
    return !!row;
  }

  /**
   * Wizard status: current opening AR/AP from synthetic docs + whether the
   * opening entry was already generated.
   */
  async getStatus() {
    const db = await getDb();
    const [ar] = await db
      .select({ total: sql`COALESCE(SUM(${sales.remainingAmount}::numeric), 0)` })
      .from(sales)
      .where(and(eq(sales.isOpeningBalance, true), sql`${sales.status} <> 'cancelled'`));
    const [ap] = await db
      .select({ total: sql`COALESCE(SUM(${purchaseInvoices.remainingAmount}::numeric), 0)` })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.isOpeningBalance, true), sql`${purchaseInvoices.status} <> 'cancelled'`));
    return {
      hasOpeningEntry: await this.hasOpeningEntry(),
      openingAR: n(ar?.total),
      openingAP: n(ap?.total),
    };
  }

  /**
   * Post the single opening journal entry (قيد افتتاحي) from pre-system
   * balances. Caller supplies cash/bank/inventory values (entered in the
   * wizard); AR/AP are derived from the synthetic opening documents. The
   * equity plug (opening_balance_equity) balances the entry.
   *
   * @param {{cashAmount?, inventoryAmount?, branchId?, entryDate?}} input
   */
  async generateOpeningEntry(input = {}, user) {
    await featureFlagsService.requireFeature('generalLedger');
    if (await this.hasOpeningEntry()) {
      throw new ConflictError('القيد الافتتاحي مُنشأ مسبقاً');
    }

    const db = await getDb();
    const branchId = resolveBranchId(user, input.branchId) || (await ensureDefaultBranch());

    // Derive AR/AP from synthetic opening docs.
    const [arRow] = await db
      .select({ total: sql`COALESCE(SUM(${sales.remainingAmount}::numeric), 0)` })
      .from(sales)
      .where(and(eq(sales.isOpeningBalance, true), sql`${sales.status} <> 'cancelled'`));
    const [apRow] = await db
      .select({ total: sql`COALESCE(SUM(${purchaseInvoices.remainingAmount}::numeric), 0)` })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.isOpeningBalance, true), sql`${purchaseInvoices.status} <> 'cancelled'`));

    const cash = n(input.cashAmount);
    const inventory = n(input.inventoryAmount);
    const ar = n(arRow?.total);
    const ap = n(apRow?.total);

    const base = await glPostingService.getBaseCurrency();

    return withTransaction(async (tx) => {
      const resolve = (key) => systemAccountsService.resolve(tx, key);
      const lines = [];
      if (cash > 0) lines.push({ accountId: await resolve('cash_default'), debit: cash, credit: 0 });
      if (inventory > 0) lines.push({ accountId: await resolve('inventory'), debit: inventory, credit: 0 });
      if (ar > 0) lines.push({ accountId: await resolve('accounts_receivable'), debit: ar, credit: 0, partyType: 'customer' });
      if (ap > 0) lines.push({ accountId: await resolve('accounts_payable'), debit: 0, credit: ap, partyType: 'supplier' });

      const totalDebit = cash + inventory + ar;
      const totalCredit = ap;
      const plug = totalDebit - totalCredit; // +ve → credit equity; -ve → debit equity
      const equityId = await resolve('opening_balance_equity');
      if (plug > 0) lines.push({ accountId: equityId, debit: 0, credit: plug });
      else if (plug < 0) lines.push({ accountId: equityId, debit: -plug, credit: 0 });

      if (lines.length < 2) {
        throw new ValidationError('لا توجد أرصدة افتتاحية لترحيلها');
      }

      const entry = await glPostingService.insertValidatedEntry(tx, {
        entryDate: input.entryDate || new Date().toISOString().slice(0, 10),
        branchId,
        sourceType: 'opening_balance',
        sourceId: null,
        description: 'القيد الافتتاحي',
        isOpening: true,
        userId: user?.id || null,
        lines: lines.map((l) => ({ ...l, currency: base })),
      });
      return entry;
    });
  }
}

export default new OpeningBalanceService();
