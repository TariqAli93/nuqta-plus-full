/**
 * updater.types.js
 *
 * JSDoc typedefs shared across the UpdaterV2 subsystem. Pure documentation —
 * no runtime exports. Imported via `@typedef` references in other files.
 */

/**
 * @typedef {'idle'|'checking'|'update-available'|'update-not-available'|
 *   'downloading'|'downloaded'|'ready-to-install'|'installing'|
 *   'service-stopping'|'service-starting'|'health-checking'|'completed'|'failed'} UpdaterStateName
 */

/**
 * @typedef {'unknown'|'differential'|'full'} DownloadMode
 */

/**
 * @typedef {Object} UpdaterConfig
 * @property {'dev'|'github'} mode          Update source.
 * @property {string}         channel       Release channel (stable|beta).
 * @property {boolean}        allowPrerelease
 * @property {string|null}    devUrl        Local provider base URL (dev mode).
 * @property {boolean}        differentialEnabled
 * @property {'server'|'client'} appMode    Server vs Client install.
 * @property {boolean}        isPackaged
 */

/**
 * @typedef {Object} DownloadTelemetry
 * @property {DownloadMode} mode
 * @property {string}       fallbackReason
 * @property {number}       fullSizeBytes
 * @property {number}       transferredBytes
 * @property {number}       bytesPerSecond
 * @property {number|null}  etaSeconds
 * @property {number}       savedBytes
 * @property {number}       pctSaved
 */

/**
 * @typedef {Object} UpdaterSnapshot
 * @property {UpdaterStateName} state
 * @property {string}  currentVersion
 * @property {string}  nextVersion
 * @property {string}  releaseNotes
 * @property {number}  progressPercent
 * @property {DownloadTelemetry} download
 * @property {string|null} error
 * @property {'server'|'client'} appMode
 * @property {'dev'|'github'} source
 */

/**
 * @typedef {Object} HealthReport
 * @property {boolean} ok
 * @property {string}  status
 * @property {string|null} appVersion
 * @property {string|null} backendVersion
 * @property {string}  database
 * @property {string}  migrations
 * @property {string}  service
 * @property {string|null} mode
 * @property {string|null} reason
 */

/**
 * @typedef {Object} ServiceResult
 * @property {boolean} ok
 * @property {number}  code
 * @property {string}  stdout
 * @property {string}  state
 */

export {};
