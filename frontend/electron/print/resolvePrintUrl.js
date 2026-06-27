/**
 * resolvePrintUrl — the SINGLE place that builds the URL/file for any internal
 * print window route. No window may hand-write a dev URL.
 *
 * The app's router (src/router/index.js) is:
 *   - DEV  → createWebHistory()      → routes are PATHS  (/print/render/:id)
 *   - PROD → createWebHashHistory()  → routes live in the HASH (#/print/render/:id)
 *
 * So:
 *   - DEV  → loadURL(`${devServer}/print/render/:id?rt=token`)   (served over http,
 *            base '/' in dev so nested-route assets resolve — see vite.config.js)
 *   - PROD → loadFile(index.html, { hash: '/print/render/:id?rt=token' })
 *
 * If those ever diverge, change them HERE only.
 */

import { fileURLToPath } from 'node:url';
import path, { dirname } from 'node:path';
import { app } from 'electron';
import logger from '../scripts/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

/** The Vite dev server origin (pinned to 5173 in vite.config.js; env overrides). */
function devServerUrl() {
  return (
    process.env.VITE_DEV_SERVER_URL ||
    process.env.ELECTRON_RENDERER_URL ||
    process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL ||
    'http://localhost:5173'
  );
}

function indexCandidates() {
  return [
    path.join(process.resourcesPath, 'dist-electron', 'dist', 'index.html'),
    path.join(__dirname, '../../dist/index.html'),
    path.join(app.getAppPath(), 'dist-electron', 'dist', 'index.html'),
  ];
}

/**
 * @param {string} routePath e.g. `/print/render/123?rt=tok`
 * @returns {{type:'url', value:string} | {type:'file', candidates:string[], options:{hash:string}}}
 */
export function resolvePrintUrl(routePath) {
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;

  if (isDev) {
    const base = (devServerUrl() || '').replace(/\/$/, '');
    if (!base) {
      // Don't silently fall back to a production loadFile in dev — surface it.
      throw new Error(
        'تعذر تشغيل نافذة الطباعة في وضع التطوير لأن رابط Vite dev server غير معروف'
      );
    }
    const value = `${base}${route}`; // web-history dev → PATH url (no hash)
    logger.debug('[PrintURL] resolved print route', {
      isDev: true,
      devServerUrl: base,
      routePath: route,
      resolvedUrl: value,
      routerMode: 'web-history',
    });
    return { type: 'url', value };
  }

  logger.debug('[PrintURL] resolved print route', {
    isDev: false,
    routePath: route,
    routerMode: 'hash',
  });
  return { type: 'file', candidates: indexCandidates(), options: { hash: route } };
}

/**
 * Apply resolvePrintUrl to a window. Returns the URL/href actually loaded.
 */
export async function loadPrintRoute(win, routePath) {
  const resolved = resolvePrintUrl(routePath);

  if (resolved.type === 'url') {
    logger.debug(`[PrintURL] loadURL ${resolved.value}`);
    await win.loadURL(resolved.value);
    return resolved.value;
  }

  let lastErr;
  for (const indexPath of resolved.candidates) {
    try {
      logger.debug(`[PrintURL] loadFile ${indexPath} hash=${resolved.options.hash}`);
      await win.loadFile(indexPath, resolved.options);
      return `file://${indexPath}#${resolved.options.hash}`;
    } catch (err) {
      lastErr = err;
      logger.warn(`[PrintURL] failed to load ${indexPath}: ${err.message}`);
    }
  }
  throw new Error(`فشل تحميل نافذة الطباعة: ${lastErr?.message || 'unknown'}`);
}
