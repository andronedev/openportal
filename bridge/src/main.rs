mod config;
mod relay;
mod server;
#[cfg(feature = "desktop")]
mod tray;

use std::sync::Arc;

use config::Config;

fn main() -> anyhow::Result<()> {
    let config = Arc::new(Config::from_env());
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    #[cfg(feature = "desktop")]
    {
        let server_config = config.clone();
        runtime.spawn(async move {
            if let Err(err) = server::serve(server_config).await {
                eprintln!("openportal-bridge server error: {err}");
            }
        });
        tray::run(config)
    }

    #[cfg(not(feature = "desktop"))]
    {
        runtime.block_on(server::serve(config))
    }
}
