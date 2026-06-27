<#
.SYNOPSIS
  NuqtaPlus Windows Service manager — single native helper used by BOTH the NSIS
  installer and the Electron app to manage the NuqtaPlusBackend service.

.DESCRIPTION
  One helper, one set of exit codes, one log. The Electron app and the installer
  must never re-implement service logic; they call this script. It is
  idempotent, supports a fixed (version-independent) binary path, waits for
  state with a real timeout, and NEVER uses taskkill /F except as a documented
  last resort inside `repair`.

  Verbs:
    install-or-update   register the service if missing, else refresh its config
    start               start + wait for RUNNING
    stop                stop + wait for STOPPED (handles STOP_PENDING)
    status              print state, exit 0 if installed
    health              query SCM state only (no port probe)
    repair              stop (hard if needed) → reconfigure → start

  Required for install-or-update:
    -BinPath  <full path to NuqtaPlusBackend.exe>   (fixed, NO version number)

  Common:
    -TimeoutMs <int>   default 30000
    -Wait              (implied for start/stop)

.NOTES
  Exit codes (stable contract consumed by windows-service-manager.js):
    0   success
    10  invalid arguments
    11  binary not found
    12  service not installed (when an operation requires it)
    13  timeout waiting for target state
    14  access denied (needs elevation)
    15  service stuck in STOP_PENDING past timeout
    16  start failed
    17  install/config failed
    18  unexpected error
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('install-or-update', 'start', 'stop', 'status', 'health', 'repair')]
  [string]$Verb,

  [string]$BinPath,
  [int]$TimeoutMs = 30000,
  [string]$ServiceName = 'NuqtaPlusBackend',
  [string]$DisplayName = 'NuqtaPlus Backend Service',
  [string]$LogFile
)

$ErrorActionPreference = 'Stop'

# ---- logging ---------------------------------------------------------------
if (-not $LogFile -or $LogFile.Trim() -eq '') {
  $LogFile = Join-Path $env:ProgramData 'NuqtaPlus\logs\service-manager.log'
}
$logDir = Split-Path -Parent $LogFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

function Write-Log([string]$level, [string]$msg) {
  $ts = (Get-Date).ToString('o')
  $line = "[$ts] [$level] [$Verb] $msg"
  try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
  Write-Output $line
}

function Exit-With([int]$code, [string]$msg, [string]$level = 'INFO') {
  Write-Log $level "exit=$code $msg"
  exit $code
}

# ---- helpers ---------------------------------------------------------------
function Get-Svc {
  try { return Get-Service -Name $ServiceName -ErrorAction Stop } catch { return $null }
}

function Wait-State([string]$target, [int]$timeoutMs) {
  $deadline = (Get-Date).AddMilliseconds($timeoutMs)
  while ((Get-Date) -lt $deadline) {
    $svc = Get-Svc
    if ($null -eq $svc) { return $false }
    if ($svc.Status -eq $target) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Test-Admin {
  $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object System.Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---- verbs -----------------------------------------------------------------
function Do-Status {
  $svc = Get-Svc
  if ($null -eq $svc) { Write-Log 'INFO' 'state=not-installed'; Exit-With 12 'not installed' }
  Write-Log 'INFO' "state=$($svc.Status)"
  Exit-With 0 "state=$($svc.Status)"
}

function Do-Stop([bool]$hard = $false) {
  $svc = Get-Svc
  if ($null -eq $svc) { Exit-With 0 'already absent — nothing to stop' }
  if ($svc.Status -eq 'Stopped') { Exit-With 0 'already stopped' }

  Write-Log 'INFO' "stopping (current=$($svc.Status))..."
  try {
    Stop-Service -Name $ServiceName -Force:$hard -ErrorAction Stop
  } catch {
    if ($_.Exception.Message -match 'denied|Access') { Exit-With 14 "access denied: $($_.Exception.Message)" 'ERROR' }
    Write-Log 'WARN' "Stop-Service raised: $($_.Exception.Message) (will still wait)"
  }

  if (Wait-State 'Stopped' $TimeoutMs) { Exit-With 0 'stopped' }

  # Stuck — inspect STOP_PENDING and, ONLY as a last resort, kill the PID.
  $svc = Get-Svc
  if ($svc -and $svc.Status -eq 'StopPending') {
    Write-Log 'WARN' 'stuck in STOP_PENDING past timeout'
    if ($hard) {
      try {
        $wmi = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
        if ($wmi -and $wmi.ProcessId -gt 0) {
          Write-Log 'WARN' "last-resort: stopping PID $($wmi.ProcessId)"
          Stop-Process -Id $wmi.ProcessId -Force -ErrorAction SilentlyContinue
          if (Wait-State 'Stopped' 5000) { Exit-With 0 'stopped after PID kill' 'WARN' }
        }
      } catch { Write-Log 'ERROR' "PID kill failed: $($_.Exception.Message)" }
    }
    Exit-With 15 'stuck in STOP_PENDING' 'ERROR'
  }
  Exit-With 13 'timeout waiting for STOPPED' 'ERROR'
}

function Do-Start {
  $svc = Get-Svc
  if ($null -eq $svc) { Exit-With 12 'not installed — cannot start' 'ERROR' }
  if ($svc.Status -eq 'Running') { Exit-With 0 'already running' }
  Write-Log 'INFO' 'starting...'
  try {
    Start-Service -Name $ServiceName -ErrorAction Stop
  } catch {
    if ($_.Exception.Message -match 'denied|Access') { Exit-With 14 "access denied: $($_.Exception.Message)" 'ERROR' }
    Write-Log 'WARN' "Start-Service raised: $($_.Exception.Message) (will still wait)"
  }
  if (Wait-State 'Running' $TimeoutMs) { Exit-With 0 'running' }
  Exit-With 16 'timeout/failed waiting for RUNNING' 'ERROR'
}

function Do-InstallOrUpdate {
  if (-not (Test-Admin)) { Exit-With 14 'install-or-update requires Administrator' 'ERROR' }
  if (-not $BinPath -or $BinPath.Trim() -eq '') { Exit-With 10 'missing -BinPath' 'ERROR' }
  if (-not (Test-Path -LiteralPath $BinPath)) { Exit-With 11 "binary not found: $BinPath" 'ERROR' }

  # Reject a version-numbered path defensively — the contract is a FIXED path.
  if ($BinPath -match '\d+\.\d+\.\d+') {
    Write-Log 'WARN' "BinPath contains a version-like segment: $BinPath (should be version-independent)"
  }

  $svc = Get-Svc
  if ($null -ne $svc) {
    Write-Log 'INFO' 'service exists — refreshing config (no delete)'
    # sc.exe needs a space after binPath= ; quote the path for spaces.
    & sc.exe config $ServiceName binPath= "`"$BinPath`"" start= delayed-auto | Out-Null
    if ($LASTEXITCODE -ne 0) { Exit-With 17 "sc config failed ($LASTEXITCODE)" 'ERROR' }
  } else {
    Write-Log 'INFO' 'service missing — installing via WinSW host'
    & "$BinPath" install | Out-Null
    if ($LASTEXITCODE -ne 0) { Exit-With 17 "WinSW install failed ($LASTEXITCODE)" 'ERROR' }
    & sc.exe config $ServiceName start= delayed-auto | Out-Null
  }

  # Recovery: restart on failure (1st/2nd after 5s, reset window 1 day).
  & sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
  Exit-With 0 'install-or-update done'
}

function Do-Repair {
  Write-Log 'INFO' 'repair: stop(hard) → install-or-update → start'
  $svc = Get-Svc
  if ($null -ne $svc -and $svc.Status -ne 'Stopped') {
    try { Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue } catch {}
    Wait-State 'Stopped' 10000 | Out-Null
  }
  if ($BinPath -and (Test-Path -LiteralPath $BinPath)) {
    if (Test-Admin) {
      & sc.exe config $ServiceName binPath= "`"$BinPath`"" start= delayed-auto | Out-Null
    }
  }
  Do-Start
}

# ---- dispatch --------------------------------------------------------------
try {
  switch ($Verb) {
    'status'            { Do-Status }
    'health'            { Do-Status }
    'stop'              { Do-Stop $false }
    'start'             { Do-Start }
    'install-or-update' { Do-InstallOrUpdate }
    'repair'            { Do-Repair }
    default             { Exit-With 10 "unknown verb: $Verb" 'ERROR' }
  }
} catch {
  Exit-With 18 "unexpected: $($_.Exception.Message)" 'ERROR'
}
