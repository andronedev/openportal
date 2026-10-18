use std::net::Ipv4Addr;

pub struct Config {
    pub port: u16,
    pub allowed_origins: Vec<String>,
    #[cfg_attr(not(feature = "tls"), allow(dead_code))]
    pub tls_cert: Option<String>,
    #[cfg_attr(not(feature = "tls"), allow(dead_code))]
    pub tls_key: Option<String>,
    pub pinned_device_ip: Option<Ipv4Addr>,
}

const DEFAULT_PORT: u16 = 8787;

impl Config {
    pub fn from_env() -> Self {
        let port = env("OPENPORTAL_BRIDGE_PORT")
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_PORT);

        let allowed_origins = env("OPENPORTAL_BRIDGE_ORIGINS")
            .map(|v| {
                v.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_else(default_origins);

        Self {
            port,
            allowed_origins,
            tls_cert: env("OPENPORTAL_BRIDGE_TLS_CERT"),
            tls_key: env("OPENPORTAL_BRIDGE_TLS_KEY"),
            pinned_device_ip: env("OPENPORTAL_BRIDGE_DEVICE_IP").and_then(|v| v.parse().ok()),
        }
    }
}

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

fn default_origins() -> Vec<String> {
    vec![
        "https://openportal.cc".to_string(),
        "http://localhost:5173".to_string(),
        "http://127.0.0.1:5173".to_string(),
    ]
}
