use std::sync::Arc;

use anyhow::Context;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::{Menu, MenuEvent, MenuItem};
use tray_icon::TrayIconBuilder;

use crate::config::Config;

pub fn run(config: Arc<Config>) -> anyhow::Result<()> {
    register_autolaunch();

    let event_loop = EventLoopBuilder::new().build();

    let menu = Menu::new();
    let status = MenuItem::new(
        format!("Bridging on 127.0.0.1:{}", config.port),
        false,
        None,
    );
    let quit = MenuItem::new("Quit OpenPortal Bridge", true, None);
    menu.append(&status).context("append status item")?;
    menu.append(&quit).context("append quit item")?;

    let _tray = TrayIconBuilder::new()
        .with_tooltip("OpenPortal Bridge")
        .with_menu(Box::new(menu))
        .build()
        .context("build tray icon")?;

    let menu_events = MenuEvent::receiver();
    let quit_id = quit.id().clone();

    event_loop.run(move |_event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        while let Ok(event) = menu_events.try_recv() {
            if event.id == quit_id {
                *control_flow = ControlFlow::Exit;
            }
        }
    })
}

fn register_autolaunch() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let path = exe.to_string_lossy().to_string();
    match auto_launch::AutoLaunchBuilder::new()
        .set_app_name("OpenPortal Bridge")
        .set_app_path(&path)
        .build()
    {
        Ok(launcher) => {
            if let Err(err) = launcher.enable() {
                eprintln!("openportal-bridge: autolaunch enable failed: {err}");
            }
        }
        Err(err) => eprintln!("openportal-bridge: autolaunch setup failed: {err}"),
    }
}
