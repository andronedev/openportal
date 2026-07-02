# The OpenPortal app catalog

This folder **is** the catalog: the list of apps OpenPortal can install on a Meta
Portal. It is data, not code, so you can add an app with a pull request and no
code change. The app reads this folder at build time.

```
catalog/
  index.json            display order + featured pins
  _template/app.json    copy this to start a new app
  apps/
    <app-id>/
      app.json          the app's entry (required)
      program.js        a bundled setup program (only for kind: "sandboxed")
      upstream/         vendored snapshot for a first-party program (rare)
```

## Add an app

1. Copy `_template/app.json` to `apps/<your-app-id>/app.json` and fill it in.
2. Add your `<your-app-id>` to `index.json` `order` where you want it to appear.
3. Open a PR. Run `pnpm lint` and `pnpm build` first.

`id` is the folder name (kebab-case, unique). Prefer open-source apps and
official download sources. OpenPortal only uses public ADB commands, so do not
submit apps that need root, exploits, or that violate the device owner's terms.

## `app.json` fields

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Matches the folder name. |
| `name`, `packageName`, `description` | yes | `packageName` is the exact Android package. |
| `category` | yes | `launcher`, `store`, `media`, `photo`, `smartHome`, `assistant`, `utility`. |
| `version` | yes | Display version; `"latest"` if resolved at install time. |
| `source` | no | Where the APK comes from: `github`, `fdroid`, `url`, `morphe`, `external`. Omit it when a `program` drives the install (e.g. a launcher). |
| `repo` | for `github` | `owner/repo`. Required for `github` (APK from its releases); for any source it also renders that repo's README on the detail page. |
| `assetPattern` | no | `github` only: case-insensitive regex to pick the right APK when a release ships several. |
| `apkUrl` | for `url` | Direct APK URL. |
| `iconUrl` / `iconFile` | no | Remote icon URL, or a bundled `public/app-icons/<packageName>.png` (`"iconFile": true`). |
| `advancedOnly` | no | `true` restricts the app to Advanced mode. |
| `skipUpdateCheck` | no | `true` suppresses the update check when upstream versioning is unreliable. |
| `requires` | no | Package names this app depends on. |
| `program` | no | Setup beyond a plain install. See below. |

Curation lives in `index.json`, not the app files: `order` is the display order
and `featured` lists the ids pinned to the "Made for Portal" section.

## `program` — setup beyond a plain install

A `program` is the escape hatch for anything an app needs past a plain install.
Three kinds:

- `{ "kind": "commands", "commands": [...], "auto"?: bool, "labelKey"?: "..." }`
  — declarative shell. `auto: true` runs them silently right after install. **The
  kind most apps should use**; needs no code.
- `{ "kind": "panel", "id": "...", "handlesInstall"?: bool, "revertOnUninstall"?: bool }`
  — a bespoke React panel, registered in
  `src/components/apps/setup/registry.ts` (so this kind needs code).
- `{ "kind": "sandboxed", "repo": "owner/repo", "trust": "verified", "handlesInstall"?: bool, "revertOnUninstall"?: bool }`
  — a full setup program the partner ships in their own repo, run in a sandboxed
  worker. Drop a `program.js` in the app folder as the offline fallback. See
  `docs/programs.md` and `sdk/`. `trust` (`verified`/`first-party`) is enforced
  at review time — do not claim `verified` for an unvetted repo.
