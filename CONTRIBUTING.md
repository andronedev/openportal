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
| `node scripts/check-provision-drift.mjs` | Check Immortal's provisioning kit against the vendored snapshot (see `docs/programs.md`) |
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

The catalog is data-only and lives at the repo root in
[`catalog/`](catalog/): one folder per app under `catalog/apps/<id>/app.json`,
so apps can be submitted with a simple PR — no code changes required. Copy
`catalog/_template/app.json`, fill it in, and add your id to `catalog/index.json`
`order`:

```json
{
  "id": "my-app",
  "name": "My App",
  "packageName": "com.example.myapp",
  "description": "What it does, in one sentence.",
  "category": "utility",
  "version": "1.0.0",
  "source": "github",
  "repo": "owner/repo",
  "iconUrl": "https://..."
}
```

**The full field reference lives in [`catalog/README.md`](catalog/README.md).**
In short: `id`/`name`/`packageName`/`description`/`category`/`version` are
required; `source` is `github` | `fdroid` | `url` | `morphe` | `external` (omit
it when a `program` drives the install); curation (`order`, `featured` for the
"Made for Portal" pins) lives in `catalog/index.json`, not the app files. There
is no per-app "custom source" — anything non-standard is a `program`.

The `program` field is data too (a JSON block, plus an `openportal.js` for the
sandboxed kind), so it needs no `src/` change:

- `program` — optional lifecycle program: everything the app needs beyond a
  plain install. One of two kinds:
  - `{ "kind": "commands", "commands": [...], "auto"?: boolean, "labelKey"?: string }`
    — shell commands to finish setup. `auto: true` runs them silently right
    after install (e.g. a launcher becoming the default); otherwise they run
    when the user clicks the setup gear on the app card. `labelKey` is an i18n
    key in `src/locales/<lang>/apps.json` used for the gear's tooltip. **This is
    the kind most apps should use.**
  - `{ "kind": "sandboxed", "repo"?: "owner/repo", "programPath"?: "...", "trust": "first-party" | "verified", "labelKey"?: string, "handlesInstall"?: boolean, "revertOnUninstall"?: boolean }`
    — a JavaScript program run in a sandboxed worker via the `portal` capability
    API, which declares its own UI (a manifest form, a `file` field, static
    presentation, a returned result view), so setup that needs configuration is
    data, not code. A first-party program is bundled as `openportal.js` in the app's
    own folder (omit `repo`); a partner ships one in **their own** repo, fetched
    from their latest release (default path `provisioning/openportal.js`)
    with a bundled `openportal.js` as the offline fallback. `handlesInstall` makes
    the Install button open the panel instead of installing directly;
    `revertOnUninstall` runs the program's revert before uninstall. See
    `docs/programs.md` and `sdk/`.

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
