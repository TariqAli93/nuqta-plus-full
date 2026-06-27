import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeInvoiceForPrint } from '../src/printing/dto/normalizeInvoiceForPrint.js';

/**
 * Pure Print DTO normalizer (no Vue/Pinia/IPC), so it runs standalone:
 *   node --test test/normalizeInvoiceForPrint.test.mjs
 *
 * Covers the invariants the whole printing pipeline depends on: serializability,
 * no-customer (cash) invoices, partial payment, discounts, installments, and
 * that the logo image is NEVER embedded (only its path travels).
 */

const company = {
  name: 'شركة نقطة',
  city: 'بغداد',
  area: 'الكرادة',
  street: 'شارع 62',
  phone: '07700000000',
  phone2: '',
  taxNumber: 'TAX-1',
  companyLogoFileName: 'company-logo.png',
  companyLogoPath: 'images/company/company-logo.png',
  invoiceHeaderText: 'مرحباً',
  invoiceFooterText: 'شكراً لتعاملكم معنا',
  invoiceTermsText: 'البضاعة المباعة لا تُسترجع إلا بموجب الفاتورة',
  invoiceType: 'roll-80',
  invoiceTheme: 'classic',
};

const baseSale = {
  id: 10,
  invoiceNumber: 'INV-0001',
  createdAt: '2026-06-27T10:00:00.000Z',
  createdBy: 'admin',
  currency: 'IQD',
  paymentType: 'cash',
  total: 30000,
  paidAmount: 30000,
  remainingAmount: 0,
  discount: 0,
  items: [
    { productName: 'منتج أ', quantity: 2, unitPrice: 10000, subtotal: 20000, discount: 0 },
    { productName: 'منتج ب', quantity: 1, unitPrice: 10000, subtotal: 10000, discount: 0 },
  ],
};

test('produces a fully serializable DTO (no proxies/functions)', () => {
  const dto = normalizeInvoiceForPrint({ sale: baseSale, companyInfo: company });
  // round-trips without throwing and is deep-equal to itself → structured-clone safe
  assert.deepEqual(JSON.parse(JSON.stringify(dto)), dto);
  assert.equal(typeof dto.company.invoiceFooterText, 'string');
});

test('never embeds the logo image — only its path/filename', () => {
  const dto = normalizeInvoiceForPrint({ sale: baseSale, companyInfo: company });
  assert.equal(dto.company.logoPath, 'images/company/company-logo.png');
  assert.equal(dto.company.logoFileName, 'company-logo.png');
  assert.equal(dto.company.logoDataUrl, undefined); // resolved later in main, not here
  assert.ok(!JSON.stringify(dto).includes('base64'));
});

test('company address is governorate-first (city → first group)', () => {
  const dto = normalizeInvoiceForPrint({ sale: baseSale, companyInfo: company });
  // company.city='بغداد', area='الكرادة', street='شارع 62'
  assert.equal(dto.company.address, 'بغداد / الكرادة / شارع 62');
});

test('legacy customer address string is reordered governorate-first', () => {
  const dto = normalizeInvoiceForPrint({
    sale: { ...baseSale, customerName: 'علي', customer: { address: 'شارع الابداع - الدورة - حي دجلة - بغداد' } },
    companyInfo: company,
  });
  assert.equal(dto.customer.address, 'بغداد / حي دجلة / الدورة / شارع الابداع');
});

test('cash / walk-in invoice has no customer', () => {
  const dto = normalizeInvoiceForPrint({
    sale: { ...baseSale, customerName: 'زبون نقدي' },
    companyInfo: company,
  });
  assert.equal(dto.customer, null);
  assert.equal(dto.invoice.type, 'cash');
});

test('keeps a real customer', () => {
  const dto = normalizeInvoiceForPrint({
    sale: { ...baseSale, customerName: 'علي', customer: { phone: '0780', address: 'x' } },
    companyInfo: company,
  });
  assert.equal(dto.customer.name, 'علي');
  assert.equal(dto.customer.phone, '0780');
});

test('partial payment surfaces the remaining balance', () => {
  const dto = normalizeInvoiceForPrint({
    sale: { ...baseSale, paidAmount: 12000, remainingAmount: 18000 },
    companyInfo: company,
  });
  assert.equal(dto.totals.paid, 12000);
  assert.equal(dto.totals.remaining, 18000);
});

test('aggregates item + invoice discounts', () => {
  const dto = normalizeInvoiceForPrint({
    sale: {
      ...baseSale,
      discount: 1000,
      items: [{ productName: 'x', quantity: 1, unitPrice: 10000, subtotal: 9000, discount: 1000 }],
    },
    companyInfo: company,
  });
  assert.equal(dto.totals.discount, 2000); // 1000 line + 1000 invoice
});

test('installment invoice carries the schedule + interest', () => {
  const dto = normalizeInvoiceForPrint({
    sale: {
      ...baseSale,
      paymentType: 'installment',
      interestAmount: 5000,
      installments: [
        { installmentNumber: 1, dueDate: '2026-07-27', dueAmount: 17500, status: 'pending' },
        { installmentNumber: 2, dueDate: '2026-08-27', dueAmount: 17500, status: 'paid' },
      ],
    },
    companyInfo: company,
  });
  assert.equal(dto.invoice.type, 'installment');
  assert.equal(dto.totals.interest, 5000);
  assert.equal(dto.meta.installments.length, 2);
  assert.equal(dto.meta.installments[1].isPaid, true);
});

test('carries currency through for the template to format', () => {
  const dto = normalizeInvoiceForPrint({
    sale: { ...baseSale, currency: 'USD' },
    companyInfo: company,
  });
  assert.equal(dto.totals.currency, 'USD');
  assert.equal(dto.meta.currency, 'USD');
});

test('throws a clear Arabic error when the sale is missing', () => {
  assert.throws(() => normalizeInvoiceForPrint({ sale: null, companyInfo: company }), /الفاتورة/);
});
