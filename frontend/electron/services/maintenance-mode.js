/**
 * maintenance-mode.js
 *
 * A tiny file-backed maintenance flag the backend can read to refuse new
 * mutating operations while an update installs (req #11/#12). It lives in
 * userData (NOT inside the program files that the installer replaces) so it
 * survives the install window and the backend can poll it.
 *
 * The flag carries a reason + the version being installed + a started-at stamp
 * so a stale flag (e.g. the app crashed mid-install) can be detected and
 * auto-expired by the backend or by enter()'s own staleness guard.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { updaterLog } from '../updater/updater.logger.js';

const MAX_AGE_MS = 30 * 60 * 1000; // a maintenance window should never exceed 30 min

function flagPath() {
  return path.join(app.getPath('userData'), 'maintenance.json');
}

/**
 * Enter maintenance mode. Idempotent.
 * @param {{ reason?: string, targetVersion?: string }} [info]
 */
export function enterMaintenance(info = {}) {
  const payload = {
    active: true,
    reason: info.reason || 'update-install',
    targetVersion: info.targetVersion || null,
    startedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(flagPath(), JSON.stringify(payload, null, 2), 'utf8');
    updaterLog.info('maintenance ENTER', payload);
    return true;
  } catch (err) {
    updaterLog.error(`maintenance enter failed: ${err.message}`);
    return false;
  }
}

/** Exit maintenance mode. Idempotent — missing file is success. */
export function exitMaintenance() {
  const file = flagPath();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    updaterLog.info('maintenance EXIT');
    return true;
  } catch (err) {
    updaterLog.error(`maintenance exit failed: ${err.message}`);
    return false;
  }
}

/**
 * @returns {{ active: boolean, reason?: string, targetVersion?: string|null, startedAt?: string }}
 */
export function maintenanceStatus() {
  const file = flagPath();
  try {
    if (!fs.existsSync(file)) return { active: false };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Auto-expire a stale window so a crashed install can't wedge the app.
    if (data?.startedAt && Date.now() - Date.parse(data.startedAt) > MAX_AGE_MS) {
      updaterLog.warn('maintenance flag is stale — auto-expiring');
      exitMaintenance();
      return { active: false };
    }
    return data?.active ? data : { active: false };
  } catch {
    return { active: false };
  }
}
