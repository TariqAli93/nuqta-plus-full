/**
 * updater.logger.js
 *
 * Dedicated, append-only loggers for the UpdaterV2 subsystem (req #15). Each
 * concern writes to its own file under <userData>/logs so a bug report can
 * attach exactly the relevant trace:
 *
 *   updater.log          — lifecycle, provider, differential, sizes, speed
 *   service-manager.log  — every service-manager.ps1 invocation + exit code
 *   installer.log        — copied/echoed NSIS detail (best-effort)
 *   update-health.log    — post-update /health probe results
 *
 * Secrets are redacted before they hit disk (req #15): home dir → ~, and
 * token/password/apikey/connection-string values are masked. Never throws.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

const HOME_DIR = (() => {
  try {
    return os.homedir();
  } catch {
    return '';
  }
})();

const SECRET_PATTERN =
  /\b(password|secret|token|authorization|apikey|api_key|licensekey|pwd)\b\s*[:=]\s*["']?([^\s"',}]+)/gi;
// postgres://user:pass@host — mask the password component.
const CONN_STRING_PATTERN = /(postgres(?:ql)?:\/\/[^:/\s]+:)([^@/\s]+)(@)/gi;

function redact(line) {
  let out = String(line);
  if (HOME_DIR) out = out.split(HOME_DIR).join('~');
  out = out.replace(SECRET_PATTERN, (_m, key) => `${key}=[REDACTED]`);
  out = out.replace(CONN_STRING_PATTERN, (_m, a, _pw, c) => `${a}[REDACTED]${c}`);
  return out;
}

function logsDir() {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

/** A tiny append-only file logger with size-capped rotation (1 file, 2 MB). */
class FileLog {
  constructor(filename) {
    this.filename = filename;
    this._path = null;
  }

  path() {
    if (this._path) return this._path;
    const dir = logsDir();
    this._path = dir ? path.join(dir, this.filename) : null;
    return this._path;
  }

  _rotate(file) {
    try {
      const { size } = fs.statSync(file);
      if (size < 2 * 1024 * 1024) return;
      fs.renameSync(file, `${file}.1`);
    } catch {
      /* first write / locked — ignore */
    }
  }

  write(level, message, data) {
    const file = this.path();
    const ts = new Date().toISOString();
    const extra = data ? ` ${safeJson(data)}` : '';
    const line = redact(`[${ts}] [${level}] ${message}${extra}\n`);
    if (!file) return;
    this._rotate(file);
    try {
      fs.appendFileSync(file, line);
    } catch {
      /* disk full / locked — best-effort */
    }
  }

  info(m, d) {
    this.write('INFO', m, d);
  }
  warn(m, d) {
    this.write('WARN', m, d);
  }
  error(m, d) {
    this.write('ERROR', m, d);
  }
}

function safeJson(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export const updaterLog = new FileLog('updater.log');
export const serviceManagerLog = new FileLog('service-manager.log');
export const installerLog = new FileLog('installer.log');
export const updateHealthLog = new FileLog('update-health.log');

export function updaterLogPath() {
  return updaterLog.path();
}
