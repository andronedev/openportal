use std::sync::Arc;

use anyhow::Context;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIconBuilder};

use crate::config::Config;

const SITE_URL: &str = "https://openportal.cc";

pub fn run(config: Arc<Config>) -> anyhow::Result<()> {
    register_autolaunch();

    let event_loop = EventLoopBuilder::new().build();

    let menu = Menu::new();
    let status = MenuItem::new(
        format!("Bridging on 127.0.0.1:{}", config.port),
        false,
        None,
    );
    let open_site = MenuItem::new("Open openportal.cc", true, None);
    let quit = MenuItem::new("Quit OpenPortal Bridge", true, None);
    menu.append(&status).context("append status item")?;
    menu.append(&PredefinedMenuItem::separator())
        .context("append separator")?;
    menu.append(&open_site).context("append open item")?;
    menu.append(&quit).context("append quit item")?;

    let mut builder = TrayIconBuilder::new()
        .with_tooltip("OpenPortal Bridge")
        .with_menu(Box::new(menu));
    if let Some(icon) = glyph_icon() {
        builder = builder.with_icon(icon);
    }
    #[cfg(target_os = "macos")]
    {
        builder = builder.with_icon_as_template(true);
    }
    let _tray = builder.build().context("build tray icon")?;

    let menu_events = MenuEvent::receiver();
    let open_site_id = open_site.id().clone();
    let quit_id = quit.id().clone();

    event_loop.run(move |_event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        while let Ok(event) = menu_events.try_recv() {
            if event.id == open_site_id {
                open_site_url();
            } else if event.id == quit_id {
                *control_flow = ControlFlow::Exit;
            }
        }
    })
}

fn open_site_url() {
    std::thread::spawn(|| {
        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open").arg(SITE_URL).status();
        #[cfg(target_os = "windows")]
        let result = std::process::Command::new("cmd")
            .args(["/C", "start", "", SITE_URL])
            .status();
        #[cfg(all(unix, not(target_os = "macos")))]
        let result = std::process::Command::new("xdg-open")
            .arg(SITE_URL)
            .status();
        if let Err(err) = result {
            eprintln!("openportal-bridge: cannot open {SITE_URL}: {err}");
        }
    });
}

fn glyph_icon() -> Option<Icon> {
    const SIZE: u32 = 32;
    let color: [u8; 3] = if cfg!(target_os = "macos") {
        [0, 0, 0]
    } else {
        [167, 139, 250]
    };
    let center = SIZE as f32 / 2.0;
    let half_extent = 9.0;
    let corner = 4.5;
    let stroke = 3.0;
    let gap_cos = (28.0f32).to_radians().cos();
    let dot_offset = 7.5;
    let dot_radius = 1.5;
    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for y in 0..SIZE {
        for x in 0..SIZE {
            let px = x as f32 + 0.5 - center;
            let py = y as f32 + 0.5 - center;
            let qx = px.abs() - (half_extent - corner);
            let qy = py.abs() - (half_extent - corner);
            let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
            let inside = qx.max(qy).min(0.0);
            let ring_dist = outside + inside - corner;
            let mut alpha = (stroke / 2.0 - ring_dist.abs() + 0.5).clamp(0.0, 1.0);
            let len = (px * px + py * py).sqrt().max(0.001);
            let toward_gap = (px - py) / (len * std::f32::consts::SQRT_2);
            if toward_gap > gap_cos {
                alpha = 0.0;
            }
            let dx = px - dot_offset;
            let dy = py + dot_offset;
            let dot_dist = (dx * dx + dy * dy).sqrt();
            alpha = alpha.max((dot_radius - dot_dist + 0.5).clamp(0.0, 1.0));
            rgba.extend_from_slice(&[color[0], color[1], color[2], (alpha * 255.0) as u8]);
        }
    }
    Icon::from_rgba(rgba, SIZE, SIZE).ok()
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
