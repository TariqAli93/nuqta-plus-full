/**
 * Print IPC (main process) — the single, organised surface for the new printing
 * pipeline. Channels:
 *
 *   print:preview-invoice   → create job + open a visible preview window
 *   print:invoice           → print (job or inline payload) on a hidden window
 *   print:invoice-pdf       → render to PDF (job or inline payload) + save dialog
 *   print:get-printers      → system printers (+ default flag)
 *   print:get-job           → fetch a stored job by id (used by the preview page)
 *   print:ready             → renderer→main "page painted" signal
 *   print:save-logo         → pick + copy company logo into userData
 *   print:delete-logo       → remove the stored company logo
 *   print:get-logo-preview  → resolve a stored logo path to a data URL (settings UI)
 *
 * Design notes:
 *   - Electron main NEVER builds invoice HTML. It only orchestrates windows that
 *     render the shared Vue ReceiptPrint component.
 *   - The company logo is resolved to a data URL HERE and injected into the job,
 *     so the renderer never needs filesystem access and the image is guaranteed
 *     loaded before printing.
 *   - Thermal rolls get a CONTENT-DRIVEN page height (measured from the rendered
 *     receipt), never a fixed 297mm.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import logger from '../scripts/logger.js';
import * as jobStore from './printJobStore.js';
import * as logoStore from './logoStore.js';
import * as windows from './printWindowManager.js';
import * as readyStore from './printReadyStore.js';
import { getPaperPreset, MM_TO_MICRONS, MM_TO_INCH } from './paperPresets.js';

// Minimum believable invoice-PDF size. Anything smaller is a blank/failed render.
const MIN_PDF_BYTES = 1500;
// A painted receipt always has more text than this.
const MIN_PAPER_TEXT = 20;

/**
 * @param {() => (BrowserWindow|null)} getMainWindow
 */
export function registerPrintIpc(getMainWindow) {
  const mainWin = () => (typeof getMainWindow === 'function' ? getMainWindow() : null);

  // Resolve the company logo (stored relative path or external URL) to something
  // the template can render, and stamp printedAt. Mutates a shallow copy.
  async function enrichData(data) {
    const out = { ...(data || {}) };
    out.company = { ...(out.company || {}) };
    out.meta = { ...(out.meta || {}) };

    const company = out.company;
    if (company.logoPath) {
      const dataUrl = await logoStore.resolveDataUrl(company.logoPath);
      if (dataUrl) {
        company.logoDataUrl = dataUrl;
      } else {
        // Degrade gracefully — print without a logo, just log it (req #18).
        logger.warn('[print] فشل تحميل شعار الشركة — سيتم الطباعة بدون شعار');
        company.logoDataUrl = null;
      }
    } else if (company.logoUrl) {
      // External URL: let the renderer load it directly.
      company.logoDataUrl = company.logoUrl;
    } else {
      company.logoDataUrl = null;
    }

    if (!out.meta.printedAt) out.meta.printedAt = new Date().toISOString();
    return out;
  }

  // Build a job from an inline payload ({ data, settings }) OR fetch an existing
  // one by jobId (optionally overriding its settings from the preview toolbar).
  async function resolveJob(payload) {
    if (payload?.jobId) {
      let job = jobStore.get(payload.jobId);
      if (!job) throw new Error('تعذر العثور على بيانات الفاتورة');
      if (payload.settings) job = jobStore.updateSettings(payload.jobId, payload.settings);
      return job;
    }
    if (!payload?.data) throw new Error('تعذر العثور على بيانات الفاتورة');
    const enriched = await enrichData(payload.data);
    return jobStore.create({
      type: payload.type || 'sale-invoice',
      template: payload.template || 'receipt',
      data: enriched,
      settings: payload.settings || {},
    });
  }

  async function listPrinters() {
    let win = mainWin();
    if (!win || win.isDestroyed()) {
      const all = BrowserWindow.getAllWindows();
      win = all.find((w) => !w.isDestroyed());
    }
    if (!win || !win.webContents) return [];
    try {
      const printers = await win.webContents.getPrintersAsync();
      return (printers || []).map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || '',
        status: p.status || 0,
        isDefault: !!p.isDefault,
      }));
    } catch (err) {
      logger.error('[print] getPrintersAsync failed:', err);
      return [];
    }
  }

  // ── lookups ───────────────────────────────────────────────────────────────
  ipcMain.handle('print:get-printers', async () => listPrinters());

  ipcMain.handle('print:get-job', async (_e, jobId) => {
    const job = jobStore.get(jobId);
    if (!job) return { success: false, error: 'تعذر العثور على بيانات الفاتورة' };
    return { success: true, job };
  });

  // The render window signals "real content is painted" with its per-render token.
  ipcMain.handle('print:ready', async (_e, token) => {
    readyStore.markReady(token);
    return { success: true };
  });

  // Create the hidden RENDER window, wait for its ready signal, then take a
  // MANDATORY DOM snapshot. If the receipt isn't actually on the page, write
  // debug artifacts and throw — so we never print/PDF a blank page. Returns the
  // window (caller owns teardown) plus the DOM snapshot.
  async function prepareRenderWindow(job, preset) {
    const token = readyStore.nextToken();
    readyStore.reset(token);
    const win = await windows.createHiddenPrintWindow(job.id, preset, token);
    try {
      // Primary gate: the page's own readiness signal. On timeout we DON'T bail
      // immediately — we still snapshot + dump debug so the cause is visible.
      try {
        await readyStore.waitForReady(token, 15000);
        logger.debug(`[print] render ready signal received (token=${token})`);
      } catch (err) {
        logger.warn(`[print] ${err.message} — inspecting DOM anyway for diagnostics`);
      }

      const dom = await windows.inspectRenderDom(win);
      logger.debug('[print] DOM state before print/PDF', {
        url: dom.url,
        title: dom.title,
        paperExists: dom.paperExists,
        paperTextLength: dom.paperTextLength,
        bodyTextLength: dom.bodyTextLength,
        imageCount: dom.imageCount,
      });

      if (!dom.paperExists || dom.paperTextLength < MIN_PAPER_TEXT) {
        const debug = await windows.dumpDebug(win, 'print');
        throw new Error(
          `Print page is empty before output (paperExists=${dom.paperExists}, ` +
            `paperTextLength=${dom.paperTextLength}, bodyTextLength=${dom.bodyTextLength}). ` +
            `Debug: ${debug.html || '-'} | ${debug.png || '-'}`
        );
      }
      return { win, dom };
    } catch (err) {
      windows.destroyWindow(win); // never leak a hidden window on failure
      throw err;
    }
  }

  // ── preview ────────────────────────────────────────────────────────────────
  ipcMain.handle('print:preview-invoice', async (_e, payload = {}) => {
    try {
      const enriched = await enrichData(payload.data);
      const job = jobStore.create({
        type: payload.type || 'sale-invoice',
        template: payload.template || 'receipt',
        data: enriched,
        settings: payload.settings || {},
      });
      const preset = getPaperPreset(job.settings.paper);
      await windows.openPreviewWindow(job.id, mainWin(), preset);
      return { success: true, jobId: job.id };
    } catch (error) {
      logger.error('[print] preview-invoice failed:', error);
      return { success: false, error: error.message || 'فشل تحميل نافذة الطباعة' };
    }
  });

  // ── print ────────────────────────────────────────────────────────────────--
  ipcMain.handle('print:invoice', async (_e, payload = {}) => {
    let win;
    try {
      const job = await resolveJob(payload);
      const preset = getPaperPreset(job.settings.paper);

      // Validate the requested printer; fall back to the system default if gone.
      let deviceName = job.settings.printerName || undefined;
      if (deviceName) {
        const printers = await listPrinters();
        const found = printers.find((p) => p.name === deviceName);
        if (!found) {
          logger.warn(`[print] printer "${deviceName}" not found — using default`);
          deviceName = undefined; // Electron then uses the OS default
        }
      }

      ({ win } = await prepareRenderWindow(job, preset));

      // Build page geometry. Thermal: fixed width + measured height.
      const pageSize = await buildPrintPageSize(win, preset);

      const printOptions = {
        // silent:true only when explicitly requested; otherwise the OS print dialog shows.
        silent: job.settings.silent === true,
        printBackground: true,
        deviceName,
        copies: job.settings.copies || 1,
        margins: preset.margins,
        pageSize,
      };

      logger.info(
        `[print] printing job ${job.id} → printer=${deviceName || 'default'} copies=${printOptions.copies} silent=${printOptions.silent}`
      );

      const result = await new Promise((resolve) => {
        win.webContents.print(printOptions, (success, errorType) => {
          if (success) {
            logger.info(`[print] job ${job.id} sent to spooler`);
            resolve({ success: true, message: 'تم إرسال الفاتورة للطباعة' });
          } else {
            const canceled = String(errorType || '')
              .toLowerCase()
              .includes('cancel');
            logger.warn(`[print] job ${job.id} not printed: ${errorType}`);
            resolve({
              success: false,
              canceled,
              error: canceled
                ? 'تم إلغاء الطباعة'
                : `فشل تنفيذ أمر الطباعة: ${errorType || 'خطأ غير معروف'}`,
            });
          }
        });
      });

      // Give the spooler a beat before tearing the window down.
      setTimeout(() => windows.destroyWindow(win), 400);
      return result;
    } catch (error) {
      logger.error('[print] invoice failed:', error);
      windows.destroyWindow(win);
      return { success: false, error: error.message || 'فشل تنفيذ أمر الطباعة' };
    }
  });

  // ── PDF ──────────────────────────────────────────────────────────────────--
  ipcMain.handle('print:invoice-pdf', async (_e, payload = {}) => {
    let win;
    try {
      const job = await resolveJob(payload);
      const preset = getPaperPreset(job.settings.paper);

      const invoiceNo = job.data?.invoice?.number || job.data?.invoice?.id || 'invoice';
      const defaultName = `invoice-${String(invoiceNo).replace(/[^\w-]+/g, '_')}.pdf`;

      // Ask where to save BEFORE rendering (lets the user cancel cheaply).
      const save = await dialog.showSaveDialog(mainWin() || undefined, {
        title: 'حفظ الفاتورة كملف PDF',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (save.canceled || !save.filePath) {
        return { success: false, canceled: true };
      }

      logger.debug(`[print][pdf] preparing render window for job ${job.id}`);
      ({ win } = await prepareRenderWindow(job, preset)); // gated: DOM verified non-empty

      const pdfOptions = await buildPdfOptions(win, preset);
      logger.debug(`[print][pdf] generating PDF for job ${job.id} → ${save.filePath}`, pdfOptions);
      let buffer = await win.webContents.printToPDF(pdfOptions);
      logger.debug(`[print][pdf] first attempt: ${buffer?.length || 0} bytes`);

      // Some Windows/GPU setups blank the headless print surface. If the PDF came
      // out empty even though the DOM was verified non-empty, briefly reveal the
      // window so the compositor produces real frames, then retry once.
      if (!buffer || buffer.length < MIN_PDF_BYTES) {
        logger.warn('[print][pdf] blank PDF on headless path — revealing window and retrying');
        await windows.revealForPaint(win);
        buffer = await win.webContents.printToPDF(pdfOptions);
        logger.debug(`[print][pdf] retry attempt: ${buffer?.length || 0} bytes`);
      }

      // Still too small → dump debug + treat as failure.
      if (!buffer || buffer.length < MIN_PDF_BYTES) {
        const debug = await windows.dumpDebug(win, 'print');
        throw new Error(
          `Generated PDF is empty or too small: ${buffer?.length || 0} bytes. ` +
            `Debug: ${debug.html || '-'} | ${debug.png || '-'}`
        );
      }

      await fs.writeFile(save.filePath, buffer);
      windows.destroyWindow(win);
      logger.info(`[print][pdf] pdf generated (${buffer.length} bytes) → ${save.filePath}`);
      return { success: true, path: save.filePath };
    } catch (error) {
      logger.error('[print] invoice-pdf failed:', error);
      windows.destroyWindow(win);
      return { success: false, error: error.message || 'فشل إنشاء ملف PDF' };
    }
  });

  // ── logo management ────────────────────────────────────────────────────────
  ipcMain.handle('print:save-logo', async () => logoStore.pickAndStore(mainWin()));
  ipcMain.handle('print:delete-logo', async (_e, relativePath) =>
    logoStore.deleteLogo(relativePath)
  );
  ipcMain.handle('print:get-logo-preview', async (_e, relativePath) => {
    const dataUrl = await logoStore.resolveDataUrl(relativePath);
    return { success: !!dataUrl, dataUrl };
  });

  logger.info('[print] IPC handlers registered');
}

/** webContents.print pageSize (microns). Thermal → measured height. */
async function buildPrintPageSize(win, preset) {
  if (preset.kind === 'sheet') {
    return preset.pageSize; // named 'A4' / 'A5'
  }
  // thermal — fixed width, content-driven height
  let heightMM = await windows.measureContentHeightMM(win);
  if (!heightMM || heightMM < 40) heightMM = 200; // sane floor if measuring fails
  return {
    width: Math.round(preset.widthMM * MM_TO_MICRONS),
    height: Math.round(heightMM * MM_TO_MICRONS),
  };
}

/** printToPDF options. Thermal → custom inch page sized to content. */
async function buildPdfOptions(win, preset) {
  const base = {
    printBackground: true,
    margins: { marginType: 'none' }, // CSS padding handles inner margins
  };
  if (preset.kind === 'sheet') {
    return { ...base, pageSize: preset.pageSize, preferCSSPageSize: false };
  }
  let heightMM = await windows.measureContentHeightMM(win);
  if (!heightMM || heightMM < 40) heightMM = 200;
  return {
    ...base,
    pageSize: {
      width: preset.widthMM * MM_TO_INCH,
      height: heightMM * MM_TO_INCH,
    },
    preferCSSPageSize: false,
  };
}
