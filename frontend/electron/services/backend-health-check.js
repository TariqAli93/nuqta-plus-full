/**
 * backend-health-check.js
 *
 * Strict post-update health verification (req #14). UpdaterV2 NEVER declares
 * success until this returns ok=true:
 *   - /health responds and reports database=connected, migrations=up-to-date
 *   - /version matches the Electron app version (no stale backend process)
 *
 * Bounded by timeouts with AbortController; never throws, never hangs. Writes
 * a structured line to update-health.log for every probe.
 */

import {
  HEALTH_ENDPOINT,
  VERSION_ENDPOINT,
  HEALTH_FETCH_TIMEOUT_MS,
  HEALTH_POLL_INTERVAL_MS,
  HEALTH_POLL_MAX_RETRIES,
} from '../../../packages/shared/index.js';
import { updateHealthLog } from '../updater/updater.logger.js';

/** @typedef {import('../updater/updater.types.js').HealthReport} HealthReport */

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    const body = await res.json();
    if (!body || typeof body !== 'object') return { ok: false, reason: 'not-object' };
    return { ok: true, body };
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : `fetch:${err?.message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One strict probe. Returns a structured HealthReport.
 * @param {string} expectedVersion  the Electron app version to match against
 * @returns {Promise<HealthReport>}
 */
export async function probeHealth(expectedVersion) {
  const h = await fetchJson(HEALTH_ENDPOINT, HEALTH_FETCH_TIMEOUT_MS);
  if (!h.ok) {
    return emptyReport(`health-${h.reason}`);
  }
  const body = h.body;
  const statusOk = body.status === 'ok' || body.status === 'healthy';
  const dbConnected = (body.database || '').toLowerCase() === 'connected';
  const migrationsOk = (body.migrations || '').toLowerCase() === 'up-to-date';

  // Resolve the backend version from /health (new shape) or /version (legacy).
  let backendVersion = body.backendVersion || null;
  if (!backendVersion) {
    const v = await fetchJson(VERSION_ENDPOINT, HEALTH_FETCH_TIMEOUT_MS);
    backendVersion = v.ok ? v.body.version || null : null;
  }
  const versionMatches = !expectedVersion || !backendVersion || backendVersion === expectedVersion;

  const ok = statusOk && dbConnected && migrationsOk && versionMatches;
  const reason = ok
    ? null
    : !statusOk
      ? `status=${body.status}`
      : !dbConnected
        ? `database=${body.database}`
        : !migrationsOk
          ? `migrations=${body.migrations}`
          : `version-mismatch app=${expectedVersion} backend=${backendVersion}`;

  return {
    ok,
    status: body.status || 'unknown',
    appVersion: body.appVersion || null,
    backendVersion,
    database: body.database || 'unknown',
    migrations: body.migrations || 'unknown',
    service: body.service || 'unknown',
    mode: body.mode || null,
    reason,
  };
}

/**
 * Poll until strictly healthy or retries exhausted. Logs each attempt.
 * @param {string} expectedVersion
 * @returns {Promise<HealthReport>}
 */
export async function waitForHealthy(expectedVersion) {
  let last = emptyReport('not-started');
  for (let attempt = 1; attempt <= HEALTH_POLL_MAX_RETRIES; attempt++) {
    last = await probeHealth(expectedVersion);
    if (last.ok) {
      updateHealthLog.info(`healthy after ${attempt} attempt(s)`, last);
      return last;
    }
    if (attempt === 1 || attempt % 5 === 0) {
      updateHealthLog.warn(`not healthy (${attempt}/${HEALTH_POLL_MAX_RETRIES}): ${last.reason}`);
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  updateHealthLog.error('health check FAILED — giving up', last);
  return last;
}

function emptyReport(reason) {
  return {
    ok: false,
    status: 'unknown',
    appVersion: null,
    backendVersion: null,
    database: 'unknown',
    migrations: 'unknown',
    service: 'unknown',
    mode: null,
    reason,
  };
}
