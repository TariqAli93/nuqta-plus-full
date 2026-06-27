import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatInvoiceAddress,
  formatLegacyAddressString,
} from '../src/printing/dto/formatInvoiceAddress.js';

/**
 * Iraqi invoice address ordering (governorate / area+quarter / street):
 *   node --test test/formatInvoiceAddress.test.mjs
 */

test('full address: province / area + quarter / street', () => {
  assert.equal(
    formatInvoiceAddress({
      provinceName: 'بغداد',
      areaName: 'الدورة',
      quarterName: 'حي دجلة',
      streetName: 'شارع الابداع',
    }),
    'بغداد / الدورة حي دجلة / شارع الابداع'
  );
});

test('no quarter: province / area / street', () => {
  assert.equal(
    formatInvoiceAddress({ provinceName: 'بغداد', areaName: 'الدورة', streetName: 'شارع الابداع' }),
    'بغداد / الدورة / شارع الابداع'
  );
});

test('province + quarter only', () => {
  assert.equal(
    formatInvoiceAddress({ provinceName: 'بغداد', quarterName: 'حي دجلة' }),
    'بغداد / حي دجلة'
  );
});

test('no street → no trailing slash', () => {
  assert.equal(
    formatInvoiceAddress({ provinceName: 'بغداد', areaName: 'الدورة' }),
    'بغداد / الدورة'
  );
});

test('no quarter → no double slash inside group two', () => {
  const out = formatInvoiceAddress({
    provinceName: 'بغداد',
    areaName: 'الدورة',
    streetName: 'شارع الابداع',
  });
  assert.equal(out, 'بغداد / الدورة / شارع الابداع');
  assert.ok(!out.includes('  '));
  assert.ok(!out.includes('/ /'));
});

test('governorateName is accepted as the province group', () => {
  assert.equal(
    formatInvoiceAddress({ governorateName: 'بغداد', cityName: 'الدورة', streetName: 'ش 60' }),
    'بغداد / الدورة / ش 60'
  );
});

test('neighborhoodName + addressLine fill quarter + street slots', () => {
  assert.equal(
    formatInvoiceAddress({ provinceName: 'بغداد', neighborhoodName: 'حي دجلة', addressLine: 'قرب الجامع' }),
    'بغداد / حي دجلة / قرب الجامع'
  );
});

test('legacy dash string is split and reversed (governorate first)', () => {
  assert.equal(
    formatInvoiceAddress('شارع الابداع - الدورة - حي دجلة - بغداد'),
    'بغداد / حي دجلة / الدورة / شارع الابداع'
  );
});

test('legacy fallback via raw when no structured fields', () => {
  assert.equal(
    formatInvoiceAddress({ raw: 'شارع الابداع - الدورة - بغداد' }),
    'بغداد / الدورة / شارع الابداع'
  );
});

test('structured fields win over a legacy raw string (req #1)', () => {
  assert.equal(
    formatInvoiceAddress({
      provinceName: 'بغداد',
      areaName: 'الدورة',
      streetName: 'شارع الابداع',
      raw: 'something - old - reversed',
    }),
    'بغداد / الدورة / شارع الابداع'
  );
});

test('single token without dashes is returned as-is', () => {
  assert.equal(formatLegacyAddressString('بغداد'), 'بغداد');
});

test('empty / nullish input → empty string (no stray slashes)', () => {
  assert.equal(formatInvoiceAddress(null), '');
  assert.equal(formatInvoiceAddress({}), '');
  assert.equal(formatInvoiceAddress(''), '');
});
