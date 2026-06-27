import { exportToExcel, exportToPdf } from '@/utils/reportExporters.js';
import { displayCell } from '@/utils/reportExport.js';

/**
 * useSmartTableExport (req #9) — turns the current table view into Excel / PDF /
 * CSV / clipboard, reusing the app's PRODUCTION exporter (Arabic font, RTL
 * sheets, styled headers, totals) so SmartTable exports look exactly like the
 * report exports. We never export the truncated/chip cell text — we export the
 * underlying values (a column's `exportValue(row)` → `value(row)` → `row[key]`),
 * type-formatted (numbers stay numeric in Excel so totals work).
 *
 * Scope (all / page / selected) and column subset are decided by the caller
 * (SmartTable) which already holds the rows; this composable just renders.
 */

const NUMERIC = new Set(['number', 'quantity', 'currency', 'percent', 'money', 'amount']);
const DATE = new Set(['date', 'datetime', 'relative', 'time']);

/** Map a SmartTable column's `format` to a reportExporter column `type`. */
function mapType(col) {
  const f = typeof col.format === 'string' ? col.format : col.exportType;
  if (NUMERIC.has(f)) return 'number';
  if (DATE.has(f)) return 'date';
  return 'text';
}

/** Underlying, untruncated value for export. */
function rawValue(col, row) {
  if (typeof col.exportValue === 'function') return col.exportValue(row);
  if (typeof col.value === 'function') return col.value(row);
  return row?.[col.key];
}

/** Columns eligible for export: drop the select + actions + opt-outs. */
function exportableColumns(columns) {
  return columns.filter(
    (c) =>
      c.exportable !== false &&
      c.key !== 'actions' &&
      c.key !== 'data-table-select' &&
      c.key !== 'data-table-expand'
  );
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** `base-YYYY-MM-DD-HHmm.ext` — clear, dated filenames (req #9). */
export function exportFilename(base, ext) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base || 'table'}-${stamp}.${ext}`;
}

function buildStructure({ title, columns, rows, meta }) {
  const cols = exportableColumns(columns);
  const builtCols = cols.map((c) => ({
    key: c.key,
    header: c.title || c.key,
    type: mapType(c),
    total: c.exportTotal === true,
  }));
  const builtRows = rows.map((row) => {
    const o = {};
    for (const c of cols) o[c.key] = rawValue(c, row);
    return o;
  });
  return {
    title: title || 'الجدول',
    meta: {
      dateFrom: meta?.dateFrom || '',
      dateTo: meta?.dateTo || '',
      currency: meta?.currency || 'ALL',
      branchLabel: meta?.branchLabel || '—',
      userName: meta?.userName || '',
      generatedAt: meta?.generatedAt || new Date(),
    },
    sections: [{ id: 'data', title: title || 'الجدول', columns: builtCols, rows: builtRows }],
  };
}

/** CSV with a UTF-8 BOM so Excel opens Arabic correctly. */
function downloadCsv({ columns, rows, filename }) {
  const cols = exportableColumns(columns);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = cols.map((c) => esc(c.title || c.key)).join(',');
  const body = rows
    .map((row) => cols.map((c) => esc(displayCell(rawValue(c, row), mapType(c)))).join(','))
    .join('\n');
  const blob = new Blob([String.fromCharCode(0xFEFF) + `${head}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Tab-separated values → clipboard (pastes straight into Excel/Sheets). */
async function copyToClipboard({ columns, rows }) {
  const cols = exportableColumns(columns);
  const head = cols.map((c) => c.title || c.key).join('\t');
  const body = rows
    .map((row) => cols.map((c) => displayCell(rawValue(c, row), mapType(c))).join('\t'))
    .join('\n');
  await navigator.clipboard.writeText(`${head}\n${body}`);
}

export function useSmartTableExport() {
  async function run(format, payload) {
    if (!payload.rows?.length) throw new Error('لا توجد بيانات للتصدير');

    if (format === 'excel') {
      await exportToExcel(buildStructure(payload), exportFilename(payload.fileBase, 'xlsx'));
    } else if (format === 'pdf') {
      await exportToPdf(buildStructure(payload), exportFilename(payload.fileBase, 'pdf'));
    } else if (format === 'csv') {
      downloadCsv({
        columns: payload.columns,
        rows: payload.rows,
        filename: exportFilename(payload.fileBase, 'csv'),
      });
    } else if (format === 'clipboard') {
      await copyToClipboard({ columns: payload.columns, rows: payload.rows });
    }
  }

  return { run, exportFilename };
}

export default useSmartTableExport;
