# OpenPortal provisioning SDK

OpenPortal provisions Meta Portals from the browser. Instead of hard-coding the
procedure, it runs a **provisioning program** that you (the launcher author)
own and ship in your repo. OpenPortal fetches it live from your latest release,
runs it in a sandboxed worker, and renders its form from a manifest you declare.
This means you can change the steps and the questions whenever you want, with no
change to OpenPortal.

- **Contract / types:** [`program-sdk.d.ts`](./program-sdk.d.ts)
- **Starter:** [`template.program.js`](./template.program.js)
- **Full reference example:** `catalog/apps/immortal-launcher/program.js` (the built-in Immortal program)

## How it works

1. Your app has a catalog entry with `program: { kind: "sandboxed", repo: "<you>/<repo>", trust: "verified" }`.
2. You publish `provisioning/openportal.program.js` in your release (an ES module).
3. OpenPortal reads it from `https://raw.githubusercontent.com/<repo>/<tag>/provisioning/openportal.program.js` (device-side, no CORS).
4. It runs your program in a **sandboxed Web Worker**: no DOM, no credentials, and no network (`fetch`/`XHR`/`WebSocket` are removed). The device is reachable only through the `portal` object.
5. Every `portal` call is validated on the main thread (https-only URLs, paths under `/sdcard` or `/data/local/tmp`, safe install flags) and shown in a user-visible audit log. The user can stop a run at any time.

**Trust.** A program runs partner-authored code with raw device shell, so
OpenPortal only fetches and runs one when your catalog entry is marked
`trust: "verified"` (a partner the maintainers have vetted) or `"first-party"`.
That tier is set in OpenPortal's reviewed catalog, not by you — coordinate with
the maintainers to get your repo marked verified.

If your program can't be fetched, or it targets a newer API than the user's
OpenPortal, OpenPortal falls back to the built-in program **only for the repo it
ships a vendored snapshot for** (Immortal today); other programs are live-only.

## Writing a program

Copy `template.program.js`. Your module must export:

| Export | Purpose |
| --- | --- |
| `manifest` | Object (or function returning one) declaring `apiVersion`, `fields`, `steps`, and optional `presentation`. Drives the panel form. |
| `defaultOptions(portal)` | Initial answers, computed from `portal.cfg` / `portal.sdk` / `portal.app`. |
| `provision(portal, answers)` | The setup. May return `{ fleet }` and/or a `{ view }` for the panel to render (links, text, a download). |
| `restore(portal)` | Optional. Undo provisioning. |
| `status(portal)` | Optional. Read current device state for the panel. |
| `resetLauncher(portal)` | Optional. Restore the stock launcher. |

Only `manifest`, `defaultOptions`, and `provision` are required. A config-only
program (a screensaver, a URL to open, no device teardown) can export just those
three.

Get editor types with no build step by referencing the SDK at the top of your file:

```js
/// <reference path="./program-sdk.d.ts" />
/** @param {Portal} portal */
export async function provision(portal, answers) { /* ... */ }
```

### The `portal` API

`portal.sdk` (Android API level), `portal.cfg` (a launcher's validated
`config.env`, empty for other programs), and `portal.app` (`{ packageName, name }`
of the catalog app) are provided. Methods: `shell`, `getprop`, `getIpAddress`,
`deviceFetchText`, `installFromUrl`, `resolveGithubLatest`, `resolveFdroidLatest`,
`makeDirectory`, `removePath`, `pushText`, `pushUserPhotos`, `pushUploadedFile`,
`getSetting`, `putSetting`, `dumpLogcat`, `clearLogcat`, `launchApp`, `step`,
`log`, `sleep`. See the d.ts for exact signatures.

`shell` runs raw, so you can run any command you discover. It is bounded to the
connected device and logged for the user; it cannot reach the credential store,
other devices, or the network.

### The manifest form

Each field is rendered automatically. Field types: `boolean`, `text`, `select`,
`file`.

```js
fields: [
  { key: "setLauncher", type: "boolean", label: "Set as the home launcher" },
  { key: "restoreAlexa", type: "boolean", label: "Restore Alexa",
    enabledWhen: { sdkLessThan: 29 }, disabledHint: "Android 9 only." },
  { key: "fleetName", type: "text", label: "Device name",
    showWhen: { whenOption: "enableFleet", equals: true } },
  { key: "creds", type: "file", label: "OAuth credentials", accept: ".json" },
]
```

- `advanced: true` shows the field only in OpenPortal's Advanced mode.
- `enabledWhen` disables (greys out) the field when false; `showWhen` hides it.
- Conditions: `sdkLessThan`, `sdkAtLeast`, and `whenOption`/`equals` (another field's answer).
- A `file` field lets the user pick a file; place it with
  `portal.pushUploadedFile(fieldKey, dir, name)` (the bytes never enter the worker).

The answers map is passed to `provision(portal, answers)`. `steps` lists your
`portal.step()` ids in display order.

### Presentation and results

Add `manifest.presentation` to show static guidance above the form, and return a
`view` from `provision()` to show results after a run, both without any UI code:

```js
manifest.presentation = {
  intro: "Connect a Google account, then set this as the screensaver.",
  steps: ["Create OAuth credentials", "Upload client_secret.json", "Apply"],
  link: { label: "Setup guide", url: "https://example.com/guide" },
}

// inside provision():
return { view: { links: [{ label: "Open config", url: `http://${ip}:8090`, copy: true }] } }
```

The host validates a returned `view`: links must be `http(s)`, text is
length-capped, and a `download` is serialized defensively.

## API versioning

`PORTAL_API_VERSION` is the host contract version (currently **1**). Declare the
version your program targets in `manifest.apiVersion`. OpenPortal runs your
program only when `apiVersion <= ` the user's host version; otherwise it falls
back to the built-in program and asks the user to update. Adding fields or
calling existing `portal` methods does not need a bump; only bump when you rely
on capabilities introduced by a newer host.

## Testing

Open OpenPortal with a device connected, install/configure your launcher, and
watch the step list and audit log. The built-in program is the behavioral
baseline; diff against it. Browser deviations (no `adb tcpip`, no host-side file
writes) are documented in `docs/programs.md`.
