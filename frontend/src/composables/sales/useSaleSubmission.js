import { ref } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import {
  SALE_SOURCE_NEW_SALE,
  SALE_TYPE_INSTALLMENT,
  SALE_TYPE_CASH,
} from '@/constants/sales';
import { toBaseQuantity } from '@/utils/productUnits';

/**
 * Builds the API payload and drives invoice creation, draft completion, the
 * cancel/leave lifecycle and double-submit protection. The payload contract is
 * unchanged from the previous NewSale.vue (pinned by the backend
 * newSaleCashInstallment test).
 *
 * @param {object} deps
 * @param {Function} [deps.beforeSubmit] async hook; return false to abort (e.g. high-risk credit confirm)
 */
export function useSaleSubmission(deps) {
  const {
    sale,
    calc,
    selectedCustomerType,
    form,
    products,
    availableStockOf,
    currentDraftId,
    saleCompleted,
    isCancelled,
    draftSaved,
    isSavingDraft,
    saveDraft,
    saleStore,
    notify,
    inventoryStore,
    beforeSubmit,
  } = deps;

  const router = useRouter();
  const loading = ref(false);

  const validateStock = () => {
    if (!Array.isArray(products.value)) {
      notify.error('❌ قائمة المنتجات غير متاحة');
      return false;
    }
    for (const item of sale.value.items) {
      const product = products.value.find((p) => p.id === item.productId);
      if (!product) {
        notify.error('❌ المنتج غير موجود');
        return false;
      }
      if (item.isService || product.productType === 'service') continue;
      const available = availableStockOf(product);
      const unit = (product.units || []).find((u) => u.id === item.unitId) || null;
      const factor = Number(unit?.conversionFactor) || 1;
      const baseRequested = Number(item.quantity || 0) * factor;
      if (available < baseRequested) {
        notify.error(`❌ الكمية المطلوبة من "${product.name}" غير متوفرة بالمخزون`);
        return false;
      }
    }
    return true;
  };

  const buildPayload = (isInstallment) => {
    const payload = {
      customerId: sale.value.customerId || null,
      currency: sale.value.currency,
      discount: sale.value.discount || 0,
      tax: sale.value.tax || 0,
      notes: sale.value.notes || null,
      saleSource: SALE_SOURCE_NEW_SALE,
      saleType: isInstallment ? SALE_TYPE_INSTALLMENT : SALE_TYPE_CASH,
      paymentType: isInstallment ? 'installment' : 'cash',
      paymentMethod: 'cash',
      priceType: selectedCustomerType.value,
      branchId: inventoryStore.selectedBranchId || undefined,
      warehouseId: inventoryStore.selectedWarehouseId || undefined,
      items: sale.value.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discount: it.discount || 0,
        unitId: it.unitId || null,
        unitName: it.unitName || null,
        unitConversionFactor: Number(it.unitConversionFactor) || 1,
        baseQuantity: toBaseQuantity(it.quantity, {
          conversionFactor: Number(it.unitConversionFactor) || 1,
        }),
        notes: it.notes && String(it.notes).trim() ? String(it.notes).trim() : undefined,
      })),
    };

    if (isInstallment) {
      payload.paidAmount = sale.value.paidAmount || 0;
      payload.installmentCount = sale.value.installmentCount;
      payload.interestRate = sale.value.interestRate || 0;
      payload.interestAmount = sale.value.interestAmount || 0;
      payload.firstInstallmentDate = sale.value.firstInstallmentDate;
      payload.installmentPeriod = sale.value.installmentPeriod || 'monthly';
    } else {
      payload.paidAmount = calc.total.value;
    }
    return payload;
  };

  const submitSale = async () => {
    if (loading.value) return; // double-submit guard
    const isInstallment = sale.value.paymentType === 'installment';

    if (isInstallment) {
      if (!sale.value.customerId) return notify.error('يرجى اختيار العميل لإكمال البيع بالأقساط');
      if (!sale.value.installmentCount || sale.value.installmentCount < 1) {
        return notify.error('عدد الأقساط يجب أن يكون أكبر من صفر');
      }
      if (!sale.value.firstInstallmentDate) return notify.error('تاريخ أول قسط مطلوب');
      if ((sale.value.paidAmount || 0) >= calc.totalWithInterest.value) {
        return notify.error('الدفعة المقدمة لا يمكن أن تساوي أو تتجاوز إجمالي الفاتورة');
      }
    } else {
      const received = Number(sale.value.receivedAmount ?? calc.total.value) || 0;
      if (received < calc.total.value) {
        return notify.error('المبلغ المستلم أقل من إجمالي الفاتورة');
      }
    }

    if (typeof beforeSubmit === 'function') {
      const proceed = await beforeSubmit({ isInstallment });
      if (proceed === false) return;
    }

    if (form?.value?.validate) {
      const { valid } = await form.value.validate();
      if (!valid) return notify.error('يرجى تعبئة الحقول المطلوبة');
    }

    if (!sale.value.items.length) return notify.error('يجب إضافة منتج واحد على الأقل');
    if (!validateStock()) return;

    loading.value = true;
    try {
      const payload = buildPayload(isInstallment);
      const saleResponse = currentDraftId.value
        ? await saleStore.completeDraft(currentDraftId.value, payload)
        : await saleStore.createSale(payload);

      saleCompleted.value = true;
      notify.success('تم حفظ الفاتورة بنجاح ✅');
      const saleId = saleResponse.data?.data?.id || saleResponse.data?.id;
      router.push({ name: 'SaleDetails', params: { id: saleId } });
    } catch (error) {
      // The global API layer already presents a precise Arabic message.
      console.error('Sale submission error:', error);
    } finally {
      loading.value = false;
    }
  };

  const handleCancel = async () => {
    isCancelled.value = true;
    if (currentDraftId.value) {
      try {
        await saleStore.removeSale(currentDraftId.value);
      } catch (error) {
        console.error('Failed to delete draft:', error);
      }
    }
    router.back();
  };

  // Save a draft when navigating away (not on cancel / successful save).
  onBeforeRouteLeave(async (to, from, next) => {
    if (!saleCompleted.value && !isCancelled.value && !draftSaved.value && !isSavingDraft.value) {
      await saveDraft();
    }
    next();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (!saleCompleted.value && !isCancelled.value && !draftSaved.value && !isSavingDraft.value) {
        saveDraft().catch(() => {});
      }
    });
  }

  return { loading, submitSale, handleCancel };
}
