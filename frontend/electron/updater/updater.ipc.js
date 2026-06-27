/**
 * updater.ipc.js
 *
 * Registers the renderer→main command handlers for UpdaterV2. The main→renderer
 * stream is a single push channel (UPDATER_EVENT_CHANNEL) handled inside the
 * orchestrator's broadcast(); here we only wire the inbound commands.
 *
 * All handlers are thin and delegate to the orchestrator API; none throw.
 */

import { ipcMain } from 'electron';
import { IPC } from './updater.events.js';
import { updaterLog } from './updater.logger.js';

let bound = false;

/**
 * @param {{ check:Function, download:Function, install:Function,
 *   getSnapshot:Function, openLog:Function, openReleaseNotes:Function,
 *   remindLater:Function }} api
 */
export function registerUpdaterIpc(api) {
  if (bound) return;
  bound = true;

  const safe = (name, fn) =>
    ipcMain.handle(name, async (_e, ...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        updaterLog.error(`ipc ${name} failed: ${err.message}`);
        return { ok: false, error: err.message };
      }
    });

  safe(IPC.CHECK, () => {
    api.check(true);
    return { ok: true };
  });
  safe(IPC.DOWNLOAD, () => {
    api.download();
    return { ok: true };
  });
  safe(IPC.INSTALL, () => {
    api.install();
    return { ok: true };
  });
  safe(IPC.RETRY, () => {
    // Retry from a failed state means: re-check, then the user re-drives the flow.
    api.check(true);
    return { ok: true };
  });
  safe(IPC.REMIND_LATER, () => {
    api.remindLater();
    return { ok: true };
  });
  safe(IPC.OPEN_LOG, () => {
    api.openLog();
    return { ok: true };
  });
  safe(IPC.OPEN_RELEASE_NOTES, () => {
    api.openReleaseNotes();
    return { ok: true };
  });
  safe(IPC.GET_STATE, () => api.getSnapshot());
}
