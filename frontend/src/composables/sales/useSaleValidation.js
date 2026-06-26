import { computed } from 'vue';

/**
 * Derives the human-readable reasons the invoice can't be created yet. The
 * action bar disables «إنشاء الفاتورة» whenever `disabledReasons` is non-empty
 * and surfaces them in a tooltip, so the cashier always knows what's missing.
 *
 * Only client-verifiable conditions live here. Server-only guards (closed
 * accounting period, credit-limit override) still return precise Arabic messages
 * through the API layer on submit.
 *
 * @param {object} deps
 * @param {import('vue').Ref} deps.sale
 * @param {object} deps.calc            result of useSaleCalculations
 * @param {Function} deps.getQuantityError
 */
export function useSaleValidation({ sale, calc, getQuantityError }) {
  const hasItems = computed(() => sale.value.items.length > 0);

  const lineIssue = computed(() =>
    sale.value.items.some(
      (item) =>
        !item.productId ||
        Number(item.quantity || 0) <= 0 ||
        getQuantityError(item).length > 0
    )
  );

  const disabledReasons = computed(() => {
    const reasons = [];
    if (!hasItems.value) {
      reasons.push('أضف منتجاً واحداً على الأقل');
    }
    if (hasItems.value && lineIssue.value) {
      reasons.push('راجع كميات المنتجات — بعضها يتجاوز المخزون أو غير صالح');
    }

    if (sale.value.paymentType === 'installment') {
      if (!sale.value.customerId) reasons.push('اختر العميل لإتمام البيع بالأقساط');
      if (!sale.value.installmentCount || sale.value.installmentCount < 1) {
        reasons.push('عدد الأقساط يجب أن يكون أكبر من صفر');
      }
      if (!sale.value.firstInstallmentDate) reasons.push('حدّد تاريخ أول قسط');
      if ((sale.value.paidAmount || 0) >= calc.totalWithInterest.value && calc.total.value > 0) {
        reasons.push('الدفعة المقدمة لا يمكن أن تساوي أو تتجاوز إجمالي الفاتورة');
      }
    } else {
      const received = Number(sale.value.receivedAmount ?? calc.total.value) || 0;
      if (hasItems.value && received < calc.total.value) {
        reasons.push('المبلغ المستلم أقل من إجمالي الفاتورة');
      }
    }

    return reasons;
  });

  const canSubmit = computed(() => disabledReasons.value.length === 0);

  return { disabledReasons, canSubmit };
}
