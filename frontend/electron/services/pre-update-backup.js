/**
 * pre-update-backup.js
 *
 * Pre-INSTALL backup (req #13). Runs only when the update is ready to install
 * and BEFORE the service is stopped — never before download. It is
 * dependency-free (no zip lib): the backup is a self-describing folder under
 *
 *   <userData>/pre-update-backups/pre-update-<from>-to-<to>-<YYYYMMDD-HHmmss>/
 *     manifest.json     { fromVersion, toVersion, createdAt, files: [{name, sha256, size}] }
 *     <artifact files…> (e.g. the DB dump produced by the backend)
 *
 * A backup is only considered VALID when the folder exists, manifest.json
 * parses, and every listed artifact exists with size>0 and a matching SHA-256
 * (req #13). If a required backup cannot be produced or validated, the caller
 * MUST block the install.
 *
 * Artifact production is pluggable: the orchestrator passes `produceArtifacts`
 * (an async fn returning absolute file paths to include — typically a DB dump
 * created via the backend's /api/settings/backups route). This keeps auth and
 * backend specifics out of this module while the VALIDATION contract lives
 * here, where it is testable.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { sha256File } from '../scripts/security.js';
import { updaterLog } from '../updater/updater.logger.js';

function backupsRoot() {
  const dir = path.join(app.getPath('userData'), 'pre-update-backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Whether a pre-update backup is required for this update. Conservative:
 * required only in server mode AND when the operator opts in via
 * UPDATER_REQUIRE_BACKUP=1. (The NSIS installer never deletes the database, so
 * a backup mainly guards against a failed migration — valuable but opt-in so an
 * unconfigured environment is not blocked from updating.)
 *
 * @param {{ appMode: 'server'|'client' }} ctx
 */
export function isBackupRequired(ctx, env = process.env) {
  return ctx.appMode === 'server' && String(env.UPDATER_REQUIRE_BACKUP || '') === '1';
}

/**
 * Create + validate a pre-update backup.
 *
 * @param {object} opts
 * @param {string} opts.fromVersion
 * @param {string} opts.toVersion
 * @param {() => Promise<string[]>} [opts.produceArtifacts] async producer of absolute file paths
 * @returns {Promise<{ ok: boolean, dir: string|null, manifestPath: string|null, reason?: string }>}
 */
export async function createPreUpdateBackup({ fromVersion, toVersion, produceArtifacts }) {
  const name = `pre-update-${fromVersion}-to-${toVersion}-${stamp()}`;
  const dir = path.join(backupsRoot(), name);
  updaterLog.info(`pre-update backup START → ${name}`);

  try {
    fs.mkdirSync(dir, { recursive: true });

    let artifacts = [];
    if (typeof produceArtifacts === 'function') {
      artifacts = (await produceArtifacts()) || [];
    }
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      const reason = 'no backup artifacts were produced';
      updaterLog.error(`pre-update backup FAILED: ${reason}`);
      return { ok: false, dir, manifestPath: null, reason };
    }

    const files = [];
    for (const src of artifacts) {
      if (!fs.existsSync(src)) {
        return fail(dir, `artifact missing: ${path.basename(src)}`);
      }
      const base = path.basename(src);
      const dst = path.join(dir, base);
      fs.copyFileSync(src, dst);
      const size = fs.statSync(dst).size;
      if (size <= 0) return fail(dir, `artifact is empty: ${base}`);
      const sha256 = sha256File(dst);
      files.push({ name: base, sha256, size });
    }

    const manifest = {
      fromVersion,
      toVersion,
      createdAt: new Date().toISOString(),
      files,
    };
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Validate what we just wrote — a backup we cannot verify is not a backup.
    const verdict = validateBackup(dir);
    if (!verdict.ok) return { ok: false, dir, manifestPath, reason: verdict.reason };

    updaterLog.info(`pre-update backup OK → ${dir} (${files.length} file(s))`);
    return { ok: true, dir, manifestPath };
  } catch (err) {
    updaterLog.error(`pre-update backup ERROR: ${err.message}`);
    return { ok: false, dir, manifestPath: null, reason: err.message };
  }
}

/**
 * Validate an existing backup folder: manifest parses + every file exists with
 * size>0 and a matching SHA-256 (req #13). Pure-ish; used by tests too.
 *
 * @param {string} dir
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateBackup(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return { ok: false, reason: 'backup dir missing' };
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { ok: false, reason: 'manifest.json missing' };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      return { ok: false, reason: 'manifest lists no files' };
    }
    for (const f of manifest.files) {
      const full = path.join(dir, f.name);
      if (!fs.existsSync(full)) return { ok: false, reason: `missing file ${f.name}` };
      const size = fs.statSync(full).size;
      if (size <= 0) return { ok: false, reason: `empty file ${f.name}` };
      if (f.sha256 && sha256File(full) !== f.sha256) {
        return { ok: false, reason: `checksum mismatch ${f.name}` };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function fail(dir, reason) {
  updaterLog.error(`pre-update backup FAILED: ${reason}`);
  return { ok: false, dir, manifestPath: null, reason };
}
