/**
 * formatInvoiceAddress — Iraqi-style invoice address ordering.
 *
 * Builds the address from the STRUCTURED fields (never a pre-joined string when
 * structured data exists). Output grouping:
 *
 *   المحافظة / (المنطقة أو المدينة + الحي) / الشارع
 *
 * Examples:
 *   provinceName=بغداد, areaName=الدورة, quarterName=حي دجلة, streetName=شارع الابداع
 *     → "بغداد / الدورة حي دجلة / شارع الابداع"
 *   province + area + street            → "بغداد / الدورة / شارع الابداع"
 *   province + quarter                  → "بغداد / حي دجلة"
 *
 * Empty fields never produce stray " / " separators.
 *
 * Legacy fallback ONLY: when there are no structured fields and just an old
 * dash-joined string (e.g. "شارع الابداع - الدورة - حي دجلة - بغداد"), it is split
 * on "-" and reversed so the governorate comes first. Reversing is never applied
 * to structured data.
 *
 * Supported structured fields:
 *   provinceName, governorateName, cityName, areaName, districtName,
 *   quarterName, neighborhoodName, streetName, addressLine, details
 * Plus an optional `raw`/`address` string used only for the legacy fallback.
 */

const SEP = ' / ';

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/**
 * Legacy fallback: a dash-joined, street-first string → governorate-first groups.
 *   "شارع الابداع - الدورة - حي دجلة - بغداد" → "بغداد / حي دجلة / الدورة / شارع الابداع"
 * A string without "-" is returned as-is (nothing to reorder).
 */
export function formatLegacyAddressString(str) {
  const s = firstNonEmpty(str);
  if (!s) return '';
  if (!s.includes('-')) return s;
  const parts = s
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.reverse().join(SEP);
}

/**
 * @param {object|string} input structured address object, or a legacy string.
 * @returns {string} formatted address (governorate / area+quarter / street), or ''.
 */
export function formatInvoiceAddress(input) {
  if (!input) return '';
  if (typeof input === 'string') return formatLegacyAddressString(input);

  const province = firstNonEmpty(input.provinceName, input.governorateName);
  const areaOrCity = firstNonEmpty(input.areaName, input.cityName, input.districtName);
  const quarter = firstNonEmpty(input.quarterName, input.neighborhoodName);
  const street = firstNonEmpty(input.streetName, input.addressLine, input.details);

  const areaPlusQuarter = [areaOrCity, quarter].filter(Boolean).join(' ');
  const groups = [province, areaPlusQuarter, street].filter(Boolean);
  if (groups.length) return groups.join(SEP);

  // No structured data at all → fall back to a raw/legacy string if provided.
  return formatLegacyAddressString(firstNonEmpty(input.raw, input.address));
}

export default formatInvoiceAddress;
