/**
 * index.js — UpdaterV2 public entry point.
 *
 * The ONLY symbol the Electron main process imports from this subsystem.
 * Wiring (in main.js) is guarded so exactly one update path is ever active:
 *
 *   import { startUpdaterV2, isUpdaterV2Enabled } from '../updater/index.js';
 *   if (isUpdaterV2Enabled()) startUpdaterV2({ mainWindow, appMode, getAppVersion });
 *   else setupAutoUpdater(mainWindow); // legacy
 *
 * Default OFF (UPDATER_V2 !== '1') so the production-proven legacy updater stays
 * the single active path until migration is deliberately flipped.
 */

import { initUpdaterV2 } from './updater.main.js';
import { registerUpdaterIpc } from './updater.ipc.js';

export { isUpdaterV2Enabled } from './updater.config.js';

/**
 * Boot the new subsystem and wire its IPC.
 * @param {object} options see initUpdaterV2
 * @returns the orchestrator API
 */
export function startUpdaterV2(options) {
  const api = initUpdaterV2(options);
  registerUpdaterIpc(api);
  return api;
}
