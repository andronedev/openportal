# Wireless ADB support (PRD)

| | |
|---|---|
| **Status** | In progress (browser Phases 0-2 landed; bridge crate landed; signing/release pending) |
| **Author** | andronedev |
| **Date** | 2026-07-02 |
| **Scope** | Manage a Portal over Wi-Fi, not only over the USB cable, while keeping the browser-first identity of the project |

> **Implementation note.** The browser transport abstraction, the USB "Enable
> wireless" step, and the WebSocket transport with bridge detection are
> implemented (`src/lib/adb/{connection,wireless,ws-connection}.ts`,
> `src/store/{device-store,wireless-store}.ts`,
> `src/components/connection/WirelessPanel.tsx`). The bridge is a Rust crate in
> this monorepo at **`bridge/`**. What remains is real-hardware validation, the
> production certificate for `local.openportal.cc`, and code signing.

## 1. Summary

Today OpenPortal talks to a Portal only over a USB cable, through WebUSB. This
document specifies adding **wireless ADB**: after a one-time USB setup, the user
manages the device over the local network with no cable attached.

The important finding up front: a normal website **cannot** open a raw TCP
socket to a device, so pure wireless ADB from `openportal.cc` alone is not
possible. The feature therefore ships in two honest halves:

1. A **USB-side "Enable wireless" step** that needs nothing new installed. It is
   useful on its own and is the foundation for the rest.
2. An optional, tiny, cross-platform **local bridge** (a tray companion) that
   relays the browser's WebSocket to the device's TCP port. It is the only way
   to reach the device wirelessly from a URL-based site, and it is designed so it
   never sees any secret.

## 2. Background and motivation

Users ask to manage the Portal without a permanent cable: place the device on a
shelf, drive it from the browser over Wi-Fi. The Portal runs Android 10 and
supports classic wireless ADB (`adb tcpip 5555` then `adb connect ip:5555`, with
RSA key authentication). The credential store OpenPortal already uses for USB
handles that same authentication, so the trust model does not change.

## 3. The core constraint (why a companion is required)

Wireless ADB is raw TCP to `device_ip:5555`. A browser tab on a normal website
has no way to open an arbitrary TCP socket. Every alternative was evaluated:

| Path | Real Wi-Fi? | Stays no-backend? | Installable by everyone today? |
|---|---|---|---|
| Normal website (`openportal.cc`) | No | Yes | Yes |
| Chrome extension (MV3) | No (never had raw TCP) | Yes | Yes |
| Chrome App (`chrome.sockets.tcp`) | Yes | Yes | No (platform end of life) |
| Isolated Web App + Direct Sockets | Yes | Yes | No (dev flag or enterprise only) |
| Website or extension + native bridge | Yes | No (native binary) | Yes |

No single option gives *Wi-Fi + zero install + everyone* at once. The Direct
Sockets API that would allow raw TCP is restricted to Isolated Web Apps, which
in mid-2026 can only be installed via a Chrome developer flag or an enterprise
policy, not by the general public. Chrome extensions never had raw TCP (that
belonged to the deprecated Chrome Apps platform).

The only path that keeps the URL-based site and works for everyone is a small
**local bridge**. This PRD accepts that tradeoff: USB stays install-free, and
Wi-Fi becomes an opt-in upgrade for users who install the bridge.

## 4. Goals

- Manage a Portal over Wi-Fi with the same feature set as USB (shell, files,
  screen mirror, logcat, app install).
- The USB "Enable wireless" step works with **nothing extra installed**.
- The bridge is **one lightweight binary**, runs from the system tray, starts on
  login, and is the same on Windows, macOS, and Linux.
- The bridge is a **transport only**: it never holds ADB keys and never decrypts
  the stream. ADB authentication stays end to end in the browser.
- A **transport abstraction** in the browser so a future Direct Sockets backend
  (when consumer Isolated Web Apps ship) drops in without rewriting the app.

## 5. Non-goals

- We do not build a general TCP proxy. The bridge reaches ADB only.
- We do not require the bridge for USB. USB must keep working with no install.
- We do not target Firefox or Safari (WebUSB and this flow are Chromium only).
- We do not implement Android 11 style mDNS pairing. The Portal is Android 10.
- We do not ship an Isolated Web App in this iteration. It is future work.

## 6. Solution overview

```
Chrome (openportal.cc)        Local bridge (tray app)          Portal
  WebSocket client     <-->   WSS on 127.0.0.1  +  TCP  <-->   adbd :5555
                              (relays raw ADB bytes)          (over Wi-Fi)
```

The bridge is a **dumb byte pipe**. It carries the raw ADB packet stream between
a WebSocket (which the browser can open) and a TCP socket to the device (which
native code can open). Because ADB's RSA handshake runs inside the browser
through the tunnel, the bridge never sees or needs any key. This keeps the whole
trust model in the front end, unchanged from USB.

### Bridge contract (pinned)

Both sides agree on this wire contract. The browser reads it in
`src/lib/adb/ws-connection.ts`; the bridge serves it in `bridge/src/server.rs`.

- **Port** `8787` on `127.0.0.1` (override `OPENPORTAL_BRIDGE_PORT`).
- **Host** `local.openportal.cc` (public DNS `A` record to `127.0.0.1`) in
  production over HTTPS/WSS; `127.0.0.1` over HTTP/WS in local dev.
- **Detection** `GET /health` returns JSON `{ "service", "version" }` with an
  `Access-Control-Allow-Origin` echoing an allowlisted origin.
- **Relay** `GET /adb?ip=<ipv4>&port=5555`, upgraded to a WebSocket whose binary
  frames are the raw ADB byte stream, piped verbatim to `ip:5555`.

## 7. User experience

### 7.1 Enable wireless (over USB, no install)

While connected over USB, the user clicks **Enable wireless ADB**. OpenPortal:

1. runs `adb tcpip 5555` to switch `adbd` into network mode,
2. reads the Portal's Wi-Fi IP address from the device,
3. shows the address and persists it for later reconnection.

This half needs no bridge. Without the bridge, it still tells the user their
device is now reachable and how.

### 7.2 Install the bridge (one time)

The user downloads **OpenPortal Bridge**, a signed installer. Launching it
installs the binary, registers a login-item so it starts on boot, and places a
tray icon. The tray shows status (linked to openportal.cc, bridging device at
`192.168.x.x`), a quit action, and a start-on-login toggle.

### 7.3 Connect over Wi-Fi

OpenPortal probes the bridge at its local health endpoint. When present, the UI
offers **Connect over Wi-Fi**. The device IP captured in 7.1 is handed to the
bridge, the browser opens the WebSocket transport, and the session runs exactly
like USB.

### 7.4 Reconnect

On later visits, if the bridge is running and the device answers, OpenPortal
offers a one-click wireless reconnect using the persisted IP.

## 8. Functional requirements

### Browser (this repo)

- A new `src/lib/adb/` transport that wraps a WebSocket to the bridge and feeds
  the same `AdbDaemonTransport.authenticate(...)` path as USB.
- Bridge detection: probe `wss://local.openportal.cc:PORT/health`, degrade
  cleanly when absent.
- UI in the connect and dashboard surfaces for enabling wireless, showing the
  IP, installing the bridge, and connecting or reconnecting. All strings go
  through i18n (`en`, `fr`).
- No `@yume-chan/*` import outside `src/lib/adb/`, per project convention.

### Bridge (new binary, separate artifact)

- Serve WSS bound to `127.0.0.1` only.
- Accept a WebSocket, open a TCP socket to the requested `device_ip:5555`, and
  pipe bytes both ways until either side closes.
- Expose a small health endpoint for detection and a status readout for the
  tray.
- Register and unregister start-on-login.
- Enforce the security rules in section 10 on every connection.

## 9. Technical design

### 9.1 Browser transport abstraction

`src/lib/adb/connection.ts` gains a transport selector so `connectDevice` can be
backed by either a WebUSB connection (today) or a WebSocket connection (the
bridge). Both produce the ADB packet duplex that
`AdbDaemonTransport.authenticate` consumes, so the rest of the app is unchanged.
This same seam is where a future Direct Sockets backend attaches.

### 9.2 The bridge binary (stack)

A single Rust binary, no webview, no runtime to install, a few megabytes. As
implemented in `bridge/`:

- `tokio`: async runtime
- `axum` (feature `ws`): serves both `GET /health` and the `GET /adb` WebSocket
  upgrade on one listener, with header access for the Origin allowlist. This
  replaces the raw `tokio-tungstenite` in the original sketch: multiplexing an
  HTTP health route and a WS upgrade with origin checks on one TLS port is much
  cleaner through axum than hand-rolling the HTTP/WS split.
- `axum-server` with `tls-rustls` (feature `tls`): TLS for the WSS listener,
  reading a PEM cert/key.
- `tray-icon` with `tao`, and `auto-launch` (feature `desktop`): the tray icon
  and cross-platform start-on-login (LaunchAgent, registry Run key, XDG
  autostart, behind one API).

Features are gated so `cargo check` on the default (networking-only) build is
fast and dependency-light; `--features production` pulls TLS and the desktop
shell. The relay itself is on the order of a few hundred lines. Rust is chosen
for the smallest footprint and a memory-safety story that reinforces the
security posture.

Tauri was considered and rejected for this iteration: it is built around a
webview the bridge does not need. It would only make sense if a real settings
window is added later.

### 9.3 The mixed-content solution

`openportal.cc` is HTTPS. An HTTPS page cannot open `ws://127.0.0.1` (blocked as
mixed content), and a self-signed local certificate would require installing a
local CA. The fix, the same pattern Plex uses with `*.plex.direct`:

1. a DNS `A` record for `local.openportal.cc` pointing at `127.0.0.1`,
2. a real publicly trusted certificate (Let's Encrypt) for that name,
3. the bridge serves WSS on `127.0.0.1` using that certificate.

The browser connects to `wss://local.openportal.cc:PORT`, which resolves to
loopback and presents a valid certificate, so there is no mixed-content block
and no local CA to install. The private key ships inside the distributed binary
(extractable), so it is rotated periodically. This is acceptable for a
loopback-only listener.

### 9.4 One codebase, three builds

The bridge is a single source tree. Roughly 95 percent is shared; the per-OS
parts (start-on-login, tray, installer format) are handled by the crates above,
not written three times. The current CI (`.github/workflows/bridge.yml`) is a
hand-rolled GitHub Actions matrix (macOS, Windows, Linux runners) that compiles
each target on its own runner, because the tray libraries link native GUI code
and do not cross-compile cleanly from one machine; it runs fmt/clippy/test on
bridge PRs and builds + uploads release binaries on `bridge-v*` tags. Adopting
`cargo-dist` later would add per-OS installers, a one-line web installer, and an
auto-update channel on top of this; it is deferred to keep the release path
self-contained for now.

## 10. Security model

The bridge grants local network reach to a browser, so it is defended as if
hostile pages will try to abuse it.

1. **Loopback only.** Bind `127.0.0.1`, never `0.0.0.0`. Only local processes
   can reach the bridge.
2. **Origin allowlist.** Complete the WebSocket handshake only when `Origin` is
   exactly `https://openportal.cc` (plus localhost in dev). Without this, any
   tab the user has open could pivot through the bridge to their devices.
3. **Target restriction.** Relay only to port 5555 on a private (RFC1918)
   address, and ideally only to the specific device IP the user selected in the
   UI. Never a general TCP proxy, to avoid SSRF.
4. **No secrets in the bridge.** ADB RSA authentication runs in the browser
   through the tunnel. The bridge is a byte pipe and holds no key.

The bridge should also surface what it is doing (which origin is connected,
which device IP is bridged) in the tray, mirroring the audit-log posture the
sandboxed program runtime already uses.

## 11. Distribution and signing

Code is shared across platforms, but each OS wants its own signature, and this
is the real cost:

- **macOS**: Apple notarization (Developer account, about 99 USD per year) or
  Gatekeeper blocks the app.
- **Windows**: an Authenticode certificate or SmartScreen warns users.
- **Linux**: `.deb`, `.rpm`, or AppImage, no mandatory signing.

`cargo-dist` provides hooks to run these signing steps in CI. A known Linux
caveat: `tray-icon` relies on `libappindicator`, present on most desktops but
not guaranteed (a bare GNOME without the extension may not show the icon).

## 12. Phasing

- **Phase 0 (browser):** introduce the transport abstraction in
  `src/lib/adb/` with USB as the only backend. Pure refactor, no behavior change.
- **Phase 1 (browser):** the USB-side "Enable wireless" step (tcpip, read IP,
  show and persist). Ships value with nothing installed.
- **Phase 2 (bridge + browser):** the Rust bridge, the WebSocket transport, and
  bridge detection. First end-to-end wireless session.
- **Phase 3 (release):** packaging, signing, auto-update, tray polish, i18n,
  docs.
- **Future:** a Direct Sockets backend behind the same abstraction, enabled only
  in an Isolated Web App context, for the day consumer IWAs are installable.

## 13. Risks and open questions

- **Signing friction and cost.** The macOS and Windows certificates are a real
  recurring expense and setup burden. Decision needed on whether to fund them or
  ship unsigned with clear warnings for early adopters.
- **Certificate key in the binary.** Rotation cadence and a revocation plan for
  `local.openportal.cc` need to be defined.
- **Trust perception.** Asking users to install a native companion for a
  "browser tool" is a positioning shift. Messaging must be clear that USB needs
  nothing and the bridge is optional.
- **Linux tray variance.** Fallback behavior when no tray is available (for
  example a headless status log or a local status page).
- **Network reachability.** Client isolation on some Wi-Fi networks blocks
  device-to-device traffic. The UI should detect and explain this failure.

## 14. Success metrics

- A user can complete USB enable, install the bridge, and run a full wireless
  session (screen mirror plus an app install) without touching a terminal.
- The bridge idle footprint stays in single-digit megabytes of memory.
- One tagged release produces signed installers for all three platforms from CI
  with no manual per-OS steps beyond signing secrets.

## 15. Future work

When consumer Isolated Web Apps become installable, a Direct Sockets backend can
replace the bridge for users on that path, using the transport abstraction from
Phase 0, and delete the companion requirement entirely. The bridge remains the
compatible fallback for everyone else.

## Appendix: glossary

- **ADB tcpip mode**: `adb tcpip 5555` tells the device's `adbd` to listen on a
  TCP port so it can be reached over the network.
- **Direct Sockets**: a browser API for raw TCP and UDP, restricted to Isolated
  Web Apps.
- **Isolated Web App (IWA)**: a signed, packaged web app served from an
  `isolated-app://` origin, installable today only via a dev flag or enterprise
  policy.
- **Bridge / companion**: the local tray binary that relays WebSocket traffic to
  the device's ADB TCP port.
