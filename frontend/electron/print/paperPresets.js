/**
 * Paper presets — canonical (main-process) copy.
 *
 * IMPORTANT: keep this in sync with the renderer copy at
 * `src/printing/paper/paperPresets.js`. Both describe the SAME physical papers;
 * the renderer uses width/kind for layout, main uses width/height/margins for the
 * actual `webContents.print` / `printToPDF` page geometry.
 *
 * Thermal rolls have a FIXED WIDTH and a CONTENT-DRIVEN HEIGHT — we never force a
 * 297mm page on a roll. The real print height is measured from the rendered
 * receipt at print time (see printWindowManager.measureContentHeightMM). Sheets
 * (A4/A5) have fixed width + height.
 */

export const PAPER_PRESETS = Object.freeze({
  'roll-58': {
    kind: 'thermal',
    label: 'رول حراري 58mm',
    widthMM: 58,
    heightMM: null, // content-driven
    margins: { marginType: 'none' },
  },
  'roll-80': {
    kind: 'thermal',
    label: 'رول حراري 80mm',
    widthMM: 80,
    heightMM: null,
    margins: { marginType: 'none' },
  },
  'roll-88': {
    kind: 'thermal',
    label: 'رول حراري 88mm',
    widthMM: 88,
    heightMM: null,
    margins: { marginType: 'none' },
  },
  a4: {
    kind: 'sheet',
    label: 'فاتورة A4',
    pageSize: 'A4',
    widthMM: 210,
    heightMM: 297,
    margins: { marginType: 'default' },
  },
  a5: {
    kind: 'sheet',
    label: 'فاتورة A5',
    pageSize: 'A5',
    widthMM: 148,
    heightMM: 210,
    margins: { marginType: 'default' },
  },
});

export const DEFAULT_PAPER = 'roll-80';

/** Resolve a paper key (falling back to the default) to its preset. */
export function getPaperPreset(paper) {
  return PAPER_PRESETS[paper] || PAPER_PRESETS[DEFAULT_PAPER];
}

export function isThermal(paper) {
  return getPaperPreset(paper).kind === 'thermal';
}

// 1 mm = 1000 microns. `webContents.print` pageSize wants microns.
export const MM_TO_MICRONS = 1000;
// `printToPDF` custom pageSize is expressed in inches.
export const MM_TO_INCH = 1 / 25.4;
