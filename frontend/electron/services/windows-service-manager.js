/**
 * windows-service-manager.js
 *
 * Thin, security-hardened JS wrapper around build/service-manager/service-manager.ps1.
 * It is the ONLY way UpdaterV2 talks to the Windows Service from the Electron
 * side. It never builds shell strings (execFile with an argv array — no
 * `shell: true`), validates the PowerShell + script paths against trusted
 * roots, quotes nothing by hand (argv avoids quoting bugs), supports paths with
 * spaces, and enforces a hard timeout on every call (req #9, #18).
 *
 * Exit codes are the stable contract from the .ps1 header.
 */

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { assertExecutable, assertPathWithin, SecurityError } from '../scripts/security.js';
import { baselineBackendDir } from '../scripts/versionManager.js';
import { BACKEND_SERVICE_NAME } from '../../../packages/shared/index.js';
import { serviceManagerLog } from '../updater/updater.logger.js';

export const SERVICE_EXIT = Object.freeze({
  OK: 0,
  INVALID_ARGS: 10,
  BINARY_NOT_FOUND: 11,
  NOT_INSTALLED: 12,
  TIMEOUT: 13,
  ACCESS_DENIED: 14,
  STOP_PENDING_STUCK: 15,
  START_FAILED: 16,
  CONFIG_FAILED: 17,
  UNEXPECTED: 18,
});

/** Resolve service-manager.ps1, validated to live under resources. */
function scriptPath() {
  // Shipped to resources/service-manager/service-manager.ps1 via extraResources.
  const root = app.isPackaged ? process.resourcesPath : path.resolve(app.getAppPath(), '../..');
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'service-manager', 'service-manager.ps1')
    : path.resolve(app.getAppPath(), '..', '..', 'build', 'service-manager', 'service-manager.ps1');
  return assertPathWithin(candidate, [root, path.dirname(candidate)], 'service-manager.ps1');
}

/** Resolve powershell.exe under %SystemRoot% (defends against PATH hijack). */
function powershellPath() {
  const sysRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
  if (!sysRoot) throw new SecurityError('SystemRoot not set — cannot locate powershell.exe');
  const candidate = path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return assertExecutable(candidate, [sysRoot], 'powershell.exe');
}

/** The fixed, version-independent service binary path (WinSW host). */
export function serviceBinaryPath() {
  const baseline = baselineBackendDir();
  const candidate = path.join(baseline, `${BACKEND_SERVICE_NAME}.exe`);
  return assertExecutable(candidate, [baseline], 'serviceBinary');
}

/**
 * Run a single service-manager verb. Resolves { ok, code, stdout, state }.
 * Never rejects — failures come back as a structured result.
 *
 * @param {'install-or-update'|'start'|'stop'|'status'|'health'|'repair'} verb
 * @param {{ timeoutMs?: number, includeBinPath?: boolean }} [opts]
 */
export function runServiceManager(verb, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 35_000;
  return new Promise((resolve) => {
    let script;
    let ps;
    try {
      script = scriptPath();
      ps = powershellPath();
    } catch (err) {
      serviceManagerLog.error(`path resolution failed: ${err.message}`);
      return resolve({ ok: false, code: SERVICE_EXIT.UNEXPECTED, stdout: err.message, state: 'unknown' });
    }
    if (!fs.existsSync(script)) {
      serviceManagerLog.error(`script missing: ${script}`);
      return resolve({ ok: false, code: SERVICE_EXIT.UNEXPECTED, stdout: 'script missing', state: 'unknown' });
    }

    // argv form — NO shell, so spaces in paths/usernames are safe (req #18).
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      verb,
      '-TimeoutMs',
      String(Math.max(1000, Math.floor((opts.timeoutMs ?? 30_000)))),
    ];
    if (opts.includeBinPath && (verb === 'install-or-update' || verb === 'repair')) {
      try {
        args.push('-BinPath', serviceBinaryPath());
      } catch (err) {
        return resolve({ ok: false, code: SERVICE_EXIT.BINARY_NOT_FOUND, stdout: err.message, state: 'unknown' });
      }
    }

    serviceManagerLog.info(`run ${verb}`, { timeoutMs });
    let stdout = '';
    const child = execFile(
      ps,
      args,
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, out, errOut) => {
        stdout = `${out || ''}${errOut || ''}`;
        const code = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        const state = parseState(stdout);
        serviceManagerLog.info(`done ${verb} exit=${code} state=${state}`);
        resolve({ ok: code === SERVICE_EXIT.OK, code, stdout: stdout.trim(), state });
      }
    );
    child.on('error', (err) => {
      serviceManagerLog.error(`spawn error ${verb}: ${err.message}`);
      resolve({ ok: false, code: SERVICE_EXIT.UNEXPECTED, stdout: err.message, state: 'unknown' });
    });
  });
}

function parseState(stdout) {
  const m = /state=([A-Za-z-]+)/.exec(stdout || '');
  return m ? m[1].toLowerCase() : 'unknown';
}

// Convenience wrappers ───────────────────────────────────────────────────────
export const stopService = (timeoutMs = 30_000) => runServiceManager('stop', { timeoutMs });
export const startService = (timeoutMs = 30_000) => runServiceManager('start', { timeoutMs });
export const serviceStatus = () => runServiceManager('status', { timeoutMs: 8_000 });
export const installOrUpdateService = (timeoutMs = 35_000) =>
  runServiceManager('install-or-update', { timeoutMs, includeBinPath: true });
export const repairService = (timeoutMs = 60_000) =>
  runServiceManager('repair', { timeoutMs, includeBinPath: true });
