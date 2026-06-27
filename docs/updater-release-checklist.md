# UpdaterV2 — Release Checklist

## Before publishing a release

- [ ] Version bumped consistently (`pnpm verify:versions`).
- [ ] `pnpm update:test` green.
- [ ] Build: `pnpm package:server` (and `package:client` if shipping client).
- [ ] `pnpm update:validate --dir release` passes (latest.yml + exe + **blockmap** + sha512).
- [ ] Code-signing applied (Authenticode) so electron-updater signature check passes.

## Publishing to GitHub Releases

- [ ] `pnpm publish:server` (electron-builder uploads exe + **exe.blockmap** + latest.yml).
- [ ] `pnpm update:validate:github` passes (asset set complete; not draft).
- [ ] **Do NOT delete the previous release's `.exe.blockmap`** — differential needs
      the old blockmap. Keep at least the last 2 releases' assets.
- [ ] Release is not a draft; prerelease only on the beta channel.

## Differential health (how to confirm it actually worked)

After a client updates, check its `%APPDATA%\NuqtaPlus\logs\updater.log`:

- `differential ATTEMPT (blockmaps resolved)` → delta path taken.
- `update DOWNLOADED … mode=differential … savedBytes=… pctSaved=…` → success.
- `FALLBACK to full download — reason: …` → why it could not delta.

> First update after a **manual** install is always a full download (no cached
> old installer to diff against). Updates installed *via the updater* are
> differential thereafter. This is electron-updater behavior, not a bug.

## Migration: turning UpdaterV2 on by default

UpdaterV2 ships **off** (`UPDATER_V2` unset → legacy updater runs). To migrate:

1. Soak with `UPDATER_V2=1` set for internal builds; run the test matrix.
2. Switch the NSIS include in `frontend/electron-builder.yml`:
   `nsis.include: ../scripts/installer-include.nsh` → `../build/installer.nsh`
   (the clean one that delegates to `service-manager.ps1`).
3. Default the flag on (set `UPDATER_V2=1` in the build env / main process).
4. After a full release proves out, remove the legacy `autoUpdater.js` wiring
   and `UpdateNotification.vue`'s legacy channels.

Until step 2, the production installer keeps using `installer-include.nsh`;
`service-manager.ps1` still ships (harmless) so the Electron side can use it.

## Rollback / recovery posture

- Download/checksum failure → nothing changed; retry.
- Backup required + failed → install blocked (no service stop).
- Service won't start post-install → `service-manager repair` (one attempt).
- Health check fails → state stays `failed`; **no success shown**; maintenance
  flag auto-expires after 30 min so the app is never wedged.
- Database restore is **never** automatic (avoids compounding data damage) —
  the pre-update backup folder is left in `userData/pre-update-backups/` for a
  deliberate manual restore.
