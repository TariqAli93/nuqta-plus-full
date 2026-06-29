import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  useSaleStore,
  useProductStore,
  useNotificationStore,
  useSettingsStore,
  useInventoryStore,
} from '@/stores';
import {
  getProductUnits,
  getDefaultSaleUnit,
  getUnitConversionFactor,
  getUnitCostPrice,
  getUnitAvailableStock,
  resolveTierUnitPrice as resolveTierPriceFor,
} from '@/utils/productUnits';
import { useSaleCalculations } from './useSaleCalculations';
import { defaultFirstInstallmentDate } from './saleDates';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isServiceProduct = (p) => p?.productType === 'service';

/**
 * Owns the entire New-Sale invoice state: the `sale` model, the product catalog,
 * currency conversion, pricing tiers, line management, barcode scanning, the
 * behaviour watchers (cash paid-in-full, interest two-way binding, stock clamps)
 * and the draft lifecycle. Returns the state plus the derived `calc` so the page
 * and child components share one source of truth.
 *
 * All numeric logic is ported 1:1 from the previous monolithic NewSale.vue.
 */
export function useSaleForm() {
  const route = useRoute();
  const saleStore = useSaleStore();
  const productStore = useProductStore();
  const settingsStore = useSettingsStore();
  const notify = useNotificationStore();
  const inventoryStore = useInventoryStore();

  // ── Core model ─────────────────────────────────────────────────────────────
  const sale = ref({
    customerId: null,
    currency: settingsStore.settings?.defaultCurrency || 'IQD',
    items: [],
    discount: 0,
    discountType: 'amount', // 'amount' | 'percent' — UI-only; payload sends resolved amount
    discountValue: 0, // raw value the user types for the chosen type
    // Cash is the default payment method for the unified invoice page.
    paymentType: 'cash',
    paidAmount: 0,
    receivedAmount: 0, // cash only, UI-only (change calculation)
    // ── installment-only fields ────────────────────────────────────────────
    installmentCount: 3,
    interestRate: 25,
    interestAmount: 0,
    interestInputType: 'rate',
    firstInstallmentDate: defaultFirstInstallmentDate(),
    installmentPeriod: 'monthly',
    notes: '',
  });

  const products = ref([]);
  const currencySettings = ref({ defaultCurrency: 'IQD', usdRate: 1500, iqdRate: 1 });
  const selectedCustomerType = ref('retail');
  const receivedTouched = ref(false);

  const calc = useSaleCalculations(sale);

  // ── Draft / lifecycle flags ────────────────────────────────────────────────
  const currentDraftId = ref(null);
  const draftSaved = ref(false);
  const isSavingDraft = ref(false);
  const saleCompleted = ref(false);
  const isCancelled = ref(false);

  // ── Currency ────────────────────────────────────────────────────────────────
  const availableCurrencies = computed(() => settingsStore.availableCurrencies);

  const convertPrice = (amount, from, to) => {
    const num = Number(amount) || 0;
    if (!num || from === to) return num;
    const usdRate = Number(currencySettings.value.usdRate) || 1500;
    if (from === 'USD' && to === 'IQD') return num * usdRate;
    if (from === 'IQD' && to === 'USD') return num / usdRate;
    return num;
  };

  const applySaleCurrencyToItems = () => {
    sale.value.items = sale.value.items.map((i) => {
      const original = i.unitPriceOriginal ?? i.unitPrice;
      const originalCur = i.originalCurrency ?? sale.value.currency;
      const originalCost = i.unitCostOriginal ?? 0;
      return {
        ...i,
        unitPrice: convertPrice(original, originalCur, sale.value.currency),
        // Keep the per-unit cost (used for the invoice-discount cost floor) in
        // the same currency as the price so the two are comparable.
        unitCostPrice: convertPrice(originalCost, originalCur, sale.value.currency),
      };
    });
  };

  // ── Warehouse-aware stock ────────────────────────────────────────────────────
  const activeWarehouseId = computed(() => inventoryStore.selectedWarehouseId);

  const availableStockOf = (product) => {
    if (!product) return 0;
    if (activeWarehouseId.value && product.warehouseStock != null) {
      return Number(product.warehouseStock) || 0;
    }
    return Number(product.totalStock ?? product.stock ?? 0);
  };

  // ── Pricing tiers ─────────────────────────────────────────────────────────────
  const resolveTierUnitPrice = (product, unit) =>
    resolveTierPriceFor(product, unit, selectedCustomerType.value);

  const productOf = (item) =>
    Array.isArray(products.value)
      ? products.value.find((prod) => prod.id === item?.productId) || null
      : null;

  const repriceAllItems = () => {
    for (const item of sale.value.items) {
      const p = productOf(item);
      if (!p) continue;
      const unit = getProductUnits(p).find((u) => u.id === item.unitId) || null;
      const perUnit = resolveTierUnitPrice(p, unit);
      item.unitPriceOriginal = perUnit;
      item.originalCurrency = p.currency || 'USD';
      item.unitPrice = convertPrice(perUnit, item.originalCurrency, sale.value.currency);
      const perUnitCost = getUnitCostPrice(p, unit);
      item.unitCostOriginal = perUnitCost;
      item.unitCostPrice = convertPrice(perUnitCost, item.originalCurrency, sale.value.currency);
      item.isCustomPrice = false;
    }
  };

  const onCustomerSelected = (customer) => {
    selectedCustomerType.value = customer?.customerType || 'retail';
    repriceAllItems();
  };
  const onPriceTypeChange = () => repriceAllItems();

  // ── Units ─────────────────────────────────────────────────────────────────────
  const unitOptionsFor = (item) => {
    const p = productOf(item);
    if (!p) return [];
    const units = getProductUnits(p);
    if (units.length === 0) return [];
    const baseName = units.find((u) => u.isBase)?.name || 'قطعة';
    return units
      .filter((u) => u.isActive !== false)
      .map((u) => ({
        value: u.id,
        title: u.isBase
          ? `${u.name} (الأساسية)`
          : `${u.name} = ${Number(u.conversionFactor) || 1} ${baseName}`,
      }));
  };

  const availableInUnit = (item) => {
    const p = productOf(item);
    if (!p) return 0;
    if (isServiceProduct(p)) return Infinity;
    const baseAvailable = availableStockOf(p);
    const unit = getProductUnits(p).find((u) => u.id === item.unitId) || null;
    return getUnitAvailableStock(baseAvailable, unit);
  };

  const onItemUnitChange = (item) => {
    const p = productOf(item);
    if (!p) return;
    const unit = getProductUnits(p).find((u) => u.id === item.unitId) || null;
    // A discount expressed for the previous unit no longer matches the new unit's
    // price — force a re-entry rather than silently keeping a stale number.
    item.discount = 0;
    item.unitName = unit?.name || null;
    item.unitConversionFactor = getUnitConversionFactor(unit);
    const perUnit = resolveTierUnitPrice(p, unit);
    item.unitPriceOriginal = perUnit;
    item.originalCurrency = p.currency || 'USD';
    item.unitPrice = convertPrice(perUnit, item.originalCurrency, sale.value.currency);
    const perUnitCost = getUnitCostPrice(p, unit);
    item.unitCostOriginal = perUnitCost;
    item.unitCostPrice = convertPrice(perUnitCost, item.originalCurrency, sale.value.currency);
    item.isCustomPrice = false;
    const cap = availableInUnit(item);
    if (Number.isFinite(cap) && cap > 0 && item.quantity > cap) {
      item.quantity = cap;
      notify.warning(
        `الكمية المتوفرة غير كافية لهذه الوحدة. المتاح: ${cap} ${unit?.name || ''}`.trim()
      );
    }
  };

  // ── Adding products ────────────────────────────────────────────────────────────
  const buildLine = (product, unit, quantity = 1) => {
    const perUnit = resolveTierUnitPrice(product, unit);
    const perUnitCost = getUnitCostPrice(product, unit);
    const service = isServiceProduct(product);
    const baseAvailable = availableStockOf(product);
    const cap = service ? Infinity : getUnitAvailableStock(baseAvailable, unit);
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku || '',
      isService: service,
      quantity,
      unitId: unit?.id || null,
      unitName: unit?.name || null,
      unitConversionFactor: getUnitConversionFactor(unit),
      unitPriceOriginal: perUnit,
      originalCurrency: product.currency || 'USD',
      unitPrice: convertPrice(perUnit, product.currency || 'USD', sale.value.currency),
      // Per-unit cost (catalog → product base cost × factor), kept in the sale
      // currency. Drives the invoice-discount «never below cost» floor.
      unitCostOriginal: perUnitCost,
      unitCostPrice: convertPrice(perUnitCost, product.currency || 'USD', sale.value.currency),
      // True once the user edits this line's price away from the catalog/tier
      // price (per-invoice only). Reset when the unit re-prices the line.
      isCustomPrice: false,
      discount: 0,
      // Per-unit installment interest («فائدة الوحدة»). Starts at 0; the user
      // types it manually on installment invoices only (hidden for cash).
      interestPerUnit: 0,
      availableStock: cap,
      baseAvailableStock: baseAvailable,
      notes: '',
      _notesOpen: false,
    };
  };

  /** Add a product (or bump its line by one) using a specific unit. */
  const pushOrIncrement = (product, unit) => {
    const service = isServiceProduct(product);
    const baseAvailable = availableStockOf(product);
    if (!service && baseAvailable <= 0) {
      notify.error('❌ المنتج غير متوفر في المخزون');
      return false;
    }
    const cap = service ? Infinity : getUnitAvailableStock(baseAvailable, unit);
    const existing = sale.value.items.find(
      (i) => i.productId === product.id && (i.unitId || null) === (unit?.id || null)
    );
    if (existing) {
      const next = existing.quantity + 1;
      if (Number.isFinite(cap) && cap > 0 && next > cap) {
        notify.error(
          `الكمية المتوفرة غير كافية لهذه الوحدة. المتاح: ${cap} ${unit?.name || ''}`.trim()
        );
        return false;
      }
      existing.quantity = next;
    } else {
      sale.value.items.push(buildLine(product, unit, 1));
    }
    return true;
  };

  /** Search-bar selection → add the product at its preferred sale unit. */
  const addProductById = (productId) => {
    if (!productId) return false;
    const product = Array.isArray(products.value)
      ? products.value.find((p) => p.id === productId)
      : null;
    if (!product) {
      notify.error('❌ المنتج غير موجود');
      return false;
    }
    return pushOrIncrement(product, getDefaultSaleUnit(product) || null);
  };

  /** Barcode scan → match a unit-level barcode first (carton), else the product's. */
  const scanCode = (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return false;
    if (!Array.isArray(products.value)) {
      notify.error('❌ قائمة المنتجات غير متاحة');
      return false;
    }
    let scannedUnit = null;
    let product = products.value.find((p) => {
      const u = getProductUnits(p).find((unit) => unit.barcode && unit.barcode === code);
      if (u) {
        scannedUnit = u;
        return true;
      }
      return false;
    });
    if (!product) product = products.value.find((p) => p.barcode === code);
    if (!product) {
      notify.error('❌ المنتج غير موجود');
      return false;
    }
    const chosenUnit = scannedUnit || getDefaultSaleUnit(product) || null;
    return pushOrIncrement(product, chosenUnit);
  };

  const removeItem = (index) => sale.value.items.splice(index, 1);

  // ── Validation helpers (per-line) ────────────────────────────────────────────
  const getQuantityError = (item) => {
    if (!item.productId) return [];
    const cap = availableInUnit(item);
    if (!Number.isFinite(cap) || cap === 0) return [];
    if (Number(item.quantity || 0) > cap) {
      const product = productOf(item);
      const unit = getProductUnits(product).find((u) => u.id === item.unitId) || null;
      return [
        `الكمية المتوفرة غير كافية لهذه الوحدة. المتاح: ${cap} ${unit?.name || ''}`.trim(),
      ];
    }
    return [];
  };

  const customProductFilter = (itemText, queryText, item) => {
    if (!queryText) return true;
    const query = queryText.toLowerCase();
    const name = item.raw.name?.toLowerCase() || '';
    const sku = item.raw.sku?.toLowerCase() || '';
    const barcode = item.raw.barcode?.toLowerCase() || '';
    return name.includes(query) || sku.includes(query) || barcode.includes(query);
  };

  // ── Installment reset ────────────────────────────────────────────────────────
  const resetInstallmentState = () => {
    sale.value.installmentCount = 3;
    sale.value.interestRate = 25;
    sale.value.interestAmount = 0;
    sale.value.interestInputType = 'rate';
    sale.value.firstInstallmentDate = defaultFirstInstallmentDate();
    sale.value.installmentPeriod = 'monthly';
  };

  // ── Behaviour watchers ────────────────────────────────────────────────────────
  // Switch payment type: clear installment data on cash, treat cash as paid in full.
  watch(
    () => sale.value.paymentType,
    (newType, oldType) => {
      if (newType === oldType) return;
      if (newType === 'cash') {
        resetInstallmentState();
        // Default a cash invoice to fully paid (received = total); the cashier
        // may lower it for a partial / deferred sale. paidAmount is derived from
        // receivedAmount (calc.paidAmount), so we don't force it here anymore.
        sale.value.receivedAmount = r2(calc.total.value);
        receivedTouched.value = false;
      } else {
        sale.value.paidAmount = 0;
        if (!sale.value.firstInstallmentDate) {
          sale.value.firstInstallmentDate = defaultFirstInstallmentDate();
        }
      }
    }
  );

  // Currency change → re-convert every line.
  watch(
    () => sale.value.currency,
    () => applySaleCurrencyToItems()
  );

  // Clamp a line's quantity to the per-unit available stock (services excluded).
  watch(
    () => sale.value.items.map((item) => ({ id: item.productId, qty: item.quantity })),
    (newItems) => {
      if (!Array.isArray(products.value)) return;
      newItems.forEach((entry, index) => {
        if (!entry.id) return;
        const item = sale.value.items[index];
        const cap = availableInUnit(item);
        if (Number.isFinite(cap) && cap > 0 && entry.qty > cap) {
          const product = productOf(item);
          notify.error(
            `❌ الكمية المطلوبة من "${product?.name || ''}" (${entry.qty}) أكبر من المتوفر (${cap})`
          );
          sale.value.items[index].quantity = cap;
        }
      });
    },
    { deep: true }
  );

  // Resolve the invoice-level discount amount from its type + raw value.
  watch(
    () => [sale.value.discountType, sale.value.discountValue, calc.subtotal.value],
    () => {
      const value = Number(sale.value.discountValue) || 0;
      sale.value.discount =
        sale.value.discountType === 'percent'
          ? r2((calc.subtotal.value * value) / 100)
          : r2(value);
    }
  );

  // Cash: the received field follows the total until the cashier overrides it.
  // After an override we keep their amount (don't wipe a deliberate partial when
  // items/discount change), but still clamp it down if a now-smaller total would
  // push received above the invoice — per the "adjust to new total" rule.
  watch(
    () => [calc.total.value, calc.totalWithInterest.value],
    () => {
      if (sale.value.paymentType !== 'cash') return;
      const t = r2(calc.total.value);
      if (!receivedTouched.value) {
        sale.value.receivedAmount = t;
      } else if ((Number(sale.value.receivedAmount) || 0) > t) {
        sale.value.receivedAmount = t;
      }
    }
  );

  // Invoice-level interest is deprecated — interest is now entered per product
  // line as a per-unit amount (item.interestPerUnit) and summed in
  // useSaleCalculations. The old rate↔amount sync watchers were removed.

  // ── Input handlers exposed to forms ──────────────────────────────────────────
  // Received is bounded to [0, total]: no negatives, and never above the invoice
  // (the extra would be change, which this invoice page doesn't book).
  const setReceivedAmount = (amount) => {
    receivedTouched.value = true;
    const t = r2(calc.total.value);
    let v = Number(amount) || 0;
    if (v < 0) v = 0;
    if (v > t) v = t;
    sale.value.receivedAmount = v;
  };
  // ── Data loading ──────────────────────────────────────────────────────────────
  const loadProducts = async () => {
    const p = await productStore.fetch({
      limit: 1000,
      warehouseId: activeWarehouseId.value || undefined,
    });
    products.value = p.data;
  };
  watch(activeWarehouseId, loadProducts);

  const loadDraft = async (draftId) => {
    try {
      const draftResponse = await saleStore.fetchSale(Number(draftId));
      const draftData = draftResponse.data?.data || draftResponse.data;
      if (!draftData || draftData.status !== 'draft') return;

      currentDraftId.value = draftData.id;
      draftSaved.value = true;
      sale.value.customerId = draftData.customerId || null;
      sale.value.currency = draftData.currency || 'IQD';
      sale.value.paymentType = draftData.paymentType || 'cash';
      sale.value.discount = draftData.discount || 0;
      sale.value.discountValue = draftData.discount || 0;
      sale.value.notes = draftData.notes || '';

      if (Array.isArray(draftData.items) && draftData.items.length > 0) {
        sale.value.items = draftData.items.map((item) => {
          const product = Array.isArray(products.value)
            ? products.value.find((p) => p.id === item.productId)
            : null;
          const factor = Number(item.unitConversionFactor) || 1;
          const perUnitCost = (Number(product?.costPrice) || 0) * factor;
          const costCurrency = product?.currency || sale.value.currency;
          return {
            productId: item.productId,
            productName: product?.name || item.productName || '',
            sku: product?.sku || '',
            isService: isServiceProduct(product),
            quantity: item.quantity,
            unitId: item.unitId || null,
            unitName: item.unitName || null,
            unitConversionFactor: factor,
            unitPrice: item.unitPrice,
            unitCostOriginal: perUnitCost,
            unitCostPrice: convertPrice(perUnitCost, costCurrency, sale.value.currency),
            discount: item.discount || 0,
            interestPerUnit: Number(item.interestPerUnit) || 0,
            notes: item.notes || '',
            _notesOpen: false,
            unitPriceOriginal: product?.sellingPrice || item.unitPrice,
            isCustomPrice:
              product?.sellingPrice != null &&
              Number(item.unitPrice) !== Number(product.sellingPrice),
            originalCurrency: product?.currency || sale.value.currency,
            availableStock: availableStockOf(product),
          };
        });
      }
      notify.info('تم تحميل المسودة');
    } catch (error) {
      notify.error('فشل تحميل المسودة');
      console.error('Failed to load draft:', error);
    }
  };

  const saveDraft = async () => {
    if (
      saleCompleted.value ||
      isCancelled.value ||
      !sale.value.items?.length ||
      draftSaved.value ||
      isSavingDraft.value
    ) {
      return;
    }
    isSavingDraft.value = true;
    try {
      const draftData = {
        ...sale.value,
        customerId: sale.value.customerId || null,
        branchId: inventoryStore.selectedBranchId || undefined,
        warehouseId: inventoryStore.selectedWarehouseId || undefined,
      };
      const response = await saleStore.createDraft(draftData);
      if (response?.data?.data?.id) {
        currentDraftId.value = response.data.data.id;
        draftSaved.value = true;
      }
    } catch (error) {
      console.error('Failed to save draft:', error);
    } finally {
      isSavingDraft.value = false;
    }
  };

  // ── Init ──────────────────────────────────────────────────────────────────────
  onMounted(async () => {
    if (inventoryStore.branches.length === 0) await inventoryStore.fetchBranches();
    if (inventoryStore.warehouses.length === 0) await inventoryStore.fetchWarehouses();
    await loadProducts();

    try {
      const settings = await settingsStore.fetchCurrencySettings();
      if (settings) {
        currencySettings.value = { ...settings };
        const defaultCurrency = settings.defaultCurrency || 'IQD';
        sale.value.currency = availableCurrencies.value.includes(defaultCurrency)
          ? defaultCurrency
          : availableCurrencies.value[0] || defaultCurrency;
      }
    } catch {
      sale.value.currency = availableCurrencies.value[0] || 'IQD';
    }

    const draftId = route.query.draftId;
    if (draftId) await loadDraft(draftId);
  });

  return {
    // state
    sale,
    products,
    currencySettings,
    selectedCustomerType,
    availableCurrencies,
    activeWarehouseId,
    calc,
    // draft / lifecycle
    currentDraftId,
    draftSaved,
    isSavingDraft,
    saleCompleted,
    isCancelled,
    // catalog helpers
    availableStockOf,
    productOf,
    unitOptionsFor,
    availableInUnit,
    getQuantityError,
    customProductFilter,
    // actions
    addProductById,
    scanCode,
    removeItem,
    onItemUnitChange,
    onCustomerSelected,
    onPriceTypeChange,
    setReceivedAmount,
    // data
    loadProducts,
    saveDraft,
    inventoryStore,
    saleStore,
    notify,
  };
}
