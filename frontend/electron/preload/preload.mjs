import { contextBridge, ipcRenderer } from 'electron';

const UPDATE_CHANNELS = [
  'update-checking',
  'update-not-available',
  'update-available',
  'update-downloading',
  'update-progress',
  'update-ready',
  'update-error',
  // Differential-vs-full download signal (reqs #10/#11): emitted when
  // electron-updater decides to attempt a delta or falls back to a full
  // download, carrying { mode: 'differential'|'full', reason }.
  'update-download-mode',
];

contextBridge.exposeInMainWorld('electronAPI', {
  // ---- App Info ----
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // ---- File dialogs ----
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),

  // ---- File IO ----
  saveFile: (path, data) => ipcRenderer.invoke('file:saveFile', path, data),
  readFile: (path) => ipcRenderer.invoke('file:readFile', path),

  // ---- Backend control ----
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  stopBackend: () => ipcRenderer.invoke('backend:stop'),
  startBackend: () => ipcRenderer.invoke('backend:start'),

  // ---- Window helpers ----
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setSize: (width, height) => ipcRenderer.invoke('window:auto-resize', { width, height }),

  // ---- Custom title-bar window controls (frameless main window) ----
  // The desktop shell draws its own min/max/close buttons; these forward to the
  // main process. `close` triggers the existing close-confirmation dialog.
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback) => {
      const handler = (_event, value) => callback(!!value);
      ipcRenderer.on('window:maximizeChanged', handler);
      return () => ipcRenderer.removeListener('window:maximizeChanged', handler);
    },
  },

  // ---- Register update listeners safely ----
  on(channel, callback) {
    if (!UPDATE_CHANNELS.includes(channel)) return null;

    const handler = (event, args) => {
      callback({
        channel,
        payload: args?.payload ?? args ?? null,
        manual: args?.manual ?? false,
        timestamp: Date.now(),
      });
    };

    ipcRenderer.on(channel, handler);

    // Return cleanup function
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ---- Remove all listeners (used when component unmounts) ----
  removeUpdateListeners() {
    UPDATE_CHANNELS.forEach((c) => ipcRenderer.removeAllListeners(c));
  },

  // ---- Manual trigger from Vue ----
  checkUpdatesManually: () => ipcRenderer.invoke('update:check'),

  // ---- First run setup ----
  createLockFile: () => ipcRenderer.invoke('firstRun:createLock'),

  // @deprecated legacy receipt printing (HTML built in main). Prefer `print.*`.
  getPrinters: () => ipcRenderer.invoke('getPrinters'),
  printReceipt: (receiptData) => ipcRenderer.invoke('print-receipt', receiptData),
  previewReceipt: (receiptData) => ipcRenderer.invoke('preview-receipt', receiptData),

  // ---- Unified printing pipeline (preview / print / PDF all share the Vue
  // ReceiptPrint template). payload = { data, settings } or { jobId, settings }.
  print: {
    previewInvoice: (payload) => ipcRenderer.invoke('print:preview-invoice', payload),
    printInvoice: (payload) => ipcRenderer.invoke('print:invoice', payload),
    exportInvoicePdf: (payload) => ipcRenderer.invoke('print:invoice-pdf', payload),
    getPrinters: () => ipcRenderer.invoke('print:get-printers'),
    getJob: (jobId) => ipcRenderer.invoke('print:get-job', jobId),
    notifyReady: (token) => ipcRenderer.invoke('print:ready', token),
    // Dev diagnostics: open /print/render/:jobId in a VISIBLE window.
    openRenderDebug: (payload) => ipcRenderer.invoke('print:open-render-debug', payload),
    // Company logo lives on disk under userData; only its path is persisted in DB.
    saveLogo: () => ipcRenderer.invoke('print:save-logo'),
    deleteLogo: (relativePath) => ipcRenderer.invoke('print:delete-logo', relativePath),
    getLogoPreview: (relativePath) => ipcRenderer.invoke('print:get-logo-preview', relativePath),
  },

  cutPaper: () => ipcRenderer.invoke('cut-paper'),
  kickDrawer: () => ipcRenderer.invoke('kick-drawer'),

  restoreBackup: (filename) => ipcRenderer.invoke('backup:restore', filename),
  exportBackup: (filename) => ipcRenderer.invoke('backup:export', filename),
  exportAndCreateNewDatabase: () => ipcRenderer.invoke('backup:exportAndCreateNewDatabase'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  clearDatabase: () => ipcRenderer.invoke('database:clear'),
  closeApp: () => ipcRenderer.invoke('app:close'),

  // ---- App mode ----
  getMode: () => ipcRenderer.invoke('app:getMode'),

  // ---- Client-mode connection config ----
  connectionConfig: {
    load: () => ipcRenderer.invoke('connection:load'),
    save: (config) => ipcRenderer.invoke('connection:save', config),
    clear: () => ipcRenderer.invoke('connection:clear'),
  },

  // ---- LAN server discovery (mDNS / Bonjour, client mode) ----
  discoverServers: (options) => ipcRenderer.invoke('mdns:discover', options || {}),

  // ---- Quick-question report windows ----
  // Opens (or focuses) a standalone report window for `type`, passing initial
  // filters as `params`. Returns { opened } or { focused }.
  openReportWindow: (type, params) =>
    ipcRenderer.invoke('reports:open', { type, params: params || {} }),
  // A report window subscribes to receive fresh filters when the user re-clicks
  // the same dashboard card (the window is focused, not duplicated).
  onReportParams(callback) {
    const handler = (_event, params) => callback(params || {});
    ipcRenderer.on('reports:params', handler);
    return () => ipcRenderer.removeListener('reports:params', handler);
  },

  // ---- fallback invoke ----
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
});

contextBridge.exposeInMainWorld('splashAPI', {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
});

/**
 * UpdaterV2 bridge (active only when UPDATER_V2=1; harmless otherwise). The new
 * subsystem pushes a single full-snapshot event and accepts a small command
 * surface. The native updater window has its own preload; this lets the main
 * Vue app optionally subscribe (e.g. a floating "update ready" chip) without
 * the old multi-channel wiring.
 */
contextBridge.exposeInMainWorld('updaterV2', {
  onState: (cb) => {
    const handler = (_e, snapshot) => {
      try {
        cb(snapshot);
      } catch {
        /* swallow renderer-side errors */
      }
    };
    ipcRenderer.on('updater:event', handler);
    return () => ipcRenderer.removeListener('updater:event', handler);
  },
  getState: () => ipcRenderer.invoke('updater:get-state'),
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.invoke('updater:install'),
  remindLater: () => ipcRenderer.invoke('updater:remind-later'),
  openLog: () => ipcRenderer.invoke('updater:open-log'),
  openReleaseNotes: () => ipcRenderer.invoke('updater:open-release-notes'),
});

/**
 * window.api — backend lifecycle API consumed by the Vue frontend.
 *
 * status()  → Promise<'starting' | 'ready' | 'error'>
 * version() → Promise<string>   e.g. "1.0.0"
 */
contextBridge.exposeInMainWorld('api', {
  backend: {
    status: () => ipcRenderer.invoke('backend:getStatus'),
    version: () => ipcRenderer.invoke('backend:getVersion'),
    /**
     * Subscribe to live lifecycle transitions pushed from main.
     * Payload shape: { status: 'starting'|'ready'|'error', reason?, ...extra }
     * Returns an unsubscribe function.
     */
    onStatusChanged: (callback) => {
      const handler = (_event, payload) => {
        try {
          callback(payload);
        } catch (err) {
          // Never let a renderer-side handler error propagate back into main.
          // eslint-disable-next-line no-console
          console.error('[backend:statusChanged] handler threw:', err);
        }
      };
      ipcRenderer.on('backend:statusChanged', handler);
      return () => ipcRenderer.removeListener('backend:statusChanged', handler);
    },
  },
});

// License activation API (safe — no crypto/fs/machineId exposed)
contextBridge.exposeInMainWorld('licenseAPI', {
  activate: (input) => ipcRenderer.invoke('activate-license', input),
  browseFile: () => ipcRenderer.invoke('license:browseFile'),
  getMachineId: () => ipcRenderer.invoke('license:getMachineId'),
  getStatus: () => ipcRenderer.invoke('license:status'),
});
