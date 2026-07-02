use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::config::Config;
use crate::relay;

const ADB_WIRELESS_PORT: u16 = 5555;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
}

pub fn app(config: Arc<Config>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/adb", get(adb_ws))
        .with_state(AppState { config })
}

pub async fn serve(config: Arc<Config>) -> anyhow::Result<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));
    let router = app(config.clone());

    #[cfg(feature = "tls")]
    if let (Some(cert), Some(key)) = (config.tls_cert.clone(), config.tls_key.clone()) {
        let tls = axum_server::tls_rustls::RustlsConfig::from_pem_file(cert, key).await?;
        eprintln!("openportal-bridge listening on https://{addr}");
        axum_server::bind_rustls(addr, tls)
            .serve(router.into_make_service())
            .await?;
        return Ok(());
    }

    eprintln!("openportal-bridge listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}

async fn health(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut response = Json(json!({
        "service": "openportal-bridge",
        "version": env!("CARGO_PKG_VERSION"),
    }))
    .into_response();
    apply_cors(response.headers_mut(), &state, &headers);
    response
}

#[derive(Deserialize)]
struct AdbQuery {
    ip: String,
    port: u16,
}

async fn adb_ws(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AdbQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    if allowed_origin(&state, &headers).is_none() {
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }

    let target = match validate_target(&state, &query) {
        Ok(target) => target,
        Err(message) => return (StatusCode::FORBIDDEN, message).into_response(),
    };

    ws.on_upgrade(move |socket| relay::run(socket, target))
}

fn allowed_origin(state: &AppState, headers: &HeaderMap) -> Option<String> {
    let origin = headers.get(header::ORIGIN)?.to_str().ok()?.to_string();
    state
        .config
        .allowed_origins
        .iter()
        .any(|allowed| allowed == &origin)
        .then_some(origin)
}

fn apply_cors(headers: &mut HeaderMap, state: &AppState, request: &HeaderMap) {
    if let Some(origin) = allowed_origin(state, request) {
        if let Ok(value) = HeaderValue::from_str(&origin) {
            headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
        }
    }
}

fn validate_target(state: &AppState, query: &AdbQuery) -> Result<SocketAddr, &'static str> {
    if query.port != ADB_WIRELESS_PORT {
        return Err("only port 5555 is allowed");
    }

    let ip: Ipv4Addr = query.ip.parse().map_err(|_| "invalid ipv4 address")?;
    if !is_private(ip) {
        return Err("only private network addresses are allowed");
    }

    if let Some(pinned) = state.config.pinned_device_ip {
        if pinned != ip {
            return Err("device ip not permitted");
        }
    }

    Ok(SocketAddr::new(IpAddr::V4(ip), query.port))
}

fn is_private(ip: Ipv4Addr) -> bool {
    ip.is_private() || ip.is_link_local()
}
