import { computed } from 'vue';
import { parseFirstDue, toYmd } from './saleDates';

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

  // ── Line aggregates ──────────────────────────────────────────────────────
  const itemsTotal = computed(() =>
    sale.value.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  );
  const itemsDiscount = computed(() =>
    sale.value.items.reduce((s, i) => s + (i.discount || 0) * i.quantity, 0)
  );

  // Subtotal = Σ(qty × unitPrice − qty × lineDiscount).
  const subtotal = computed(() =>
    sale.value.items.reduce((s, i) => {
      const itemTotal = i.quantity * i.unitPrice;
      const itemDiscount = (i.discount || 0) * i.quantity;
      return s + (itemTotal - itemDiscount);
    }, 0)
  );

  // Total after the invoice-level discount (never negative).
  const total = computed(() => Math.max(0, subtotal.value - (sale.value.discount || 0)));

  // ── Installment interest (simple) ────────────────────────────────────────
  const interestValue = computed(() => {
    if (!isInstallment.value) return 0;
    if (sale.value.interestInputType === 'amount') {
      return Math.max(0, sale.value.interestAmount || 0);
    }
    const rate = sale.value.interestRate || 0;
    return total.value * (rate / 100);
  });

  const totalWithInterest = computed(() => r2(total.value + interestValue.value));

  const actualInterestRate = computed(() => {
    if (!isInstallment.value || total.value === 0) return 0;
    if (sale.value.interestInputType === 'amount') {
      return (interestValue.value / total.value) * 100;
    }
    return sale.value.interestRate || 0;
  });

  // ── Payment-derived figures ──────────────────────────────────────────────
  // Single installment value = (total after interest − down payment) / count.
  const installmentAmount = computed(() => {
    const count = sale.value.installmentCount;
    if (!count || count <= 0) return 0;
    const remaining = Math.max(0, totalWithInterest.value - (sale.value.paidAmount || 0));
    return r2(remaining / count);
  });

  // Remaining: 0 for cash (paid in full); (total after interest − down) otherwise.
  const remainingAmount = computed(() => {
    if (!isInstallment.value) return 0;
    return Math.max(0, r2(totalWithInterest.value - (sale.value.paidAmount || 0)));
  });

  // Change owed back to a cash customer (UI-only; the payload is always paid in
  // full). `receivedAmount` defaults to the total and is overridable by the cashier.
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
    itemsTotal,
    itemsDiscount,
    subtotal,
    total,
    interestValue,
    totalWithInterest,
    actualInterestRate,
    installmentAmount,
    remainingAmount,
    changeAmount,
    installmentSchedule,
  };
}
