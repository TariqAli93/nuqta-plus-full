/**
 * updater-window.preload.cjs
 *
 * Minimal, sandbox-safe bridge for the NATIVE updater window (updater-window.html).
 * CommonJS (.cjs) because the project is "type":"module" and Electron preloads
 * must load as CJS. Exposes only the update command surface + the single state
 * push channel — no fs, no arbitrary invoke.
 */

const { contextBridge, ipcRenderer } = require('electron');

const EVENT_CHANNEL = 'updater:event';
const CMD = {
  download: 'updater:download',
  install: 'updater:install',
  retry: 'updater:retry',
  remindLater: 'updater:remind-later',
  openLog: 'updater:open-log',
  openReleaseNotes: 'updater:open-release-notes',
  getState: 'updater:get-state',
};

contextBridge.exposeInMainWorld('updaterAPI', {
  onState: (cb) => {
    const handler = (_e, snapshot) => {
      try {
        cb(snapshot);
      } catch {
        /* renderer handler error must not bubble into main */
      }
    };
    ipcRenderer.on(EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, handler);
  },
  getState: () => ipcRenderer.invoke(CMD.getState),
  download: () => ipcRenderer.invoke(CMD.download),
  install: () => ipcRenderer.invoke(CMD.install),
  retry: () => ipcRenderer.invoke(CMD.retry),
  remindLater: () => ipcRenderer.invoke(CMD.remindLater),
  openLog: () => ipcRenderer.invoke(CMD.openLog),
  openReleaseNotes: () => ipcRenderer.invoke(CMD.openReleaseNotes),
});
