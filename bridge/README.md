# OpenPortal Bridge

A tiny local companion that lets [openportal.cc](https://openportal.cc) manage a
Portal over Wi-Fi. A browser tab cannot open a raw TCP socket to a device, so
this bridge accepts a WebSocket from the site and pipes the raw ADB byte stream
to the Portal's `adbd` TCP port (`device_ip:5555`).

The bridge is a **dumb byte pipe**. ADB's RSA handshake runs end to end inside
the browser through the tunnel, so the bridge never sees or holds any key.

## What it does

- Serves `GET /health` (JSON, for the site to detect the bridge) and
  `GET /adb?ip=<ipv4>&port=5555` (the WebSocket relay) on `127.0.0.1`.
- Relays raw ADB bytes both ways until either side closes.

## Security rules (enforced on every connection)

- **Loopback only** — binds `127.0.0.1`, never `0.0.0.0`.
- **Origin allowlist** — the WebSocket and CORS responses only serve
  `https://openportal.cc` (and localhost dev origins). Configurable via
  `OPENPORTAL_BRIDGE_ORIGINS`.
- **Target restriction** — relays only to a private (RFC1918) IPv4 on port
  `5555`. Optionally pin one device IP with `OPENPORTAL_BRIDGE_DEVICE_IP`.
- **No secrets** — the bridge holds no ADB keys.

## Build

```bash
# Networking core only (dev, plain ws://127.0.0.1)
cargo run

# Production build: TLS listener + system tray + start-on-login
cargo run --features production
```

### Feature flags

| Feature | Adds |
|---|---|
| `tls` | HTTPS/WSS listener via `axum-server` + rustls (reads a PEM cert/key) |
| `desktop` | System tray (`tray-icon` + `tao`) and start-on-login (`auto-launch`) |
| `production` | `tls` + `desktop` |

## Configuration (environment)

| Variable | Default |
|---|---|
| `OPENPORTAL_BRIDGE_PORT` | `8787` |
| `OPENPORTAL_BRIDGE_ORIGINS` | `https://openportal.cc,http://localhost:5173,http://127.0.0.1:5173` |
| `OPENPORTAL_BRIDGE_TLS_CERT` / `OPENPORTAL_BRIDGE_TLS_KEY` | unset (plain HTTP) |
| `OPENPORTAL_BRIDGE_DEVICE_IP` | unset (any RFC1918 IP allowed) |

## TLS and mixed content

`openportal.cc` is HTTPS and cannot open `ws://127.0.0.1` (mixed content). In
production the bridge presents a publicly-trusted certificate for
`local.openportal.cc` (a public DNS `A` record pointing at `127.0.0.1`), so the
browser reaches `wss://local.openportal.cc:8787` over loopback with a valid
certificate and no local CA to install. Point `OPENPORTAL_BRIDGE_TLS_CERT` /
`OPENPORTAL_BRIDGE_TLS_KEY` at that certificate.

During local development the site is served over HTTP from `localhost`, where a
plain `ws://127.0.0.1` to loopback is allowed, so no certificate is needed.
