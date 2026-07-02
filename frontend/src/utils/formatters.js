/**
 * Utility functions for formatting dates, numbers, and currencies
 */

/*
 * Intl formatter memoization.
 *
 * Constructing an `Intl.NumberFormat` / `Intl.DateTimeFormat` is expensive
 * (it loads locale + numbering-system data). These formatters are called from
 * inside table cells, so previously EVERY repaint of a 25-row list allocated a
 * fresh formatter per numeric/date/currency cell — hundreds of throwaway
 * objects per frame, which is a primary cause of scroll/render jank and GC
 * pressure in the Electron renderer. We cache one instance per (locale, options)
 * key and reuse it; the cache is tiny and bounded by the handful of distinct
 * option shapes the app actually uses.
 */
const _numberFmtCache = new Map();
function numberFormatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = _numberFmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    _numberFmtCache.set(key, fmt);
  }
  return fmt;
}

const _dateFmtCache = new Map();
function dateFormatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = _dateFmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    _dateFmtCache.set(key, fmt);
  }
  return fmt;
}

/**
 * Format date in Arabic locale
 * @param {Date|String} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 */
export function formatDate(date, options = {}) {
  if (!date) return '';

  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return '';

  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    numberingSystem: 'latn',
  };

  return dateFormatter('ar-IQ', { ...defaultOptions, ...options }).format(dateObj);
}

/**
 * Format date and time in Arabic locale
 * @param {Date|String} date - Date to format
 */
export function formatDateTime(date) {
  return formatDate(date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
  });
}

/**
 * Format number with thousand separators
 * @param {Number} number - Number to format
 * @param {Number} decimals - Number of decimal places
 */
export function formatNumber(number, decimals = 2) {
  if (number === null || number === undefined || isNaN(number)) return '0';

  return numberFormatter('ar', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    numberingSystem: 'latn',
  }).format(number);
}

/**
 * Currency symbol map — the single source of truth for currency symbols.
 * IQD intentionally maps to 'د.ع' (never '$') regardless of any per-currency
 * symbol stored in settings, so amounts render consistently across the app.
 * @param {String} currency - Currency code (IQD, USD, EUR, GBP)
 * @returns {String} Currency symbol
 */
export function getCurrencySymbol(currency) {
  const symbols = { IQD: 'د.ع', USD: '$', EUR: '€', GBP: '£' };
  return symbols[currency] || currency || 'د.ع';
}

/**
 * Canonical currency formatter — the single source of truth used across the
 * whole app. Output is "<number> <symbol>" (e.g. "200,000 د.ع", "1,500.00 $").
 * IQD uses 0 fraction digits, other currencies use 2.
 * @param {Number} amount - Amount to format
 * @param {String} currency - Currency code (defaults to IQD)
 * @returns {String} Formatted currency string
 */
export function formatCurrency(amount, currency = 'IQD') {
  const cur = currency || 'IQD';
  const num = Number(amount) || 0;
  const decimals = cur === 'USD' ? 2 : 0;
  // Reuse a cached formatter instead of the per-call `toLocaleString` path —
  // currency cells are the hottest formatter in the product/sales tables.
  const formatted = numberFormatter('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
  return `${formatted} ${getCurrencySymbol(cur)}`;
}

/**
 * Format relative time (e.g., "منذ ساعتين")
 * @param {Date|String} date - Date to format
 */
export function formatRelativeTime(date) {
  if (!date) return '';

  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return '';

  const now = new Date();
  const diffMs = now - dateObj;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;

  return formatDate(dateObj);
}

/**
 * Parse number from formatted string
 * @param {String} value - Formatted number string
 */
export function parseNumber(value) {
  if (!value) return 0;
  const numStr = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  const num = parseFloat(numStr);
  return isNaN(num) ? 0 : num;
}
