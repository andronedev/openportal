# Contributing to OpenPortal

Thanks for your interest in improving OpenPortal! This document explains how to
set up the project, the conventions we follow, and how to submit changes.

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in a Chromium-based browser. You can develop the
entire UI **without a device** using demo mode: `http://localhost:5173/?demo`.

## Useful scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check (`tsc --noEmit`) and build for production |
| `pnpm preview` | Preview the production build locally |
| `pnpm lint` | Run Biome checks (lint + format + import order) |
| `pnpm format` | Auto-format the codebase with Biome |
| `node scripts/check-provision-drift.mjs` | Check Immortal's provisioning kit against the vendored snapshot (see `docs/provisioning.md`) |
| `node scripts/vendor-provision.mjs [ref]` | Re-vendor Immortal's `provision.sh` and `config.env` from a release tag |

Please make sure `pnpm build` and `pnpm lint` both pass before opening a PR.

## Architecture rules

- **The UI never imports `@yume-chan/*` directly.** All ADB operations go
  through `src/lib/adb/`. If you need a new device capability, add a function in
  the appropriate `src/lib/adb/*.ts` module and call it from components/stores.
- **State lives in Zustand stores** (`src/store/`). Components read from stores;
  device I/O is kept out of render paths.
- **Everything is internationalized.** No hard-coded user-facing strings — add
  keys under `src/locales/<lang>/<namespace>.json` and use `useTranslation`.
- **Keep advanced features behind Advanced mode** when they are powerful or
  potentially confusing for non-technical users (see `useUIStore().mode`).

## Code style

- TypeScript, strict mode. Avoid `any`; prefer precise types.
- Formatting and linting are enforced by [Biome](https://biomejs.dev) (tabs,
  organized imports). Run `pnpm format` before committing.
- Match the surrounding code: Tailwind utility classes inline, `cn()` for
  conditional classes, small focused components.

## Adding an app to the catalog

The catalog is data-only and lives in
[`src/lib/portal/catalog.json`](src/lib/portal/catalog.json) so apps can be
submitted with a simple PR — no code changes required. Add an object to the
array:

```json
{
  "id": "my-app",
  "name": "My App",
  "packageName": "com.example.myapp",
  "description": "What it does, in one sentence.",
  "category": "utility",
  "version": "1.0.0",
  "downloadUrl": "https://...",
  "iconUrl": "https://...",
  "program": {
    "kind": "commands",
    "commands": ["settings put secure ..."],
    "labelKey": "setAsDefault"
  }
}
```

Field reference:

- `id` — unique kebab-case identifier
- `packageName` — exact Android package name
- `category` — one of `launcher`, `store`, `media`, `photo`, `smartHome`,
  `assistant`, `utility`
- `madeForPortal` — optional; `true` for apps built specifically for the Portal.
  They get a "Made for Portal" badge and a pinned section at the top of the catalog
- `advancedOnly` — optional; `true` restricts the app to Advanced mode. By default
  (omitted) every app is listed in Classic mode too
- `downloadUrl`, `iconUrl` — optional
- `repo` — optional `owner/repo` on GitHub. Required for `source: "github"` (the
  APK is resolved from its releases); for any source it also renders that repo's
  README on the app's detail page, so pointing an F-Droid or URL app at its GitHub
  mirror gives it a rich description
- `assetPattern` — optional, `source: "github"` only; a case-insensitive regex
  matched against release asset file names to pick the right APK when a release
  ships several variants (per-ABI splits, signed vs unsigned flavors, TV builds).
  The first match wins. Omit it to take the first `.apk` asset; set it when that
  default would grab an unsigned or off-target build (e.g.
  `"^app-mobile-universal-release\\.apk$"` for a signed universal build). The
  Portal is arm64, so prefer a `universal` or `arm64` asset
- `iconFile` — optional; use instead of `iconUrl` when the app has no hosted
  icon to link to. Drop a square PNG at `public/app-icons/<packageName>.png` and
  set `"iconFile": true` (or pass an extension like `"svg"`). `iconUrl` wins when
  both are set; with neither, the card shows an initials avatar.
- `skipUpdateCheck` — optional; set `true` to suppress the "update available"
  check when upstream versioning is unreliable (e.g. a release tag that doesn't
  match the APK's embedded versionName, which would flag a phantom update)
- `customSource` — optional; with `source: "custom"`, the id of a resolver in
  `src/lib/portal/custom-sources/registry.ts` that fetches the app's latest APK
  and version with bespoke code. Use it for apps with no standard GitHub/F-Droid
  release feed (e.g. a self-hosted version manifest whose tags drift from the
  APK's versionName). Like a `panel` program, this catalog change also needs
  a matching code change
- `program` — optional lifecycle program: everything the app needs beyond a
  plain install. One of three kinds:
  - `{ "kind": "commands", "commands": [...], "auto"?: boolean, "labelKey"?: string }`
    — shell commands to finish setup. `auto: true` runs them silently right
    after install (e.g. a launcher becoming the default); otherwise they run
    when the user clicks the setup gear on the app card. `labelKey` is an i18n
    key in `src/locales/<lang>/apps.json` used for the gear's tooltip. **This is
    the kind most apps should use** — it needs no code.
  - `{ "kind": "panel", "id": "...", "labelKey"?: string, "handlesInstall"?: boolean, "revertOnUninstall"?: boolean }`
    — setup that needs a UI (e.g. uploading credentials). The `id` must match a
    panel registered in `src/components/apps/setup/registry.ts`, so this kind
    also requires code. `handlesInstall` makes the Install button open the panel
    instead of installing directly; `revertOnUninstall` runs the panel's
    lifecycle revert before uninstall.
  - `{ "kind": "sandboxed", "repo": "owner/repo", "programPath"?: "...", "trust": "verified", "labelKey"?: string, "handlesInstall"?: boolean, "revertOnUninstall"?: boolean }`
    — a full provisioning program the partner ships in **their own** repo.
    OpenPortal fetches it from their latest release (default path
    `provisioning/openportal.program.js`) and runs it in a sandboxed worker via
    the `portal` capability API. See `docs/provisioning.md` and `sdk/`.

  A `sandboxed` program runs partner-authored code (raw device shell), so it is
  gated by `trust`: only `"verified"` (a vetted partner) or `"first-party"`
  (OpenPortal's own) programs are fetched and executed; anything else is
  refused. **`trust` is enforced at review time** — do not merge a catalog PR
  that claims `"verified"` for a repo the maintainers have not vetted.

Guidelines:

- Prefer open-source apps and official download sources.
- Do **not** submit apps that require root, exploits, or that violate the device
  owner's terms — OpenPortal only uses public ADB commands.

## Reporting bugs

Open an issue with:

- Portal model and firmware version (visible on the Dashboard)
- Browser and OS
- Steps to reproduce, and any errors from the browser console

## Pull requests

1. Fork and create a feature branch.
2. Make your change, with i18n keys for any new strings.
3. Run `pnpm lint` and `pnpm build`.
4. Open a PR describing the change and how you tested it.

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
