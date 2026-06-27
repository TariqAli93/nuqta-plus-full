/**
 * updater.config.js
 *
 * Pure configuration resolver for UpdaterV2. Takes the process env + a few
 * runtime facts and returns a frozen UpdaterConfig. No electron import so it
 * is unit-testable; the orchestrator passes `app.isPackaged` / app mode in.
 *
 * Environment (req #7):
 *   UPDATER_MODE     = 'github' | 'dev'      (default: github)
 *   UPDATER_DEV_URL  = http://localhost:7070 (dev provider base)
 *   UPDATER_CHANNEL  = 'stable' | 'beta'     (default: stable)
 *   UPDATER_V2       = '1' to enable the new subsystem (default: off → legacy)
 */

/** @typedef {import('./updater.types.js').UpdaterConfig} UpdaterConfig */

const DEFAULT_DEV_URL = 'http://localhost:7070';

/**
 * @param {object}  [env=process.env]
 * @param {object}  [opts]
 * @param {boolean} [opts.isPackaged]
 * @param {'server'|'client'} [opts.appMode]
 * @returns {UpdaterConfig}
 */
export function resolveUpdaterConfig(env = process.env, opts = {}) {
  const isPackaged = !!opts.isPackaged;
  const appMode = opts.appMode === 'client' ? 'client' : 'server';

  // Mode: explicit env wins. In an UNPACKAGED dev run without an explicit mode
  // we still default to 'github' so nothing surprising happens; the developer
  // opts into the local provider with UPDATER_MODE=dev.
  const rawMode = String(env.UPDATER_MODE || '').toLowerCase();
  const mode = rawMode === 'dev' ? 'dev' : 'github';

  const channel = String(env.UPDATER_CHANNEL || 'stable').toLowerCase();
  const allowPrerelease = channel === 'beta';

  let devUrl = null;
  if (mode === 'dev') {
    devUrl = String(env.UPDATER_DEV_URL || DEFAULT_DEV_URL).replace(/\/+$/, '');
  }

  // Differential is always ON unless an operator explicitly disables it for a
  // diagnostic full-download run. We never disable it silently (req #6).
  const differentialEnabled = String(env.UPDATER_DISABLE_DIFFERENTIAL || '') !== '1';

  return Object.freeze({
    mode,
    channel,
    allowPrerelease,
    devUrl,
    differentialEnabled,
    appMode,
    isPackaged,
  });
}

/**
 * Whether the new subsystem should take over. Default OFF so the existing,
 * production-proven updater stays the single active path until migration is
 * deliberately flipped — satisfies "never two active update paths at once".
 *
 * @param {object} [env=process.env]
 * @returns {boolean}
 */
export function isUpdaterV2Enabled(env = process.env) {
  return String(env.UPDATER_V2 || '') === '1';
}
