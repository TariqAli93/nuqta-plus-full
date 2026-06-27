/**
 * updater.main.js
 *
 * UpdaterV2 orchestrator. Owns the full lifecycle on top of electron-updater
 * and drives the state machine, native UX (Windows notifications + taskbar
 * progress + the native updater window), differential telemetry, the
 * pre-install backup, maintenance mode, and the post-relaunch service +
 * health verification.
 *
 * HARD RULES enforced here:
 *   - The Windows Service is NEVER stopped during checking/downloading/ready
 *     (req #11). Stopping happens inside the NSIS installer at install time.
 *   - We do NOT rely on code after quitAndInstall() to start the service
 *     (req #9): NSIS starts it; on the NEXT launch we VERIFY + repair.
 *   - Success is declared ONLY after a strict /health check passes (req #14).
 */

import { app, BrowserWindow, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { STATES, DOWNLOAD_MODE, UPDATER_EVENT_CHANNEL } from './updater.events.js';
import { UpdaterStateMachine } from './updater.state.js';
import { resolveUpdaterConfig } from './updater.config.js';
import { applyProvider } from './updater.providers.js';
import { updaterLog, updaterLogPath } from './updater.logger.js';
import { serviceStatus, repairService, SERVICE_EXIT } from '../services/windows-service-manager.js';
import { waitForHealthy } from '../services/backend-health-check.js';
import { enterMaintenance, exitMaintenance } from '../services/maintenance-mode.js';
import { createPreUpdateBackup, isBackupRequired } from '../services/pre-update-backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let config = null;
let machine = null;
let ctx = null; // { getAppVersion, appMode, produceBackupArtifacts }
let updaterWindow = null;
let releaseNotesUrl = '';
let installMarkerPath = '';

// Differential telemetry — populated by inspecting electron-updater's own logs.
let downloadMode = DOWNLOAD_MODE.UNKNOWN;
let fullSize = 0;
let downloadStartedAt = 0;
let lastTransferred = 0;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise UpdaterV2.
 * @param {object} options
 * @param {BrowserWindow} options.mainWindow
 * @param {'server'|'client'} options.appMode
 * @param {() => string} options.getAppVersion
 * @param {() => Promise<string[]>} [options.produceBackupArtifacts]
 */
export function initUpdaterV2(options) {
  ctx = {
    mainWindow: options.mainWindow,
    appMode: options.appMode === 'client' ? 'client' : 'server',
    getAppVersion: options.getAppVersion || (() => app.getVersion()),
    produceBackupArtifacts: options.produceBackupArtifacts || null,
  };

  config = resolveUpdaterConfig(process.env, {
    isPackaged: app.isPackaged,
    appMode: ctx.appMode,
  });

  machine = new UpdaterStateMachine(broadcast);
  machine.patch({
    currentVersion: ctx.getAppVersion(),
    appMode: ctx.appMode,
    source: config.mode,
  });

  const { source } = applyProvider(config, autoUpdater);
  bridgeUpdaterLogger();
  bindEvents();

  updaterLog.info('UpdaterV2 initialised', {
    mode: config.mode,
    channel: config.channel,
    source,
    appMode: ctx.appMode,
    differentialEnabled: config.differentialEnabled,
    currentVersion: ctx.getAppVersion(),
  });

  installMarkerPath = path.join(app.getPath('userData'), 'updater-installing.json');

  // If we relaunched right after an install, verify the service + health now.
  runPostUpdateVerification().catch((err) =>
    updaterLog.error(`post-update verification crashed: ${err.message}`)
  );

  // Silent first check (req #1) — never in client mode without a server, never
  // unpackaged unless dev mode is explicitly configured.
  const canCheck = app.isPackaged || config.mode === 'dev';
  if (canCheck) {
    setTimeout(() => check(false), app.isPackaged ? 45_000 : 4_000);
  }

  return { check, download, install, getSnapshot, openLog, openReleaseNotes, remindLater };
}

export function getSnapshot() {
  return machine ? machine.snapshot() : null;
}

// ── Lifecycle actions ────────────────────────────────────────────────────────

export function check(manual = false) {
  if (!config) return;
  if (!app.isPackaged && config.mode !== 'dev') {
    updaterLog.info('check skipped — unpackaged and not in dev mode');
    return;
  }
  try {
    machine.transition(STATES.CHECKING, { error: null });
  } catch {
    /* already mid-flow — ignore re-entrant check */
    return;
  }
  updaterLog.info(`check (manual=${manual}) provider=${config.mode}`);
  autoUpdater.checkForUpdates().catch((err) => {
    fail(`check failed: ${err?.message || err}`);
  });
}

export function download() {
  if (machine.state !== STATES.UPDATE_AVAILABLE && machine.state !== STATES.FAILED) {
    updaterLog.warn(`download ignored — state=${machine.state}`);
    return;
  }
  downloadStartedAt = Date.now();
  lastTransferred = 0;
  machine.transition(STATES.DOWNLOADING, {
    progressPercent: 0,
    download: { mode: downloadMode },
  });
  updaterLog.info(`download START differentialEnabled=${config.differentialEnabled}`);
  autoUpdater.downloadUpdate().catch((err) => fail(`download failed: ${err?.message || err}`));
}

/**
 * Begin install. Order (req #11/#13):
 *   ready → enter maintenance → pre-install backup (gated) → INSTALLING →
 *   quitAndInstall (NSIS stops the service, installs, starts it).
 * We never stop the service from JS here.
 */
export async function install() {
  if (machine.state !== STATES.READY_TO_INSTALL && machine.state !== STATES.DOWNLOADED) {
    updaterLog.warn(`install ignored — state=${machine.state}`);
    return;
  }
  const fromVersion = ctx.getAppVersion();
  const toVersion = machine.snapshot().nextVersion || 'unknown';

  // 1) maintenance mode — backend refuses new mutating ops while we install.
  enterMaintenance({ reason: 'update-install', targetVersion: toVersion });

  // 2) pre-install backup (only if required; gates the install on success).
  if (isBackupRequired(ctx)) {
    updaterLog.info('pre-install backup required — running');
    const result = await createPreUpdateBackup({
      fromVersion,
      toVersion,
      produceArtifacts: ctx.produceBackupArtifacts,
    });
    if (!result.ok) {
      exitMaintenance();
      fail(`pre-install backup failed — install aborted: ${result.reason}`);
      return;
    }
    updaterLog.info(`pre-install backup OK: ${result.dir}`);
  } else {
    updaterLog.info('pre-install backup not required for this update');
  }

  // 3) persist an install marker so the next launch runs verification.
  try {
    fs.writeFileSync(
      installMarkerPath,
      JSON.stringify({ fromVersion, toVersion, at: new Date().toISOString() }),
      'utf8'
    );
  } catch (err) {
    updaterLog.warn(`could not write install marker: ${err.message}`);
  }

  machine.transition(STATES.INSTALLING);
  updaterLog.info('quitAndInstall(silent=true, forceRunAfter=true)');
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (err) {
      exitMaintenance();
      fail(`quitAndInstall failed: ${err?.message || err}`);
    }
  }, 250);
}

export function remindLater() {
  if (machine.state === STATES.UPDATE_AVAILABLE || machine.state === STATES.READY_TO_INSTALL) {
    notify('تحديث متوفر', 'يمكنك التثبيت لاحقاً من زر التحديث.');
  }
}

export function openLog() {
  const p = updaterLogPath();
  if (p && fs.existsSync(p)) shell.openPath(p);
}

export function openReleaseNotes() {
  if (releaseNotesUrl) shell.openExternal(releaseNotesUrl);
}

// ── Post-relaunch verification (req #9/#14) ─────────────────────────────────

/**
 * Runs on every startup. If an install marker is present we KNOW we just
 * updated, so we drive the post-install states: ensure the service is RUNNING
 * (repair once if not), then a strict health check, then COMPLETED. Success is
 * only declared here — never right after the download.
 */
export async function runPostUpdateVerification() {
  if (!installMarkerPath || !fs.existsSync(installMarkerPath)) return;

  let marker = {};
  try {
    marker = JSON.parse(fs.readFileSync(installMarkerPath, 'utf8'));
  } catch {
    /* corrupt marker — still verify, then clear */
  }
  updaterLog.info('post-update verification START', marker);

  // Client mode never manages a local service.
  if (ctx.appMode === 'server') {
    machine.transition(STATES.SERVICE_STARTING, { nextVersion: marker.toVersion || '' });
    const status = await serviceStatus();
    if (status.state !== 'running') {
      updaterLog.warn(`service state=${status.state} after install — repairing`);
      const repaired = await repairService();
      if (!repaired.ok) {
        clearMarker();
        exitMaintenance();
        fail(
          `service did not come up after update (code ${repaired.code}: ${shortReason(repaired.code)})`
        );
        return;
      }
    }
  }

  machine.transition(STATES.HEALTH_CHECKING);
  const health = await waitForHealthy(ctx.getAppVersion());
  clearMarker();
  exitMaintenance();

  if (!health.ok) {
    fail(`post-update health check failed: ${health.reason}`);
    return;
  }

  machine.transition(STATES.COMPLETED, { error: null });
  updaterLog.info('update COMPLETED — service running + health OK', health);
  notify('تم التحديث بنجاح', `الإصدار ${ctx.getAppVersion()} يعمل وقاعدة البيانات متصلة.`);
}

// ── electron-updater event wiring ────────────────────────────────────────────

function bindEvents() {
  autoUpdater.on('update-available', (info) => {
    fullSize = Number(info?.files?.[0]?.size) || 0;
    downloadMode = DOWNLOAD_MODE.UNKNOWN;
    releaseNotesUrl = githubReleaseUrl(info?.version);
    updaterLog.info('update AVAILABLE', { next: info?.version, fullSize });
    machine.transition(STATES.UPDATE_AVAILABLE, {
      nextVersion: info?.version || '',
      releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : '',
      download: { fullSizeBytes: fullSize, mode: DOWNLOAD_MODE.UNKNOWN },
    });
    openUpdaterWindow();
    notify('يتوفر تحديث جديد', `الإصدار ${info?.version} متاح للتنزيل.`);
  });

  autoUpdater.on('update-not-available', () => {
    updaterLog.info('no update available');
    if (machine.state === STATES.CHECKING) {
      machine.transition(STATES.UPDATE_NOT_AVAILABLE);
      machine.transition(STATES.IDLE);
    }
  });

  autoUpdater.on('download-progress', (p) => {
    const percent = Math.round(p?.percent || 0);
    lastTransferred = p?.transferred || 0;
    const bps = p?.bytesPerSecond || 0;
    const remaining = Math.max(0, (p?.total || 0) - lastTransferred);
    const etaSeconds = bps > 0 ? Math.round(remaining / bps) : null;
    setTaskbarProgress(percent / 100);
    machine.patch({
      progressPercent: percent,
      download: {
        transferredBytes: lastTransferred,
        fullSizeBytes: p?.total || fullSize,
        bytesPerSecond: bps,
        etaSeconds,
        mode: downloadMode,
      },
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setTaskbarProgress(-1);
    const transferred = lastTransferred || 0;
    if (downloadMode === DOWNLOAD_MODE.UNKNOWN) {
      downloadMode =
        fullSize > 0 && transferred < fullSize * 0.9
          ? DOWNLOAD_MODE.DIFFERENTIAL
          : DOWNLOAD_MODE.FULL;
    }
    const saved = fullSize > 0 ? Math.max(0, fullSize - transferred) : 0;
    const pctSaved = fullSize > 0 ? Math.round((saved / fullSize) * 100) : 0;
    const durationS = downloadStartedAt
      ? ((Date.now() - downloadStartedAt) / 1000).toFixed(1)
      : '0';
    updaterLog.info('update DOWNLOADED', {
      version: info?.version,
      mode: downloadMode,
      transferredBytes: transferred,
      fullSizeBytes: fullSize,
      savedBytes: saved,
      pctSaved,
      durationS,
    });
    machine.transition(STATES.DOWNLOADED, {
      download: { mode: downloadMode, transferredBytes: transferred, savedBytes: saved, pctSaved },
    });
    machine.transition(STATES.READY_TO_INSTALL);
    notify('التحديث جاهز', 'اضغط «تثبيت الآن» لإكمال التحديث.');
  });

  autoUpdater.on('error', (err) => {
    setTaskbarProgress(-1);
    fail(`updater error: ${err?.message || err}`);
  });
}

/**
 * Bridge + INSPECT electron-updater's verbose log lines. This is the only
 * reliable signal for the library's internal differential-vs-full decision
 * (req #6): "Download block maps …" = delta attempt; "Cannot download
 * differentially, fallback to full download: <reason>" = fallback + reason.
 */
function bridgeUpdaterLogger() {
  autoUpdater.logger = {
    info: (m) => onUpdaterLine('info', m),
    warn: (m) => onUpdaterLine('warn', m),
    error: (m) => onUpdaterLine('error', m),
    debug: () => {},
  };
}

function onUpdaterLine(level, raw) {
  const m = typeof raw === 'string' ? raw : String(raw?.message || raw);
  updaterLog[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info'](`eu: ${m}`);

  if (/Download block maps/i.test(m)) {
    downloadMode = DOWNLOAD_MODE.DIFFERENTIAL;
    if (machine) machine.patch({ download: { mode: downloadMode } });
    updaterLog.info('differential ATTEMPT (blockmaps resolved)');
    return;
  }
  const fb = /Cannot download differentially, fallback to full download:\s*([\s\S]*)/i.exec(m);
  if (fb) {
    downloadMode = DOWNLOAD_MODE.FULL;
    const reason = (fb[1] || '').split('\n')[0].trim().slice(0, 300);
    if (machine) machine.patch({ download: { mode: downloadMode, fallbackReason: reason } });
    updaterLog.warn(`FALLBACK to full download — reason: ${reason || 'unknown'}`);
  }
}

// ── Native UX helpers ────────────────────────────────────────────────────────

function notify(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show();
    }
  } catch (err) {
    updaterLog.warn(`notification failed: ${err.message}`);
  }
}

function setTaskbarProgress(fraction) {
  try {
    const win = ctx?.mainWindow;
    if (win && !win.isDestroyed()) win.setProgressBar(fraction);
  } catch {
    /* progress bar is cosmetic — ignore */
  }
}

/**
 * The native, fixed-size updater window (no app chrome, no Vue, no web layout —
 * req #8). Loaded from a plain HTML file with its own minimal preload. Opening
 * is best-effort; if the asset is missing we fall back to notifications + the
 * main-window renderer which also receives the broadcast.
 */
function openUpdaterWindow() {
  if (String(process.env.UPDATER_NATIVE_WINDOW || '1') !== '1') return;
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.focus();
    return;
  }
  const assetDir = resolveAssetDir();
  const html = path.join(assetDir, 'updater-window.html');
  const preload = path.join(assetDir, 'updater-window.preload.cjs');
  if (!fs.existsSync(html)) {
    updaterLog.warn(
      `updater-window.html missing (looked in ${assetDir}) — using notifications only`
    );
    return;
  }
  updaterWindow = new BrowserWindow({
    width: 460,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'تحديث NuqtaPlus',
    parent: ctx?.mainWindow && !ctx.mainWindow.isDestroyed() ? ctx.mainWindow : undefined,
    modal: false,
    show: false,
    webPreferences: {
      preload: fs.existsSync(preload) ? preload : undefined,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  updaterWindow.removeMenu();
  updaterWindow
    .loadFile(html)
    .catch((err) => updaterLog.warn(`updater window load: ${err.message}`));
  updaterWindow.once('ready-to-show', () => {
    updaterWindow.show();
    // push the current snapshot immediately so the window is never blank
    broadcast(machine.snapshot());
  });
  updaterWindow.on('closed', () => {
    updaterWindow = null;
  });
}

/**
 * Resolve the directory holding the native window assets (HTML + .cjs preload).
 * After esbuild bundles updater.main.js into dist-electron/main, __dirname no
 * longer points at the source, so we check the packaged resources location and
 * the dev source tree, falling back to __dirname.
 */
function resolveAssetDir() {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, 'updater') : null,
    path.join(app.getAppPath(), 'electron', 'updater'),
    path.resolve(app.getAppPath(), '..', 'electron', 'updater'),
    __dirname,
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'updater-window.html'))) return dir;
    } catch {
      /* ignore */
    }
  }
  return __dirname;
}

/** Push the snapshot to every renderer (main window + native updater window). */
function broadcast(snapshot) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(UPDATER_EVENT_CHANNEL, snapshot);
    } catch {
      /* a window mid-teardown — skip */
    }
  }
}

// ── internals ────────────────────────────────────────────────────────────────

function fail(message) {
  updaterLog.error(message);
  if (machine && machine.canTransition(STATES.FAILED)) {
    machine.transition(STATES.FAILED, { error: message });
  } else if (machine) {
    machine.patch({ error: message });
  }
}

function clearMarker() {
  try {
    if (installMarkerPath && fs.existsSync(installMarkerPath)) fs.unlinkSync(installMarkerPath);
  } catch {
    /* ignore */
  }
}

function shortReason(code) {
  const map = {
    [SERVICE_EXIT.NOT_INSTALLED]: 'service not installed',
    [SERVICE_EXIT.TIMEOUT]: 'timeout',
    [SERVICE_EXIT.ACCESS_DENIED]: 'access denied',
    [SERVICE_EXIT.STOP_PENDING_STUCK]: 'stuck stopping',
    [SERVICE_EXIT.START_FAILED]: 'start failed',
    [SERVICE_EXIT.CONFIG_FAILED]: 'config failed',
  };
  return map[code] || `code ${code}`;
}

function githubReleaseUrl(version) {
  if (!version || config?.mode !== 'github') return '';
  // owner/repo are in app-update.yml; we link to the tag page for release notes.
  return `https://github.com/TariqAli93/nuqta-plus-full/releases/tag/v${version}`;
}
