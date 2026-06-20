# Immortal provisioning

OpenPortal can run Immortal's full device provisioning from the browser, the same
way the project's `provisioning/provision.sh` does over a USB cable. This exists
because Immortal's maintainer (rightly) pointed out that installing the launcher
alone is not enough: its on-device App Store and self-update only work once the
device has been provisioned (Meta's package verifier disabled,
`REQUEST_INSTALL_PACKAGES` granted, the Gen-1 installer overlay fixed, the launcher
and screensaver set). OpenPortal reproduces that whole flow, step for step, with a
Restore that undoes it.

Everything provisioning does is a public ADB command (`pm`, `cmd`, `settings`,
`appops`, `am`, `dpm`, `input`, file push, `pm install`). No root, no exploit.

## Where the code lives

| Concern | File |
|---|---|
| Engine (1:1 port of `provision.sh`) | `src/lib/adb/provision.ts` |
| Config (typed view of `config.env`, live fetch + fallback) | `src/lib/portal/provision-config.ts` |
| Vendored upstream snapshot + pinned ref | `src/lib/portal/provision/upstream/` |
| UI panel (status, options, progress, restore) | `src/components/apps/setup/ImmortalProvisioning.tsx` |
| Drift detector / re-vendor scripts | `scripts/check-provision-drift.mjs`, `scripts/vendor-provision.mjs` |
| Drift CI | `.github/workflows/provision-drift.yml` |

The catalog entry (`src/lib/portal/catalog.json`, `immortal-launcher`) wires the
panel in with `setup: { kind: "custom", id: "immortal-provision" }`.

## How it stays in sync (the maintenance model)

`provision.sh` is upstream-owned and changes every few releases. Immortal already
keeps two parallel ports in lockstep (the bash kit and a PowerShell `provision.ps1`,
guarded by its own CI). This TS port is a third one, so it has explicit anti-drift
tooling instead of relying on someone noticing.

The script splits cleanly into two things, and we treat them differently:

- **Data** (`config.env`: package names, URLs, checksums, package lists, toggles).
  High churn, low risk. The panel fetches `config.env` live from the **latest
  release tag** at runtime (`loadProvisionConfig`), so a value change upstream
  reaches users with no OpenPortal change. The vendored copy is the offline
  fallback only.
- **Procedure** (the `provision.sh` functions: the ordered ADB commands). Lower
  churn, higher impact. This is the reviewed, pinned TS port. We do not execute
  fetched shell, both because OpenPortal speaks ADB rather than running a host
  shell, and because auto-running third-party code that disables a security
  verifier would be a supply-chain footgun.

### When the drift CI fires

`scripts/check-provision-drift.mjs` (run weekly + on demand) compares the upstream
blob SHAs against the vendored snapshot in `meta.json`.

1. **`config.env` changed (data only).** The job prints a notice and passes.
   Runtime already serves the new release-tag values. Refresh the offline fallback
   when convenient: `node scripts/vendor-provision.mjs`. No TS change.
2. **`provision.sh` changed (procedure).** The job **fails** with a link to the
   upstream diff. Update the matching function in `src/lib/adb/provision.ts` and the
   row in the fidelity table below, then re-vendor:
   `node scripts/vendor-provision.mjs`. The 1:1 naming (`installClient` <->
   `install_client`) makes the re-port mechanical.
3. **A new upstream step.** Add the TS function, a fidelity-table row, the option
   toggle if user-facing, and the i18n keys under `provisioning.*` in
   `src/locales/{en,fr}/apps.json`.

`scripts/vendor-provision.mjs` rewrites `provision.sh`, `config.env`, `meta.json`,
and the generated `snapshot.ts` from a release tag in one shot, so the raw copies
and the runtime fallback never diverge.

## Fidelity map (provision.sh -> provision.ts)

| Bash function | TS step | Key commands | Notes |
|---|---|---|---|
| `resolve_adb` / `wait_for_device` | (n/a) | - | OpenPortal is the ADB transport; the device is already connected |
| `install_client` | `installClient` | `pm install -r -d` of the resolved release APK | release URL via `resolveGithubLatest`; device-side download |
| `start_shizuku` | `startShizuku` | install APK, run `lib/*/libshizuku.so`, `pgrep` verify | |
| `install_apps` | `installApps` | F-Droid + APK URLs -> `pm install` | device-side download, mirrors `--apps` |
| `push_assets` | `pushAssets` | push photos, first becomes `frame.jpg` | photos are user-supplied (no bundled assets) |
| `grant_perms` | `grantPerms` | `pm grant`, `appops set`, `dpm set-active-admin`, `cmd notification allow_listener` | best-effort; device-admin failure is a warning |
| `apply_system_tweaks` | `applySystemTweaks` | `settings put global policy_control / hidden_api_policy* / development_settings_enabled` | |
| `disable_verifier` | `disableVerifier` | `pm disable-user <appverifier>`, `package_verifier_enable 0` | the step the maintainer's objection is about |
| `disable_installer_overlay` | `disableInstallerOverlay` | gated `sdk < 29`; `cmd overlay disable`; marker setting | gate via `deviceInfo.apiLevel` |
| `disable_ota` | `disableOta` | `pm disable-user` OTA packages | interactive prompt -> a UI toggle (default on) |
| `disable_presence` | `disablePresence` | `pm disable-user <presence>` | UI toggle (default off) |
| `snapshot_stock` / `load_state` | `snapshotStock` / `loadState` | `cmd package query-activities`, `settings get`; `/sdcard/immortal_restore.env` | snapshot written via file push |
| `set_launcher` | `setLauncher` | `cmd package set-home-activity` | UI toggle (default from `SET_LAUNCHER`, on); off keeps the stock launcher |
| `set_screensaver` | `setScreensaver` | `settings put secure screensaver_*` | |
| `enable_fleet` | `enableFleet` | push `provision.json`, relaunch, poll `agent.json`, read wlan0 IP | host inventory file becomes a **download** |
| `configure_boot_apps` | `configureBootApps` | write `boot_apps.txt` | |
| `maybe_restore_alexa` / `restore_alexa` | `restoreAlexa` | gate A9; download + sha256 falcon; `install -r`; grants; `am start`; install millennium; logcat poll | primary URL path only (see deviations) |
| `restore_alexa_undo` | `restoreAlexaUndo` | remove millennium; keep falcon | |
| `do_provision` / `do_restore` / `do_status` | `provision` / `restore` / `status` | same step order | |
| `--apps` / `--overlay-fix` / `--shizuku` / `--fleet` / `--alexa` | `runApps` / `overlayFix` / `runShizuku` / `runFleet` / `runAlexa` | re-runnable sub-modes | |
| `enable_wifi_adb_now` (`--wifi-adb`) | (omitted) | `adb tcpip 5555` | not portable (see deviations) |

`exitCode` is unreliable in the browser ADB transport (it is forced to 0 on the
legacy protocol), so every step is best-effort and success is confirmed by
`status()` reading real device state, not by return codes. This matches the
script's own `>/dev/null 2>&1` posture.

## Browser deviations (intentional)

1. **`--wifi-adb` is not ported.** `adb tcpip` followed by a raw TCP `adb connect`
   is impossible from a browser. It is an on-demand power-user mode anyway; the
   Wi-Fi fleet agent is the persistent channel.
2. **The falcon bsdiff fallback is deferred.** The primary Alexa path
   (`FALCON_PATCHED_URL`, a direct download) works device-side. Only the offline
   reconstruct path (stock APK + binary diff) would need a WASM `bspatch`.
3. **The fleet inventory is offered as a download.** A browser cannot write
   `fleet/<serial>.json` to the user's disk, so the panel rebuilds that JSON (token
   and IP read back from the device) and offers it for download.
4. **Live config values are validated before use.** `provision.sh` sources a local
   `config.env` the operator controls; OpenPortal fetches it live from the latest
   release tag, so `loadProvisionConfig` allowlist-checks every value that reaches a
   device command (package and component names, permissions, F-Droid ids, `https`
   URLs) and falls back to the vendored snapshot on any violation, so a compromised
   upstream value cannot inject shell into an ADB command.

## Verifying

- `pnpm lint` and `pnpm build` must pass (CI runs both).
- Demo mode (`?demo`) renders the panel with the vendored config and no device; all
  device actions are guarded on a live `adb`.
- `node scripts/check-provision-drift.mjs` reports no drift against the vendored
  snapshot.
- On real hardware, run provisioning and compare `status()` to a `provision.sh`
  run; test Restore; check the Alexa A9-vs-A10 gate.
