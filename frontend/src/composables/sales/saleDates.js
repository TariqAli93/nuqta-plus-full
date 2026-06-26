/**
 * Date helpers shared by the New-Sale composables. Kept framework-free so the
 * installment-schedule preview (frontend) stays bit-for-bit aligned with the
 * backend generator: dates start from «تاريخ أول قسط» and step by the period.
 */

/** Format a Date (or parseable value) as a TZ-safe `YYYY-MM-DD` string. */
export const toYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Default first due date: today + one month, used as the «تاريخ أول قسط» seed. */
export const defaultFirstInstallmentDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return toYmd(d);
};

/** Resolve the first due date for the preview, mirroring the backend fallback. */
export const parseFirstDue = (ymd, period) => {
  if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date(`${ymd}T00:00:00`);
  const d = new Date();
  if (period === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
};
