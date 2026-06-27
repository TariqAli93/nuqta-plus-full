; ============================================================================
; installer.nsh  (UpdaterV2 — clean NSIS integration)
;
; Drop-in replacement for scripts/installer-include.nsh that delegates ALL
; service logic to the single native helper shipped at
;   $INSTDIR\resources\service-manager\service-manager.ps1
; instead of inlining sc.exe/WinSW calls. One helper, one log, one contract.
;
; NOT yet wired into electron-builder.yml — switch `nsis.include` to this file
; only when you flip UPDATER_V2 on by default (see docs/updater-release-checklist.md).
; Until then the production installer keeps using installer-include.nsh.
;
; Service rules (unchanged, critical):
;   - customInstall (first install AND update): install-or-update → start → wait.
;   - customUnInstall during an UPDATE (${isUpdated}): STOP only, never delete.
;   - customUnInstall on a real uninstall: stop + remove the service.
;   - NEVER deletes PostgreSQL data, userData, images, or backups.
; ============================================================================

!define NUQTA_PS '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File'
!define NUQTA_SM '$INSTDIR\resources\service-manager\service-manager.ps1'
!define NUQTA_SVC_BIN '$INSTDIR\resources\backend\NuqtaPlusBackend.exe'

!macro NuqtaRunServiceManager VERB EXTRA
  IfFileExists "${NUQTA_SM}" 0 +3
    nsExec::ExecToLog '${NUQTA_PS} "${NUQTA_SM}" ${VERB} ${EXTRA}'
    Pop $0
!macroend

; ----------------------------------------------------------------------------
; customInstall — install/refresh the service then start + wait for RUNNING.
; Runs elevated (perMachine). A failed start is logged but never aborts the
; install; the Electron post-update verification repairs on next launch.
; ----------------------------------------------------------------------------
!macro customInstall
  DetailPrint "[NuqtaPlus] configuring backend service via service-manager..."
  !insertmacro NuqtaRunServiceManager "install-or-update" '-BinPath "${NUQTA_SVC_BIN}" -TimeoutMs 35000'
  DetailPrint "[NuqtaPlus] starting backend service..."
  !insertmacro NuqtaRunServiceManager "start" '-TimeoutMs 30000'
  IntCmp $0 0 +2 0 0
    DetailPrint "[NuqtaPlus] WARNING: service start returned $0 — Electron self-heal will retry"
!macroend

; ----------------------------------------------------------------------------
; customUnInstall — STOP on update (preserve registration); fully remove only
; on a real uninstall. Never touches user data.
; ----------------------------------------------------------------------------
!macro customUnInstall
  ${if} ${isUpdated}
    DetailPrint "[NuqtaPlus] update — stopping service, PRESERVING registration"
    !insertmacro NuqtaRunServiceManager "stop" '-TimeoutMs 30000'
  ${else}
    DetailPrint "[NuqtaPlus] uninstall — stopping and removing service"
    !insertmacro NuqtaRunServiceManager "stop" '-TimeoutMs 30000'
    IfFileExists "${NUQTA_SVC_BIN}" 0 +3
      nsExec::ExecToLog '"${NUQTA_SVC_BIN}" uninstall'
      Pop $0
    nsExec::ExecToLog 'sc.exe delete "NuqtaPlusBackend"'
    Pop $0
    ; NOTE: deliberately NO deletion of resources\backend data, %PROGRAMDATA%,
    ; userData, images, or backups — user data outlives the program files.
  ${endif}
!macroend
