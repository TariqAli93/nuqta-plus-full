/**
 * Print Window Manager (main process).
 *
 *   openPreviewWindow(jobId)               → visible window at /print/preview/:jobId
 *   createHiddenPrintWindow(jobId, preset, token)
 *                                          → offscreen window at /print/render/:jobId?rt=token
 *   inspectRenderDom(win)                  → snapshot of the page (for the mandatory gate + debug)
 *   measureContentHeightMM(win)            → real rendered receipt height (thermal)
 *   dumpDebug(win, label)                  → write print-debug.html + print-debug.png to userData
 *   destroyWindow(win)
 *
 * The hidden window MUST use the same preload as the app (so /print/render can
 * call window.electronAPI.print.getJob / notifyReady), MUST keep painting while
 * hidden (paintWhenInitiallyHidden + backgroundThrottling:false), and loads the
 * toolbar-free RENDER route. No HTML is built here; no document.write.
 */

import { fileURLToPath } from 'node:url';
import path, { dirname } from 'node:path';
import { app, BrowserWindow } from 'electron';
import fsSync from 'node:fs';
import logger from '../scripts/logger.js';
import { loadPrintRoute } from './resolvePrintUrl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.join(__dirname, '../preload/preload.cjs');

function previewRoute(jobId) {
  return `/print/preview/${encodeURIComponent(jobId)}`;
}
function renderRoute(jobId, token) {
  return `/print/render/${encodeURIComponent(jobId)}?rt=${encodeURIComponent(token)}`;
}

/** Open a VISIBLE preview window. */
export async function openPreviewWindow(jobId, parentWindow, preset) {
  const isSheet = preset?.kind === 'sheet';
  const win = new BrowserWindow({
    width: isSheet ? 900 : 460,
    height: 820,
    minWidth: 360,
    minHeight: 480,
    show: false,
    backgroundColor: '#3a3a3a',
    title: 'معاينة الطباعة',
    parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    modal: false,
    webPreferences: {
      devTools: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
    },
  });
  win.removeMenu();
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  logger.info(`[print] opening preview window for ${jobId}`);
  await loadPrintRoute(win, previewRoute(jobId));
  return win;
}

/**
 * Create a HEADLESS window that loads the toolbar-free render route.
 *  - same preload as the app (so getJob/notifyReady exist)
 *  - `show:false` + `paintWhenInitiallyHidden` is the documented headless-PDF
 *    setup: printToPDF renders the DOM via Chromium's print path, no on-screen
 *    compositing required. (Do NOT use an off-screen `opacity:0` window — Windows
 *    skips compositing it, which yields a blank PDF and a failed capturePage.)
 *  - If the headless PDF ever comes out blank, the caller retries via
 *    revealForPaint() below.
 */
export async function createHiddenPrintWindow(jobId, preset, token) {
  const win = new BrowserWindow({
    show: false,
    backgroundColor: '#ffffff',
    width: Math.max(360, Math.round((preset?.widthMM || 80) * 3.7795)),
    height: 1200,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      devTools: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      offscreen: false,
      preload: PRELOAD,
    },
  });
  win.removeMenu();

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logger.error(`[print] render window failed to load: ${code} ${desc} ${url}`);
  });

  logger.debug(`[print] creating headless render window for ${jobId} (token=${token})`);
  await loadPrintRoute(win, renderRoute(jobId, token));
  logger.debug('[print] render window load() resolved');
  return win;
}

/**
 * Fallback for environments where the headless print path yields a blank surface
 * (some Windows/GPU setups): briefly show the window WITHOUT stealing focus so the
 * compositor produces real frames, then let the caller re-run printToPDF. A real
 * visible paint always renders correctly.
 */
export async function revealForPaint(win) {
  try {
    if (!win || win.isDestroyed()) return;
    win.setOpacity(1);
    win.showInactive(); // visible (brief) but never steals focus
    // wait for at least one painted frame
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      win.webContents.once('paint', done); // offscreen-style hint (harmless if unused)
      setTimeout(done, 400); // and a hard cap
    });
  } catch (err) {
    logger.warn(`[print] revealForPaint failed: ${err.message}`);
  }
}

/**
 * Open the render route in a VISIBLE window (dev diagnostics). Lets you see the
 * exact `/print/render/:jobId` page — and its DevTools — without building or
 * generating a PDF. Same route the hidden print/PDF windows use.
 */
export async function openRenderDebugWindow(jobId, token, parentWindow) {
  const win = new BrowserWindow({
    show: true,
    width: 900,
    height: 1000,
    title: `Render Debug — ${jobId}`,
    parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    backgroundColor: '#ffffff',
    webPreferences: {
      devTools: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
    },
  });
  win.removeMenu();
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  logger.info(`[print] opening VISIBLE render-debug window for ${jobId} (token=${token})`);
  await loadPrintRoute(win, renderRoute(jobId, token));
  win.webContents.openDevTools({ mode: 'right' });
  return win;
}

/**
 * MANDATORY pre-print DOM snapshot. Returns enough to decide whether the page
 * actually rendered the receipt (and to log for diagnostics).
 */
export async function inspectRenderDom(win) {
  return win.webContents.executeJavaScript(`(() => {
    const paper = document.querySelector('[data-print-paper="true"]');
    return {
      url: location.href,
      title: document.title,
      bodyTextLength: (document.body && document.body.innerText ? document.body.innerText.trim().length : 0),
      paperExists: !!paper,
      paperTextLength: (paper && paper.innerText ? paper.innerText.trim().length : 0),
      paperHtmlLength: (paper && paper.innerHTML ? paper.innerHTML.trim().length : 0),
      bodyClass: (document.body ? document.body.className : ''),
      imageCount: document.images.length,
      htmlHead: document.documentElement.outerHTML.slice(0, 2000)
    };
  })()`);
}

/**
 * Measure the rendered receipt height in millimetres (thermal rolls → page is as
 * tall as the content, never a fixed 297mm). Returns null if unmeasurable.
 */
export async function measureContentHeightMM(win) {
  try {
    const px = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('[data-print-paper="true"]');
      if (!el) return 0;
      return Math.ceil(el.getBoundingClientRect().height);
    })()`);
    if (!px || px <= 0) return null;
    const mm = (px * 25.4) / 96; // CSS px → mm
    return Math.ceil(mm) + 2;
  } catch (err) {
    logger.warn(`[print] content height measurement failed: ${err.message}`);
    return null;
  }
}

/**
 * Write print-debug.html + print-debug.png to userData so a blank PDF can be
 * diagnosed (was the page itself empty, or only the PDF?). Best-effort.
 * @returns {{html?: string, png?: string}} written file paths
 */
export async function dumpDebug(win, label = 'print') {
  const out = {};
  try {
    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
    const htmlPath = path.join(app.getPath('userData'), `${label}-debug.html`);
    fsSync.writeFileSync(htmlPath, html, 'utf8');
    out.html = htmlPath;
  } catch (err) {
    logger.warn(`[print] dumpDebug html failed: ${err.message}`);
  }
  try {
    const image = await win.webContents.capturePage();
    const pngPath = path.join(app.getPath('userData'), `${label}-debug.png`);
    fsSync.writeFileSync(pngPath, image.toPNG());
    out.png = pngPath;
  } catch (err) {
    logger.warn(`[print] dumpDebug png failed: ${err.message}`);
  }
  if (out.html || out.png) {
    logger.error(`[print] debug artifacts written: ${out.html || '-'} | ${out.png || '-'}`);
  }
  return out;
}

export function destroyWindow(win) {
  try {
    if (win && !win.isDestroyed()) win.destroy();
  } catch (err) {
    logger.warn(`[print] destroyWindow: ${err.message}`);
  }
}
