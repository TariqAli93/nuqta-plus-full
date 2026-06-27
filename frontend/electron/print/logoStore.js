/**
 * Company logo store (main process).
 *
 * The image itself is NEVER stored in the database (no base64, no binary). We
 * copy the chosen file into the app's userData directory and persist only its
 * RELATIVE path (e.g. `images/company/company-logo.png`) in settings. At print
 * time we resolve that path back to a data URL so the receipt template can show
 * the logo regardless of the renderer origin (dev-server http:// or packaged
 * file://) — and so the image is guaranteed loaded before printing.
 */

import { app, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../scripts/logger.js';

const SUBDIR = path.join('images', 'company');
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — beyond this we warn (but still allow)

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Absolute path to <userData>/images/company. */
function logoDir() {
  return path.join(app.getPath('userData'), SUBDIR);
}

/** Resolve a stored relative path to its absolute on-disk location. */
export function resolveAbsolute(relativePath) {
  if (!relativePath) return null;
  // Defensive: never let a stored value escape userData.
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return path.join(app.getPath('userData'), normalized);
}

/**
 * Open a native picker, validate, and copy the image into userData.
 * @param {BrowserWindow|null} parentWindow
 * @returns {Promise<{success:boolean, canceled?:boolean, fileName?:string, path?:string, dataUrl?:string, warning?:string, error?:string}>}
 */
export async function pickAndStore(parentWindow) {
  try {
    const result = await dialog.showOpenDialog(parentWindow || undefined, {
      title: 'اختيار شعار الشركة',
      properties: ['openFile'],
      filters: [{ name: 'الصور', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });

    if (result.canceled || !result.filePaths?.length) {
      return { success: false, canceled: true };
    }

    const sourcePath = result.filePaths[0];
    const ext = path.extname(sourcePath).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      logger.warn(`[logo] rejected non-image extension: ${ext}`);
      return { success: false, error: 'نوع الملف غير مدعوم. الأنواع المسموحة: PNG, JPG, JPEG, WEBP' };
    }

    const stat = await fs.stat(sourcePath);
    let warning;
    if (stat.size > MAX_BYTES) {
      warning = 'حجم الصورة كبير (أكثر من 5 ميجابايت) وقد يبطئ الطباعة. يُنصح بصورة أصغر.';
      logger.warn(`[logo] large logo selected: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
    }

    const dir = logoDir();
    await fs.mkdir(dir, { recursive: true });

    // Stable canonical name so the receipt always points at one file; the ext
    // follows the chosen image. Old logos with a different ext are cleaned up.
    const fileName = `company-logo${ext}`;
    const destAbsolute = path.join(dir, fileName);

    // Remove any previous logo (different extension) so we don't orphan files.
    await cleanupOtherLogos(fileName).catch(() => {});

    await fs.copyFile(sourcePath, destAbsolute);

    const relativePath = path.join(SUBDIR, fileName).replace(/\\/g, '/');
    const dataUrl = await toDataUrl(destAbsolute, ext);

    logger.info(`[logo] stored ${relativePath}`);
    return { success: true, fileName, path: relativePath, dataUrl, warning };
  } catch (error) {
    logger.error('[logo] pickAndStore failed:', error);
    return { success: false, error: error.message || 'فشل حفظ الشعار' };
  }
}

/** Delete the stored logo file (best-effort). */
export async function deleteLogo(relativePath) {
  try {
    const abs = resolveAbsolute(relativePath);
    if (abs) await fs.unlink(abs).catch(() => {});
    // Also sweep any sibling logos so the folder is clean.
    await cleanupOtherLogos(null).catch(() => {});
    logger.info('[logo] deleted company logo');
    return { success: true };
  } catch (error) {
    logger.warn('[logo] delete failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Resolve a stored logo to a data URL for rendering. Returns null (and logs a
 * warning) if the file is missing — callers must degrade gracefully (print
 * without a logo) rather than fail the invoice.
 */
export async function resolveDataUrl(relativePath) {
  try {
    if (!relativePath) return null;
    const abs = resolveAbsolute(relativePath);
    const ext = path.extname(abs).toLowerCase();
    if (!MIME[ext]) return null;
    await fs.access(abs);
    return await toDataUrl(abs, ext);
  } catch (error) {
    logger.warn(`[logo] could not resolve logo "${relativePath}": ${error.message}`);
    return null;
  }
}

async function toDataUrl(absPath, ext) {
  const buf = await fs.readFile(absPath);
  const mime = MIME[ext] || 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Remove every file in the logo dir except `keepFileName`. */
async function cleanupOtherLogos(keepFileName) {
  const dir = logoDir();
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((name) => name !== keepFileName)
      .map((name) => fs.unlink(path.join(dir, name)).catch(() => {}))
  );
}
