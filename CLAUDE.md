# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OpenPortal manages Meta Portal devices from the browser via **WebUSB + ADB** — pure frontend, no backend, no drivers. It speaks the ADB protocol over USB using [ya-webadb](https://github.com/yume-chan/ya-webadb) (`@yume-chan/*`). The built `dist/` is a static site; deploys to GitHub Pages on push to `main`.

Requires a Chromium-based browser (WebUSB is unavailable in Firefox/Safari) served over HTTPS or `localhost` (WebUSB needs a secure context).

## Commands

```bash
pnpm install
pnpm dev        # Vite dev server on http://localhost:5173
pnpm build      # tsc --noEmit (type-check) THEN vite build
pnpm lint       # Biome: lint + format check + import order
pnpm format     # Biome auto-format (tabs, organized imports)
```

There is **no test framework** in this project. CI (`.github/workflows/deploy.yml`) runs `pnpm lint` then `pnpm build` — both must pass before a PR merges. Run them locally before pushing.

## Demo mode — the primary dev workflow without hardware

Append `?demo` to the URL (`http://localhost:5173/?demo`). `useDemoMode()` in `src/App.tsx` then forces the device store to `state: "connected"` with `MOCK_DEVICE_INFO` (`src/lib/adb/mock.ts`) **but leaves `adb` as `null`**.

This is the key constraint when touching UI: components that issue live device I/O must guard on `adb` being non-null (e.g. `adb && <ScreenMirror .../>` in `DashboardPage`). Code that reads `deviceInfo`/`portalModel` works in demo mode; code that calls into the device does not. Don't assume `state === "connected"` implies a live `adb`.

## Architecture

**The UI never imports `@yume-chan/*` directly.** Every ADB capability is wrapped in a module under `src/lib/adb/`, and components/stores call those wrappers. To add a device capability, add/extend a function in the right `src/lib/adb/*.ts` module — do not reach for the ya-webadb API from a component. (`connection`, `shell`, `pty`, `file-system`, `screen`, `scrcpy`, `logcat`, `device-config`, `device-info`, `app-manager`, `online-install`, `settings`, `backup`, `credential-store`.)

**State lives in Zustand stores** (`src/store/`), and device I/O is kept out of render paths:
- `device-store` — connection lifecycle (`connect`/`disconnect`/`refreshDeviceInfo`), holds the live `Adb` handle, `deviceInfo`, `portalModel`. `watchDisconnect` recovers gracefully when the cable is pulled.
- `ui-store` — `mode` (classic/advanced), `theme`, sidebar; **persisted** to localStorage key `openportal-ui`.
- `app-store` — installed-apps state and catalog interactions.

**Connection flow** (`src/lib/adb/connection.ts`): WebUSB is filtered to Meta's vendor id `0x2ec6`. `requestDevice` → `connectDevice` authenticates an `AdbDaemonTransport` using the persisted RSA credential store (`credential-store.ts`).

**Routing / gating** (`src/App.tsx`): while `state !== "connected"` the app renders `ConnectScreen` only — there is no router. Once connected, a `BrowserRouter` (basename `import.meta.env.BASE_URL`) mounts the pages. Dashboard and Apps are eager; the advanced tools (Files, Screen, Terminal, Logcat, Flags) are `React.lazy` code-split so the heavy chunks load on demand.

**Classic vs Advanced mode** (`useUIStore().mode`): keep powerful or confusing features behind Advanced mode. In the catalog, every app shows in Classic mode by default; set `advancedOnly: true` to restrict one to Advanced mode. Apps flagged `madeForPortal` get a pinned "Made for Portal" section at the top of the catalog plus a badge.

## i18n — no hard-coded user-facing strings

All UI text goes through react-i18next (`src/i18n.ts`). Languages: `en`, `fr` (fallback `en`). Four namespaces, each a JSON file per language under `src/locales/<lang>/`: `common` (default NS), `dashboard`, `apps`, `tools`. Add a key to **both** language files and use `useTranslation(ns)`. Stores reach i18n via the default `import i18n from "@/i18n"`.

## scrcpy (screen mirroring)

Real scrcpy over H.264 → WebCodecs (`src/lib/adb/scrcpy.ts`, decoded via `@yume-chan/scrcpy-decoder-webcodecs`). The server binary is bundled at `public/scrcpy-server` and pushed to the device on demand. The `SERVER_VERSION` constant in `scrcpy.ts` **must match** the bundled binary version (currently `2.3`) — bump both together. Portal runs Android 10, so there is no audio. Use `isScrcpySupported()` to gate (WebCodecs availability).

## App lifecycle: install and `program`

**One install path.** Every install goes through `installApp(adb, source, opts)` in `src/lib/adb/install.ts`, where `source` is a local `File` (sync-push) or a URL list + optional `sha256` (device-side download, verify, `pm install`). The local drag-&-drop store action, the catalog download in `use-app-actions.ts`, and the sandboxed provisioning worker all route through it — don't reintroduce a second installer. `online-install.ts` keeps only the device-fetch primitives (`deviceFetchText`, `detectDownloader`).

**One `program` model.** Anything an app needs beyond a plain install is one optional `program` field on its catalog entry (`AppProgram` in `catalog.ts`), with three kinds: `commands` (declarative shell, `auto` to run silently post-install), `panel` (bespoke React UI by `id` in `setup/registry.ts`), and `sandboxed` (a partner's provisioning program, below). Use the `isPanelProgram()` guard: `panel` and `sandboxed` both open a modal and can `handlesInstall`/`revertOnUninstall`, as opposed to declarative `commands`. `AppSetupPanel` routes by kind.

## Sandboxed provisioning programs

Some apps (Immortal is the reference consumer) need full device provisioning, not just an install (disable Meta's package verifier, grant `REQUEST_INSTALL_PACKAGES`, fix the Gen-1 installer dialog, set launcher and screensaver). A `program: { kind: "sandboxed", repo, trust }` catalog entry declares this. The procedure is **not hand-ported**: it is a JavaScript **program** the partner ships in their repo (fetched live from their release; a built-in default at `src/lib/portal/provision/program/default.program.js` is the offline fallback for Immortal, a 1:1 of its `provision.sh`). OpenPortal runs it in a **sandboxed Web Worker** with no DOM, no credential store, and no live `Adb` handle; the program drives the device only through a constrained `portal` capability API that RPCs to a **broker** on the main thread (`src/lib/portal/provision/{worker,broker,loader,types}.ts`, public barrel `index.ts`). The broker holds the `Adb` handle, validates every call (https-only, path/flag/package allowlists), and surfaces an audit log + kill switch. One generic panel (`src/components/apps/setup/SandboxedProgramPanel.tsx`) runs every sandboxed program, its form driven by a **manifest** the program declares, so new questions need no front-end change. The loader reads `repo`/`programPath`/`trust` from the catalog entry (not hardcoded to Immortal) and **only fetches/runs `verified` or `first-party` programs** — `trust` is enforced at PR-review time. The host/program contract is versioned (`PORTAL_API_VERSION` in `types.ts`); the SDK for program authors lives in `sdk/`. Config values come from a typed live view of `config.env` (`src/lib/portal/provision-config.ts`, parameterized by repo) with a vendored snapshot under `src/lib/portal/provision/upstream/` (Biome-ignored) as fallback and drift baseline. `scripts/check-provision-drift.mjs` (CI: `.github/workflows/provision-drift.yml`) alerts when upstream `provision.sh` or `openportal.program.js` moves; `scripts/vendor-provision.mjs` re-vendors in one shot. Full detail and the fidelity map live in `docs/provisioning.md`.

## Conventions

- TypeScript strict mode (plus `noUnusedLocals`, `noUncheckedIndexedAccess`, etc.). Avoid `any`; prefer precise types.
- Formatting/linting is **Biome**, not Prettier/ESLint: tabs, organized imports. `src/lib/portal/catalog.json` and `public/scrcpy-server` are excluded from Biome.
- Path alias: `@/` → `src/`.
- Tailwind CSS 4 utilities inline; use `cn()` (from `src/lib/utils.ts`) for conditional classes. Shared primitives live in `src/components/ui/primitives.tsx`.
- The app catalog (`src/lib/portal/catalog.json`) is **data-only** so apps can be added via PR with no code change. See CONTRIBUTING.md for the field schema and the `madeForPortal`/`advancedOnly`/`program` semantics.
- This tool uses only public ADB commands — no exploits, root, or bootloader unlock. Don't add capabilities that require them.

## PWA

Installable, offline app shell. The service worker (`public/sw.js`) is a **hand-written static file** (not generated by a build plugin) and is registered only in production builds (`src/main.tsx`). `public/manifest.webmanifest` is the web manifest.

## Deploy

`pnpm build` → static `dist/`. The site is served at the **custom domain `openportal.cc`** (root), so CI builds with the default base `/`; `public/CNAME` pins the domain across Actions deploys, and CI copies `index.html` → `404.html` for SPA deep-link fallback. GitHub Pages 301-redirects the old project URL `andronedev.github.io/openportal/*` to `openportal.cc/*` with the path preserved, so existing badge embeds keep working. To deploy a fork under a sub-path instead, set `VITE_BASE=/<repo-name>/`.
