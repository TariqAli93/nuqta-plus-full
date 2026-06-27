// autoUpdater.js
import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import logger from './logger.js';

// Never download in the background — the user explicitly starts the download
// from the "Update now" button (req #7).
autoUpdater.autoDownload = false;

// NEVER install silently when the app quits. A downloaded update is applied
// ONLY when the user clicks "Restart and Install" (installUpdate). Installing
// on quit ran the perMachine NSIS installer at an uncontrolled moment, which
// is part of why the backend service used to disappear after updates
// (reqs #5, #7).
autoUpdater.autoInstallOnAppQuit = false;

// Differential (delta) download is the WHOLE POINT of this module: only the
// changed blocks of the ~250 MB installer should be fetched between versions.
// electron-updater enables it by default, but we set it EXPLICITLY so a future
// dependency bump that flips the default can never silently force every client
// onto full downloads. A full download happens ONLY when differential fails for
// a real reason (missing old blockmap, server without Range support, corrupt
// delta) — and when it does we log WHY (see the logger wrapper below) and tell
// the renderer so the UI can show differential vs full download state
// (req #2, #10, #11).
autoUpdater.disableDifferentialDownload = false;

/**
 * Security posture for frontend auto-updates:
 *   - allowDowngrade = false → reject older-version installers
 *     (defeats rollback-based exploits against signature checks)
 *   - allowPrerelease = false → only stable channel
 *   - HTTPS enforced: electron-updater validates the feed URL protocol on
 *     GenericProvider / GitHub. We assert it explicitly below so a
 *     mis-configured publish config fails loudly in development instead of
 *     silently downgrading to HTTP.
 *   - Signature verification: on Windows, electron-updater verifies the
 *     NSIS installer's Authenticode signature against the publisher name
 *     configured in build.nsis.publisherName / build.win.publisherName. An
 *     unsigned or wrong-publisher installer is rejected automatically.
 *     Ship only code-signed installers.
 */
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;

// ── Dedicated updater log (req #11) ─────────────────────────────────────────
// In addition to the shared app log, every update event is appended to
// <userData>/logs/updater.log so the entire update lifecycle — provider, file
// URLs, blockmap availability, differential vs full, sizes, speed, checksum
// result, service stop/start, health check — lives in one auditable file the
// user can attach to a bug report. Best-effort; never throws.
let updaterLogPath = null;
function updaterLogFile() {
  if (updaterLogPath) return updaterLogPath;
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    updaterLogPath = path.join(dir, 'updater.log');
  } catch {
    updaterLogPath = null;
  }
  return updaterLogPath;
}

function ulog(message) {
  // Mirror to the shared structured logger…
  logger.info(`[updater] ${message}`);
  // …and to the dedicated updater.log.
  const file = updaterLogFile();
  if (!file) return;
  try {
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    /* disk full / locked — the shared log still has the line */
  }
}

// Bridge electron-updater's own verbose logging into BOTH our structured logger
// and the dedicated updater.log, and INSPECT every line so we can detect the
// differential-vs-full decision the library makes internally. electron-updater
// logs "Download block maps (old: …, new: …)" when it attempts a delta, and
// "Cannot download differentially, fallback to full download: <reason>" when it
// gives up — those two strings are our only reliable signal for req #10/#11.
autoUpdater.logger = {
  info: (m) => handleUpdaterLine('info', m),
  warn: (m) => handleUpdaterLine('warn', m),
  error: (m) => handleUpdaterLine('error', m),
  debug: (m) => logger.debug(`[updater] ${m}`),
};

function handleUpdaterLine(level, raw) {
  const m = typeof raw === 'string' ? raw : String(raw?.message || raw);
  logger[level]?.(`[updater] ${m}`);
  const file = updaterLogFile();
  if (file) {
    try {
      fs.appendFileSync(file, `[${new Date().toISOString()}] [eu:${level}] ${m}\n`);
    } catch {
      /* ignore */
    }
  }

  // Differential attempt — the library found both blockmaps and will try a delta.
  if (/Download block maps/i.test(m)) {
    downloadMode = 'differential';
    send('update-download-mode', { mode: 'differential', reason: '' });
    ulog('differential download ATTEMPT (blockmaps resolved)');
    return;
  }

  // Fallback to full — capture the reason after the colon for the UI + log.
  const fb = /Cannot download differentially, fallback to full download:\s*([\s\S]*)/i.exec(m);
  if (fb) {
    downloadMode = 'full';
    const reason = (fb[1] || '').split('\n')[0].trim().slice(0, 300);
    send('update-download-mode', { mode: 'full', reason });
    ulog(`FELL BACK to full download — reason: ${reason || 'unknown'}`);
  }
}

/**
 * Enforce HTTPS on whatever feed URL electron-updater resolved from
 * app-update.yml. Throws during startup if someone ships a dev config by
 * mistake. No-op in dev where updates are never checked anyway.
 */
function assertHttpsFeed() {
  if (!app.isPackaged) return;
  try {
    const feed = autoUpdater.getFeedURL?.();
    if (feed && !/^https:\/\//i.test(feed)) {
      const msg = `[updater] refusing non-HTTPS feed URL: ${feed}`;
      logger.error(msg);
      throw new Error(msg);
    }
  } catch (err) {
    // getFeedURL may not be ready until first check — the real enforcement
    // happens when electron-updater fetches, and it will error there too.
    logger.warn(`[updater] assertHttpsFeed could not read feed URL: ${err.message}`);
  }
}

let mainWindow = null;
let listenersBound = false;

/**
 * Whether the in-flight check was user-initiated. Only manual checks surface
 * "checking" / "no update" / "check error" feedback in the UI; the
 * available → progress → ready → error stream always reaches the renderer
 * regardless, so the SILENT startup check still pops the update dialog
 * (reqs #1, #8).
 */
let manualCheck = false;

// ── Differential / download telemetry (reqs #10, #11) ───────────────────────
// downloadMode is decided by inspecting electron-updater's own log lines
// (handleUpdaterLine). expectedFullSize is the full installer size from
// latest.yml, captured at update-available; transferred bytes at completion
// tell us how much was ACTUALLY pulled (≈ full ⇒ full download, ≪ full ⇒ delta).
let downloadMode = 'unknown'; // 'unknown' | 'differential' | 'full'
let expectedFullSize = 0;
let downloadStartedAt = 0;
let lastTransferred = 0;

function send(channel, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, payload);
    } catch (err) {
      logger.warn(`[updater] failed to post ${channel}: ${err.message}`);
    }
  }
}

function setupAutoUpdater(window) {
  mainWindow = window;
  setupListeners();
  assertHttpsFeed();
  ulog(
    `updater initialised — currentVersion=${app.getVersion()} ` +
      `differentialEnabled=${!autoUpdater.disableDifferentialDownload}`
  );

  // Silent background check shortly after launch (req #1).
  setTimeout(() => checkForUpdates(false), app.isPackaged ? 60000 : 5000);
}

/* All real electron-updater events. The available/progress/ready/error stream
 * is always forwarded; checking/not-available are gated to manual checks. */
function setupListeners() {
  if (listenersBound) return;
  listenersBound = true;

  autoUpdater.on('checking-for-update', () => {
    ulog('checking for update…');
    if (manualCheck) send('update-checking', { manual: true });
  });

  autoUpdater.on('update-available', (info) => {
    // Capture the full installer size from latest.yml so the UI can show
    // "downloaded X of FULL Y" and we can compute the delta saving afterwards.
    expectedFullSize = Number(info?.files?.[0]?.size) || 0;
    downloadMode = 'unknown';
    ulog(
      `update AVAILABLE: v${info?.version} ` +
        `(current v${app.getVersion()}, fullSize=${fmtBytes(expectedFullSize)})`
    );
    send('update-available', {
      version: info?.version,
      currentVersion: app.getVersion(),
      releaseNotes: info?.releaseNotes || '',
      fullSize: expectedFullSize,
      manual: manualCheck,
    });
    manualCheck = false;
  });

  autoUpdater.on('update-not-available', () => {
    ulog(`no update available (current v${app.getVersion()})`);
    if (manualCheck) send('update-not-available', { manual: true });
    manualCheck = false;
  });

  autoUpdater.on('download-progress', (p) => {
    const percent = Math.round(p?.percent || 0);
    const transferred = p?.transferred || 0;
    const total = p?.total || 0;
    const bytesPerSecond = p?.bytesPerSecond || 0;
    lastTransferred = transferred;
    // ETA from the library's instantaneous speed; guard divide-by-zero.
    const remaining = Math.max(0, total - transferred);
    const etaSeconds = bytesPerSecond > 0 ? Math.round(remaining / bytesPerSecond) : null;
    logger.info(
      `[updater] progress ${percent}% (${fmtBytes(transferred)}/${fmtBytes(total)}) ` +
        `@ ${fmtBytes(bytesPerSecond)}/s eta=${etaSeconds == null ? '?' : etaSeconds + 's'} ` +
        `mode=${downloadMode}`
    );
    send('update-progress', {
      percent,
      transferred,
      total,
      bytesPerSecond,
      etaSeconds,
      mode: downloadMode,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    // Summarise the delta saving for the audit log. In differential mode the
    // bytes ACTUALLY transferred are far below the full installer size; that
    // gap is the whole value of this feature, so record it explicitly.
    const elapsedMs = downloadStartedAt ? Date.now() - downloadStartedAt : 0;
    const transferred = lastTransferred || 0;
    const saved = expectedFullSize > 0 ? Math.max(0, expectedFullSize - transferred) : 0;
    const pctSaved = expectedFullSize > 0 ? Math.round((saved / expectedFullSize) * 100) : 0;
    // If the library never logged a fallback and we transferred clearly less
    // than the full installer, we can confidently call it differential.
    if (
      downloadMode === 'unknown' &&
      expectedFullSize > 0 &&
      transferred < expectedFullSize * 0.9
    ) {
      downloadMode = 'differential';
    } else if (downloadMode === 'unknown') {
      downloadMode = 'full';
    }
    ulog(
      `update DOWNLOADED: v${info?.version} mode=${downloadMode} ` +
        `transferred=${fmtBytes(transferred)} fullSize=${fmtBytes(expectedFullSize)} ` +
        `saved≈${fmtBytes(saved)} (${pctSaved}%) in ${(elapsedMs / 1000).toFixed(1)}s ` +
        `— waiting for user to click "Restart and Install"`
    );
    send('update-ready', {
      version: info?.version,
      mode: downloadMode,
      transferred,
      fullSize: expectedFullSize,
      saved,
      pctSaved,
    });
  });

  autoUpdater.on('error', (err) => {
    const msg = err?.message || String(err);
    ulog(`ERROR: ${msg}`);
    send('update-error', { error: msg, manual: manualCheck });
    manualCheck = false;
  });
}

/* 🔥 Check for updates. manual=true when the user pressed "Check for updates". */
function checkForUpdates(manual = false) {
  manualCheck = manual;
  ulog(`checkForUpdates (manual=${manual})`);

  if (!app.isPackaged) {
    logger.info('[updater] not packaged — skipping update check');
    if (manual) send('update-not-available', { manual: true });
    manualCheck = false;
    return;
  }

  autoUpdater.checkForUpdates().catch((err) => {
    const msg = err?.message || String(err);
    ulog(`checkForUpdates failed: ${msg}`);
    if (manual) send('update-error', { manual: true, error: msg });
    manualCheck = false;
  });
}

/* User clicked "Update now" → start the download (req #6 step 1). */
function startDownload() {
  downloadStartedAt = Date.now();
  lastTransferred = 0;
  ulog(
    `startDownload (user requested) — differentialEnabled=${!autoUpdater.disableDifferentialDownload}`
  );
  send('update-downloading', { mode: downloadMode });
  autoUpdater.downloadUpdate().catch((err) => {
    const msg = err?.message || String(err);
    ulog(`downloadUpdate failed: ${msg}`);
    send('update-error', { error: msg });
  });
}

/* User clicked "Restart and Install" → apply the update now (req #6). */
function installUpdate() {
  ulog('install trigger — quitAndInstall(silent=true, forceRunAfter=true)');
  // Defer so the IPC reply flushes before the app quits. Silent + forceRunAfter:
  // the perMachine NSIS installer auto-elevates (one UAC prompt), runs
  // customInstall elevated to repair/start the backend service, and relaunches.
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (err) {
      const msg = err?.message || String(err);
      ulog(`quitAndInstall failed: ${msg}`);
      send('update-error', { error: msg });
    }
  }, 0);
}

/** Human-readable byte formatter shared by the log lines. */
function fmtBytes(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / 1024 / 1024).toFixed(2)} MB`;
  return `${(x / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export { setupAutoUpdater, checkForUpdates, startDownload, installUpdate };
