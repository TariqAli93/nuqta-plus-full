import { eq, and } from 'drizzle-orm';
import {
  sales,
  saleItems,
  saleReturns,
  saleReturnItems,
  payments,
  expenses,
  vouchers,
  purchaseInvoices,
  purchaseItems,
  purchaseReturns,
  purchaseReturnItems,
  treasuryTransfers,
  cashboxes,
  bankAccounts,
  products,
} from '../../models/index.js';
import systemAccountsService from './systemAccountsService.js';
import { ValidationError } from '../../utils/errors.js';

/**
 * Posting rules (قواعد الترحيل) — pure builders, one per source document
 * type. Each builder loads its document inside the caller's transaction and
 * returns the draft entry:
 *
 *   { entryDate, branchId, accountingPeriodId, description,
 *     lines: [{ accountId, debit, credit, currency, exchangeRate,
 *               partyType?, partyId?, description? }] }
 *
 * Accounts are resolved through system_accounts (data-driven); rules
 * themselves are code (unit-testable like reportMath.js). Builders return
 * null when the document needs no entry (zero-value, or its money is posted
 * by another canonical document — see the voucher builder).
 */

const n = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);
const today = () => new Date().toISOString().slice(0, 10);
const dateOf = (v) => {
  if (!v) return today();
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v).toISOString().slice(0, 10);
};

/** Resolve the GL account for a cashbox/bank target (with system fallbacks). */
async function resolveTargetAccount(tx, { cashboxId, bankAccountId, method }) {
  if (bankAccountId) {
    const [bank] = await tx
      .select({ glAccountId: bankAccounts.glAccountId })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, Number(bankAccountId)))
      .limit(1);
    if (bank?.glAccountId) return bank.glAccountId;
    return systemAccountsService.resolve(tx, 'bank_default');
  }
  if (cashboxId) {
    const [box] = await tx
      .select({ glAccountId: cashboxes.glAccountId })
      .from(cashboxes)
      .where(eq(cashboxes.id, Number(cashboxId)))
      .limit(1);
    if (box?.glAccountId) return box.glAccountId;
  }
  // No treasury attribution (flag off / legacy) → method decides the default.
  return systemAccountsService.resolve(tx, method === 'bank' || method === 'card' || method === 'transfer' ? 'bank_default' : 'cash_default');
}

/** Total line cost at sale time (mirrors reportMath conventions). */
function saleLineCost(line, productCost) {
  if (line.unitCostPrice != null) return n(line.unitCostPrice) * n(line.quantity);
  return n(productCost) * n(line.baseQuantity || line.quantity);
}

// ── Rule 1+2: sale (cash / credit / installment — one builder) ─────────────
async function buildSale(tx, sourceId) {
  const [sale] = await tx.select().from(sales).where(eq(sales.id, sourceId)).limit(1);
  if (!sale) throw new ValidationError(`Sale ${sourceId} not found`);
  if (sale.status === 'cancelled' || sale.status === 'draft') return null;

  const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
  const cur = sale.currency || 'IQD';
  const rate = n(sale.exchangeRate) || 1;

  // COGS from the frozen per-line cost snapshots (fallback: catalog cost).
  let cogsTotal = 0;
  for (const line of items) {
    let productCost = 0;
    if (line.unitCostPrice == null && line.productId) {
      const [p] = await tx
        .select({ costPrice: products.costPrice })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);
      productCost = n(p?.costPrice);
    }
    cogsTotal += saleLineCost(line, productCost);
  }
  cogsTotal = parseFloat(cogsTotal.toFixed(4));

  const lines = [];
  const push = (accountId, debit, credit, extra = {}) => {
    if (n(debit) <= 0 && n(credit) <= 0) return;
    lines.push({ accountId, debit: n(debit), credit: n(credit), currency: cur, exchangeRate: rate, ...extra });
  };

  // Paid legs — one per payment row so mixed cash/bank sales post correctly.
  const salePayments = await tx.select().from(payments).where(eq(payments.saleId, sale.id));
  for (const p of salePayments) {
    const target = await resolveTargetAccount(tx, {
      cashboxId: p.cashboxId,
      bankAccountId: p.bankAccountId,
      method: p.paymentMethod,
    });
    push(target, n(p.amount), 0, { description: 'المقبوض' });
  }
  const paidTotal = salePayments.reduce((acc, p) => acc + n(p.amount), 0);
  // Defensive: legacy rows where sale.paidAmount ≠ Σ payments — post the gap
  // to the default cash account so the entry still mirrors the document.
  const paidGap = parseFloat((n(sale.paidAmount) - paidTotal).toFixed(4));
  if (paidGap > 0.0001) {
    push(await systemAccountsService.resolve(tx, 'cash_default'), paidGap, 0, {
      description: 'المقبوض (فرق توفيقي)',
    });
  }

  if (n(sale.remainingAmount) > 0) {
    push(
      await systemAccountsService.resolve(tx, 'accounts_receivable'),
      n(sale.remainingAmount),
      0,
      { partyType: 'customer', partyId: sale.customerId || null, description: 'ذمة العميل' }
    );
  }
  if (n(sale.discount) > 0) {
    push(await systemAccountsService.resolve(tx, 'sales_discount'), n(sale.discount), 0, {
      description: 'خصم ممنوح',
    });
  }

  push(await systemAccountsService.resolve(tx, 'sales_revenue'), 0, n(sale.subtotal), {
    description: 'إيراد المبيعات',
  });
  if (n(sale.interestAmount) > 0) {
    push(
      await systemAccountsService.resolve(tx, 'installment_interest_income'),
      0,
      n(sale.interestAmount),
      { description: 'فائدة الأقساط' }
    );
  }
  if (n(sale.tax) > 0) {
    push(await systemAccountsService.resolve(tx, 'sales_tax_payable'), 0, n(sale.tax), {
      description: 'ضريبة المبيعات',
    });
  }

  if (cogsTotal > 0) {
    push(await systemAccountsService.resolve(tx, 'cogs'), cogsTotal, 0, {
      description: 'كلفة البضاعة المباعة',
    });
    push(await systemAccountsService.resolve(tx, 'inventory'), 0, cogsTotal, {
      description: 'إخراج من المخزون',
    });
  }

  return {
    entryDate: dateOf(sale.issuedAt || sale.createdAt),
    branchId: sale.branchId || null,
    accountingPeriodId: sale.accountingPeriodId || null,
    description: `قيد فاتورة بيع ${sale.invoiceNumber}`,
    lines,
  };
}

// ── Rule 3: sale return ────────────────────────────────────────────────────
async function buildSaleReturn(tx, sourceId) {
  const [ret] = await tx.select().from(saleReturns).where(eq(saleReturns.id, sourceId)).limit(1);
  if (!ret) throw new ValidationError(`Sale return ${sourceId} not found`);
  const [sale] = await tx.select().from(sales).where(eq(sales.id, ret.saleId)).limit(1);
  const items = await tx
    .select()
    .from(saleReturnItems)
    .where(eq(saleReturnItems.returnId, ret.id));

  const cur = ret.currency || 'IQD';
  const rate = n(sale?.exchangeRate) || 1;

  // Returned COGS via the original sale lines' frozen unit costs.
  let returnedCogs = 0;
  for (const ri of items) {
    let unitCostPrice = null;
    let baseFallbackCost = 0;
    if (ri.saleItemId) {
      const [orig] = await tx
        .select({ unitCostPrice: saleItems.unitCostPrice })
        .from(saleItems)
        .where(eq(saleItems.id, ri.saleItemId))
        .limit(1);
      unitCostPrice = orig?.unitCostPrice ?? null;
    }
    if (unitCostPrice == null && ri.productId) {
      const [p] = await tx
        .select({ costPrice: products.costPrice })
        .from(products)
        .where(eq(products.id, ri.productId))
        .limit(1);
      baseFallbackCost = n(p?.costPrice);
    }
    returnedCogs +=
      unitCostPrice != null
        ? n(unitCostPrice) * n(ri.quantity)
        : baseFallbackCost * n(ri.baseQuantity || ri.quantity);
  }
  returnedCogs = parseFloat(returnedCogs.toFixed(4));

  const lines = [];
  const push = (accountId, debit, credit, extra = {}) => {
    if (n(debit) <= 0 && n(credit) <= 0) return;
    lines.push({ accountId, debit: n(debit), credit: n(credit), currency: cur, exchangeRate: rate, ...extra });
  };

  push(await systemAccountsService.resolve(tx, 'sales_returns'), n(ret.returnedValue), 0, {
    description: 'مردودات مبيعات',
  });
  if (n(ret.refundAmount) > 0) {
    const target = await resolveTargetAccount(tx, {
      cashboxId: null,
      bankAccountId: null,
      method: ret.refundMethod === 'card' ? 'bank' : 'cash',
    });
    push(target, 0, n(ret.refundAmount), { description: 'المسترد نقداً' });
  }
  if (n(ret.debtReduction) > 0) {
    push(
      await systemAccountsService.resolve(tx, 'accounts_receivable'),
      0,
      n(ret.debtReduction),
      { partyType: 'customer', partyId: ret.customerId || null, description: 'خصم من ذمة العميل' }
    );
  }
  if (returnedCogs > 0) {
    push(await systemAccountsService.resolve(tx, 'inventory'), returnedCogs, 0, {
      description: 'إرجاع للمخزون',
    });
    push(await systemAccountsService.resolve(tx, 'cogs'), 0, returnedCogs, {
      description: 'عكس كلفة البضاعة',
    });
  }

  return {
    entryDate: dateOf(ret.createdAt),
    branchId: ret.branchId || null,
    accountingPeriodId: ret.accountingPeriodId || null,
    description: `قيد مرتجع بيع عن الفاتورة ${sale?.invoiceNumber || ret.saleId}`,
    lines,
  };
}

// ── Rule 4: customer payment (debt collection) ─────────────────────────────
async function buildPayment(tx, sourceId) {
  const [p] = await tx.select().from(payments).where(eq(payments.id, sourceId)).limit(1);
  if (!p) throw new ValidationError(`Payment ${sourceId} not found`);
  if (n(p.amount) <= 0) return null;

  const [sale] = p.saleId
    ? await tx.select().from(sales).where(eq(sales.id, p.saleId)).limit(1)
    : [null];
  const cur = p.currency || 'IQD';
  const rate = n(p.exchangeRate) || 1;

  const target = await resolveTargetAccount(tx, {
    cashboxId: p.cashboxId,
    bankAccountId: p.bankAccountId,
    method: p.paymentMethod,
  });
  const ar = await systemAccountsService.resolve(tx, 'accounts_receivable');

  return {
    entryDate: dateOf(p.paymentDate || p.createdAt),
    branchId: sale?.branchId || null,
    accountingPeriodId: null,
    description: `قيد دفعة عميل${sale?.invoiceNumber ? ` عن الفاتورة ${sale.invoiceNumber}` : ''}`,
    lines: [
      { accountId: target, debit: n(p.amount), credit: 0, currency: cur, exchangeRate: rate },
      {
        accountId: ar,
        debit: 0,
        credit: n(p.amount),
        currency: cur,
        exchangeRate: rate,
        partyType: 'customer',
        partyId: p.customerId || null,
      },
    ],
  };
}

// ── Rule 8: expense ────────────────────────────────────────────────────────
async function buildExpense(tx, sourceId) {
  const [e] = await tx.select().from(expenses).where(eq(expenses.id, sourceId)).limit(1);
  if (!e) throw new ValidationError(`Expense ${sourceId} not found`);
  if (n(e.amount) <= 0) return null;

  const cur = e.currency || 'IQD';
  const expenseAccount = await systemAccountsService.resolveWithFallback(
    tx,
    `expense_cat:${e.category}`,
    'expenses_default'
  );
  const target = await resolveTargetAccount(tx, {
    cashboxId: e.cashboxId,
    bankAccountId: e.bankAccountId,
    method: e.paymentMethod || 'cash',
  });

  return {
    entryDate: dateOf(e.expenseDate),
    branchId: e.branchId || null,
    accountingPeriodId: e.accountingPeriodId || null,
    description: `قيد مصروف (${e.category})${e.note ? ` — ${e.note}` : ''}`,
    lines: [
      { accountId: expenseAccount, debit: n(e.amount), credit: 0, currency: cur, exchangeRate: 1 },
      { accountId: target, debit: 0, credit: n(e.amount), currency: cur, exchangeRate: 1 },
    ],
  };
}

// ── Rules 7/9/10: vouchers ────────────────────────────────────────────────
// Only vouchers that ARE the canonical money document post here:
//   'manual'           → standalone receipt/payment (rules 9/10)
//   'purchase_payment' → supplier payment (rule 7 — the voucher IS the doc)
// Every other sourceType's money is posted by its source (sale/payment/
// expense/return) — posting the voucher too would double-count.
async function buildVoucher(tx, sourceId) {
  const [v] = await tx.select().from(vouchers).where(eq(vouchers.id, sourceId)).limit(1);
  if (!v) throw new ValidationError(`Voucher ${sourceId} not found`);
  if (v.status !== 'active') return null;
  if (v.sourceType !== 'manual' && v.sourceType !== 'purchase_payment') return null;

  const cur = v.currency || 'IQD';
  const rate = n(v.exchangeRate) || 1;
  const target = await resolveTargetAccount(tx, {
    cashboxId: v.cashboxId,
    bankAccountId: v.bankAccountId,
    method: v.method,
  });

  let counter;
  let counterExtra = {};
  if (v.sourceType === 'purchase_payment') {
    counter = await systemAccountsService.resolve(tx, 'accounts_payable');
    counterExtra = { partyType: 'supplier', partyId: v.supplierId || null };
  } else if (v.counterAccountId) {
    counter = v.counterAccountId;
  } else {
    counter = await systemAccountsService.resolve(
      tx,
      v.voucherType === 'receipt' ? 'other_income' : 'other_expenses'
    );
  }

  const lines =
    v.voucherType === 'receipt'
      ? [
          { accountId: target, debit: n(v.amount), credit: 0, currency: cur, exchangeRate: rate },
          { accountId: counter, debit: 0, credit: n(v.amount), currency: cur, exchangeRate: rate, ...counterExtra },
        ]
      : [
          { accountId: counter, debit: n(v.amount), credit: 0, currency: cur, exchangeRate: rate, ...counterExtra },
          { accountId: target, debit: 0, credit: n(v.amount), currency: cur, exchangeRate: rate },
        ];

  return {
    entryDate: dateOf(v.voucherDate),
    branchId: v.branchId || null,
    accountingPeriodId: v.accountingPeriodId || null,
    description: `قيد سند ${v.voucherType === 'receipt' ? 'قبض' : 'صرف'} ${v.voucherNumber}`,
    lines,
  };
}

// ── Rules 5/5b: purchase ───────────────────────────────────────────────────
// Uniform model: the purchase credits the FULL total to AP; every supplier
// payment voucher (at receipt or later) posts Dr AP / Cr cash separately.
// Net AP = remaining — no special-casing of the at-receipt cash leg, and
// the voucher rule stays identical for both payment moments.
async function buildPurchase(tx, sourceId) {
  const [inv] = await tx
    .select()
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, sourceId))
    .limit(1);
  if (!inv) throw new ValidationError(`Purchase ${sourceId} not found`);
  if (inv.status === 'cancelled') return null;
  // Opening-balance documents are covered by the opening JE (Phase F).
  if (inv.isOpeningBalance) return null;

  const cur = inv.currency || 'IQD';
  const rate = n(inv.exchangeRate) || 1;
  const lines = [];
  const push = (accountId, debit, credit, extra = {}) => {
    if (n(debit) <= 0 && n(credit) <= 0) return;
    lines.push({ accountId, debit: n(debit), credit: n(credit), currency: cur, exchangeRate: rate, ...extra });
  };

  push(await systemAccountsService.resolve(tx, 'inventory'), n(inv.total), 0, {
    description: 'إدخال بضاعة للمخزون',
  });
  push(await systemAccountsService.resolve(tx, 'accounts_payable'), 0, n(inv.total), {
    partyType: 'supplier',
    partyId: inv.supplierId,
    description: 'ذمة المورد (الإجمالي)',
  });

  return {
    entryDate: dateOf(inv.invoiceDate),
    branchId: inv.branchId || null,
    accountingPeriodId: inv.accountingPeriodId || null,
    description: `قيد فاتورة شراء ${inv.invoiceNumber}`,
    lines,
  };
}

// ── Rule 6: purchase return ────────────────────────────────────────────────
async function buildPurchaseReturn(tx, sourceId) {
  const [ret] = await tx
    .select()
    .from(purchaseReturns)
    .where(eq(purchaseReturns.id, sourceId))
    .limit(1);
  if (!ret) throw new ValidationError(`Purchase return ${sourceId} not found`);

  const cur = ret.currency || 'IQD';
  const lines = [];
  const push = (accountId, debit, credit, extra = {}) => {
    if (n(debit) <= 0 && n(credit) <= 0) return;
    lines.push({ accountId, debit: n(debit), credit: n(credit), currency: cur, exchangeRate: 1, ...extra });
  };

  if (n(ret.refundAmount) > 0) {
    // The receipt voucher minted for the refund carries the cashbox.
    const [v] = await tx
      .select()
      .from(vouchers)
      .where(
        and(
          eq(vouchers.purchaseInvoiceId, ret.purchaseInvoiceId),
          eq(vouchers.sourceType, 'purchase_refund'),
          eq(vouchers.status, 'active')
        )
      )
      .limit(1);
    const target = await resolveTargetAccount(tx, {
      cashboxId: v?.cashboxId || null,
      bankAccountId: v?.bankAccountId || null,
      method: 'cash',
    });
    push(target, n(ret.refundAmount), 0, { description: 'المسترد من المورد' });
  }
  if (n(ret.debtReduction) > 0) {
    push(await systemAccountsService.resolve(tx, 'accounts_payable'), n(ret.debtReduction), 0, {
      partyType: 'supplier',
      partyId: ret.supplierId,
      description: 'خصم من ذمة المورد',
    });
  }
  push(await systemAccountsService.resolve(tx, 'inventory'), 0, n(ret.returnedValue), {
    description: 'إخراج بضاعة مرتجعة للمورد',
  });

  return {
    entryDate: dateOf(ret.createdAt),
    branchId: ret.branchId || null,
    accountingPeriodId: ret.accountingPeriodId || null,
    description: `قيد مرتجع شراء ${ret.returnNumber}`,
    lines,
  };
}

// ── Rule 11: treasury transfer (may cross currencies) ──────────────────────
async function buildTreasuryTransfer(tx, sourceId) {
  const [t] = await tx
    .select()
    .from(treasuryTransfers)
    .where(eq(treasuryTransfers.id, sourceId))
    .limit(1);
  if (!t) throw new ValidationError(`Treasury transfer ${sourceId} not found`);
  if (t.status !== 'active') return null;

  const fromAccount = await resolveTargetAccount(tx, {
    cashboxId: t.fromCashboxId,
    bankAccountId: t.fromBankAccountId,
    method: t.fromBankAccountId ? 'bank' : 'cash',
  });
  const toAccount = await resolveTargetAccount(tx, {
    cashboxId: t.toCashboxId,
    bankAccountId: t.toBankAccountId,
    method: t.toBankAccountId ? 'bank' : 'cash',
  });

  const lines = [
    {
      accountId: toAccount,
      debit: t.toAmount != null ? n(t.toAmount) : n(t.amount),
      credit: 0,
      currency: t.toCurrency || t.currency,
      exchangeRate: t.toCurrency && t.toCurrency !== t.currency ? 1 : n(t.exchangeRate) || 1,
      description: 'إلى',
    },
    {
      accountId: fromAccount,
      debit: 0,
      credit: n(t.amount),
      currency: t.currency,
      exchangeRate: n(t.exchangeRate) || 1,
      description: 'من',
    },
  ];

  return {
    entryDate: dateOf(t.transferDate),
    branchId: t.branchId || null,
    accountingPeriodId: t.accountingPeriodId || null,
    description: `قيد تحويل خزينة ${t.transferNumber}`,
    lines,
  };
}

export const RULE_BUILDERS = Object.freeze({
  sale: buildSale,
  sale_return: buildSaleReturn,
  payment: buildPayment,
  expense: buildExpense,
  voucher: buildVoucher,
  purchase: buildPurchase,
  purchase_return: buildPurchaseReturn,
  treasury_transfer: buildTreasuryTransfer,
});

export default { RULE_BUILDERS };
