import { fileURLToPath } from 'node:url';
import path, { dirname, join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import logger from '../scripts/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const PRELOAD = join(__dirname, '../preload/preload.mjs');

// Report type → window title (Arabic). Whitelist: anything else is rejected so a
// compromised renderer can't ask main to open an arbitrary route.
const TITLES = Object.freeze({
  sales: 'تقرير المبيعات — شكد بعت؟',
  profit: 'تقرير الأرباح — شكد ربحت؟',
  'top-products': 'أكثر المنتجات مبيعاً',
  debts: 'تقرير الديون — شنو عليه دين؟',
  'cash-box': 'تقرير الصندوق — شكد بالصندوق؟',
  expenses: 'تقرير المصروفات — شكد صرفت؟',
  'cash-movement': 'حركة الصندوق',
});

// One window per report type (dedupe + focus). Keyed by type.
const windows = new Map();

function buildQuery(params) {
  if (!params || typeof params !== 'object') return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Load `/reports/<type>?<query>` into a window (dev server URL / packaged file+hash). */
async function loadReportRoute(win, type, params) {
  const route = `/reports/${type}${buildQuery(params)}`;
  if (isDev) {
    await win.loadURL(`http://localhost:5173${route}`);
    return;
  }
  // Packaged: hash router → loadFile(index.html, { hash: '/reports/...' }).
  const candidates = [
    path.join(process.resourcesPath, 'dist-electron', 'dist', 'index.html'),
    path.join(__dirname, '../../dist/index.html'),
    path.join(app.getAppPath(), 'dist-electron', 'dist', 'index.html'),
  ];
  let lastErr;
  for (const indexPath of candidates) {
    try {
      await win.loadFile(indexPath, { hash: route });
      return;
    } catch (err) {
      lastErr = err;
      logger.warn(`reports:open — failed to load ${indexPath}: ${err.message}`);
    }
  }
  throw new Error(`Failed to locate index.html for report window: ${lastErr?.message || 'unknown'}`);
}

function openReportWindow(parentWindow, { type, params }) {
  if (!TITLES[type]) throw new Error(`Unknown report type: ${type}`);

  // Already open → focus it (and push the latest filters) instead of duplicating.
  const existing = windows.get(type);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show(); // no-op if already visible; guarantees a still-loading one surfaces
    existing.focus();
    try { existing.webContents.send('reports:params', params || {}); } catch { /* ignore */ }
    return { ok: true, focused: true };
  }

  // Open the frame IMMEDIATELY (show: true) so the user gets instant feedback;
  // the report page paints its own skeleton/loading and fetches data after the
  // window is up. We do NOT await page load before returning — blocking the IPC
  // on `did-finish-load` is what made cards feel frozen for several seconds.
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    show: true,
    backgroundColor: '#ffffff', // avoids a transparent flash while the SPA boots
    title: TITLES[type],
    parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    modal: false,
    webPreferences: {
      devTools: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: PRELOAD,
    },
  });
  win.removeMenu();
  // Register synchronously, BEFORE the async load, so a rapid second click finds
  // this window and focuses it instead of spawning a duplicate.
  windows.set(type, win);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.once('ready-to-show', () => { win.focus(); });
  win.on('closed', () => { windows.delete(type); });

  // Fire-and-forget the navigation; on failure tear the (already-shown) window
  // down so a blank frame doesn't linger and a retry can re-create it.
  loadReportRoute(win, type, params).catch((err) => {
    logger.error(`reports:open — ${err.message}`);
    if (!win.isDestroyed()) win.destroy();
    windows.delete(type);
  });

  return { ok: true, opened: true };
}

/**
 * Register the `reports:open` IPC channel. `getMainWindow` returns the current
 * main window (used as the parent so report windows stack above it).
 */
export function registerReportWindows(getMainWindow) {
  ipcMain.handle('reports:open', async (_event, payload = {}) => {
    const parent = typeof getMainWindow === 'function' ? getMainWindow() : null;
    return openReportWindow(parent, payload);
  });
}
