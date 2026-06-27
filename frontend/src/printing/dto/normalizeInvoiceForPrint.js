/**
 * normalizeInvoiceForPrint — converts a raw sale + company settings into a clean,
 * fully-serializable Print DTO suitable for sending over Electron IPC.
 *
 * Guarantees about the returned object:
 *   - no Vue refs / reactive proxies (we read plain values and JSON round-trip it)
 *   - no functions
 *   - 100% serializable (structured-clone safe)
 *
 * The image of the company logo is NEVER embedded here — only its file name /
 * relative path / external URL travel in the DTO. The Electron main process
 * resolves the path to a data URL at print time (see electron/print/logoStore.js).
 *
 * Handles: no-customer (cash) invoices, partially-paid invoices, installment
 * invoices (with schedule), long invoices, and is RTL-agnostic (the template owns
 * direction). Currency is carried through so the template formats correctly.
 */

import { formatInvoiceAddress } from './formatInvoiceAddress.js';

function num(v) {
  return Number(v) || 0;
}

// Map a company/customer record (structured fields, with current settings using
// city/area/street) to the Iraqi governorate-first invoice address. The legacy
// `city` field is treated as the governorate so e.g. «بغداد» sorts first; any real
// province/governorate field takes precedence when present.
function formatEntityAddress(source = {}) {
  return (
    formatInvoiceAddress({
      provinceName: source.provinceName,
      governorateName:
        source.governorateName || source.governorate || source.province || source.city,
      cityName: source.cityName,
      areaName: source.areaName || source.area,
      districtName: source.districtName || source.district,
      quarterName: source.quarterName || source.quarter,
      neighborhoodName: source.neighborhoodName || source.neighborhood,
      streetName: source.streetName || source.street,
      addressLine: source.addressLine,
      details: source.details,
      // legacy free-text fallback (old single dash-joined string)
      raw: source.address || source.addressString,
    }) || ''
  );
}

function pickCustomerName(sale) {
  const name = sale.customerName || sale.customer?.name || '';
  // The synthetic "زبون نقدي" walk-in is treated as "no customer".
  if (!name || name === 'زبون نقدي') return null;
  return name;
}

function buildItems(sale) {
  return (sale.items || []).map((item) => ({
    name: item.productName || item.name || 'منتج',
    sku: item.sku || item.productSku || item.barcode || null,
    barcode: item.barcode || null,
    unit: item.unitName || item.unit || null,
    quantity: num(item.quantity),
    price: num(item.unitPrice ?? item.price),
    // Per-line discount is stored as a TOTAL for the line in SaleDetails' snapshot.
    discount: num(item.discount),
    total: num(item.subtotal ?? item.total ?? item.netSubtotal),
    notes: item.notes || null,
  }));
}

function buildInstallments(sale) {
  if (sale.paymentType !== 'installment' || !Array.isArray(sale.installments)) return [];
  const statusLabels = {
    paid: 'مدفوع',
    pending: 'معلق',
    overdue: 'متأخر',
    cancelled: 'ملغي',
  };
  return sale.installments.map((inst, index) => ({
    number: inst.installmentNumber || index + 1,
    dueDate: inst.dueDate || null,
    amount: num(inst.dueAmount),
    statusLabel: statusLabels[inst.status] || inst.status || '',
    isPaid: inst.status === 'paid',
  }));
}

function buildPayments(sale) {
  // Prefer an explicit payments breakdown if the sale carries one; otherwise
  // synthesize nothing (the template already shows the aggregate "paid" line).
  if (Array.isArray(sale.payments) && sale.payments.length) {
    return sale.payments.map((p) => ({
      method: p.paymentMethod || p.method || 'cash',
      amount: num(p.amount),
    }));
  }
  return [];
}

/**
 * @param {object} params
 * @param {object} params.sale         raw sale (e.g. from buildSaleForPrint())
 * @param {object} params.companyInfo  settingsStore.companyInfo (+ print fields)
 * @returns {object} serializable Print DTO
 */
export function normalizeInvoiceForPrint({ sale, companyInfo } = {}) {
  if (!sale) throw new Error('تعذر العثور على بيانات الفاتورة');
  const company = companyInfo || {};

  const currency = sale.currency || company.defaultCurrency || 'IQD';
  const isInstallment = sale.paymentType === 'installment';

  // Iraqi governorate-first ordering built from structured fields (req: never a
  // pre-reversed string when the fields exist).
  const address = formatEntityAddress(company);

  const itemsDiscount = (sale.items || []).reduce((sum, it) => sum + num(it.discount), 0);
  const invoiceDiscount = num(sale.discount);

  const dto = {
    company: {
      name: company.name || '',
      phone: company.phone || '',
      phone2: company.phone2 || '',
      address,
      taxNumber: company.taxNumber || '',
      // Logo: identifiers only — the image is resolved in main.
      logoFileName: company.companyLogoFileName || null,
      logoPath: company.companyLogoPath || null,
      logoUrl: company.logoUrl || null,
      // Custom texts from settings.
      invoiceHeaderText: company.invoiceHeaderText || '',
      invoiceSubHeaderText: company.invoiceSubHeaderText || '',
      invoiceFooterText: company.invoiceFooterText || '',
      invoiceTermsText: company.invoiceTermsText || '',
      // Header layout: 'auto' | 'horizontal' | 'centered' | 'compact'.
      invoiceHeaderLayout: company.invoiceHeaderLayout || 'auto',
    },
    invoice: {
      id: sale.id ?? null,
      number: sale.invoiceNumber || sale.id || '',
      type: isInstallment ? 'installment' : 'cash',
      date: sale.createdAt || sale.date || null,
      status: sale.status || '',
      notes: sale.notes || '',
    },
    customer: pickCustomerName(sale)
      ? {
          id: sale.customerId ?? sale.customer?.id ?? null,
          name: pickCustomerName(sale),
          phone: sale.customer?.phone || sale.customerPhone || null,
          // Same Iraqi ordering; customers usually carry only a legacy string.
          address: formatEntityAddress(sale.customer || {}) || null,
        }
      : null,
    items: buildItems(sale),
    totals: {
      currency,
      subtotal: num(sale.subtotal) || (sale.items || []).reduce((s, it) => s + num(it.subtotal ?? it.total) + num(it.discount), 0),
      discount: itemsDiscount + invoiceDiscount,
      tax: num(sale.tax),
      interest: isInstallment ? num(sale.interestAmount) : 0,
      total: num(sale.total),
      paid: num(sale.paidAmount),
      remaining: num(sale.remainingAmount),
      change: num(sale.changeAmount),
    },
    payments: buildPayments(sale),
    meta: {
      userName: sale.createdBy || sale.user?.name || sale.userName || '',
      branchName: sale.branchName || sale.branch?.name || '',
      warehouseName: sale.warehouseName || sale.warehouse?.name || '',
      currency,
      isInstallment,
      installments: buildInstallments(sale),
      printedAt: null, // stamped in main at print time
    },
  };

  // Final guarantee: strip any lingering proxy/getter and prove serializability.
  return JSON.parse(JSON.stringify(dto));
}

export default normalizeInvoiceForPrint;
