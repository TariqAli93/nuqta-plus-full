import {
  formatCurrency as fmtCurrency,
  formatNumber as fmtNumber,
  formatDate as fmtDate,
  formatDateTime as fmtDateTime,
  formatRelativeTime as fmtRelative,
} from '@/utils/formatters';

/**
 * SmartTable cell formatters (req #16) — a single, centralized set of "smart"
 * cell renderers so every table formats money / numbers / dates / phones /
 * status the same way, with correct RTL behaviour.
 *
 * A column opts in with `format: '<name>'` (or a `(value, row) => string`
 * function). <SmartTable> calls `formatCell(column, value, row)` for any column
 * that has no `#item.<key>` slot, so pages only template the cells that are
 * genuinely custom.
 *
 * RTL note: Arabic UI is RTL, but numbers, money, barcodes and SKUs must read
 * left-to-right. We don't inject markup here (formatters return strings);
 * SmartTable wraps numeric/identifier columns in a `dir="ltr"` span based on the
 * column's `align`/`format`, so digits never get visually reordered.
 */

/** True for formats whose output must render left-to-right inside an RTL UI. */
export const LTR_FORMATS = new Set([
  'number',
  'currency',
  'quantity',
  'percent',
  'phone',
  'barcode',
  'sku',
  'date',
  'datetime',
  'time',
]);

/** Formats that should be right-aligned (numeric columns) in an RTL table. */
export const NUMERIC_FORMATS = new Set(['number', 'currency', 'quantity', 'percent']);

const isEmpty = (v) => v === null || v === undefined || v === '';

export function formatPercent(value, decimals = 1) {
  if (isEmpty(value) || Number.isNaN(Number(value))) return '—';
  return `${fmtNumber(Number(value), decimals)}%`;
}

export function formatQuantity(value, decimals = 0) {
  if (isEmpty(value) || Number.isNaN(Number(value))) return '—';
  return fmtNumber(Number(value), decimals);
}

/** Group an Iraqi-style phone number for readability; kept LTR by SmartTable. */
export function formatPhone(value) {
  if (isEmpty(value)) return '—';
  const digits = String(value).replace(/[^\d+]/g, '');
  // 07XX XXX XXXX grouping when it looks like a local 11-digit mobile number.
  const local = digits.replace(/^\+?964/, '0');
  if (/^0\d{10}$/.test(local)) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return digits || '—';
}

export function formatBoolean(value, { yes = 'نعم', no = 'لا' } = {}) {
  if (isEmpty(value)) return '—';
  return value ? yes : no;
}

export function truncate(value, max = 60) {
  const s = isEmpty(value) ? '' : String(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Named formatter registry. Each: (value, row, column) => string.
 * `currency` reads the row's currency field (column.currencyKey, default
 * 'currency') so mixed-currency tables format each row correctly.
 */
export const cellFormatters = {
  text: (v) => (isEmpty(v) ? '—' : String(v)),
  longtext: (v, _row, col) => (isEmpty(v) ? '—' : truncate(v, col?.truncate ?? 60)),
  number: (v, _row, col) => (isEmpty(v) ? '—' : fmtNumber(Number(v), col?.decimals ?? 0)),
  quantity: (v, _row, col) => formatQuantity(v, col?.decimals ?? 0),
  percent: (v, _row, col) => formatPercent(v, col?.decimals ?? 1),
  currency: (v, row, col) => {
    if (isEmpty(v)) return '—';
    const currency = (col?.currencyKey ? row?.[col.currencyKey] : row?.currency) || col?.currency;
    return fmtCurrency(Number(v), currency || 'IQD');
  },
  date: (v) => (isEmpty(v) ? '—' : fmtDate(v)),
  datetime: (v) => (isEmpty(v) ? '—' : fmtDateTime(v)),
  relative: (v) => (isEmpty(v) ? '—' : fmtRelative(v)),
  time: (v) => {
    if (isEmpty(v)) return '—';
    try {
      return new Intl.DateTimeFormat('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
        numberingSystem: 'latn',
      }).format(new Date(v));
    } catch {
      return String(v);
    }
  },
  phone: (v) => formatPhone(v),
  barcode: (v) => (isEmpty(v) ? '—' : String(v)),
  sku: (v) => (isEmpty(v) ? '—' : String(v)),
  boolean: (v, _row, col) => formatBoolean(v, col?.labels),
};

/**
 * Resolve a column's display string. Returns null when the column declares no
 * `format` (so SmartTable falls back to the raw value / a caller slot).
 */
export function formatCell(column, value, row) {
  if (!column?.format) return null;
  if (typeof column.format === 'function') return column.format(value, row, column);
  const fn = cellFormatters[column.format];
  return fn ? fn(value, row, column) : String(value ?? '');
}

/**
 * Raw, unformatted value for EXPORT (req #9: export originals, not truncated
 * cell text). Prefers an explicit `exportValue(row)`, then `value(row)`, then
 * the keyed field. Never returns the visually-truncated string.
 */
export function exportValue(column, row) {
  if (typeof column.exportValue === 'function') return column.exportValue(row);
  if (typeof column.value === 'function') return column.value(row);
  const raw = row?.[column.key];
  // Apply currency/number formatting for human-readable exports, but keep the
  // FULL value (no truncation, no chips).
  if (column.format && column.format !== 'longtext' && column.format !== 'text') {
    const formatted = formatCell(column, raw, row);
    return formatted === '—' ? '' : formatted;
  }
  return isEmpty(raw) ? '' : raw;
}

/* Re-export the central primitives so pages can import everything table-related
   from one place. */
export const formatCurrency = fmtCurrency;
export const formatNumber = fmtNumber;
export const formatDate = fmtDate;
export const formatDateTime = fmtDateTime;
export const formatRelativeTime = fmtRelative;
