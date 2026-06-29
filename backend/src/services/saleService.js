import { getDb, getPool, saveDatabase } from '../db.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  SALE_TYPE_INSTALLMENT,
  SALE_SOURCE_POS,
  saleTypeToPaymentType,
} from '../constants/sales.js';
import {
  sales,
  saleItems,
  products,
  customers,
  payments,
  installments,
  users,
  warehouses,
  branches,
  productStock,
  saleReturns,
  saleReturnItems,
  saleItemStockEntries,
} from '../models/index.js';
import * as schema from '../models/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateDraftInvoicePlaceholder, calculateSaleTotals } from '../utils/helpers.js';
import { allocateInvoiceDiscount, clampItemDiscountPerUnit } from '../utils/discountAllocation.js';
import { eq, desc, and, gte, lte, sql, inArray, lt, count as countFn } from 'drizzle-orm';
import { buildSearch, ncol, RANK } from '../utils/searchBuilder.js';
import { normalizeIraqPhone } from '../utils/phone.js';
import settingsService from './settingsService.js';
import alertBus from '../events/alertBus.js';
import { hasPermission } from '../auth/permissionMatrix.js';
import { getCustomerCreditSnapshot, canCreateInstallmentSale } from './creditScoringService.js';
import auditService from './auditService.js';
import { InventoryService } from './inventoryService.js';
import { resolveUnitSnapshot, listProductUnits } from './productUnitService.js';
import {
  enforceWarehouseScope,
  invoiceBranchScope,
  enforceInvoiceBranchScope,
} from './scopeService.js';
import featureFlagsService from './featureFlagsService.js';
import { ensureDefaultBranch, ensureDefaultWarehouse } from './systemDefaultsService.js';
import { netAfterReturn, returnedItemCost } from './reportMath.js';
import accountingPeriodService from './accountingPeriodService.js';
import voucherService from './voucherService.js';
import glPostingService from './gl/glPostingService.js';

// Threshold below which a customer is considered "high risk" for an alert
const HIGH_RISK_SCORE_THRESHOLD = 50;

// Build the OR conditions used to match a product *inside* an invoice's items
// (req #3). Shared by the EXISTS predicate and the matchedValue subselect so
// both stay in sync. `si` is the sale_items alias bound in the subquery.
function invoiceItemMatchParts({ text, code, likeText, likeCode }) {
  const parts = [];
  if (text) parts.push(sql`si.search_product_name LIKE ${likeText}`);
  if (code) parts.push(sql`si.search_product_sku LIKE ${likeCode}`);
  if (code) parts.push(sql`si.search_barcode = ${code}`);
  return parts;
}

// Declarative sale/invoice search targets (req #3): invoice number, customer
// name + phone, products inside the invoice, payment method, status, notes.
const SALE_SEARCH_TARGETS = [
  { label: 'invoiceNumber', rank: RANK.INVOICE_EXACT, kind: 'codeExact', norm: ncol('sales', 'search_invoice'), value: sales.invoiceNumber },
  {
    label: 'customerPhone',
    rank: RANK.PHONE_EXACT,
    kind: 'custom',
    value: customers.phone,
    predicate: ({ raw }) => {
      const normalised = normalizeIraqPhone(raw);
      return normalised ? sql`${customers.normalizedPhone} = ${normalised}` : null;
    },
  },
  { label: 'customerName', rank: RANK.NAME_EXACT, kind: 'textExact', norm: ncol('customers', 'search_name'), value: customers.name },
  { label: 'invoiceNumber', rank: RANK.CODE_PARTIAL, kind: 'codePartial', norm: ncol('sales', 'search_invoice'), value: sales.invoiceNumber },
  { label: 'customerName', rank: RANK.NAME_PARTIAL, kind: 'textPartial', norm: ncol('customers', 'search_name'), value: customers.name },
  {
    label: 'productName',
    rank: RANK.RELATED_MATCH,
    kind: 'custom',
    predicate: (ctx) => {
      const parts = invoiceItemMatchParts(ctx);
      if (!parts.length) return null;
      return sql`EXISTS (SELECT 1 FROM ${saleItems} si WHERE si.sale_id = ${sales.id} AND (${sql.join(parts, sql` OR `)}))`;
    },
    value: (ctx) => {
      const parts = invoiceItemMatchParts(ctx);
      if (!parts.length) return sql`NULL`;
      return sql`(SELECT si.product_name FROM ${saleItems} si WHERE si.sale_id = ${sales.id} AND (${sql.join(parts, sql` OR `)}) LIMIT 1)`;
    },
  },
  {
    label: 'customerPhone',
    rank: RANK.PHONE_PARTIAL,
    kind: 'custom',
    value: customers.phone,
    predicate: ({ raw }) => {
      const digits = String(raw ?? '').replace(/\D/g, '');
      if (digits.length < 3) return null;
      return sql`${customers.normalizedPhone} LIKE ${`%${digits}%`}`;
    },
  },
  {
    label: 'paymentMethod',
    rank: RANK.FIELD_MATCH,
    kind: 'custom',
    value: sales.paymentType,
    predicate: ({ text }) => (text ? sql`lower(${sales.paymentType}) = ${text}` : null),
  },
  {
    label: 'status',
    rank: RANK.FIELD_MATCH,
    kind: 'custom',
    value: sales.status,
    predicate: ({ text }) => (text ? sql`lower(${sales.status}) = ${text}` : null),
  },
  { label: 'notes', rank: RANK.DETAILS, kind: 'textPartial', norm: ncol('sales', 'search_notes'), value: sales.notes },
];

/**
 * Enforce the customer's recommended credit limit for installment/mixed sales.
 *
 * If the sale total exceeds recommendedLimit:
 *   - user with `sales.override_credit_limit` → allowed; logged to audit trail
 *   - otherwise → ValidationError (reject)
 *
 * Also logs an audit entry when a high-risk customer (score <= threshold) is
 * used in a new installment sale, and emits a real-time alert.
 *
 * @returns {{snapshot, exceeded, highRisk}}
 */
async function enforceCreditLimit({ customerId, total, user, paymentType, branchId }) {
  if (!customerId) return { snapshot: null, exceeded: false, highRisk: false, decision: null };
  if (paymentType !== 'installment' && paymentType !== 'mixed') {
    return { snapshot: null, exceeded: false, highRisk: false, decision: null };
  }

  // Smart decision engine — combines score + aging + active counts + limit.
  const decision = await canCreateInstallmentSale(customerId, Number(total), branchId);
  const snapshot = await getCustomerCreditSnapshot(customerId);
  if (!snapshot) {
    return { snapshot: null, exceeded: false, highRisk: false, decision };
  }

  const limit = snapshot.recommendedLimit;
  const score = snapshot.creditScore;
  const exceeded = limit != null && Number(total) > Number(limit);
  const highRisk =
    decision.riskLevel === 'high' ||
    (score != null && score <= HIGH_RISK_SCORE_THRESHOLD);

  // High-risk decision blocks the sale unless the caller has override permission.
  if (decision.riskLevel === 'high') {
    const canOverride = user && hasPermission('sales.override_credit_limit', user.role);
    if (!canOverride) {
      const err = new ValidationError(
        `Installment sale rejected: ${decision.reason}. Override permission required.`
      );
      err.code = 'CREDIT_DECISION_BLOCKED';
      err.decision = decision;
      throw err;
    }
    // Override taken — log every reason that contributed.
    await auditService.log({
      userId: user.id,
      username: user.username,
      action: 'sales:credit_decision_override',
      resource: 'customers',
      resourceId: customerId,
      details: {
        saleTotal: Number(total),
        recommendedLimit: limit != null ? Number(limit) : null,
        creditScore: score,
        riskLevel: decision.riskLevel,
        reasons: decision.reasons,
      },
    });
  }

  if (exceeded && decision.riskLevel !== 'high') {
    // Non-blocking exceed (e.g. limit slightly off but other signals are clean)
    // — still gated by override permission to avoid silent breaches.
    const canOverride = user && hasPermission('sales.override_credit_limit', user.role);
    if (!canOverride) {
      throw new ValidationError(
        `Sale total (${total}) exceeds customer's recommended credit limit (${limit}). An override permission is required.`
      );
    }
    await auditService.log({
      userId: user.id,
      username: user.username,
      action: 'sales:credit_limit_override',
      resource: 'customers',
      resourceId: customerId,
      details: {
        saleTotal: Number(total),
        recommendedLimit: Number(limit),
        creditScore: score,
      },
    });
  }

  if (highRisk) {
    await auditService.log({
      userId: user?.id || null,
      username: user?.username || null,
      action: 'sales:high_risk_approved',
      resource: 'customers',
      resourceId: customerId,
      details: {
        saleTotal: Number(total),
        recommendedLimit: limit != null ? Number(limit) : null,
        creditScore: score,
        threshold: HIGH_RISK_SCORE_THRESHOLD,
        decisionReasons: decision.reasons,
      },
    });
    alertBus.emit('alerts.changed', 'customer.high_risk_sale');
  }

  return { snapshot, exceeded, highRisk, decision };
}

/**
 * Enforce the customer's HARD credit ceiling (سقف الدين) — a manual,
 * per-customer limit distinct from the ML `recommendedLimit` enforced above.
 *
 * When `customers.creditLimit` is set (NULL = unlimited) and this sale adds to
 * the customer's outstanding balance, reject if
 *   (current AR + this sale's remaining) > creditLimit
 * unless the caller holds `sales.override_credit_limit` (logged when overridden).
 *
 * Current AR mirrors customerService: Σ remaining on non-cancelled sales
 * + Σ remaining on pending installments.
 */
export async function enforceCustomerCreditLimit({ customerId, newRemaining, user }) {
  if (!customerId || !(Number(newRemaining) > 0)) return;

  const db = await getDb();
  const [customer] = await db
    .select({ creditLimit: customers.creditLimit, name: customers.name })
    .from(customers)
    .where(eq(customers.id, Number(customerId)))
    .limit(1);
  const limit = customer?.creditLimit;
  if (limit == null) return; // unlimited

  const [salesAgg] = await db
    .select({
      ar: sql`COALESCE(SUM(CASE WHEN ${sales.status} != 'cancelled' THEN ${sales.remainingAmount}::numeric ELSE 0 END), 0)`,
    })
    .from(sales)
    .where(eq(sales.customerId, Number(customerId)));
  const currentAR = Number(salesAgg?.ar) || 0;
  const projected = currentAR + Number(newRemaining);

  if (projected > Number(limit)) {
    const canOverride = user && hasPermission('sales.override_credit_limit', user.role);
    if (!canOverride) {
      const err = new ValidationError(
        `تجاوز سقف الدين: الرصيد المتوقع (${projected}) يتجاوز سقف العميل (${limit}).`
      );
      err.code = 'CREDIT_LIMIT_EXCEEDED';
      err.statusCode = 422;
      err.details = { currentAR, newRemaining: Number(newRemaining), creditLimit: Number(limit) };
      throw err;
    }
    await auditService.log({
      userId: user.id,
      username: user.username,
      action: 'sales:credit_limit_override',
      resource: 'customers',
      resourceId: Number(customerId),
      details: { currentAR, newRemaining: Number(newRemaining), creditLimit: Number(limit), kind: 'hard_ceiling' },
    });
  }
}

/**
 * Run a callback inside a PostgreSQL transaction.
 * Creates a dedicated client from the pool, wraps in BEGIN/COMMIT/ROLLBACK,
 * and provides a transaction-scoped Drizzle instance.
 */
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
 * Allocate the next invoice number for a branch within the current
 * transaction. Backed by the invoice_sequences counter row — the upsert
 * acquires a row-level lock, so concurrent callers serialize and the returned
 * sequence value is unique per (branchId, year).
 *
 * If the surrounding transaction rolls back, the increment rolls back too —
 * no number is burned on a failed sale.
 *
 * @param {object} tx Drizzle transaction handle (must run inside withTransaction)
 * @param {number} branchId
 * @returns {Promise<{invoiceNumber: string, issuedAt: Date}>}
 */
async function allocateInvoiceNumber(tx, branchId) {
  if (!branchId || !Number.isInteger(branchId) || branchId <= 0) {
    throw new ValidationError('A branch is required to issue an invoice number');
  }
  const issuedAt = new Date();
  const year = issuedAt.getFullYear();

  const result = await tx.execute(sql`
    INSERT INTO invoice_sequences (branch_id, year, next_value)
    VALUES (${branchId}, ${year}, 2)
    ON CONFLICT (branch_id, year)
    DO UPDATE SET next_value = invoice_sequences.next_value + 1,
                  updated_at = now()
    RETURNING (next_value - 1) AS sequence
  `);

  const rows = result.rows ?? result;
  const seq = Number(rows?.[0]?.sequence);
  if (!Number.isFinite(seq) || seq <= 0) {
    throw new Error('Invoice sequence allocation failed');
  }

  const branchStr = String(branchId).padStart(3, '0');
  const seqStr = String(seq).padStart(6, '0');
  return {
    invoiceNumber: `BR${branchStr}-${year}-${seqStr}`,
    issuedAt,
  };
}

/**
 * Round amount based on currency
 * For IQD: round to nearest multiple of 250 (smallest denomination)
 * For USD: round to nearest integer
 */
function roundByCurrency(amount, currency) {
  if (currency === 'IQD') {
    return Math.ceil(amount / 250) * 250;
  } else {
    return Math.ceil(amount);
  }
}

/** Parse numeric string from PG to JS number. PG numeric columns return strings. */
function n(val) {
  if (val === null || val === undefined) return 0;
  return Number(val);
}

/**
 * Build an installment schedule (جدول الأقساط) for the deferred balance.
 *
 * Splits `totalRemaining` across `count` installments, rounding each by the
 * currency and folding the rounding drift into the LAST installment so the rows
 * always sum back to exactly the remaining amount. Due dates start at
 * `firstInstallmentDate` (YYYY-MM-DD) and step by `period` ('weekly' |
 * 'monthly'); when no first date is supplied it falls back to "one period from
 * today" — the historical monthly behaviour, so legacy callers are unchanged.
 *
 * @returns {Array<{installmentNumber:number, dueAmount:number, dueDate:string}>}
 */
function buildInstallmentSchedule({ totalRemaining, count, currency, firstInstallmentDate, period }) {
  const installmentCount = parseInt(count, 10) || 0;
  const remaining = roundByCurrency(Number(totalRemaining) || 0, currency);
  if (installmentCount < 1 || remaining <= 0) return [];

  const step = period === 'weekly' ? 'weekly' : 'monthly';
  const base = roundByCurrency(remaining / installmentCount, currency);
  // Drift between the evenly-rounded rows and the real remaining, charged to the
  // final installment so Σ(dueAmount) === remaining to the currency's precision.
  const adjustment = base * installmentCount - remaining;

  let firstDue;
  if (firstInstallmentDate && /^\d{4}-\d{2}-\d{2}$/.test(firstInstallmentDate)) {
    firstDue = new Date(`${firstInstallmentDate}T00:00:00`);
  } else {
    firstDue = new Date();
    if (step === 'weekly') firstDue.setDate(firstDue.getDate() + 7);
    else firstDue.setMonth(firstDue.getMonth() + 1);
  }

  const rows = [];
  for (let i = 0; i < installmentCount; i++) {
    const due = new Date(firstDue);
    if (step === 'weekly') due.setDate(due.getDate() + i * 7);
    else due.setMonth(due.getMonth() + i);
    const isLast = i === installmentCount - 1;
    const amount = roundByCurrency(isLast ? base - adjustment : base, currency);
    // Format from LOCAL components (not toISOString) so a first date the user
    // picked — e.g. 2026-07-01 — is never shifted a day back by the UTC offset.
    const y = due.getFullYear();
    const mo = String(due.getMonth() + 1).padStart(2, '0');
    const da = String(due.getDate()).padStart(2, '0');
    rows.push({
      installmentNumber: i + 1,
      dueAmount: amount,
      dueDate: `${y}-${mo}-${da}`,
    });
  }
  return rows;
}

/**
 * Resolve the branch + warehouse pair for a sale.
 *
 * Preference order:
 *   1. An explicit warehouseId passed in (validated against branchId if given).
 *   2. The branch-bound user's assignedWarehouseId.
 *   3. The first active warehouse inside the user's assigned branch.
 *   4. The first active warehouse overall (legacy single-warehouse flow).
 *
 * Without step 3, a branch-bound user with no assigned warehouse would have
 * sales silently routed to the main warehouse of another branch — the bug
 * that kept non-main branches from selling.
 */
async function resolveBranchWarehouse({ branchId, warehouseId, actingUser }) {
  const db = await getDb();

  if (warehouseId) {
    const [wh] = await db
      .select({ id: warehouses.id, branchId: warehouses.branchId, isActive: warehouses.isActive })
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId))
      .limit(1);
    if (!wh) throw new ValidationError('Warehouse not found');
    if (!wh.isActive) throw new ValidationError('Warehouse is inactive');
    if (branchId && branchId !== wh.branchId) {
      throw new ValidationError('Warehouse does not belong to the specified branch');
    }
    // A warehouse created while multi-branch is off has no branchId, but invoice
    // numbering needs a NOT-NULL branch — fall back to the system default branch.
    const effectiveBranchId = wh.branchId || (await ensureDefaultBranch());
    return { branchId: effectiveBranchId, warehouseId: wh.id };
  }

  // Prefer a warehouse inside the user's assigned branch when the caller is
  // branch-bound. Picks an active warehouse there; if there's only one this
  // is deterministic.
  const preferredBranchId = branchId || actingUser?.assignedBranchId || null;
  if (preferredBranchId) {
    const [wh] = await db
      .select({ id: warehouses.id, branchId: warehouses.branchId })
      .from(warehouses)
      .where(
        and(eq(warehouses.branchId, preferredBranchId), eq(warehouses.isActive, true))
      )
      .orderBy(warehouses.id)
      .limit(1);
    if (wh) return { branchId: wh.branchId, warehouseId: wh.id };
    if (branchId || actingUser?.assignedBranchId) {
      throw new ValidationError(
        'No active warehouse found for the assigned branch — ask an admin to create one'
      );
    }
  }

  // Legacy / single-warehouse fallback: first active warehouse anywhere.
  const [fallback] = await db
    .select({ id: warehouses.id, branchId: warehouses.branchId })
    .from(warehouses)
    .where(eq(warehouses.isActive, true))
    .orderBy(warehouses.id)
    .limit(1);
  if (fallback) {
    const effectiveBranchId = fallback.branchId || (await ensureDefaultBranch());
    return { branchId: effectiveBranchId, warehouseId: fallback.id };
  }

  // Nothing exists yet (e.g. branch management off and the operator never made
  // a warehouse). Create the internal default warehouse + branch on demand so
  // selling never dead-ends with "create a branch/warehouse first".
  const defaultWarehouseId = await ensureDefaultWarehouse();
  const [created] = await db
    .select({ id: warehouses.id, branchId: warehouses.branchId })
    .from(warehouses)
    .where(eq(warehouses.id, defaultWarehouseId))
    .limit(1);
  const effectiveBranchId = created?.branchId || (await ensureDefaultBranch());
  return { branchId: effectiveBranchId, warehouseId: defaultWarehouseId };
}

/**
 * Load each line's product type, enforce the service/physical business rules,
 * and normalise SERVICE lines so the rest of the pipeline (totals, snapshot,
 * profit) treats the received price (السعر المستلم) as the line's unit price.
 *
 * Business rules (req: منتجات/خدمات):
 *   - An invoice is EITHER physical-only OR service-only — never mixed.
 *   - A physical line needs a positive unit price.
 *   - A service line needs a positive received amount; the stored service price
 *     is ignored when blank/zero ("لا تعتمد على سعر الخدمة المخزن إذا كان فارغاً").
 *
 * Mutates `items` in place: each service line's `unitPrice` becomes the
 * received amount. Cost stays 0 for services (no purchase cost), so the whole
 * received amount falls through as profit downstream.
 *
 * @returns {Promise<{hasService: boolean, hasPhysical: boolean}>}
 */
async function validateAndNormaliseItemTypes(items) {
  const ids = [...new Set((items || []).map((i) => i.productId).filter(Boolean))];
  const db = await getDb();
  const rows = ids.length
    ? await db
        .select({ id: products.id, productType: products.productType })
        .from(products)
        .where(inArray(products.id, ids))
    : [];
  const typeById = new Map(rows.map((r) => [r.id, r.productType]));

  let hasService = false;
  let hasPhysical = false;

  for (const item of items) {
    const isService = (typeById.get(item.productId) || 'inventory') === 'service';
    if (isService) {
      hasService = true;
      const received =
        item.serviceReceivedAmount != null
          ? Number(item.serviceReceivedAmount)
          : Number(item.unitPrice);
      if (!(received > 0)) {
        const err = new ValidationError('يجب إدخال السعر المستلم للخدمة');
        err.code = 'SERVICE_PRICE_REQUIRED';
        err.statusCode = 422;
        throw err;
      }
      // The received price IS the line price for a service.
      item.unitPrice = received;
    } else {
      hasPhysical = true;
      if (!(Number(item.unitPrice) > 0)) {
        const err = new ValidationError('سعر المنتج يجب أن يكون أكبر من صفر');
        err.code = 'PRODUCT_PRICE_REQUIRED';
        err.statusCode = 422;
        throw err;
      }
    }
  }

  if (hasService && hasPhysical) {
    const err = new ValidationError('لا يمكن دمج خدمة مع منتجات فعلية في نفس الفاتورة');
    err.code = 'MIXED_SERVICE_PHYSICAL';
    err.statusCode = 422;
    throw err;
  }

  return { hasService, hasPhysical };
}

/**
 * Resolve each item's per-unit cost, using the SAME basis the persisted snapshot
 * + profit use (unit cost override → product base cost × conversion factor).
 * Read-only; runs before the write transaction. Returns a number[] aligned to
 * `items` (0 for items without a productId).
 *
 * @param {object} handle drizzle db/tx handle
 * @param {Array} items sale items (productId, unitId)
 * @returns {Promise<number[]>} per-unit cost per line
 */
async function resolveLineUnitCosts(handle, items) {
  const out = [];
  for (const item of items) {
    if (!item.productId) {
      out.push(0);
      continue;
    }
    const [product] = await handle
      .select({ costPrice: products.costPrice })
      .from(products)
      .where(eq(products.id, item.productId))
      .limit(1);
    const unit = await resolveUnitSnapshot(handle, item.productId, item.unitId || null);
    const baseCost = Number(product?.costPrice) || 0;
    const perUnitCost =
      unit.costPrice != null ? Number(unit.costPrice) : baseCost * unit.conversionFactor;
    out.push(perUnitCost);
  }
  return out;
}

/**
 * Authoritative discount guard for a sale, applied in two ordered steps so a
 * product can never be sold below its cost:
 *   1. Clamp each line's OWN discount («خصم المنتج») in place to at most
 *      unitPrice − unitCost (per unit) — mutates `items[i].discount`.
 *   2. Distribute the invoice discount («خصم الفاتورة») over the resulting safe
 *      line nets, never pushing a line below cost (a line already AT cost from
 *      step 1 has zero capacity and gets no invoice-discount share).
 *
 * @returns {{safeDiscount:number}} the invoice discount actually applicable.
 */
async function clampSaleDiscounts(handle, items, requestedInvoiceDiscount) {
  const perUnitCosts = await resolveLineUnitCosts(handle, items);

  // Step 1 — clamp each line's own discount to the cost floor.
  for (let i = 0; i < items.length; i++) {
    const { applied } = clampItemDiscountPerUnit(
      items[i].unitPrice,
      perUnitCosts[i],
      items[i].discount || 0
    );
    items[i].discount = applied;
  }

  // Step 2 — clamp the invoice discount over the (now safe) line nets.
  const req = Math.max(0, parseFloat(requestedInvoiceDiscount) || 0);
  if (req <= 0) return { safeDiscount: req };
  const lines = items.map((item, i) => {
    const qty = Number(item.quantity) || 0;
    const value = qty * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0) * qty;
    return { value, cost: (Number(perUnitCosts[i]) || 0) * qty };
  });
  const { applied } = allocateInvoiceDiscount(lines, req);
  return { safeDiscount: applied };
}

export class SaleService {
  async create(saleData, user) {
    // Backward-compat: callers previously passed userId (number). Normalise.
    const actingUser = typeof user === 'object' && user !== null ? user : { id: user };
    const userId = actingUser.id;
    const currencySettings = await settingsService.getCurrencySettings();

    if (!saleData.items || saleData.items.length === 0) {
      throw new ValidationError('Sale must have at least one item');
    }

    // Enforce the service/physical rules and fold each service line's received
    // price (السعر المستلم) into its unitPrice before computing totals. Throws a
    // clear Arabic error on a mixed invoice or a service with no received price.
    await validateAndNormaliseItemTypes(saleData.items);

    // Authoritative discount guard so a product is never sold below cost: clamp
    // each line's own discount first, then the invoice discount over the safe
    // line nets. Mutates item.discount to the applied amount. The frontend
    // already clamps + warns; this guarantees it even for a direct API call.
    // Skipped entirely when there is no discount of any kind (no cost lookup).
    let safeDiscount = parseFloat(saleData.discount) || 0;
    const hasAnyDiscount =
      safeDiscount > 0 || saleData.items.some((it) => (Number(it.discount) || 0) > 0);
    if (hasAnyDiscount) {
      const db = await getDb();
      ({ safeDiscount } = await clampSaleDiscounts(db, saleData.items, saleData.discount || 0));
    }

    const totals = calculateSaleTotals(saleData.items, safeDiscount, saleData.tax || 0);

    // ── Normalise saleSource / saleType / paymentType ──────────────────────
    // New callers send `saleSource` + `saleType`; legacy callers only send
    // `paymentType`. We accept either and keep both in sync so the DB
    // column stays backward-compatible.
    const saleSource = saleData.saleSource || null;
    const saleType   = saleData.saleType   || null;
    const paymentType =
      saleData.paymentType ||
      (saleType ? saleTypeToPaymentType(saleType) : 'cash');

    // Feature gate: a POS sale requires the pos feature flag to be on.
    // Mirrors the frontend "hide POS button/route" UX.
    if (saleSource === SALE_SOURCE_POS) {
      const posEnabled = await featureFlagsService.isFeatureEnabled('pos');
      if (!posEnabled) {
        const err = new ValidationError('POS module is disabled');
        err.statusCode = 403;
        err.code = 'FEATURE_DISABLED';
        err.feature = 'pos';
        throw err;
      }
    }

    const isInstallmentSale =
      paymentType === 'installment' ||
      paymentType === 'mixed' ||
      saleType    === SALE_TYPE_INSTALLMENT;

    // Feature gate: reject installment sales when the installments module is
    // disabled. Mirrors the frontend "hide installment button" UX so a
    // direct API call still gets blocked.
    if (isInstallmentSale) {
      const installmentsEnabled = await featureFlagsService.isFeatureEnabled('installments');
      if (!installmentsEnabled) {
        const err = new ValidationError('Installments are disabled');
        err.statusCode = 403;
        err.code = 'FEATURE_DISABLED';
        err.feature = 'installments';
        throw err;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    const currency = saleData.currency || currencySettings.defaultCurrency;

    // ── Per-line installment interest ─────────────────────────────────────────
    // Interest is now set PER PRODUCT LINE as a per-unit amount (فائدة الوحدة),
    // entered manually on installment invoices only (cash lines send 0 → no-op).
    // We aggregate it here so the invoice keeps a single interest total
    // (sales.interest_amount) for GL/reporting, while each sale_item stores its
    // own snapshot below. Round each line so the aggregate equals the sum of the
    // stored line snapshots (keeps the GL interest credit balanced to the fil).
    let interestTotal = 0;
    for (const item of saleData.items) {
      const ipu = isInstallmentSale ? Math.max(0, parseFloat(item.interestPerUnit) || 0) : 0;
      interestTotal += roundByCurrency(ipu * (parseInt(item.quantity, 10) || 0), currency);
    }
    interestTotal = roundByCurrency(interestTotal, currency);

    const interestAmount = interestTotal;
    // Deprecated invoice-level rate, kept only as an informational blended value.
    const blendedInterestRate =
      totals.subtotal > 0 ? Number(((interestTotal / totals.subtotal) * 100).toFixed(4)) : 0;

    let finalTotal = roundByCurrency(totals.total + interestTotal, currency);

    let paidAmount = roundByCurrency(parseFloat(saleData.paidAmount) || 0, currency);
    let remainingAmount = Math.max(0, finalTotal - paidAmount);

    const threshold = currency === 'IQD' ? 250 : 0.01;
    remainingAmount = remainingAmount < threshold ? 0 : roundByCurrency(remainingAmount, currency);

    // Never book an overpayment: cap the collected amount at the invoice total.
    // (Any cash "change" is a POS/UI concern, not a recorded payment.)
    if (paidAmount > finalTotal) {
      paidAmount = finalTotal;
      remainingAmount = 0;
    }

    // POS sales are always settled in full — a POS request that leaves a balance
    // is a bug (the POS screen pays in full and never books a debt), so reject it
    // instead of silently creating a customer debt. A NEW_SALE invoice, by
    // contrast, may be paid in full, partially paid, or fully deferred: any
    // remainder becomes a customer debt (booked below) and is collected later
    // through addPayment(). (The IQD/USD rounding threshold above already zeroes
    // a sub-currency-unit remainder, so this never false-positives on rounding.)
    if (saleSource === SALE_SOURCE_POS && remainingAmount > 0) {
      throw new ValidationError('بيع نقطة البيع يجب أن يكون مدفوعاً بالكامل.');
    }

    const exchangeRate =
      saleData.exchangeRate ||
      (currency === 'USD' ? currencySettings.usdRate : currencySettings.iqdRate);

    const customerId = saleData.customerId || null;

    // Pricing tier the cashier sold at (تسعير الوكلاء). The frontend already
    // resolved each line's unitPrice for this tier; we only stamp the choice for
    // reporting. Unknown/missing → 'retail' (مفرد) so legacy callers are safe.
    const priceType = ['retail', 'wholesale', 'agent'].includes(saleData.priceType)
      ? saleData.priceType
      : 'retail';

    if (isInstallmentSale && !customerId) {
      throw new ValidationError('يرجى اختيار العميل لإكمال البيع بالأقساط');
    }

    // A partially paid or fully deferred invoice leaves a balance that must be
    // owed by a real customer so it can be collected later. A fully-paid sale
    // (remainingAmount === 0, e.g. a walk-in cash invoice) needs no customer.
    if (remainingAmount > 0 && !customerId) {
      throw new ValidationError('يجب تحديد العميل عند البيع الآجل أو الدفع الجزئي.');
    }

    // Enforce credit-limit policy before any DB writes.
    // Throws ValidationError when the smart decision rejects the sale and the
    // caller lacks the override permission.
    await enforceCreditLimit({
      customerId,
      total: finalTotal,
      user: actingUser,
      paymentType,
      branchId: actingUser?.assignedBranchId || saleData.branchId || null,
    });

    // Hard per-customer credit ceiling (سقف الدين) — applies to ANY sale that
    // leaves a balance (cash with partial payment, credit, or installment), not
    // just installments. NULL limit = unlimited.
    await enforceCustomerCreditLimit({
      customerId,
      newRemaining: remainingAmount,
      user: actingUser,
    });

    // Resolve branch + warehouse. A branch-bound user may target any branch in
    // their assigned set (many-to-many) — honour the requested branch/warehouse
    // first, then fall back to their primary/fixed assignment. The
    // enforceWarehouseScope() gate below rejects anything outside their scope,
    // so a client still can't spoof a foreign branch.
    const { branchId, warehouseId } = await resolveBranchWarehouse({
      branchId: saleData.branchId || actingUser?.assignedBranchId,
      warehouseId: actingUser?.assignedWarehouseId || saleData.warehouseId,
      actingUser,
    });

    // Final scope check — throws if the resolved warehouse is outside the
    // acting user's branch/warehouse scope (defensive).
    await enforceWarehouseScope(actingUser, warehouseId);

    // Attach to the open accounting period (required when the feature is on).
    const accountingPeriodId = await accountingPeriodService.resolvePeriodIdForWrite(
      actingUser,
      branchId,
      { require: true }
    );

    // A sale binds to the CURRENT USER (createdBy) and the open accounting
    // period (enforced above via resolvePeriodIdForWrite).
    const newSaleId = await withTransaction(async (tx) => {
      // Allocate inside the transaction so a rollback releases the number
      // back (the counter increment rolls back too) and concurrent inserts
      // serialize on the row-level lock.
      const { invoiceNumber, issuedAt } = await allocateInvoiceNumber(tx, branchId);

      const [newSale] = await tx
        .insert(sales)
        .values({
          invoiceNumber,
          issuedAt,
          customerId,
          branchId,
          warehouseId,
          accountingPeriodId,
          subtotal: String(totals.subtotal),
          discount: String(totals.discount),
          tax: String(totals.tax),
          total: String(finalTotal),
          currency,
          exchangeRate: String(exchangeRate),
          paymentType,
          saleSource,
          saleType,
          priceType,
          // Online-order linkage — null for ordinary POS/NewSale invoices.
          channelId: saleData.channelId || null,
          onlineOrderId: saleData.onlineOrderId || null,
          paidAmount: String(paidAmount),
          remainingAmount: String(remainingAmount),
          status: remainingAmount <= 0 ? 'completed' : 'pending',
          notes: saleData.notes || null,
          createdBy: userId,
          // interestRate is deprecated (interest is now per-line); store the
          // blended effective rate so legacy readers stay consistent.
          interestRate: String(blendedInterestRate),
          interestAmount: String(roundByCurrency(interestAmount, currency)),
        })
        .returning();

      const stockItems = [];
      for (const item of saleData.items) {
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (!product) {
          throw new NotFoundError(`Product with ID ${item.productId} not found`);
        }

        // Resolve the chosen unit (defaults to base when unitId is null) so
        // we can store a snapshot AND deduct the correct base-unit quantity.
        const unit = await resolveUnitSnapshot(tx, item.productId, item.unitId || null);
        const baseQty = Math.round(Number(item.quantity || 0) * unit.conversionFactor);
        if (!Number.isInteger(baseQty) || baseQty <= 0) {
          throw new ValidationError('الكمية المحوّلة للوحدة الأساسية غير صالحة');
        }

        const itemDiscountTotal = (item.discount || 0) * item.quantity;
        const itemSubtotal = item.quantity * item.unitPrice - itemDiscountTotal;

        // Per-line installment interest snapshot. Only set the before/after-price
        // columns when this line actually carries interest, so cash and
        // zero-interest lines stay NULL (indistinguishable from legacy rows and
        // rendered identically). `subtotal` above stays the BASE line total.
        const lineInterestPerUnit = isInstallmentSale
          ? Math.max(0, parseFloat(item.interestPerUnit) || 0)
          : 0;
        const lineInterestAmount = roundByCurrency(lineInterestPerUnit * item.quantity, currency);
        const hasLineInterest = lineInterestPerUnit > 0;

        // Snapshot the per-unit cost so reports stay correct after the
        // catalog's unit cost changes. Override → that override; otherwise
        // base cost × factor.
        const baseCost = Number(product.costPrice) || 0;
        const perUnitCost = unit.costPrice != null ? Number(unit.costPrice) : baseCost * unit.conversionFactor;

        const [insertedSaleItem] = await tx.insert(saleItems).values({
          saleId: newSale.id,
          productId: item.productId,
          // Product snapshot — frozen here so the invoice survives a later
          // hard-delete of the product (cancelled invoices keep these values).
          productName: product.name,
          productSku: product.sku || null,
          barcode: product.barcode || null,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          discount: String(itemDiscountTotal),
          subtotal: String(parseFloat(itemSubtotal.toFixed(2))),
          // Per-line installment interest snapshot (NULL/0 = no interest).
          unitPriceBeforeInterest: hasLineInterest ? String(item.unitPrice) : null,
          interestPerUnit: String(lineInterestPerUnit),
          interestAmount: String(lineInterestAmount),
          unitPriceAfterInterest: hasLineInterest ? String(item.unitPrice + lineInterestPerUnit) : null,
          unitId: unit.id,
          unitName: unit.name,
          unitConversionFactor: String(unit.conversionFactor),
          baseQuantity: baseQty,
          unitCostPrice: String(perUnitCost || 0),
          priceType,
          // Per-line note (ملاحظة المنتج). Blank/whitespace → NULL.
          notes: item.notes && String(item.notes).trim() ? String(item.notes).trim() : null,
        }).returning({ id: saleItems.id });

        stockItems.push({
          productId: item.productId,
          quantity: baseQty,
          saleItemId: insertedSaleItem.id,
          unitId: unit.id,
          unitName: unit.name,
          unitQuantity: item.quantity,
        });
      }

      // Per-warehouse stock deduction via inventoryService.
      // Throws ValidationError on insufficient stock and rolls back the tx.
      await InventoryService.applySaleStockMovement(tx, {
        saleId: newSale.id,
        warehouseId,
        items: stockItems,
        userId,
      });

      if (paidAmount > 0) {
        const method = saleData.paymentMethod || 'cash';
        const [insertedPayment] = await tx.insert(payments).values({
          saleId: newSale.id,
          customerId,
          amount: String(parseFloat(paidAmount.toFixed(2))),
          currency,
          exchangeRate: String(exchangeRate),
          paymentMethod: method,
          paymentReference: saleData.paymentReference || null,
          createdBy: userId,
          notes: saleData.paymentNotes || null,
        }).returning({ id: payments.id });

        // Treasury: mint the receipt voucher (سند قبض) in the same tx. No-op
        // when the treasury flag is off or the payment never touches a drawer.
        await voucherService.mintForPayment(tx, {
          payment: {
            id: insertedPayment.id,
            amount: paidAmount,
            currency,
            exchangeRate,
            paymentMethod: method,
          },
          sale: { id: newSale.id, branchId, customerId, invoiceNumber },
          user: actingUser || { id: userId },
          sourceType: 'sale_payment',
          cashboxId: saleData.cashboxId || null,
          bankAccountId: saleData.bankAccountId || null,
        });
      }

      if (isInstallmentSale && remainingAmount > 0) {
        const installmentCount = parseInt(saleData.installmentCount) || 3;
        if (installmentCount < 1) {
          throw new ValidationError('عدد الأقساط يجب أن يكون أكبر من صفر');
        }

        const schedule = buildInstallmentSchedule({
          totalRemaining: remainingAmount,
          count: installmentCount,
          currency,
          firstInstallmentDate: saleData.firstInstallmentDate,
          period: saleData.installmentPeriod,
        });

        for (const row of schedule) {
          await tx.insert(installments).values({
            saleId: newSale.id,
            customerId,
            installmentNumber: row.installmentNumber,
            dueAmount: String(row.dueAmount),
            paidAmount: '0',
            remainingAmount: String(row.dueAmount),
            currency,
            dueDate: row.dueDate,
            status: 'pending',
          });
        }
      }

      if (customerId && remainingAmount > 0) {
        await tx
          .update(customers)
          .set({
            totalDebt: sql`${customers.totalDebt}::numeric + ${remainingAmount}`,
            totalPurchases: sql`${customers.totalPurchases}::numeric + ${finalTotal}`,
          })
          .where(eq(customers.id, customerId));
      }

      // GL: post the sale's journal entry in the same tx (failure-valved —
      // a posting defect records a repair row, never breaks the sale).
      await glPostingService.postDocument(tx, {
        sourceType: 'sale',
        sourceId: newSale.id,
        user: actingUser || { id: userId },
      });

      return newSale.id;
    });

    alertBus.emit('alerts.changed', 'sale.created');
    return await this.getById(newSaleId);
  }

  async getAll(filters = {}, actingUser = null) {
    const db = await getDb();
    const { page = 1, limit = 10, search, status, startDate, endDate, paymentType, minTotal, maxTotal } =
      filters;

    // Centralized, ranked text search over invoice number, customer name/phone,
    // products inside the invoice, payment method, status and notes (req #3).
    const searchClause = buildSearch(SALE_SEARCH_TARGETS, search);

    const conditions = [];

    if (searchClause.where) {
      conditions.push(searchClause.where);
    }

    if (status) {
      conditions.push(eq(sales.status, status));
    }

    // PosScreen passes paymentType='cash' to exclude installment drafts.
    if (paymentType) {
      conditions.push(eq(sales.paymentType, paymentType));
    }

    if (startDate) {
      conditions.push(gte(sales.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(sales.createdAt, new Date(endDate)));
    }

    if (filters.customer) {
      conditions.push(eq(sales.customerId, filters.customer));
    }

    // Invoice total range filter (req #14).
    if (minTotal !== undefined && minTotal !== null && minTotal !== '') {
      conditions.push(gte(sales.total, String(Number(minTotal))));
    }
    if (maxTotal !== undefined && maxTotal !== null && maxTotal !== '') {
      conditions.push(lte(sales.total, String(Number(maxTotal))));
    }

    // Branch scope (multi-branch + feature-flag aware). A branch-bound user only
    // ever sees invoices from the branches assigned to them; a multi-branch user
    // sees ALL of theirs and may narrow to one via `filters.branchId`. Global
    // admins (and the feature-off single-branch shop) are unrestricted and may
    // optionally filter by an explicit branch.
    const invoiceScope = await invoiceBranchScope(actingUser);
    if (invoiceScope === null) {
      if (filters.branchId) conditions.push(eq(sales.branchId, Number(filters.branchId)));
    } else {
      if (invoiceScope.length === 0) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
      const req = filters.branchId ? Number(filters.branchId) : null;
      conditions.push(
        req && invoiceScope.includes(req)
          ? eq(sales.branchId, req)
          : inArray(sales.branchId, invoiceScope)
      );
    }

    // Get total count. The customers join is required because the search
    // predicate may reference customer name / phone.
    let countQuery = db
      .select({ count: sql`count(*)` })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id));
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions));
    }
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    const offset = (page - 1) * limit;

    // Strongest matches first when searching (req #9); else newest-first.
    const orderBy = searchClause.active
      ? [desc(searchClause.rankScore), desc(sales.createdAt)]
      : [desc(sales.createdAt)];

    // Main query with joins + pagination
    let query = db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        total: sales.total,
        currency: sales.currency,
        paymentType: sales.paymentType,
        priceType: sales.priceType,
        paidAmount: sales.paidAmount,
        remainingAmount: sales.remainingAmount,
        status: sales.status,
        createdAt: sales.createdAt,
        customer: customers.name,
        customerPhone: customers.phone,
        customerId: sales.customerId,
        // Branch shown explicitly in the list. branchName is NULL when the
        // invoice has no branch or its branch row was removed — the UI renders
        // "غير محدد" in that case.
        branchId: sales.branchId,
        branchName: branches.name,
        createdBy: users.username,
        itemCount: sql`(SELECT COUNT(*) FROM ${saleItems} WHERE ${saleItems.saleId} = ${sales.id})`,
        returnedTotal: sql`COALESCE((SELECT SUM(${saleReturns.returnedValue}::numeric) FROM ${saleReturns} WHERE ${saleReturns.saleId} = ${sales.id}), 0)`,
        // Search match metadata (req #18) — null/0 when not searching.
        matchedField: searchClause.active ? searchClause.matchedField : sql`NULL`,
        matchedValue: searchClause.active ? searchClause.matchedValue : sql`NULL`,
        rankScore: searchClause.active ? searchClause.rankScore : sql`0`,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .leftJoin(users, eq(sales.createdBy, users.id))
      .leftJoin(branches, eq(sales.branchId, branches.id))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query;

    return {
      data: results.map((row) => ({
        ...row,
        total: n(row.total),
        paidAmount: n(row.paidAmount),
        remainingAmount: n(row.remainingAmount),
        itemCount: Number(row.itemCount) || 0,
        returnedTotal: n(row.returnedTotal),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id) {
    const db = await getDb();
    const [sale] = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerId: sales.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        branchId: sales.branchId,
        branchName: branches.name,
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        subtotal: sales.subtotal,
        discount: sales.discount,
        tax: sales.tax,
        total: sales.total,
        currency: sales.currency,
        exchangeRate: sales.exchangeRate,
        interestRate: sales.interestRate,
        interestAmount: sales.interestAmount,
        paymentType: sales.paymentType,
        priceType: sales.priceType,
        paidAmount: sales.paidAmount,
        remainingAmount: sales.remainingAmount,
        status: sales.status,
        notes: sales.notes,
        issuedAt: sales.issuedAt,
        createdAt: sales.createdAt,
        createdBy: users.username,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .leftJoin(users, eq(sales.createdBy, users.id))
      .leftJoin(branches, eq(sales.branchId, branches.id))
      .leftJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .where(eq(sales.id, id))
      .limit(1);

    if (!sale) {
      throw new NotFoundError('Sale');
    }

    let customer = null;
    if (sale.customerId) {
      const [customerData] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, sale.customerId))
        .limit(1);
      customer = customerData || null;
    }

    const items = await db
      .select({
        id: saleItems.id,
        saleId: saleItems.saleId,
        productId: saleItems.productId,
        // Snapshot fields — survive a hard-delete of the product.
        productName: saleItems.productName,
        productSku: saleItems.productSku,
        barcode: saleItems.barcode,
        productDescription: products.description,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        discount: saleItems.discount,
        subtotal: saleItems.subtotal,
        // Per-line installment interest snapshot. `unitPriceAfterInterest` non-null
        // is the "new-style" flag the UI/print use. `interestAmount` is aliased to
        // `lineInterestAmount` so it never collides with the sale-level field.
        unitPriceBeforeInterest: saleItems.unitPriceBeforeInterest,
        interestPerUnit: saleItems.interestPerUnit,
        lineInterestAmount: saleItems.interestAmount,
        unitPriceAfterInterest: saleItems.unitPriceAfterInterest,
        unitId: saleItems.unitId,
        unitName: saleItems.unitName,
        unitConversionFactor: saleItems.unitConversionFactor,
        baseQuantity: saleItems.baseQuantity,
        // Frozen per-unit cost (NULL on legacy rows — falls back to current
        // products.cost_price * baseQuantity).
        unitCostPrice: saleItems.unitCostPrice,
        priceType: saleItems.priceType,
        // Per-line note (ملاحظة المنتج). NULL on legacy rows / blank entries.
        notes: saleItems.notes,
        // Profit visibility — uses the product's current cost_price. Returns
        // null when the product was deleted so the UI can render "n/a".
        costPrice: products.costPrice,
        createdAt: saleItems.createdAt,
      })
      .from(saleItems)
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(eq(saleItems.saleId, id));

    const salePayments = await db
      .select()
      .from(payments)
      .where(eq(payments.saleId, id));

    const saleInstallments = await db
      .select()
      .from(installments)
      .where(eq(installments.saleId, id));

    const returns = await this.getReturnsForSale(id);

    // Compute per-item + sale-level profit. profit=null on any item with a
    // missing cost (deleted product) so the UI can show "n/a" instead of
    // a misleading number. The sale-level total is null in that case too.
    // Profit prefers the per-unit cost frozen at sale time (so reports stay
    // correct even if the catalog's unit cost is changed later). Falls back
    // to the product's current base cost × baseQuantity for legacy rows
    // recorded before the unit-cost snapshot column existed.
    //
    // The invoice-level discount («خصم الفاتورة») is distributed across the
    // lines in proportion to each line's value (with a per-line cost floor)
    // BEFORE profit is computed, so a single-line invoice carries its full
    // discount and no line's net sale price ever drops below its cost (profit
    // floored at 0). See utils/discountAllocation.js. A sale stored before this
    // change keeps its discount; if it exceeds the lines' capacity the floor
    // simply caps each line at 0 profit on display.
    const lineMeta = items.map((item) => {
      const baseCost = item.costPrice == null ? null : Number(item.costPrice);
      const qty = Number(item.quantity) || 0;
      const factor = Number(item.unitConversionFactor) || 1;
      const baseQty = Number(item.baseQuantity) || qty * factor;
      const unitCost = item.unitCostPrice == null ? null : Number(item.unitCostPrice);
      const value = Number(item.unitPrice) * qty - n(item.discount);
      let cost = null;
      if (unitCost != null) cost = unitCost * qty;
      else if (baseCost != null) cost = baseCost * baseQty;
      return { baseCost, qty, factor, baseQty, unitCost, value, cost };
    });

    const saleDiscount = n(sale.discount);
    const { allocations } = allocateInvoiceDiscount(
      // A null cost (deleted product) can't be floored — treat it as 0 so it
      // still draws its proportional share; that line's profit stays null below.
      lineMeta.map((m) => ({ value: m.value, cost: m.cost == null ? 0 : m.cost })),
      saleDiscount
    );

    const enrichedItems = items.map((item, i) => {
      const m = lineMeta[i];
      const invoiceDiscountShare = roundByCurrency(allocations[i] || 0, sale.currency);
      const netSaleAmount = roundByCurrency(m.value - invoiceDiscountShare, sale.currency);
      const profit = m.cost == null ? null : roundByCurrency(netSaleAmount - m.cost, sale.currency);
      return {
        ...item,
        unitPrice: n(item.unitPrice),
        discount: n(item.discount),
        subtotal: n(item.subtotal),
        // Keep before/after-interest NULL on legacy/zero-interest rows so the
        // "new-style" detection (after != null) stays meaningful; coerce the rest.
        unitPriceBeforeInterest:
          item.unitPriceBeforeInterest == null ? null : n(item.unitPriceBeforeInterest),
        interestPerUnit: n(item.interestPerUnit),
        lineInterestAmount: n(item.lineInterestAmount),
        unitPriceAfterInterest:
          item.unitPriceAfterInterest == null ? null : n(item.unitPriceAfterInterest),
        unitConversionFactor: m.factor,
        baseQuantity: m.baseQty,
        unitCostPrice: m.unitCost,
        costPrice: m.baseCost,
        // This line's share of the invoice discount + its net sale after it.
        invoiceDiscountShare,
        netSaleAmount,
        profit,
      };
    });
    const profitAccurate = enrichedItems.every((it) => it.profit !== null);
    const totalProfit = profitAccurate
      ? enrichedItems.reduce((acc, it) => acc + (it.profit || 0), 0)
      : null;

    // Convert numeric strings to numbers for the response
    return {
      ...sale,
      subtotal: n(sale.subtotal),
      discount: n(sale.discount),
      tax: n(sale.tax),
      total: n(sale.total),
      exchangeRate: n(sale.exchangeRate),
      interestRate: n(sale.interestRate),
      interestAmount: n(sale.interestAmount),
      paidAmount: n(sale.paidAmount),
      remainingAmount: n(sale.remainingAmount),
      totalProfit,
      profitAccurate,
      customer,
      items: enrichedItems,
      payments: salePayments.map((p) => ({
        ...p,
        amount: n(p.amount),
        exchangeRate: n(p.exchangeRate),
      })),
      installments: saleInstallments.map((inst) => ({
        ...inst,
        dueAmount: n(inst.dueAmount),
        paidAmount: n(inst.paidAmount),
        remainingAmount: n(inst.remainingAmount),
      })),
      returns,
    };
  }

  /**
   * Block a sale mutation when its accounting period OR its shift is closed.
   * Reads the period/shift ids straight from the row (getById omits them) and
   * delegates to the central writability guards. No-op when the sale isn't
   * attached to a period/shift (legacy rows / feature off).
   */
  async assertSaleWritable(saleId) {
    const db = await getDb();
    const [row] = await db
      .select({ accountingPeriodId: sales.accountingPeriodId })
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);
    await accountingPeriodService.assertAccountingPeriodWritable(row?.accountingPeriodId || null);
  }

  async addPayment(saleId, paymentData, userId) {
    const sale = await this.getById(saleId);
    // Recording a payment mutates the sale — blocked once its period/shift closes.
    await this.assertSaleWritable(saleId);

    if (sale.status === 'cancelled') {
      throw new ValidationError('Cannot add payment to cancelled sale');
    }

    if (sale.remainingAmount <= 0) {
      throw new ValidationError('Sale is already fully paid');
    }

    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    const currency = sale.currency || 'USD';
    const roundedPaymentDataAmount = roundByCurrency(paymentData.amount, currency);
    const roundedRemainingAmount = roundByCurrency(sale.remainingAmount, currency);

    // Reject a genuine overpayment with a clear message (a sub-currency-unit
    // rounding overshoot is still capped silently by the Math.min below).
    const overThreshold = currency === 'IQD' ? 250 : 0.01;
    if (roundedPaymentDataAmount - roundedRemainingAmount > overThreshold) {
      throw new ValidationError('مبلغ الدفعة يتجاوز المبلغ المتبقي على الفاتورة.');
    }

    const paymentAmount = Math.min(roundedPaymentDataAmount, roundedRemainingAmount);

    let insertedPaymentId = null;

    await withTransaction(async (tx) => {
      const [insertedPayment] = await tx
        .insert(payments)
        .values({
          saleId,
          customerId: sale.customerId,
          amount: String(paymentAmount),
          currency: paymentData.currency || sale.currency,
          exchangeRate: String(paymentData.exchangeRate || sale.exchangeRate),
          paymentMethod: paymentData.paymentMethod || 'cash',
          paymentReference: paymentData.paymentReference || null,
          notes: paymentData.notes,
          createdBy: userId,
        })
        .returning({ id: payments.id });
      insertedPaymentId = insertedPayment?.id || null;

      // Treasury: mint the receipt voucher (سند قبض) for the debt payment in
      // the same tx — the collecting user's open-shift cashbox is preferred.
      await voucherService.mintForPayment(tx, {
        payment: {
          id: insertedPayment.id,
          amount: paymentAmount,
          currency: paymentData.currency || sale.currency,
          exchangeRate: paymentData.exchangeRate || sale.exchangeRate,
          paymentMethod: paymentData.paymentMethod || 'cash',
        },
        sale: {
          id: sale.id,
          branchId: sale.branchId,
          customerId: sale.customerId,
          invoiceNumber: sale.invoiceNumber,
        },
        user: { id: userId },
        sourceType: 'collections',
        cashboxId: paymentData.cashboxId || null,
        bankAccountId: paymentData.bankAccountId || null,
      });

      // GL: post the debt payment (Dr cash/bank ↔ Cr AR).
      await glPostingService.postDocument(tx, {
        sourceType: 'payment',
        sourceId: insertedPayment.id,
        user: { id: userId },
      });

      const roundedPaymentAmount = roundByCurrency(paymentAmount, currency);
      const newPaidAmount = roundByCurrency(sale.paidAmount + roundedPaymentAmount, currency);
      const newRemainingAmount = Math.max(
        0,
        roundByCurrency(sale.remainingAmount - roundedPaymentAmount, currency)
      );
      const newStatus = newRemainingAmount <= 0 ? 'completed' : 'pending';

      await tx
        .update(sales)
        .set({
          paidAmount: String(newPaidAmount),
          remainingAmount: String(newRemainingAmount),
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(sales.id, saleId));

      if (sale.customerId) {
        await tx
          .update(customers)
          .set({
            totalDebt: sql`${customers.totalDebt}::numeric - ${paymentAmount}`,
          })
          .where(eq(customers.id, sale.customerId));
      }

      if (sale.installments && sale.installments.length > 0) {
        let remainingPayment = paymentAmount;

        for (const installment of sale.installments) {
          if (remainingPayment <= 0) break;
          if (installment.status === 'paid') continue;

          const installmentPayment = Math.min(remainingPayment, installment.remainingAmount);
          const newInstallmentPaid = installment.paidAmount + installmentPayment;
          const newInstallmentRemaining = installment.remainingAmount - installmentPayment;
          const installmentStatus = newInstallmentRemaining <= 0 ? 'paid' : 'pending';

          await tx
            .update(installments)
            .set({
              paidAmount: String(newInstallmentPaid),
              remainingAmount: String(newInstallmentRemaining),
              status: installmentStatus,
              paidDate: installmentStatus === 'paid' ? new Date().toISOString().split('T')[0] : null,
              updatedAt: new Date(),
            })
            .where(eq(installments.id, installment.id));

          remainingPayment -= installmentPayment;
        }
      }
    });

    alertBus.emit('alerts.changed', 'payment.added');

    // Reload the sale + customer so we have the post-payment state for the
    // confirmation message. Errors here MUST NOT roll back the payment — the
    // notification system is optional, so we log and move on.
    try {
      const updatedSale = await this.getById(saleId);
      if (updatedSale.customerId && insertedPaymentId) {
        const db = await getDb();
        const [c] = await db
          .select()
          .from(customers)
          .where(eq(customers.id, updatedSale.customerId))
          .limit(1);
        if (c && c.phone) {
          const notifications = await import('./notifications/notificationService.js');
          await notifications.sendPaymentConfirmation({
            sale: updatedSale,
            payment: { id: insertedPaymentId, amount: paymentAmount },
            customer: c,
          });
        }
      }
    } catch (err) {
      // Non-fatal — payment is already committed.
      // eslint-disable-next-line no-console
      console.warn('[notifications] payment confirmation skipped:', err.message);
    }

    return await this.getById(saleId);
  }

  async cancel(id, userId) {
    const sale = await this.getById(id);

    if (sale.status === 'cancelled') {
      throw new ValidationError('Sale is already cancelled');
    }

    // Cancelling mutates the sale — blocked once its accounting period is closed.
    const db = await getDb();
    const [salePeriodRow] = await db
      .select({
        accountingPeriodId: sales.accountingPeriodId,
      })
      .from(sales)
      .where(eq(sales.id, id))
      .limit(1);
    await accountingPeriodService.assertWritable(salePeriodRow?.accountingPeriodId || null);

    const result = await withTransaction(async (tx) => {
      // Per-warehouse stock restore via inventoryService (records sale_cancel
      // movement). Legacy sales with no warehouseId are skipped safely.
      // We restore in base units so unit-aware sales unwind correctly even
      // though the user originally bought 2 درزن.
      await InventoryService.restoreSaleStockMovement(tx, {
        saleId: sale.id,
        warehouseId: sale.warehouseId,
        items: sale.items
          .filter((i) => i.productId)
          .map((i) => ({
            productId: i.productId,
            quantity: Number(i.baseQuantity || i.quantity) || 0,
            unitId: i.unitId || null,
            unitName: i.unitName || null,
            unitQuantity: i.quantity,
          })),
        userId,
        movementType: 'sale_cancel',
      });

      if (sale.customerId && sale.remainingAmount > 0) {
        await tx
          .update(customers)
          .set({
            totalDebt: sql`GREATEST(${customers.totalDebt}::numeric - ${sale.remainingAmount}, 0)`,
            totalPurchases: sql`GREATEST(${customers.totalPurchases}::numeric - ${sale.total}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, sale.customerId));
      }

      await tx
        .update(installments)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(and(eq(installments.saleId, id), eq(installments.status, 'pending')));

      const [updated] = await tx
        .update(sales)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(sales.id, id))
        .returning();

      // GL: reverse the sale's entry (and any debt-payment entries linked to
      // it) so the ledger mirrors the cancellation.
      await glPostingService.reverseEntry(tx, {
        sourceType: 'sale',
        sourceId: id,
        user: { id: userId },
        reason: 'إلغاء الفاتورة',
      });

      return updated;
    });

    alertBus.emit('alerts.changed', 'sale.cancelled');
    return result;
  }

  async getSalesReport(filters = {}, actingUser = null) {
    const db = await getDb();
    const { startDate, endDate, currency } = filters;

    const toYmd = (d) => (d ? new Date(d).toISOString().split('T')[0] : null);
    const start = toYmd(startDate);
    const end = toYmd(endDate);

    // Use sql cast for date comparison with timestamps
    const createdDate = sql`${sales.createdAt}::date::text`;
    const conds = [
      // Include returned / partially-returned sales — they are still real
      // transactions; the returned portion is netted out below. Excluding them
      // (as the old `completed|pending` filter did) made a returned sale vanish
      // from the report entirely instead of being correctly reduced.
      inArray(sales.status, ['completed', 'pending', 'partially_returned', 'returned']),
      ...(start ? [gte(createdDate, start)] : []),
      ...(end ? [lte(createdDate, end)] : []),
    ];
    if (currency) conds.push(eq(sales.currency, currency));

    const invoiceScope = await invoiceBranchScope(actingUser);
    if (invoiceScope !== null) {
      if (invoiceScope.length === 0) {
        // Nothing to report for a user with no assigned branch
        return { salesUSD: 0, paidUSD: 0, profitUSD: 0, salesIQD: 0, paidIQD: 0, profitIQD: 0, count: 0 };
      }
      const req = filters.branchId ? Number(filters.branchId) : null;
      conds.push(
        req && invoiceScope.includes(req)
          ? eq(sales.branchId, req)
          : inArray(sales.branchId, invoiceScope)
      );
    } else if (filters.branchId) {
      conds.push(eq(sales.branchId, Number(filters.branchId)));
    }

    const salesData = await db
      .select()
      .from(sales)
      .where(and(...conds));

    const saleIds = salesData.map((s) => s.id);

    let items = [];
    if (saleIds.length) {
      items = await db
        .select({
          saleId: saleItems.saleId,
          quantity: saleItems.quantity,
          unitPrice: saleItems.unitPrice,
          discount: saleItems.discount,
          subtotal: saleItems.subtotal,
          unitConversionFactor: saleItems.unitConversionFactor,
          baseQuantity: saleItems.baseQuantity,
          unitCostPrice: saleItems.unitCostPrice,
          productId: saleItems.productId,
          productCost: products.costPrice,
          currency: sales.currency,
        })
        .from(saleItems)
        .leftJoin(products, eq(saleItems.productId, products.id))
        .leftJoin(sales, eq(saleItems.saleId, sales.id))
        .where(inArray(saleItems.saleId, saleIds));
    }

    const byCur = {};
    for (const s of salesData) {
      const c = s.currency || 'USD';
      byCur[c] ??= {
        totalSales: 0,
        totalPaid: 0,
        totalRemaining: 0,
        totalProfit: 0,
        totalRevenue: 0,
        totalDiscount: 0,
        totalInterest: 0,
        count: 0,
        cashSales: 0,
        installmentSales: 0,
        mixedSales: 0,
        completedSales: 0,
        pendingSales: 0,
      };
      const o = byCur[c];

      o.totalSales += n(s.total);
      o.totalPaid += n(s.paidAmount);
      o.totalRemaining += n(s.remainingAmount);
      o.totalDiscount += n(s.discount);
      o.totalInterest += n(s.interestAmount);
      o.totalRevenue += n(s.total) - n(s.interestAmount);

      o.count += 1;
      if (s.paymentType) o[`${s.paymentType}Sales`] = (o[`${s.paymentType}Sales`] || 0) + 1;
      o[`${s.status}Sales`] = (o[`${s.status}Sales`] || 0) + 1;
    }

    for (const item of items) {
      const c = item.currency || 'USD';
      if (!item.quantity || item.quantity <= 0) continue;
      const itemDiscount = n(item.discount);
      const factor = Number(item.unitConversionFactor) || 1;
      const baseQty = Number(item.baseQuantity) || item.quantity * factor;
      const lineRevenue = n(item.unitPrice) * item.quantity - itemDiscount;
      // Prefer the snapshotted per-unit cost so a unit-cost override
      // remains in effect for historical sales after a catalog edit. Falls
      // back to the product's current base cost × baseQuantity (the
      // legacy/no-snapshot path).
      const unitCost = item.unitCostPrice == null ? null : Number(item.unitCostPrice);
      const baseCost = n(item.productCost);
      const profit = unitCost != null
        ? lineRevenue - unitCost * item.quantity
        : lineRevenue - baseCost * baseQty;
      if (byCur[c]) byCur[c].totalProfit += profit;
    }

    // ── Net out returns ──────────────────────────────────────────────────────
    // A returned / partially-returned sale keeps its original total + line items
    // (so everything summed above is GROSS). Subtract the authoritative returned
    // value (capped/rounded at return time) from sales & revenue, and the
    // returned gross margin (returned value − returned cost) from profit. The
    // returned cost reuses the same per-unit snapshot the forward profit uses so
    // a full return nets the line's profit back to zero.
    let returnItems = [];
    let returnValueRows = [];
    if (saleIds.length) {
      returnItems = await db
        .select({
          quantity: saleReturnItems.quantity,
          baseQuantity: saleReturnItems.baseQuantity,
          unitConversionFactor: saleReturnItems.unitConversionFactor,
          unitCostPrice: saleItems.unitCostPrice,
          productCost: products.costPrice,
          currency: sales.currency,
        })
        .from(saleReturnItems)
        .leftJoin(saleReturns, eq(saleReturnItems.returnId, saleReturns.id))
        .leftJoin(sales, eq(saleReturns.saleId, sales.id))
        .leftJoin(saleItems, eq(saleReturnItems.saleItemId, saleItems.id))
        .leftJoin(products, eq(saleReturnItems.productId, products.id))
        .where(inArray(saleReturns.saleId, saleIds));

      returnValueRows = await db
        .select({
          currency: sales.currency,
          returnedValue: sql`COALESCE(SUM(${saleReturns.returnedValue}::numeric),0)`,
        })
        .from(saleReturns)
        .leftJoin(sales, eq(saleReturns.saleId, sales.id))
        .where(inArray(saleReturns.saleId, saleIds))
        .groupBy(sales.currency);
    }

    const returnedCostByCur = {};
    for (const ri of returnItems) {
      const c = ri.currency || 'USD';
      returnedCostByCur[c] = (returnedCostByCur[c] || 0) + returnedItemCost(ri);
    }
    const returnedValueByCur = Object.fromEntries(
      returnValueRows.map((r) => [r.currency || 'USD', n(r.returnedValue)])
    );

    for (const c in byCur) {
      const o = byCur[c];
      const retVal = returnedValueByCur[c] || 0;
      const retCost = returnedCostByCur[c] || 0;
      o.totalSales = netAfterReturn(o.totalSales, retVal);
      o.totalRevenue = netAfterReturn(o.totalRevenue, retVal);
      // Drop the returned gross margin from profit (= retVal − retCost).
      o.totalProfit += retCost - retVal;
      o.totalProfit = o.totalProfit - o.totalDiscount + o.totalInterest;
    }

    const usd = byCur['USD'] ?? {};
    const iqd = byCur['IQD'] ?? {};
    const allCount = Object.values(byCur).reduce((a, d) => a + (d.count || 0), 0);

    // Overdue installments count
    const overdueResult = await db
      .select({ count: sql`count(*)` })
      .from(installments)
      .where(
        and(
          eq(installments.status, 'pending'),
          lte(installments.dueDate, new Date().toISOString().split('T')[0])
        )
      );

    return {
      salesUSD: usd.totalSales || 0,
      paidUSD: usd.totalPaid || 0,
      profitUSD: parseFloat((usd.totalProfit || 0).toFixed(2)),
      revenueUSD: parseFloat((usd.totalRevenue || 0).toFixed(2)),
      discountUSD: parseFloat((usd.totalDiscount || 0).toFixed(2)),
      interestUSD: parseFloat((usd.totalInterest || 0).toFixed(2)),
      avgSaleUSD: usd.count ? parseFloat((usd.totalSales / usd.count).toFixed(2)) : 0,
      avgProfitUSD: usd.count ? parseFloat((usd.totalProfit / usd.count).toFixed(2)) : 0,
      profitMarginUSD: usd.totalRevenue
        ? parseFloat(((usd.totalProfit / usd.totalRevenue) * 100).toFixed(2))
        : 0,

      salesIQD: iqd.totalSales || 0,
      paidIQD: iqd.totalPaid || 0,
      profitIQD: parseFloat((iqd.totalProfit || 0).toFixed(2)),
      revenueIQD: parseFloat((iqd.totalRevenue || 0).toFixed(2)),
      discountIQD: parseFloat((iqd.totalDiscount || 0).toFixed(2)),
      interestIQD: parseFloat((iqd.totalInterest || 0).toFixed(2)),
      avgSaleIQD: iqd.count ? parseFloat((iqd.totalSales / iqd.count).toFixed(2)) : 0,
      avgProfitIQD: iqd.count ? parseFloat((iqd.totalProfit / iqd.count).toFixed(2)) : 0,
      profitMarginIQD: iqd.totalRevenue
        ? parseFloat(((iqd.totalProfit / iqd.totalRevenue) * 100).toFixed(2))
        : 0,

      count: allCount,
      completedSales: (usd.completedSales || 0) + (iqd.completedSales || 0),
      pendingSales: (usd.pendingSales || 0) + (iqd.pendingSales || 0),
      overdueInstallments: Number(overdueResult[0]?.count || 0),
    };
  }

  async removePayment(saleId, paymentId, userId) {
    const db = await getDb();
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);

    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.userId !== userId) {
      throw new Error('Unauthorized');
    }

    const sale = await this.getById(saleId);
    // Removing a payment mutates the sale — blocked once its period/shift closes.
    await this.assertSaleWritable(saleId);
    const paymentAmount = n(payment.amount);

    await withTransaction(async (tx) => {
      // Cancel the minted treasury voucher BEFORE the payment row disappears
      // (the FK is SET NULL — without this the voucher would stay active and
      // keep inflating the cashbox balance).
      await voucherService.cancelForSource(tx, {
        paymentId,
        reason: 'حذف الدفعة الأصلية',
        userId,
      });
      // GL: reverse the payment's journal entry before the row disappears.
      await glPostingService.reverseEntry(tx, {
        sourceType: 'payment',
        sourceId: paymentId,
        user: { id: userId },
        reason: 'حذف الدفعة',
      });
      await tx.delete(payments).where(eq(payments.id, paymentId));

      const newPaidAmount = sale.paidAmount - paymentAmount;
      const newRemainingAmount = sale.remainingAmount + paymentAmount;

      await tx
        .update(sales)
        .set({
          paidAmount: String(newPaidAmount),
          remainingAmount: String(newRemainingAmount),
          status: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(sales.id, saleId));

      if (sale.customerId) {
        await tx
          .update(customers)
          .set({
            totalDebt: sql`${customers.totalDebt}::numeric + ${paymentAmount}`,
          })
          .where(eq(customers.id, sale.customerId));
      }
    });

    alertBus.emit('alerts.changed', 'payment.removed');
    return payment;
  }

  async removeSale(saleId) {
    const sale = await this.getById(saleId);

    if (!sale) {
      throw new NotFoundError('Sale');
    }

    // Deleting a sale is destructive — blocked once its period/shift closes.
    await this.assertSaleWritable(saleId);

    await withTransaction(async (tx) => {
      // Cancel any treasury vouchers minted for this sale's payments before
      // the rows disappear (FKs are SET NULL, not CASCADE).
      const salePayments = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.saleId, saleId));
      for (const p of salePayments) {
        await voucherService.cancelForSource(tx, {
          paymentId: p.id,
          reason: 'حذف الفاتورة الأصلية',
          userId: null,
        });
      }
      await tx.delete(payments).where(eq(payments.saleId, saleId));
      await tx.delete(installments).where(eq(installments.saleId, saleId));
      await tx.delete(saleItems).where(eq(saleItems.saleId, saleId));
      await tx.delete(sales).where(eq(sales.id, saleId));
    });

    alertBus.emit('alerts.changed', 'sale.removed');
    return sale;
  }

  async restoreSale(saleId, userId) {
    const sale = await this.getById(saleId);

    if (!sale) {
      throw new NotFoundError('Sale');
    }

    if (sale.status !== 'cancelled') {
      throw new ValidationError('Only cancelled sales can be restored');
    }

    // Un-cancelling mutates the sale — blocked once its period/shift closes.
    await this.assertSaleWritable(saleId);

    const result = await withTransaction(async (tx) => {
      if (sale.warehouseId) {
        await InventoryService.applySaleStockMovement(tx, {
          saleId: sale.id,
          warehouseId: sale.warehouseId,
          items: sale.items
            .filter((i) => i.productId)
            .map((i) => ({
              productId: i.productId,
              quantity: Number(i.baseQuantity || i.quantity) || 0,
              unitId: i.unitId || null,
              unitName: i.unitName || null,
              unitQuantity: i.quantity,
            })),
          userId,
        });
      }

      if (sale.customerId && sale.remainingAmount > 0) {
        await tx
          .update(customers)
          .set({
            totalDebt: sql`${customers.totalDebt}::numeric + ${sale.remainingAmount}`,
            totalPurchases: sql`${customers.totalPurchases}::numeric + ${sale.total}`,
          })
          .where(eq(customers.id, sale.customerId));
      }

      const currency = sale.currency || 'USD';
      const roundedRemainingAmount = roundByCurrency(sale.remainingAmount, currency);
      const [updated] = await tx
        .update(sales)
        .set({
          status: roundedRemainingAmount <= 0 ? 'completed' : 'pending',
          updatedAt: new Date(),
        })
        .where(eq(sales.id, saleId))
        .returning();

      await tx
        .update(installments)
        .set({
          status: 'pending',
          updatedAt: new Date(),
        })
        .where(and(eq(installments.saleId, saleId), eq(installments.status, 'cancelled')));

      // GL: re-post the restored sale (the cancel reversal freed the
      // one-posted-entry-per-source slot).
      await glPostingService.postDocument(tx, {
        sourceType: 'sale',
        sourceId: saleId,
        user: { id: userId },
      });

      return updated;
    });

    alertBus.emit('alerts.changed', 'sale.restored');
    return result;
  }

  /**
   * Fetch all returns recorded against a sale, with their items. Used by
   * getById() to surface return history alongside payments and installments.
   */
  async getReturnsForSale(saleId) {
    const db = await getDb();
    const returns = await db
      .select()
      .from(saleReturns)
      .where(eq(saleReturns.saleId, saleId))
      .orderBy(desc(saleReturns.createdAt));

    if (returns.length === 0) return [];

    const ids = returns.map((r) => r.id);
    const items = await db
      .select()
      .from(saleReturnItems)
      .where(inArray(saleReturnItems.returnId, ids));

    const itemsByReturn = new Map();
    for (const it of items) {
      if (!itemsByReturn.has(it.returnId)) itemsByReturn.set(it.returnId, []);
      itemsByReturn.get(it.returnId).push({
        ...it,
        unitPrice: n(it.unitPrice),
        subtotal: n(it.subtotal),
        unitConversionFactor: Number(it.unitConversionFactor) || 1,
        baseQuantity: Number(it.baseQuantity) || it.quantity,
      });
    }

    return returns.map((r) => ({
      ...r,
      returnedValue: n(r.returnedValue),
      refundAmount: n(r.refundAmount),
      debtReduction: n(r.debtReduction),
      items: itemsByReturn.get(r.id) || [],
    }));
  }

  /**
   * Record a return / refund against an existing sale.
   *
   * Effects (single transaction):
   *   - Validates returnable quantity per item (sold qty - prior returns).
   *   - Inserts sale_returns + sale_return_items rows.
   *   - Restores stock via stock_movements (movement_type='sale_return').
   *   - Reduces sales.paidAmount by refundAmount and sales.remainingAmount by
   *     debtReduction. Status becomes 'completed' if no debt remains.
   *   - Reduces customer.totalPurchases by returnedValue and totalDebt by debtReduction.
   *   - For installment sales, walks pending installments from latest to
   *     earliest, reducing dueAmount/remainingAmount and cancelling rows
   *     that drop to zero, until debtReduction is fully absorbed.
   *   - Logs an audit entry for the operation.
   *
   * @param {number} saleId
   * @param {{items, refundAmount, refundMethod, refundReference, reason, notes}} returnData
   * @param {{id, username, assignedBranchId, assignedWarehouseId, role}} actingUser
   */
  async createReturn(saleId, returnData, actingUser) {
    const userId = actingUser?.id || null;
    const sale = await this.getById(saleId);

    // A return mutates the original sale and must be recorded in the same
    // accounting period — blocked once that period is closed.
    const db = await getDb();
    const [salePeriodRow] = await db
      .select({
        accountingPeriodId: sales.accountingPeriodId,
      })
      .from(sales)
      .where(eq(sales.id, sale.id))
      .limit(1);
    const salePeriodId = salePeriodRow?.accountingPeriodId || null;
    await accountingPeriodService.assertWritable(salePeriodId);

    if (sale.status === 'cancelled') {
      throw new ValidationError('Cannot return items from a cancelled sale');
    }
    if (sale.status === 'draft') {
      throw new ValidationError('Cannot return items from a draft sale');
    }
    // Installment invoices are excluded — refunds against an open installment
    // schedule are handled by adjusting/cancelling the installment plan,
    // not through this return flow.
    if (
      sale.paymentType === 'installment' ||
      sale.paymentType === 'mixed' ||
      sale.saleType === 'INSTALLMENT'
    ) {
      throw new ValidationError(
        'Returns are not supported on installment invoices. Cancel or adjust the installment plan instead.'
      );
    }
    if (!Array.isArray(returnData.items) || returnData.items.length === 0) {
      throw new ValidationError('Return must include at least one item');
    }

    // Branch/warehouse scope — strict, feature-flag aware: a branch-bound user
    // can never return an invoice from a branch they aren't assigned to (even by
    // passing the sale id directly).
    await enforceInvoiceBranchScope(actingUser, sale.branchId);
    if (sale.warehouseId) {
      await enforceWarehouseScope(actingUser, sale.warehouseId);
    }

    const currency = sale.currency || 'USD';

    // Sum prior-returned base quantity per saleItemId so we can enforce
    // (returnedBase + priorReturnsBase) <= soldBase. Returns are tracked in
    // base units so a customer who bought 2 درزن (= 24 قطعة) and returns 1
    // درزن still has 12 قطعة of headroom for further partial returns.
    const priorReturns = await this.getReturnsForSale(saleId);
    const priorByItemId = new Map();
    for (const r of priorReturns) {
      for (const it of r.items) {
        if (!it.saleItemId) continue;
        const itBase = Number(it.baseQuantity) || Number(it.quantity) || 0;
        priorByItemId.set(it.saleItemId, (priorByItemId.get(it.saleItemId) || 0) + itBase);
      }
    }
    // Snapshot of base quantities returned before this request. Used later to
    // restore stock-entry quantities without mutating sale_item_stock_entries.
    const previouslyReturnedByItem = new Map(priorByItemId);

    // Resolve every requested return item against the original sale's items.
    // We accept either saleItemId (preferred) or productId for callers that
    // only know the product. When productId is given, pick the first matching
    // sale item with capacity left.
    const saleItemsById = new Map(sale.items.map((it) => [it.id, it]));
    const saleItemsByProduct = new Map();
    for (const it of sale.items) {
      if (!it.productId) continue;
      if (!saleItemsByProduct.has(it.productId)) saleItemsByProduct.set(it.productId, []);
      saleItemsByProduct.get(it.productId).push(it);
    }

    const resolvedItems = [];
    for (const req of returnData.items) {
      const qty = Number(req.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new ValidationError('الكمية المرتجعة يجب أن تكون أكبر من صفر');
      }

      let target = null;
      if (req.saleItemId) {
        target = saleItemsById.get(req.saleItemId);
        if (!target) {
          throw new ValidationError(
            `Sale item ${req.saleItemId} does not belong to sale ${saleId}`
          );
        }
      } else if (req.productId) {
        const candidates = saleItemsByProduct.get(req.productId) || [];
        target = candidates.find((c) => {
          const prior = priorByItemId.get(c.id) || 0;
          const baseSold = Number(c.baseQuantity) || c.quantity;
          return baseSold - prior > 0;
        });
        if (!target) {
          throw new ValidationError(
            `Product ${req.productId} was not sold on this sale or is fully returned`
          );
        }
      } else {
        throw new ValidationError('Each return item needs saleItemId or productId');
      }

      // Resolve the unit chosen for the return. When the caller passes no
      // unitId we default to the unit used on the original sale line so the
      // numbers on the receipt match up.
      let returnUnit;
      if (req.unitId) {
        returnUnit = await (async () => {
          const db = await getDb();
          const [u] = await db
            .select()
            .from(schema.productUnits)
            .where(and(eq(schema.productUnits.id, req.unitId), eq(schema.productUnits.productId, target.productId)))
            .limit(1);
          if (!u) {
            throw new ValidationError('الوحدة غير صالحة لهذا المنتج', 'INVALID_PRODUCT_UNIT');
          }
          return {
            id: u.id,
            name: u.name,
            conversionFactor: Number(u.conversionFactor) || 1,
          };
        })();
      } else {
        returnUnit = {
          id: target.unitId || null,
          name: target.unitName || null,
          conversionFactor: Number(target.unitConversionFactor) || 1,
        };
      }

      const baseQty = Math.round(qty * (returnUnit.conversionFactor || 1));
      if (!Number.isInteger(baseQty) || baseQty <= 0) {
        throw new ValidationError('الكمية المحوّلة للوحدة الأساسية غير صالحة');
      }

      const prior = priorByItemId.get(target.id) || 0;
      const baseSold = Number(target.baseQuantity) || target.quantity;
      const remainingBase = baseSold - prior;
      if (baseQty > remainingBase) {
        throw new ValidationError(
          'لا يمكن استرجاع كمية أكبر من الكمية المباعة أو الكمية المتبقية للاسترجاع'
        );
      }

      // Net unit price after distributing the per-item discount on the
      // original sale_items row. saleItem.subtotal already nets the
      // discount, so subtotal/quantity is the post-discount unit price.
      // Keep raw (unrounded) — per-line ceil rounding amplifies float noise
      // past the actual paid amount on IQD (250-bucket) sales.
      const originalFactor = Number(target.unitConversionFactor) || 1;
      // Per-base price on the original sale line — used to value the return
      // even when the customer brings the carton back as loose pieces.
      const perBaseNet = target.quantity > 0
        ? (target.subtotal / target.quantity) / originalFactor
        : Number(target.unitPrice) / originalFactor;
      const lineSubtotal = perBaseNet * baseQty;
      const returnUnitPrice = perBaseNet * (returnUnit.conversionFactor || 1);

      // Reserve capacity so two requests in the same payload that target the
      // same sale_item don't both pass validation.
      priorByItemId.set(target.id, prior + baseQty);

      resolvedItems.push({
        saleItem: target,
        quantity: qty,
        baseQuantity: baseQty,
        unitId: returnUnit.id,
        unitName: returnUnit.name,
        unitConversionFactor: returnUnit.conversionFactor,
        unitPrice: returnUnitPrice,
        subtotal: lineSubtotal,
      });
    }

    // Cap returnedValue at what the sale actually has left to give back
    // (sale.total minus everything previously returned). This absorbs the
    // float / rounding gap that would otherwise push the value past the
    // paidAmount + remainingAmount budget on currencies like IQD.
    const priorReturnedTotal = priorReturns.reduce((acc, r) => acc + r.returnedValue, 0);
    const maxReturnable = Math.max(0, sale.total - priorReturnedTotal);

    // Round to the nearest currency bucket (not ceil) so the figure stays
    // within the cap; ceil would re-introduce the same overshoot we just
    // fixed by capping above.
    const roundReturnNearest = (amount) => {
      if (currency === 'IQD') return Math.round(amount / 250) * 250;
      return Math.round(amount * 100) / 100;
    };

    // Goods value of the returned items (no interest).
    const returnedGoodsValue = resolvedItems.reduce((acc, it) => acc + it.subtotal, 0);

    // Interest pro-ration: installment sales pre-bake interest into the sale
    // total. When the customer returns goods we cancel the proportional
    // slice of interest with them — otherwise returning everything would
    // still leave the interest portion as a phantom debt across future
    // installments. Cash sales have interestAmount = 0 so this is a no-op.
    const saleGoodsTotal = sale.items.reduce((acc, it) => acc + Number(it.subtotal || 0), 0);
    const interestAmount = Number(sale.interestAmount || 0);
    const returnedInterest =
      interestAmount > 0 && saleGoodsTotal > 0
        ? (returnedGoodsValue / saleGoodsTotal) * interestAmount
        : 0;

    const rawReturnedValue = returnedGoodsValue + returnedInterest;
    const returnedValue = roundReturnNearest(Math.min(rawReturnedValue, maxReturnable));
    if (returnedValue <= 0) {
      throw new ValidationError('Returned value must be greater than zero');
    }

    // Refund + debt allocation. The customer must always be made whole:
    // refundAmount is cash handed back, debtReduction is debt forgiven.
    // Together they equal returnedValue. Each side is bounded by what the
    // sale actually has available.
    const tolerance = currency === 'IQD' ? 250 : 0.01;
    const requestedRefund = roundReturnNearest(
      Math.max(0, Number(returnData.refundAmount) || 0)
    );
    if (requestedRefund > returnedValue + tolerance) {
      throw new ValidationError('Refund amount cannot exceed the returned value');
    }
    if (requestedRefund > sale.paidAmount + tolerance) {
      throw new ValidationError(
        `Refund amount (${requestedRefund}) cannot exceed amount already paid (${sale.paidAmount})`
      );
    }

    // Refund is capped at both the returned value and what was actually paid;
    // whatever is left becomes a debt write-off, capped at the outstanding
    // remaining amount. Any tiny float / bucket residual collapses into the
    // refund side (so we never throw on rounding noise — the cap above
    // already kept us within the sale's budget).
    let refundAmount = Math.min(requestedRefund, returnedValue, sale.paidAmount);
    let debtReduction = roundReturnNearest(returnedValue - refundAmount);
    if (debtReduction > sale.remainingAmount) {
      const overflow = debtReduction - sale.remainingAmount;
      if (overflow > tolerance) {
        throw new ValidationError(
          `Returned value (${returnedValue}) exceeds remaining debt (${sale.remainingAmount}) plus refund (${refundAmount}) by ${overflow}. Increase the refund amount.`
        );
      }
      // Within tolerance — push the residual onto the refund side so the
      // numbers add up without surfacing a bucket-rounding error to the user.
      debtReduction = sale.remainingAmount;
      refundAmount = roundReturnNearest(returnedValue - debtReduction);
    }

    const refundMethod =
      returnData.refundMethod ||
      (refundAmount > 0 ? 'cash' : 'credit');
    if (refundMethod === 'card' && !returnData.refundReference) {
      throw new ValidationError('Card refund requires a reference number');
    }

    const result = await withTransaction(async (tx) => {
      // 1. Insert the return header.
      const [newReturn] = await tx
        .insert(saleReturns)
        .values({
          saleId: sale.id,
          customerId: sale.customerId || null,
          branchId: sale.branchId || null,
          warehouseId: sale.warehouseId || null,
          accountingPeriodId: salePeriodId,
          returnedValue: String(returnedValue),
          refundAmount: String(refundAmount),
          debtReduction: String(debtReduction),
          refundMethod,
          refundReference: returnData.refundReference || null,
          currency,
          reason: returnData.reason || null,
          notes: returnData.notes || null,
          createdBy: userId,
        })
        .returning();

      // Treasury: cash refunds leave the drawer — mint the payment voucher
      // (سند صرف) in the same tx. No-op for credit/card refunds or flag off.
      await voucherService.mintForRefund(tx, {
        saleReturn: newReturn,
        sale: { id: sale.id, branchId: sale.branchId, invoiceNumber: sale.invoiceNumber },
        user: { id: userId },
      });

      // GL: post the return entry (مردودات + عكس الكلفة + استرداد/خصم ذمة).
      await glPostingService.postDocument(tx, {
        sourceType: 'sale_return',
        sourceId: newReturn.id,
        user: { id: userId },
      });

      // 2. Insert the line items.
      for (const it of resolvedItems) {
        await tx.insert(saleReturnItems).values({
          returnId: newReturn.id,
          saleItemId: it.saleItem.id,
          productId: it.saleItem.productId || null,
          productName: it.saleItem.productName,
          quantity: it.quantity,
          unitPrice: String(it.unitPrice),
          subtotal: String(it.subtotal),
          unitId: it.unitId || null,
          unitName: it.unitName || null,
          unitConversionFactor: String(it.unitConversionFactor || 1),
          baseQuantity: it.baseQuantity,
        });
      }

      // 3. Restore stock for items that have a productId. Legacy sales with
      //    no warehouseId are skipped (movements need a warehouse).
      if (sale.warehouseId) {
        // Restore entry-level quantities (when trace rows exist), then always
        // restore aggregate warehouse stock via InventoryService below.
        const stockItems = [];
        for (const it of resolvedItems) {
          if (!it.saleItem?.id || !it.saleItem?.productId) continue;
          let remaining = Number(it.baseQuantity) || 0;
          if (remaining <= 0) continue;
          stockItems.push({
            productId: it.saleItem.productId,
            quantity: remaining,
            unitId: it.unitId || null,
            unitName: it.unitName || null,
            unitQuantity: it.quantity,
          });
          const previousReturned = Number(previouslyReturnedByItem.get(it.saleItem.id) || 0);
          const restoreWindowStart = Math.max(0, previousReturned);
          const restoreWindowEnd = Math.max(restoreWindowStart, previousReturned + remaining);
          let traceCursor = 0;
          const traces = await tx
            .select({
              id: saleItemStockEntries.id,
              stockEntryId: saleItemStockEntries.productStockEntryId,
              quantity: saleItemStockEntries.quantity,
            })
            .from(saleItemStockEntries)
            .where(eq(saleItemStockEntries.saleItemId, it.saleItem.id))
            .orderBy(desc(saleItemStockEntries.id))
            .for('update');
          for (const tr of traces) {
            if (remaining <= 0) break;
            const traceQty = Number(tr.quantity) || 0;
            const traceStart = traceCursor;
            const traceEnd = traceCursor + traceQty;
            traceCursor = traceEnd;
            const overlapStart = Math.max(restoreWindowStart, traceStart);
            const overlapEnd = Math.min(restoreWindowEnd, traceEnd);
            const giveBack = Math.max(0, overlapEnd - overlapStart);
            if (giveBack <= 0) continue;
            await tx.execute(sql`
              UPDATE product_stock_entries
              SET remaining_quantity = remaining_quantity + ${giveBack},
                  status = CASE
                    WHEN status = 'blocked' THEN 'blocked'
                    WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN 'expired'
                    ELSE 'active'
                  END,
                  updated_at = now()
              WHERE id = ${tr.stockEntryId}
            `);
            remaining -= giveBack;
          }
        }
        if (stockItems.length > 0) {
          await InventoryService.restoreSaleStockMovement(tx, {
            saleId: sale.id,
            warehouseId: sale.warehouseId,
            items: stockItems,
            userId,
            movementType: 'sale_return',
          });
        }
      }

      // 4. Update the sale: paidAmount drops by refundAmount, remainingAmount
      //    drops by debtReduction. Status becomes 'completed' when no debt
      //    remains (mirrors addPayment's behaviour).
      const newPaidAmount = roundByCurrency(
        Math.max(0, sale.paidAmount - refundAmount),
        currency
      );
      const newRemainingAmount = roundByCurrency(
        Math.max(0, sale.remainingAmount - debtReduction),
        currency
      );
      const fullReturned = priorReturnedTotal + returnedValue >= sale.total - tolerance;
      const newStatus = fullReturned
        ? 'returned'
        : (priorReturnedTotal + returnedValue > 0 ? 'partially_returned' : (newRemainingAmount <= 0 ? 'completed' : sale.status));
      await tx
        .update(sales)
        .set({
          paidAmount: String(newPaidAmount),
          remainingAmount: String(newRemainingAmount),
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(sales.id, sale.id));

      // 5. Customer balance: lifetime purchases drops by the returned value;
      //    outstanding debt drops by the forgiven portion.
      if (sale.customerId) {
        const setExpr = {
          totalPurchases: sql`GREATEST(${customers.totalPurchases}::numeric - ${returnedValue}, 0)`,
          updatedAt: new Date(),
        };
        if (debtReduction > 0) {
          setExpr.totalDebt = sql`GREATEST(${customers.totalDebt}::numeric - ${debtReduction}, 0)`;
        }
        await tx.update(customers).set(setExpr).where(eq(customers.id, sale.customerId));
      }

      // 6. Installment adjustment: walk pending installments from highest
      //    number down, shrinking dueAmount/remainingAmount until the debt
      //    reduction is consumed. An installment whose remainingAmount drops
      //    to zero is marked 'cancelled' to stay consistent with cancel().
      if (debtReduction > 0 && sale.installments && sale.installments.length > 0) {
        let toAbsorb = debtReduction;
        const sortedPending = [...sale.installments]
          .filter((i) => i.status === 'pending' && i.remainingAmount > 0)
          .sort((a, b) => b.installmentNumber - a.installmentNumber);

        for (const inst of sortedPending) {
          if (toAbsorb <= 0) break;
          const reduceBy = Math.min(toAbsorb, inst.remainingAmount);
          const newRemaining = roundByCurrency(
            Math.max(0, inst.remainingAmount - reduceBy),
            currency
          );
          const newDue = roundByCurrency(
            Math.max(inst.paidAmount || 0, inst.dueAmount - reduceBy),
            currency
          );
          const newInstStatus = newRemaining <= 0 ? 'cancelled' : 'pending';
          await tx
            .update(installments)
            .set({
              dueAmount: String(newDue),
              remainingAmount: String(newRemaining),
              status: newInstStatus,
              updatedAt: new Date(),
            })
            .where(eq(installments.id, inst.id));
          toAbsorb -= reduceBy;
        }
      }

      return newReturn;
    });

    // 7. Audit trail — non-fatal if the audit service throws.
    try {
      await auditService.log({
        userId: actingUser?.id || null,
        username: actingUser?.username || null,
        action: 'sale:return_created',
        resource: 'sales',
        resourceId: sale.id,
        details: {
          returnId: result.id,
          returnedValue,
          refundAmount,
          debtReduction,
          refundMethod,
          itemCount: resolvedItems.length,
          reason: returnData.reason || null,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[audit] sale:return_created skipped:', err.message);
    }

    alertBus.emit('alerts.changed', 'sale.returned');
    return await this.getById(saleId);
  }

  async createDraft(saleData, userId) {
    const db = await getDb();
    const currencySettings = await settingsService.getCurrencySettings();

    let totals = { subtotal: 0, discount: 0, tax: 0, total: 0 };
    if (saleData.items && saleData.items.length > 0) {
      totals = calculateSaleTotals(saleData.items, saleData.discount || 0, saleData.tax || 0);
    }

    // Drafts use a non-conflicting placeholder. A real invoice number is only
    // allocated from invoice_sequences when the draft is completed — so a
    // draft that never ships does not burn a number, and per-branch sequences
    // stay densely packed.
    const invoiceNumber = generateDraftInvoicePlaceholder();
    const currency = saleData.currency || currencySettings.defaultCurrency;
    const exchangeRate =
      saleData.exchangeRate ||
      (currency === 'USD' ? currencySettings.usdRate : currencySettings.iqdRate);

    // Pricing tier the draft was built at (تسعير الوكلاء). Carried so completing
    // the draft later defaults to the same tier. Unknown/missing → 'retail'.
    const priceType = ['retail', 'wholesale', 'agent'].includes(saleData.priceType)
      ? saleData.priceType
      : 'retail';

    const draftValues = {
      invoiceNumber,
      subtotal: String(totals.subtotal),
      discount: String(totals.discount || 0),
      tax: String(totals.tax || 0),
      total: String(totals.total),
      currency,
      exchangeRate: String(exchangeRate),
      paymentType: saleData.paymentType || 'cash',
      priceType,
      paidAmount: '0',
      remainingAmount: String(totals.total),
      status: 'draft',
      notes: saleData.notes || null,
      createdBy: userId,
      interestRate: String(parseFloat(saleData.interestRate) || 0),
      interestAmount: '0',
    };

    if (saleData.customerId !== undefined && saleData.customerId !== null) {
      draftValues.customerId = saleData.customerId;
    }

    if (saleData.branchId) draftValues.branchId = saleData.branchId;
    if (saleData.warehouseId) draftValues.warehouseId = saleData.warehouseId;

    const [newDraft] = await db.insert(sales).values(draftValues).returning();

    if (saleData.items && saleData.items.length > 0) {
      const itemsToInsert = [];
      for (const item of saleData.items) {
        let productName = item.productName || 'Unknown Product';
        let productSku = item.productSku || null;
        let barcode = item.barcode || null;

        if (item.productId) {
          const [product] = await db
            .select({ name: products.name, sku: products.sku, barcode: products.barcode })
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1);
          if (product) {
            productName = product.name;
            productSku = product.sku || null;
            barcode = product.barcode || null;
          }
        }

        const itemDiscountTotal = (item.discount || 0) * (item.quantity || 1);
        const itemSubtotal = (item.unitPrice || 0) * (item.quantity || 1) - itemDiscountTotal;

        itemsToInsert.push({
          saleId: newDraft.id,
          productId: item.productId || null,
          // Product snapshot — frozen so the invoice survives product deletion.
          productName,
          productSku,
          barcode,
          quantity: item.quantity || 1,
          unitPrice: String(item.unitPrice || 0),
          discount: String(itemDiscountTotal),
          subtotal: String(parseFloat(itemSubtotal.toFixed(2))),
          // Carry the typed per-unit interest on the draft so reopening it
          // restores it (the final snapshot is computed when the draft completes).
          interestPerUnit: String(Math.max(0, parseFloat(item.interestPerUnit) || 0)),
          priceType,
          // Per-line note (ملاحظة المنتج) — carried on the draft so completing it
          // later preserves what the cashier typed. Blank/whitespace → NULL.
          notes: item.notes && String(item.notes).trim() ? String(item.notes).trim() : null,
        });
      }

      await db.insert(saleItems).values(itemsToInsert);
    }

    saveDatabase();
    return await this.getById(newDraft.id);
  }

  async deleteOldDrafts() {
    const db = await getDb();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const deleted = await db
      .delete(sales)
      .where(and(eq(sales.status, 'draft'), lt(sales.createdAt, oneDayAgo)))
      .returning();

    saveDatabase();
    return deleted.length;
  }

  async completeDraft(draftId, saleData, user) {
    const actingUser = typeof user === 'object' && user !== null ? user : { id: user };
    const userId = actingUser.id;
    const draft = await this.getById(draftId);
    if (draft.status !== 'draft') {
      throw new ValidationError('Sale is not a draft');
    }

    if (!saleData.items || saleData.items.length === 0) {
      throw new ValidationError('Sale must have at least one item');
    }

    // Finalising a draft creates a real invoice — apply the same service/physical
    // guards and received-price normalisation as a direct sale.
    await validateAndNormaliseItemTypes(saleData.items);

    // Clamp item + invoice discounts to the per-line «never below cost» floor —
    // same authoritative guard as create().
    let safeDiscount = parseFloat(saleData.discount) || 0;
    const hasAnyDiscount =
      safeDiscount > 0 || saleData.items.some((it) => (Number(it.discount) || 0) > 0);
    if (hasAnyDiscount) {
      const db = await getDb();
      ({ safeDiscount } = await clampSaleDiscounts(db, saleData.items, saleData.discount || 0));
    }

    const totals = calculateSaleTotals(saleData.items, safeDiscount, saleData.tax || 0);

    // Cash vs installment for the completed invoice (same rule as create()).
    const completingInstallment =
      saleData.paymentType === 'installment' ||
      saleData.paymentType === 'mixed' ||
      saleData.saleType === SALE_TYPE_INSTALLMENT;

    const currencySettings = await settingsService.getCurrencySettings();
    const currency = saleData.currency || draft.currency || currencySettings.defaultCurrency;

    // Per-line installment interest (mirrors create()): a per-unit amount entered
    // on installment invoices only; cash lines send 0 → no-op. Aggregated here so
    // the invoice keeps a single interest total for GL/reporting; each sale_item
    // stores its own snapshot below. Round per line to keep the aggregate exact.
    let interestTotal = 0;
    for (const item of saleData.items) {
      const ipu = completingInstallment ? Math.max(0, parseFloat(item.interestPerUnit) || 0) : 0;
      interestTotal += roundByCurrency(ipu * (parseInt(item.quantity, 10) || 0), currency);
    }
    interestTotal = roundByCurrency(interestTotal, currency);

    const interestAmount = interestTotal;
    const blendedInterestRate =
      totals.subtotal > 0 ? Number(((interestTotal / totals.subtotal) * 100).toFixed(4)) : 0;

    let finalTotal = roundByCurrency(totals.total + interestTotal, currency);

    let paidAmount = roundByCurrency(parseFloat(saleData.paidAmount) || 0, currency);
    let remainingAmount = Math.max(0, finalTotal - paidAmount);

    const threshold = currency === 'IQD' ? 250 : 0.01;
    remainingAmount = remainingAmount < threshold ? 0 : roundByCurrency(remainingAmount, currency);

    // Never book an overpayment: cap the collected amount at the invoice total.
    // A completed draft (always a NEW_SALE invoice) may be paid in full,
    // partially paid, or fully deferred — the remainder becomes a customer debt.
    if (paidAmount > finalTotal) {
      paidAmount = finalTotal;
      remainingAmount = 0;
    }

    const exchangeRate =
      saleData.exchangeRate !== undefined ? saleData.exchangeRate : draft.exchangeRate;

    const draftCustomerId = saleData.customerId || draft.customerId || null;

    // A partial / deferred completed draft books a debt → it must have a customer.
    if (remainingAmount > 0 && !draftCustomerId) {
      throw new ValidationError('يجب تحديد العميل عند البيع الآجل أو الدفع الجزئي.');
    }

    await enforceCreditLimit({
      customerId: draftCustomerId,
      total: finalTotal,
      user: actingUser,
      paymentType: saleData.paymentType || draft.paymentType,
    });

    const { branchId, warehouseId } = await resolveBranchWarehouse({
      branchId: actingUser?.assignedBranchId || saleData.branchId || draft.branchId,
      warehouseId: actingUser?.assignedWarehouseId || saleData.warehouseId || draft.warehouseId,
      actingUser,
    });

    // Completing a draft finalizes it into the open accounting period.
    const accountingPeriodId = await accountingPeriodService.resolvePeriodIdForWrite(
      actingUser,
      branchId,
      { require: true }
    );

    // Pricing tier (تسعير الوكلاء): explicit completion payload → the tier the
    // draft was saved with → 'retail'. Stamped for reporting only.
    const priceType = ['retail', 'wholesale', 'agent'].includes(saleData.priceType)
      ? saleData.priceType
      : ['retail', 'wholesale', 'agent'].includes(draft.priceType)
        ? draft.priceType
        : 'retail';

    const updatedSaleId = await withTransaction(async (tx) => {
      await tx.delete(saleItems).where(eq(saleItems.saleId, draftId));

      // Drafts arrive with a DRAFT- placeholder; promotion to a real invoice
      // happens here, inside the same transaction that flips status off
      // 'draft'. allocateInvoiceNumber holds a row lock on the sequence row
      // so two cashiers completing drafts at the same instant get distinct
      // numbers, and a rollback gives the number back.
      const { invoiceNumber, issuedAt } = await allocateInvoiceNumber(tx, branchId);

      const [updatedSale] = await tx
        .update(sales)
        .set({
          invoiceNumber,
          issuedAt,
          customerId: saleData.customerId || draft.customerId,
          branchId,
          warehouseId,
          accountingPeriodId,
          subtotal: String(totals.subtotal),
          discount: String(totals.discount),
          tax: String(totals.tax),
          total: String(finalTotal),
          currency,
          exchangeRate: String(exchangeRate),
          paymentType: saleData.paymentType || draft.paymentType,
          priceType,
          paidAmount: String(paidAmount),
          remainingAmount: String(remainingAmount),
          status: remainingAmount <= 0 ? 'completed' : 'pending',
          notes: saleData.notes || draft.notes,
          // Deprecated invoice-level rate → store the blended effective rate.
          interestRate: String(blendedInterestRate),
          interestAmount: String(roundByCurrency(interestAmount, currency)),
          updatedAt: new Date(),
        })
        .where(eq(sales.id, draftId))
        .returning();

      const stockItems = [];
      for (const item of saleData.items) {
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (!product) {
          throw new ValidationError(`Product with ID ${item.productId} not found`);
        }

        const unit = await resolveUnitSnapshot(tx, item.productId, item.unitId || null);
        const baseQty = Math.round(Number(item.quantity || 0) * unit.conversionFactor);
        if (!Number.isInteger(baseQty) || baseQty <= 0) {
          throw new ValidationError('الكمية المحوّلة للوحدة الأساسية غير صالحة');
        }

        const itemDiscountTotal = (item.discount || 0) * item.quantity;
        const itemSubtotal = item.quantity * item.unitPrice - itemDiscountTotal;

        // Per-line installment interest snapshot (see create()).
        const lineInterestPerUnit = completingInstallment
          ? Math.max(0, parseFloat(item.interestPerUnit) || 0)
          : 0;
        const lineInterestAmount = roundByCurrency(lineInterestPerUnit * item.quantity, currency);
        const hasLineInterest = lineInterestPerUnit > 0;

        // Snapshot per-unit cost so completed-draft sales record the same
        // information a normal create() flow does — keeps profit reports
        // accurate and immune to later catalog edits.
        const baseCost = Number(product.costPrice) || 0;
        const perUnitCost = unit.costPrice != null ? Number(unit.costPrice) : baseCost * unit.conversionFactor;

        const [insertedSaleItem] = await tx.insert(saleItems).values({
          saleId: updatedSale.id,
          productId: item.productId,
          // Product snapshot — frozen so the invoice survives product deletion.
          productName: product.name,
          productSku: product.sku || null,
          barcode: product.barcode || null,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          discount: String(itemDiscountTotal),
          subtotal: String(parseFloat(itemSubtotal.toFixed(2))),
          // Per-line installment interest snapshot (NULL/0 = no interest).
          unitPriceBeforeInterest: hasLineInterest ? String(item.unitPrice) : null,
          interestPerUnit: String(lineInterestPerUnit),
          interestAmount: String(lineInterestAmount),
          unitPriceAfterInterest: hasLineInterest ? String(item.unitPrice + lineInterestPerUnit) : null,
          unitId: unit.id,
          unitName: unit.name,
          unitConversionFactor: String(unit.conversionFactor),
          baseQuantity: baseQty,
          unitCostPrice: String(perUnitCost || 0),
          priceType,
          // Per-line note (ملاحظة المنتج). Blank/whitespace → NULL.
          notes: item.notes && String(item.notes).trim() ? String(item.notes).trim() : null,
        }).returning({ id: saleItems.id });

        stockItems.push({
          productId: item.productId,
          quantity: baseQty,
          saleItemId: insertedSaleItem.id,
          unitId: unit.id,
          unitName: unit.name,
          unitQuantity: item.quantity,
        });
      }

      await InventoryService.applySaleStockMovement(tx, {
        saleId: updatedSale.id,
        warehouseId,
        items: stockItems,
        userId,
      });

      if (paidAmount > 0) {
        const customerId = saleData.customerId || draft.customerId || null;
        const method = saleData.paymentMethod || 'cash';
        const [insertedPayment] = await tx.insert(payments).values({
          saleId: updatedSale.id,
          customerId,
          amount: String(paidAmount),
          currency,
          exchangeRate: String(exchangeRate),
          paymentMethod: method,
          paymentReference: saleData.paymentReference || null,
          createdBy: userId,
        }).returning({ id: payments.id });

        // Treasury: mint the receipt voucher for the completed draft's payment.
        await voucherService.mintForPayment(tx, {
          payment: {
            id: insertedPayment.id,
            amount: paidAmount,
            currency,
            exchangeRate,
            paymentMethod: method,
          },
          sale: {
            id: updatedSale.id,
            branchId,
            customerId,
            invoiceNumber,
          },
          user: actingUser || { id: userId },
          sourceType: 'sale_payment',
          cashboxId: saleData.cashboxId || null,
          bankAccountId: saleData.bankAccountId || null,
        });
      }

      // Build the installment schedule from the requested count + first date +
      // period (the same derivation create() uses). The sale schema strips any
      // client-sent `installments` array, so deriving it here also fixes the
      // long-standing case of an installment draft completing with NO schedule.
      if (completingInstallment && remainingAmount > 0) {
        const customerId = saleData.customerId || draft.customerId;
        if (!customerId) {
          throw new ValidationError('يرجى اختيار العميل لإكمال البيع بالأقساط');
        }

        const installmentCount = parseInt(saleData.installmentCount) || 3;
        const schedule = buildInstallmentSchedule({
          totalRemaining: remainingAmount,
          count: installmentCount,
          currency,
          firstInstallmentDate: saleData.firstInstallmentDate,
          period: saleData.installmentPeriod,
        });

        for (const row of schedule) {
          await tx.insert(installments).values({
            saleId: updatedSale.id,
            customerId,
            installmentNumber: row.installmentNumber,
            dueAmount: String(row.dueAmount),
            paidAmount: '0',
            remainingAmount: String(row.dueAmount),
            currency,
            dueDate: row.dueDate,
            status: 'pending',
            createdBy: userId,
          });
        }
      }

      // Book the outstanding balance as customer debt — for a cash partial /
      // fully-deferred invoice as well as an installment one (mirrors create();
      // previously this lived INSIDE the installment block, so a partial cash
      // draft completion booked no debt).
      if (draftCustomerId && remainingAmount > 0) {
        await tx
          .update(customers)
          .set({
            totalDebt: sql`${customers.totalDebt}::numeric + ${remainingAmount}`,
            totalPurchases: sql`${customers.totalPurchases}::numeric + ${finalTotal}`,
          })
          .where(eq(customers.id, draftCustomerId));
      }

      // GL: post the completed draft's sale entry in the same tx.
      await glPostingService.postDocument(tx, {
        sourceType: 'sale',
        sourceId: updatedSale.id,
        user: actingUser || { id: userId },
      });

      return updatedSale.id;
    });

    alertBus.emit('alerts.changed', 'draft.completed');
    return await this.getById(updatedSaleId);
  }

  async getTopProducts(filters = {}) {
    const db = await getDb();
    const { limit = 5, startDate, endDate } = filters;

    // Include returned / partially-returned sales — the returned quantities are
    // subtracted below so a returned item no longer inflates product sales.
    const conditions = [
      inArray(sales.status, ['completed', 'partially_returned', 'returned']),
    ];
    if (startDate) conditions.push(gte(sales.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(sales.createdAt, new Date(endDate)));

    // Gross per-product totals. No SQL LIMIT here: returns are netted out in JS
    // first, then we sort + slice, so a heavily-returned product can't keep a
    // slot it no longer deserves.
    const grossRows = await db
      .select({
        productId: saleItems.productId,
        productName: sql`min(${products.name})`.as('productName'),
        totalQuantity: sql`CAST(COALESCE(sum(${saleItems.quantity}),0) AS integer)`.as('totalQuantity'),
        totalRevenue: sql`CAST(COALESCE(sum(${saleItems.quantity} * ${saleItems.unitPrice}::numeric),0) AS numeric)`.as('totalRevenue'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(and(...conditions))
      .groupBy(saleItems.productId);

    // Returned quantities/revenue per product, matched to the parent sale's
    // date window so the netting lines up with the gross figures above.
    const returnConds = [];
    if (startDate) returnConds.push(gte(sales.createdAt, new Date(startDate)));
    if (endDate) returnConds.push(lte(sales.createdAt, new Date(endDate)));
    const returnRows = await db
      .select({
        productId: saleReturnItems.productId,
        returnedQuantity: sql`COALESCE(sum(${saleReturnItems.quantity}),0)`.as('returnedQuantity'),
        returnedRevenue: sql`COALESCE(sum(${saleReturnItems.subtotal}::numeric),0)`.as('returnedRevenue'),
      })
      .from(saleReturnItems)
      .innerJoin(saleReturns, eq(saleReturnItems.returnId, saleReturns.id))
      .innerJoin(sales, eq(saleReturns.saleId, sales.id))
      .where(returnConds.length ? and(...returnConds) : undefined)
      .groupBy(saleReturnItems.productId);

    const returnsByProduct = new Map(
      returnRows.map((r) => [
        r.productId,
        { qty: Number(r.returnedQuantity) || 0, revenue: Number(r.returnedRevenue) || 0 },
      ])
    );

    return grossRows
      .map((row) => {
        const ret = returnsByProduct.get(row.productId) || { qty: 0, revenue: 0 };
        return {
          productId: row.productId,
          productName: row.productName,
          totalQuantity: Math.max(0, (Number(row.totalQuantity) || 0) - ret.qty),
          totalRevenue: Math.max(0, (Number(row.totalRevenue) || 0) - ret.revenue),
        };
      })
      .filter((r) => r.totalQuantity > 0)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, limit);
  }
}
