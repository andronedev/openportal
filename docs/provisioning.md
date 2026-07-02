# Sandboxed provisioning programs

Some catalog apps need full device provisioning, not just an install. OpenPortal
runs that provisioning from the browser through a **sandboxed program runtime**:
a partner ships a JavaScript program in their repo, and OpenPortal fetches and
runs it in a locked-down worker. This is one of the three `program` kinds a
catalog entry can declare (`commands`, `panel`, `sandboxed`); this document
covers the `sandboxed` kind.

**Immortal is the reference consumer.** Its maintainer (rightly) pointed out that
installing the launcher alone is not enough: the on-device App Store and
self-update only work once the device has been provisioned (Meta's package
verifier disabled, `REQUEST_INSTALL_PACKAGES` granted, the Gen-1 installer
overlay fixed, the launcher and screensaver set). OpenPortal reproduces that
whole flow, step for step, with a Restore that undoes it — the same way the
project's `provisioning/provision.sh` does over a USB cable. The runtime itself
is not Immortal-specific: any **verified** partner can ship a program the same
way (see Trust below).

Everything provisioning does is a public ADB command (`pm`, `cmd`, `settings`,
`appops`, `am`, `dpm`, `input`, file push, `pm install`). No root, no exploit.

## Architecture: a program, not a port

The procedure is not hand-ported into OpenPortal anymore. It is a **JavaScript
program** that the launcher author owns and ships in their repo. OpenPortal
fetches it live from the latest release and runs it in a **sandboxed Web
Worker**. The worker has no DOM, no credential store, no live ADB handle, and no
network (`fetch`/`XHR`/`WebSocket` are removed). It can only touch the device
through a constrained `portal` capability API that round-trips, over
`postMessage`, to a **broker** on the main thread. The broker holds the live
`Adb` handle, validates every request, logs it to a user-visible audit log, and
runs it through an `src/lib/adb/*` wrapper.

```
Main thread (trusted)                      Worker (sandboxed realm)
─────────────────────                      ────────────────────────
broker holds Adb, validates,               runs the program:
logs to audit, dispatches to                 manifest / defaultOptions
src/lib/adb wrappers           ◄── RPC ──►   provision / restore / status
kill switch = worker.terminate()             portal.* (no Adb, no creds, no net)
```

The built-in program (`src/lib/portal/provision/program/default.program.js`) is
a faithful translation of Immortal's `provision.sh` and is the offline fallback
for that one repo. When Immortal publishes `provisioning/openportal.program.js`
in a release, OpenPortal runs that one instead, so the maintainer can change the
steps without any OpenPortal change. The program's `repo`, its path, and its
`trust` tier all come from the catalog entry, so the loader is not hardcoded to
Immortal (see Trust below).

The panel form is driven by a **manifest** the program declares, so a new
question (a toggle, a text field, a select) appears with no front-end change.

## Where the code lives

| Concern | File |
|---|---|
| Worker runtime (sandbox + `portal` RPC) | `src/lib/portal/provision/worker.ts` |
| Capability broker (validation, audit, dispatch) | `src/lib/portal/provision/broker.ts` |
| Shared types + `PORTAL_API_VERSION` | `src/lib/portal/provision/types.ts` |
| Program loader (spec-driven fetch, trust gate, vendored fallback) | `src/lib/portal/provision/loader.ts` |
| Built-in program (1:1 of Immortal's `provision.sh`) | `src/lib/portal/provision/program/default.program.js` |
| Public barrel | `src/lib/portal/provision/index.ts` |
| Config (typed view of `config.env`, live fetch + fallback) | `src/lib/portal/provision-config.ts` |
| Vendored upstream snapshot + pinned ref | `src/lib/portal/provision/upstream/` |
| Generic UI runner (status, manifest form, progress, audit, restore) | `src/components/apps/setup/SandboxedProgramPanel.tsx` |
| Program SDK (types, template, docs) | `sdk/` |
| Drift detector / re-vendor scripts | `scripts/check-provision-drift.mjs`, `scripts/vendor-provision.mjs` |
| Drift CI | `.github/workflows/provision-drift.yml` |

The catalog entry (`src/lib/portal/catalog.json`, `immortal-launcher`) wires the
runner in with `program: { kind: "sandboxed", repo: "starbrightlab/immortal",
trust: "verified" }`. `AppSetupPanel` routes every `sandboxed` program to the one
generic `SandboxedProgramPanel` by kind — there is no per-app panel id, and the
loader reads `repo`/`programPath`/`trust` from that entry rather than hardcoding
Immortal.

## Trust

A `sandboxed` program is partner-authored code with raw device shell access, so
running it is gated by the catalog entry's `trust` tier (`ProgramTrust` in
`catalog.ts`):

- `first-party` — OpenPortal's own program.
- `verified` — a partner the maintainers have vetted (Immortal today), whose
  release we fetch and run at run time.

`loadProgram` fetches and executes a live program **only** for these two tiers;
anything else is refused. A vendored offline snapshot is offered only for the one
repo we ship one for (`UPSTREAM_META.repo`, i.e. Immortal); other programs are
live-only. Because the tier is declared in `catalog.json`, which is first-party
data merged through reviewed PRs, **trust is enforced at review time**: a
reviewer must not merge a `"verified"` entry for an unvetted repo.

## The SDK

`sdk/` is the launcher author's kit: `provision-sdk.d.ts` (the typed contract),
`template.program.js` (a starter, referenced with `/// <reference>` for editor
types and no build step), and `README.md` (the API reference, manifest schema,
versioning, and testing). The built-in program is the full worked example.

A program is an ES module exporting `manifest`, `defaultOptions(portal)`,
`provision(portal, answers)`, `restore(portal)`, `status(portal)`, and
`resetLauncher(portal)`.

### API versioning

`PORTAL_API_VERSION` (in `types.ts`, currently **1**) is the host contract
version. A program declares the version it targets in `manifest.apiVersion`.
OpenPortal runs a live program only when `apiVersion <=` the host version;
otherwise it falls back to the built-in program and tells the user to update.
Adding fields or calling existing `portal` methods needs no bump; bump only on a
breaking change to the contract.

## Security model

The boundary is the **broker capability allowlist**, not the sandbox alone.

1. **Capability broker (primary control).** The worker can only request methods
   in a fixed `portal.*` set. The broker validates arguments before touching the
   device: `https`-only URLs, paths under `/sdcard` or `/data/local/tmp` with no
   `..`, install flags matched against `/^[-a-zA-Z0-9 ]*$/`, package-name and
   settings-namespace checks. The `cfg` handed to the program is already
   allowlist-validated by `findConfigViolations`. Every shell command, fetch,
   install, push, and setting write is shown in the panel's audit log, and the
   user can stop the run at any time (`worker.terminate()` + an overall timeout).
2. **Realm isolation (defense in depth).** Before any program code loads, the
   worker neutralizes `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`,
   `Worker`, `SharedWorker`, `indexedDB`, `caches`, and `EventSource`. It never
   holds the `Adb` handle or the credential store; the built worker chunk is a
   few KB of RPC plumbing with no ADB stack.
3. **Reviewability.** The program is fetched from a known release tag, shown to
   the user with a link, and the drift CI alerts when it changes. There is no CSP
   on GitHub Pages, so this design-time validation is the protection, matching the
   existing allowlist approach in `provision-config.ts`.

Honest notes:

- `portal.shell` runs raw, so a compromised program can run any shell command on
  the connected device. That is the same power `provision.sh` already has; the
  gain over the status quo is that credentials, the DOM, network egress, and
  other devices/users are out of reach, and every command is visible and
  abortable.
- Realm isolation removes the easy egress paths but not dynamic `import()` of a
  remote URL. The capability broker still bounds the blast radius (the program
  only ever receives non-secret data: the public config, the API level), and a
  CSP'd sandbox iframe is the planned hardening to close it.

## How it stays in sync (the maintenance model)

The script splits into two things, treated differently:

- **Data** (`config.env`). High churn, low risk. The panel fetches it live from
  the **latest release tag** (`loadProvisionConfig`), so a value change upstream
  reaches users with no OpenPortal change. The vendored copy is the offline
  fallback only.
- **Procedure** (the program). Until Immortal publishes
  `openportal.program.js`, the built-in program is the procedure, authored from
  `provision.sh` and kept in lockstep with it. Once Immortal publishes one,
  OpenPortal runs that live and the built-in is just the fallback.

### When the drift CI fires

`scripts/check-provision-drift.mjs` (run weekly + on demand) compares upstream
blob SHAs against the vendored snapshot in `meta.json`.

1. **`config.env` changed (data only).** Notice, passes. Runtime already serves
   the new release-tag values. Refresh the fallback when convenient:
   `node scripts/vendor-provision.mjs`.
2. **`provision.sh` changed, or `openportal.program.js` changed/was published.**
   Fails with a link to the upstream diff. Re-review the built-in program in
   `src/lib/portal/provision/program/default.program.js` against `provision.sh`
   (the 1:1 naming makes it mechanical), then re-vendor:
   `node scripts/vendor-provision.mjs`. When upstream ships
   `openportal.program.js`, the vendor script vendors it as the fallback and
   records `programBlob`/`programSha256` in `meta.json`.

## Fidelity map (provision.sh -> default.program.js)

| Bash function | Program step | Key commands | Notes |
|---|---|---|---|
| `resolve_adb` / `wait_for_device` | (n/a) | - | OpenPortal is the ADB transport; the device is already connected |
| `install_client` | `installClient` | `pm install -r -d` of the resolved release APK | release URL via `portal.resolveGithubLatest`; device-side download |
| `start_shizuku` | `startShizuku` | install APK, run `lib/*/libshizuku.so`, `pgrep` verify | |
| `install_apps` | `installApps` | F-Droid + APK URLs -> `pm install` | device-side download |
| `push_assets` | `pushAssets` | push photos via `portal.pushUserPhotos`, first becomes `frame.jpg` | photos are user-supplied |
| `grant_perms` | `grantPerms` | `pm grant`, `appops set`, `dpm set-active-admin`, `cmd notification allow_listener` | device-admin failure is a warning |
| `apply_system_tweaks` | `applySystemTweaks` | `settings put global policy_control / hidden_api_policy* / development_settings_enabled` | |
| `disable_verifier` | `disableVerifier` | `pm disable-user <appverifier>`, `package_verifier_enable 0` | the step the maintainer's objection is about |
| `disable_installer_overlay` | `disableInstallerOverlay` | gated `sdk < 29`; `cmd overlay disable`; marker setting | gate via `portal.sdk` |
| `disable_ota` | `disableOta` | `pm disable-user` OTA packages | manifest toggle `disableOta` (default on) |
| `disable_presence` | `disablePresence` | `pm disable-user <presence>` | manifest toggle (default off) |
| `snapshot_stock` / `load_state` | `snapshotStock` / `loadState` | `cmd package query-activities`, `settings get`; `/sdcard/immortal_restore.env` | snapshot written via `portal.pushText` |
| `set_launcher` | `setLauncher` | `cmd package set-home-activity` | manifest toggle (default from `SET_LAUNCHER`) |
| `set_screensaver` | `setScreensaver` | `settings put secure screensaver_*` | |
| `enable_fleet` | `enableFleet` | push `provision.json`, relaunch, poll `agent.json`, read wlan0 IP | host inventory file becomes a **download** |
| `configure_boot_apps` | `configureBootApps` | write `boot_apps.txt` | |
| `maybe_restore_alexa` / `restore_alexa` | `restoreAlexa` | gate A9; download + sha256 falcon; `install -r`; grants; `am start`; install millennium; logcat poll | primary URL path only (see deviations) |
| `restore_alexa_undo` | (in `restore`) | remove millennium; keep falcon | |
| `do_provision` / `do_restore` / `do_status` | `provision` / `restore` / `status` | same step order | plus `resetLauncher` |
| `enable_wifi_adb_now` (`--wifi-adb`) | (omitted) | `adb tcpip 5555` | not portable (see deviations) |

`exitCode` is unreliable in the browser ADB transport (forced to 0 on the legacy
protocol), so every step is best-effort and success is confirmed by `status()`
reading real device state, not by return codes. This matches the script's own
`>/dev/null 2>&1` posture.

## Browser deviations (intentional)

1. **`--wifi-adb` is not ported.** `adb tcpip` followed by a raw TCP `adb connect`
   is impossible from a browser. The Wi-Fi fleet agent is the persistent channel.
2. **The falcon bsdiff fallback is deferred.** The primary Alexa path
   (`FALCON_PATCHED_URL`, a direct download) works device-side. Only the offline
   reconstruct path (stock APK + binary diff) would need a WASM `bspatch`.
3. **The fleet inventory is offered as a download.** A browser cannot write
   `fleet/<serial>.json` to disk, so the panel rebuilds that JSON (token and IP
   read back from the device) and offers it for download.
4. **Live config values are validated before use.** `loadProvisionConfig`
   allowlist-checks every value that reaches a device command and falls back to
   the vendored snapshot on any violation, so a compromised upstream value cannot
   inject shell into an ADB command.

## Verifying

- `pnpm lint` and `pnpm build` must pass (CI runs both).
- Demo mode (`?demo`) renders the panel with the vendored config and program and
  no device; all device actions are guarded on a live `adb`.
- `node scripts/check-provision-drift.mjs` reports no drift against the vendored
  snapshot.
- On real hardware, run provisioning and compare `status()` to a `provision.sh`
  run; test Restore; watch the audit log and the Stop button; check the Alexa
  A9-vs-A10 gate.
