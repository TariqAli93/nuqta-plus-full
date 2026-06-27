# UpdaterV2 — Architecture

A clean, isolated, opt-in update subsystem. It does **not** patch the legacy
updater; it lives beside it and takes over only when `UPDATER_V2=1`, so exactly
one update path is ever active at runtime.

## Why a rewrite

The legacy path worked but had no visibility into differential-vs-full, no
state machine, mixed service logic across NSIS + Electron + ad-hoc scripts, and
no dev test harness. UpdaterV2 fixes all of that with a single state machine, a
single native service helper, native UX, and a local update server for testing.

## File map

```
frontend/electron/updater/
  index.js                     public entry: startUpdaterV2(), isUpdaterV2Enabled()
  updater.events.js            STATES, TRANSITIONS, DOWNLOAD_MODE, IPC channel names
  updater.types.js             JSDoc typedefs (no runtime)
  updater.state.js             finite state machine (pure, unit-tested)
  updater.config.js            env → frozen config (pure, unit-tested)
  updater.logger.js            updater.log / service-manager.log / installer.log / update-health.log
  updater.providers.js         electron-updater feed wiring (github | dev local)
  updater.main.js              orchestrator: lifecycle, native UX, differential telemetry,
                               pre-install backup, maintenance, post-update verification
  updater.ipc.js               renderer→main command handlers
  updater-window.html          NATIVE fixed-size update dialog (no Vue, no web layout)
  updater-window.preload.cjs   minimal sandbox-safe bridge for that window
  __tests__/                   node:test unit tests

frontend/electron/services/
  windows-service-manager.js   JS wrapper around service-manager.ps1 (execFile, no shell)
  backend-health-check.js      strict /health + /version verification
  maintenance-mode.js          userData maintenance flag (backend reads it)
  pre-update-backup.js         pre-install backup + manifest + checksum validation

build/service-manager/
  service-manager.ps1          the ONE native Windows Service helper (stable exit codes)
  README.md
build/installer.nsh            clean NSIS that delegates to service-manager.ps1 (drop-in)

scripts/update/
  run-local-update-server.js   dev update server with HTTP Range support
  validate-release-assets.js   release payload validator (local folder or GitHub)

docs/updater-architecture.md | updater-test-plan.md | updater-release-checklist.md
```

## Lifecycle (state machine)

```
idle → checking → update-available → downloading → downloaded → ready-to-install
     → installing → (app quits into NSIS) → [relaunch]
     → service-starting → health-checking → completed
                                          ↘ failed (from any active state)
```

Illegal transitions throw (e.g. `installing` before `downloaded`). The Windows
Service is **protected** (never stopped) in: idle, checking, update-available,
downloading, downloaded, ready-to-install. It stops only at `installing`, inside
the NSIS installer.

## Who stops/starts the service — and when

| Phase | Actor | Action |
|---|---|---|
| download | nobody | service keeps running |
| install begins | NSIS `customUnInstall --updated` | **stop only**, registration preserved |
| files installed | NSIS `customInstall` → `service-manager install-or-update` + `start` | reconfigure + start + wait RUNNING |
| relaunch | Electron `runPostUpdateVerification()` | verify RUNNING; `repair` once if not |
| success | Electron | only after strict `/health` passes |

We never rely on code after `quitAndInstall()` to start the service.

## Differential telemetry

electron-updater decides differential-vs-full internally. The orchestrator
bridges its logger and parses two signals:
- `Download block maps …` → differential **attempt**
- `Cannot download differentially, fallback to full download: <reason>` → fallback + reason

These drive `download.mode` / `download.fallbackReason` in the snapshot and the
`updater.log` lines (`differential ATTEMPT`, `FALLBACK to full download`). At
completion we also compute `savedBytes`/`pctSaved` from transferred-vs-full.

## Native UX (req #8)

- Windows toast **notifications** (Electron `Notification`) on available/ready/completed.
- **Taskbar progress** (`win.setProgressBar`) during download.
- A **native fixed-size dialog window** (`updater-window.html`, 460×380, no menu,
  no sidebar, system font, RTL) — not a Vue page. It talks over a minimal preload.
- The main Vue app may also subscribe via `window.updaterV2` for a floating chip.

## Server vs Client mode

- **Server**: manages the Windows Service, runs post-update service verify +
  health, supports pre-install backup, honors maintenance mode.
- **Client**: never touches a local service or DB; `runPostUpdateVerification`
  skips the service step and only health-checks reachability/version.

## Enabling

```
# .env / environment
UPDATER_V2=1                 # take over from legacy (default off)
UPDATER_MODE=github|dev      # default github
UPDATER_DEV_URL=http://localhost:7070
UPDATER_CHANNEL=stable|beta  # default stable
UPDATER_NATIVE_WINDOW=1      # default on
UPDATER_REQUIRE_BACKUP=1     # gate install on a verified backup (server, default off)
UPDATER_DISABLE_DIFFERENTIAL=1  # diagnostic only
```
