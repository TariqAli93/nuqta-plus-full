# UpdaterV2 — Test Plan

## A. Fast local checks (no packaging) — run these now

```bash
pnpm update:test            # state machine + config unit tests (12 tests)
pnpm update:validate        # validates ./release payload (latest.yml + exe + blockmap + sha512)
pnpm update:server          # serves dev-updates/ with HTTP Range support
```

`update:server` proves Range support (electron-updater differential needs it):

```bash
curl -D - -H "Range: bytes=2-5" http://localhost:7070/<asset>.exe
# → HTTP/1.1 206 Partial Content, Content-Range: bytes 2-5/<size>
```

## B. Dev end-to-end update (local server, no GitHub) — req #7

```text
1. Build 1.0.17:  bump version to 1.0.17 → pnpm package:server
2. Install 1.0.17 (run release/NuqtaPlus-Server-Setup-1.0.17.exe). Create real data.
3. Build 1.0.18:  bump version to 1.0.18 → pnpm package:server
4. Copy these into dev-updates/ :
     latest.yml
     NuqtaPlus-Server-Setup-1.0.17.exe(.blockmap)   ← keep the old pair for differential
     NuqtaPlus-Server-Setup-1.0.18.exe(.blockmap)
5. pnpm update:server
6. Launch the installed 1.0.17 with:
     UPDATER_V2=1 UPDATER_MODE=dev UPDATER_DEV_URL=http://localhost:7070
7. Watch %APPDATA%\NuqtaPlus\logs\updater.log
8. Native dialog: Download → progress (mode badge + speed + ETA) → Install now
9. After relaunch: service-starting → health-checking → completed toast
10. Confirm data, service RUNNING, /health backendVersion=1.0.18
```

## C. Coverage matrix

| # | Scenario | How | Expected | Evidence |
|---|---|---|---|---|
| 1 | dev local 1.0.17→1.0.18 | section B | completed | updater.log |
| 2 | GitHub 1.0.17→1.0.18 | publish:server | completed | updater.log |
| 3 | UI-only change | rebuild front only | small differential | `savedBytes` high |
| 4 | Backend change | rebuild backend | differential | updater.log |
| 5 | Service change | new WinSW xml | service repaired if needed | service-manager.log |
| 6 | Migration update | schema change | migrations=up-to-date in /health | update-health.log |
| 7 | Differential success | keep old blockmap | `differential ATTEMPT` | updater.log |
| 8 | Fallback to full | delete old .blockmap | `FALLBACK to full download` + reason | updater.log |
| 9 | Bad latest.yml | corrupt file | check fails, state=failed | updater.log |
| 10 | sha512 mismatch | tamper exe | electron-updater rejects | updater.log |
| 11 | Missing asset | remove exe | check/download fails clearly | updater.log |
| 12 | Private repo/token | no token | clear error, no crash | updater.log |
| 13 | Service running during download | observe | service stays RUNNING | service-manager.log |
| 14 | Service stops only at install | observe | first stop = NSIS phase | installer.log |
| 15 | Service starts after install | observe | RUNNING post-install | service-manager.log |
| 16 | Health check fail | block /health | state=failed, no success toast | update-health.log |
| 17 | Backend port busy | occupy 41732 | health fail, actionable error | update-health.log |
| 18 | Orphan backend | stale node.exe | reconcile/repair | service-manager.log |
| 19 | Path with spaces | install to "C:\Program Files\..." | works (argv, no shell) | service-manager.log |
| 20 | Username with spaces | such a user | works | service-manager.log |
| 21 | Program Files install | perMachine | works | installer.log |
| 22 | Per-user install | (server is perMachine) | n/a / documented | — |
| 23 | Server mode | default | full flow | updater.log |
| 24 | Client mode | client build | no service/DB ops | updater.log |
| 25 | Windows restart mid-update | reboot | marker drives verify on next boot | updater.log |
| 26 | Update twice | back-to-back | second is differential | updater.log |
| 27 | Rollback/recovery | force health fail | repair attempt, no false success | update-health.log |
| 28 | Data preserved | check DB rows | intact | manual |
| 29 | License preserved | check license | intact | manual |
| 30 | Service survives reboot | reboot | RUNNING (delayed-auto) | service-manager.log |

## D. What is verified in CI vs on Windows

- **Verified here (CI-able):** unit tests, release validation, dev server Range,
  lint, PowerShell parse, syntax of every module.
- **Must be run on a real Windows host (packaged):** rows 1–30 above — anything
  touching the NSIS installer, the SCM, signing, and quitAndInstall.
