/**
 * updater.events.js
 *
 * Single source of truth for the UpdaterV2 lifecycle states, the renderer-bound
 * IPC channels, and the invoke (renderer→main) command channels.
 *
 * This file is intentionally dependency-free (no electron import) so it can be
 * imported by the main process, the preload bridge, unit tests, and tooling
 * alike.
 */

/**
 * The complete lifecycle state set (req #4). Every state has a matching log
 * line and a renderer event; transitions are validated by updater.state.js.
 */
export const STATES = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  UPDATE_AVAILABLE: 'update-available',
  UPDATE_NOT_AVAILABLE: 'update-not-available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  READY_TO_INSTALL: 'ready-to-install',
  INSTALLING: 'installing',
  SERVICE_STOPPING: 'service-stopping',
  SERVICE_STARTING: 'service-starting',
  HEALTH_CHECKING: 'health-checking',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

/**
 * Allowed transitions. A transition NOT listed here is a programming error and
 * updater.state.js throws on it — this keeps the lifecycle honest and makes
 * illegal sequences (e.g. installing before downloaded) impossible.
 */
export const TRANSITIONS = Object.freeze({
  [STATES.IDLE]: [STATES.CHECKING],
  [STATES.CHECKING]: [STATES.UPDATE_AVAILABLE, STATES.UPDATE_NOT_AVAILABLE, STATES.FAILED],
  [STATES.UPDATE_NOT_AVAILABLE]: [STATES.IDLE, STATES.CHECKING],
  [STATES.UPDATE_AVAILABLE]: [STATES.DOWNLOADING, STATES.IDLE, STATES.FAILED],
  [STATES.DOWNLOADING]: [STATES.DOWNLOADED, STATES.FAILED],
  [STATES.DOWNLOADED]: [STATES.READY_TO_INSTALL, STATES.FAILED],
  [STATES.READY_TO_INSTALL]: [STATES.INSTALLING, STATES.IDLE, STATES.FAILED],
  // Once installing begins the app quits into the NSIS installer. SERVICE_*
  // and HEALTH_CHECKING are post-relaunch states recorded by the new process.
  [STATES.INSTALLING]: [STATES.SERVICE_STOPPING, STATES.FAILED],
  [STATES.SERVICE_STOPPING]: [STATES.SERVICE_STARTING, STATES.FAILED],
  [STATES.SERVICE_STARTING]: [STATES.HEALTH_CHECKING, STATES.FAILED],
  [STATES.HEALTH_CHECKING]: [STATES.COMPLETED, STATES.FAILED],
  [STATES.COMPLETED]: [STATES.IDLE, STATES.CHECKING],
  [STATES.FAILED]: [STATES.IDLE, STATES.CHECKING],
});

/** States during which the Windows Service must NEVER be stopped (req #11). */
export const SERVICE_PROTECTED_STATES = Object.freeze([
  STATES.IDLE,
  STATES.CHECKING,
  STATES.UPDATE_AVAILABLE,
  STATES.UPDATE_NOT_AVAILABLE,
  STATES.DOWNLOADING,
  STATES.DOWNLOADED,
  STATES.READY_TO_INSTALL,
]);

/** Download-mode classification for differential telemetry (req #6). */
export const DOWNLOAD_MODE = Object.freeze({
  UNKNOWN: 'unknown',
  DIFFERENTIAL: 'differential',
  FULL: 'full',
});

/** main → renderer push channel (a single channel carrying the full state). */
export const UPDATER_EVENT_CHANNEL = 'updater:event';

/** renderer → main invoke channels (req #4 retry/actions). */
export const IPC = Object.freeze({
  CHECK: 'updater:check',
  DOWNLOAD: 'updater:download',
  INSTALL: 'updater:install',
  RETRY: 'updater:retry',
  REMIND_LATER: 'updater:remind-later',
  OPEN_LOG: 'updater:open-log',
  OPEN_RELEASE_NOTES: 'updater:open-release-notes',
  GET_STATE: 'updater:get-state',
});
