# service-manager.ps1

The single native helper that manages the `NuqtaPlusBackend` Windows Service.
Used by **both** the NSIS installer (`build/installer.nsh`) and the Electron app
(`frontend/electron/services/windows-service-manager.js`). One helper, one log,
one set of exit codes — no service logic is duplicated anywhere else.

## Usage

```powershell
service-manager.ps1 install-or-update -BinPath "C:\Program Files\NuqtaPlus\resources\backend\NuqtaPlusBackend.exe" -TimeoutMs 35000
service-manager.ps1 start  -TimeoutMs 30000
service-manager.ps1 stop   -TimeoutMs 30000
service-manager.ps1 status
service-manager.ps1 repair -BinPath "...\NuqtaPlusBackend.exe"
```

`-BinPath` must be a **fixed, version-independent** path (no version number in it).

## Exit codes (stable contract)

| Code | Meaning |
|---|---|
| 0 | success |
| 10 | invalid arguments |
| 11 | binary not found |
| 12 | service not installed (when required) |
| 13 | timeout waiting for target state |
| 14 | access denied (needs elevation) |
| 15 | stuck in STOP_PENDING past timeout |
| 16 | start failed |
| 17 | install/config failed |
| 18 | unexpected error |

## Behavior notes

- Idempotent: `install-or-update` refreshes config if the service exists, else
  installs via the WinSW host; never creates duplicates.
- `stop` waits for STOPPED and handles STOP_PENDING; it uses `taskkill`/PID-kill
  **only** as a last resort inside the `-Force` path after the timeout.
- Recovery options (restart-on-failure) are configured on install.
- Logs to `%ProgramData%\NuqtaPlus\logs\service-manager.log` (override with `-LogFile`).
- Shipped to `resources/service-manager/service-manager.ps1` via electron-builder
  `extraResources` (server build only — clients have no local service).
