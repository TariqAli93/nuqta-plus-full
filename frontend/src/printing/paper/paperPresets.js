/**
 * Paper presets — renderer copy (used for layout: which CSS width class + whether
 * it is a content-height roll or a fixed sheet).
 *
 * IMPORTANT: keep in sync with the main-process copy at
 * `electron/print/paperPresets.js`, which adds the print/PDF page geometry.
 *
 * Thermal rolls: fixed WIDTH only; the height grows with the content. Sheets
 * (A4/A5): fixed width + height.
 */

export const PAPER_PRESETS = Object.freeze({
  'roll-58': { kind: 'thermal', label: 'رول حراري 58mm', widthMM: 58 },
  'roll-80': { kind: 'thermal', label: 'رول حراري 80mm', widthMM: 80 },
  'roll-88': { kind: 'thermal', label: 'رول حراري 88mm', widthMM: 88 },
  a4: { kind: 'sheet', label: 'فاتورة A4', widthMM: 210, heightMM: 297 },
  a5: { kind: 'sheet', label: 'فاتورة A5', widthMM: 148, heightMM: 210 },
});

export const PAPER_OPTIONS = Object.entries(PAPER_PRESETS).map(([value, p]) => ({
  value,
  label: p.label,
  kind: p.kind,
}));

export const DEFAULT_PAPER = 'roll-80';

export function getPaperPreset(paper) {
  return PAPER_PRESETS[paper] || PAPER_PRESETS[DEFAULT_PAPER];
}

export function isThermalPaper(paper) {
  return getPaperPreset(paper).kind === 'thermal';
}
