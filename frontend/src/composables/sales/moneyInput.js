/**
 * Tiny helpers for free-typed money fields (discount, down payment, interest,
 * received cash). `groupNumber` adds thousands separators while preserving the
 * user's in-progress typing (unlike the Intl formatter, it never forces decimals
 * or prints "0" for an empty field). `parseAmount` is re-exported from the
 * canonical formatters util so parsing stays consistent app-wide.
 */
import { parseNumber as parseAmount } from '@/utils/formatters';

export { parseAmount };

export function groupNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const numStr = String(value).replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(numStr)) return value;
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}
