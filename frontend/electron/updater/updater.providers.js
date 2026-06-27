/**
 * updater.providers.js
 *
 * Builds the electron-updater feed configuration for either source:
 *   - github : the published GitHub Releases feed (production).
 *   - dev    : a GenericProvider pointed at the local update server
 *              (scripts/update/run-local-update-server.js) so the full
 *              check → download → install flow can be exercised without a real
 *              publish (req #7).
 *
 * Both paths produce the SAME latest.yml / *.exe / *.exe.blockmap contract,
 * so differential download behaves identically in dev and prod.
 */

/** @typedef {import('./updater.types.js').UpdaterConfig} UpdaterConfig */

/**
 * GitHub feed — owner/repo come from electron-builder's publish config baked
 * into app-update.yml, so for github mode we return null and let
 * electron-updater read its own embedded config. We only override the feed for
 * dev mode.
 *
 * @param {UpdaterConfig} config
 * @param {import('electron-updater').AppUpdater} autoUpdater
 * @returns {{ source: 'dev'|'github', feed: object|null }}
 */
export function applyProvider(config, autoUpdater) {
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = config.allowPrerelease;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableDifferentialDownload = !config.differentialEnabled;

  if (config.mode === 'dev') {
    // GenericProvider against the local server. electron-updater appends
    // /latest.yml and resolves installer + blockmap relative to this URL.
    const feed = {
      provider: 'generic',
      url: config.devUrl,
      channel: config.channel === 'beta' ? 'beta' : 'latest',
      useMultipleRangeRequest: true,
    };
    autoUpdater.setFeedURL(feed);
    autoUpdater.forceDevUpdateConfig = true; // allow update checks while unpackaged
    return { source: 'dev', feed };
  }

  // github — rely on the embedded app-update.yml. Set the channel so beta
  // builds resolve beta.yml when the beta channel is active.
  if (config.channel === 'beta') {
    try {
      autoUpdater.channel = 'beta';
    } catch {
      /* older electron-updater — ignored */
    }
  }
  return { source: 'github', feed: null };
}
