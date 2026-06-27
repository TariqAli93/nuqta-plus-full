/**
 * Receipt themes — modern, Desktop-native looks (NOT old web-invoice templates).
 *
 * A theme is a flat map of CSS custom properties consumed by receipt.print.css.
 * It NEVER changes data or markup — only presentation. Adding a theme = add an
 * entry here (+ optional THEME_OPTIONS label). Nothing else changes.
 *
 *   classic-pro     clean accountant look, hairline borders
 *   fluent          Microsoft-Fluent inspired, soft cards, restrained accent (A4/A5)
 *   compact-pro     dense, high-legibility thermal (58/80/88)
 *   ledger          bookkeeping style, crisp ruled table, strong totals (A4)
 *   minimal-modern  pure black/white, hairline rules, fastest on thermal
 */

const BASE = {
  '--r-font': "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
  '--r-fg': '#111827',
  '--r-muted': '#6b7280',
  '--r-line': '#d1d5db',
  '--r-line-soft': '#e5e7eb',
  '--r-accent': '#111827',
  '--r-accent-fg': '#ffffff',
  '--r-zebra': 'transparent',
  '--r-paid': '#047857',
  '--r-due': '#b91c1c',
  '--r-box-bg': '#f9fafb',
  '--r-box-border': '#e5e7eb',

  '--r-size': '12px',
  '--r-small': '11px',
  '--r-company-size': '18px',
  '--r-title-size': '13px',
  '--r-grand-size': '18px',
  '--r-gap': '8px',

  '--r-header-border': '1px solid var(--r-line-soft)',
  '--r-th-bg': '#f3f4f6',
  '--r-th-fg': 'var(--r-fg)',
  '--r-cell-border': '1px solid var(--r-line-soft)',
  '--r-divider': '1px solid var(--r-line-soft)',
  '--r-radius': '8px',
};

export const THEMES = Object.freeze({
  'classic-pro': {
    ...BASE,
    '--r-accent': '#1f2937',
    '--r-th-bg': '#f3f4f6',
    '--r-divider': '1px solid var(--r-line)',
  },
  fluent: {
    ...BASE,
    '--r-accent': '#2563eb',
    '--r-accent-fg': '#ffffff',
    '--r-fg': '#1f2937',
    '--r-muted': '#64748b',
    '--r-line-soft': '#e2e8f0',
    '--r-box-bg': '#f8fafc',
    '--r-box-border': '#e2e8f0',
    '--r-th-bg': '#eef2ff',
    '--r-th-fg': '#1e3a8a',
    '--r-zebra': '#f8fafc',
    '--r-company-size': '20px',
    '--r-grand-size': '19px',
    '--r-gap': '10px',
    '--r-radius': '10px',
    '--r-cell-border': '1px solid #eef2f7',
    '--r-header-border': '2px solid #eef2ff',
  },
  'compact-pro': {
    ...BASE,
    '--r-size': '11px',
    '--r-small': '10px',
    '--r-company-size': '14px',
    '--r-title-size': '11px',
    '--r-grand-size': '15px',
    '--r-gap': '5px',
    '--r-th-bg': 'transparent',
    '--r-cell-border': '0',
    '--r-divider': '1px dashed var(--r-line)',
    '--r-box-bg': 'transparent',
    '--r-box-border': 'transparent',
    '--r-radius': '0',
  },
  ledger: {
    ...BASE,
    '--r-accent': '#0f172a',
    '--r-fg': '#0f172a',
    '--r-line': '#94a3b8',
    '--r-line-soft': '#cbd5e1',
    '--r-th-bg': '#0f172a',
    '--r-th-fg': '#ffffff',
    '--r-cell-border': '1px solid #94a3b8',
    '--r-divider': '1px solid #94a3b8',
    '--r-box-bg': '#ffffff',
    '--r-box-border': '#0f172a',
    '--r-company-size': '19px',
    '--r-grand-size': '20px',
    '--r-radius': '4px',
  },
  'minimal-modern': {
    ...BASE,
    '--r-fg': '#000000',
    '--r-muted': '#555555',
    '--r-line': '#000000',
    '--r-line-soft': '#cccccc',
    '--r-accent': '#000000',
    '--r-th-bg': 'transparent',
    '--r-cell-border': '0',
    '--r-divider': '1px solid var(--r-line-soft)',
    '--r-box-bg': 'transparent',
    '--r-box-border': 'transparent',
    '--r-size': '11px',
    '--r-company-size': '14px',
    '--r-grand-size': '15px',
    '--r-gap': '5px',
    '--r-radius': '0',
  },
});

export const THEME_OPTIONS = [
  { value: 'classic-pro', label: 'كلاسيكي احترافي' },
  { value: 'fluent', label: 'Fluent حديث (A4/A5)' },
  { value: 'compact-pro', label: 'مدمج احترافي (حراري)' },
  { value: 'ledger', label: 'محاسبي (A4)' },
  { value: 'minimal-modern', label: 'بسيط حديث' },
];

export const THEME_VALUES = THEME_OPTIONS.map((t) => t.value);
export const DEFAULT_THEME = 'classic-pro';

/** Resolve a theme name to its CSS-variable map (falls back to the default). */
export function getThemeVars(theme) {
  return THEMES[theme] || THEMES[DEFAULT_THEME];
}

/** Normalize an unknown/legacy theme value to a valid one. */
export function coerceTheme(theme) {
  return THEME_VALUES.includes(theme) ? theme : DEFAULT_THEME;
}
