import { computed } from 'vue';
import { parseFirstDue, toYmd } from './saleDates';
import { allocateInvoiceDiscount, clampItemDiscountPerUnit } from '@/utils/discountAllocation';

/** Round to 2 decimals (currency-safe). */
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Pure, derived numbers for the New-Sale invoice. Takes the reactive `sale`
 * ref and returns only `computed`s — no stores, no side effects — so the same
 * math can be reused by the page, the summary panel and the validators without
 * drifting. Mirrors the original NewSale.vue rounding exactly.
 *
 * @param {import('vue').Ref} sale
 */
export function useSaleCalculations(sale) {
  const isInstallment = computed(() => sale.value.paymentType === 'installment');

  // ── Per-line item-discount clamp (runs BEFORE the invoice discount) ───────
  // Each line's own discount («خصم المنتج») is capped so its net never drops
  // below its cost; the resulting safe nets are the single basis for the
  // subtotal AND the invoice-discount allocation. `unitCostPrice` is set on each
  // line by useSaleForm (sale currency). The backend re-clamps authoritatively.
  const lineMeta = computed(() =>
    sale.value.items.map((i) => {
      const qty = Number(i.quantity) || 0;
      const unitPrice = Number(i.unitPrice) || 0;
      const unitCost = Number(i.unitCostPrice) || 0;
      const c = clampItemDiscountPerUnit(unitPrice, unitCost, i.discount || 0);
      const itemDiscountApplied = c.applied * qty;
      const itemDiscountRequested = Math.max(0, Number(i.discount) || 0) * qty;
      return {
        qty,
        cost: unitCost * qty,
        appliedPerUnit: c.applied,
        capped: c.capped,
        itemDiscountApplied,
        itemDiscountUnapplied: Math.max(0, itemDiscountRequested - itemDiscountApplied),
        netAfterItem: qty * unitPrice - itemDiscountApplied,
      };
    })
  );

  // ── Line aggregates ──────────────────────────────────────────────────────
  const itemsTotal = computed(() =>
    sale.value.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  );
  // Item discount ACTUALLY applied after the cost floor.
  const itemsDiscount = computed(() =>
    r2(lineMeta.value.reduce((s, m) => s + m.itemDiscountApplied, 0))
  );
  const itemDiscountUnapplied = computed(() =>
    r2(lineMeta.value.reduce((s, m) => s + m.itemDiscountUnapplied, 0))
  );
  const itemDiscountCapped = computed(() => lineMeta.value.some((m) => m.capped));

  // Subtotal = Σ(line net after the applied item discount).
  const subtotal = computed(() => lineMeta.value.reduce((s, m) => s + m.netAfterItem, 0));

  // ── Invoice-level discount with the «never below cost» floor ──────────────
  // The discount the user requested is spread across the lines in proportion to
  // their value, but no line may be pushed below its cost. `appliedDiscount` is
  // the safe amount actually applied; `unappliedDiscount` is what had to be
  // dropped (surfaced to the cashier as a warning). See utils/discountAllocation.
  const discountAllocation = computed(() =>
    allocateInvoiceDiscount(
      lineMeta.value.map((m) => ({ value: m.netAfterItem, cost: m.cost })),
      sale.value.discount || 0
    )
  );
  const appliedDiscount = computed(() => r2(discountAllocation.value.applied));
  const unappliedDiscount = computed(() => r2(discountAllocation.value.unapplied));
  const discountCapped = computed(() => discountAllocation.value.capped);

  // Total after the invoice-level discount (clamped to the cost floor; never negative).
  const total = computed(() => Math.max(0, subtotal.value - appliedDiscount.value));

  // ── Installment interest (per product line) ──────────────────────────────
  // Interest is set per line as a per-unit amount («فائدة الوحدة») and summed
  // across lines. Installment invoices only; cash invoices never add interest.
  const interestValue = computed(() => {
    if (!isInstallment.value) return 0;
    return sale.value.items.reduce(
      (s, i) => s + (i.quantity || 0) * Math.max(0, i.interestPerUnit || 0),
      0
    );
  });

  const totalWithInterest = computed(() => r2(total.value + interestValue.value));

  // Blended effective rate (informational only — interest is amount-driven now).
  const actualInterestRate = computed(() => {
    if (!isInstallment.value || total.value === 0) return 0;
    return (interestValue.value / total.value) * 100;
  });

  // ── Payment-derived figures ──────────────────────────────────────────────
  // Single installment value = (total after interest − down payment) / count.
  const installmentAmount = computed(() => {
    const count = sale.value.installmentCount;
    if (!count || count <= 0) return 0;
    const remaining = Math.max(0, totalWithInterest.value - (sale.value.paidAmount || 0));
    return r2(remaining / count);
  });

  // Amount actually collected up-front. Installment → the down payment.
  // Cash → the received amount, clamped to [0, total] (a debt-creating invoice
  // never returns change, so an overpayment is never booked).
  const paidAmount = computed(() => {
    if (isInstallment.value) return r2(sale.value.paidAmount || 0);
    const received = Number(sale.value.receivedAmount ?? total.value) || 0;
    return Math.min(Math.max(0, r2(received)), total.value);
  });

  // Remaining (debt). Cash partial/deferred now leaves a real balance (it used
  // to be hard-zeroed) — the single source the UI, validation and payload share.
  const remainingAmount = computed(() => {
    if (isInstallment.value) {
      return Math.max(0, r2(totalWithInterest.value - (sale.value.paidAmount || 0)));
    }
    return Math.max(0, r2(total.value - paidAmount.value));
  });

  // Payment status from the rounded figures (currency-safe — never a raw-float
  // compare): paid / partially_paid / unpaid.
  const paymentStatus = computed(() => {
    if (remainingAmount.value <= 0) return 'paid';
    if (paidAmount.value > 0) return 'partially_paid';
    return 'unpaid';
  });

  // Change owed back to a cash customer. With `receivedAmount` capped at the
  // total on this (invoice) page it is always 0; kept for API stability.
  const changeAmount = computed(() => {
    if (isInstallment.value) return 0;
    const received = Number(sale.value.receivedAmount ?? total.value) || 0;
    return Math.max(0, r2(received - total.value));
  });

  // ── Installment schedule preview ─────────────────────────────────────────
  // Distributes the remaining over `count`, pushing the rounding remainder into
  // the last installment; dates start at «تاريخ أول قسط» and step by period.
  const installmentSchedule = computed(() => {
    if (!isInstallment.value) return [];

    const count = sale.value.installmentCount;
    let remaining = r2(remainingAmount.value);
    if (remaining <= 0 || !count || count <= 0) return [];

    const schedule = [];
    const baseInstallment = remaining / count;
    const period = sale.value.installmentPeriod === 'weekly' ? 'weekly' : 'monthly';
    const firstDue = parseFirstDue(sale.value.firstInstallmentDate, period);
    let totalDistributed = 0;

    for (let i = 1; i <= count; i++) {
      const isLast = i === count;

      let installment;
      if (isLast) {
        installment = r2(remaining - totalDistributed);
        if (installment <= 0) installment = Math.max(0.01, r2(baseInstallment));
      } else {
        installment = r2(baseInstallment);
        if (installment <= 0) installment = 0.01;
        totalDistributed += installment;
      }

      remaining = r2(remaining - installment);

      const due = new Date(firstDue);
      if (period === 'weekly') due.setDate(due.getDate() + (i - 1) * 7);
      else due.setMonth(due.getMonth() + (i - 1));

      schedule.push({
        number: i,
        amount: installment,
        remaining: Math.max(0, remaining),
        dueDate: toYmd(due),
      });
    }

    return schedule;
  });

  return {
    isInstallment,
    lineMeta,
    itemsTotal,
    itemsDiscount,
    itemDiscountUnapplied,
    itemDiscountCapped,
    subtotal,
    appliedDiscount,
    unappliedDiscount,
    discountCapped,
    total,
    interestValue,
    totalWithInterest,
    actualInterestRate,
    installmentAmount,
    paidAmount,
    remainingAmount,
    paymentStatus,
    changeAmount,
    installmentSchedule,
  };
}
