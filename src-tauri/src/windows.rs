use std::sync::Arc;

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use crate::models::ShowDockIcon;
use crate::state::{AppState, RefreshMode};

pub fn show_main(app: &AppHandle, state: &Arc<AppState>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    } else if let Err(error) = create_main(app) {
        tracing::error!("could not create main window: {error}");
        crate::events::app_error(
            app,
            &crate::error::AppError::new(
                crate::models::ErrorCode::Unknown,
                format!("Could not open the GitPulse window: {error}"),
            ),
        );
        return;
    }
    apply_activation_policy(app, state);
}

fn create_main(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("GitPulse")
        .inner_size(1080.0, 720.0)
        .min_inner_size(900.0, 600.0)
        .resizable(true)
        .visible(true)
        .build()?;
    Ok(())
}

pub fn toggle_popover(app: &AppHandle, state: &Arc<AppState>) {
    if cfg!(target_os = "linux") {
        show_main(app, state);
        return;
    }

    if let Some(window) = app.get_webview_window("popover") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
            apply_activation_policy(app, state);
            return;
        }
        position_popover(app, state, &window);
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        match create_popover(app) {
            Ok(window) => {
                position_popover(app, state, &window);
                let _ = window.show();
                let _ = window.set_focus();
            }
            Err(error) => {
                tracing::error!("could not create popover: {error}");
                return;
            }
        }
    }

    apply_activation_policy(app, state);
    queue_stale_refreshes(state);
}

fn create_popover(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    WebviewWindowBuilder::new(app, "popover", WebviewUrl::App("index.html".into()))
        .title("GitPulse")
        .inner_size(380.0, 520.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
}

fn position_popover(app: &AppHandle, state: &AppState, window: &tauri::WebviewWindow) {
    let Some(rect) = state.tray_rect() else {
        return;
    };
    let center_x = rect.x + rect.width / 2.0;
    let center_y = rect.y + rect.height / 2.0;
    let monitor = app
        .monitor_from_point(center_x, center_y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let scale = monitor.scale_factor();
    let size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(
        (380.0 * scale) as u32,
        (520.0 * scale) as u32,
    ));
    let work = monitor.work_area();
    let left = work.position.x as f64;
    let top = work.position.y as f64;
    let right = left + work.size.width as f64;
    let bottom = top + work.size.height as f64;

    let mut x = center_x - size.width as f64 / 2.0;
    let mut y = rect.y + rect.height + 8.0;
    if y + size.height as f64 > bottom {
        y = rect.y - size.height as f64 - 8.0;
    }

    x = x.clamp(left, (right - size.width as f64).max(left));
    y = y.clamp(top, (bottom - size.height as f64).max(top));
    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

fn queue_stale_refreshes(state: &Arc<AppState>) {
    let now = chrono::Utc::now();
    for summary in state.summaries_snapshot() {
        let stale = chrono::DateTime::parse_from_rfc3339(&summary.updated_at)
            .map(|updated| (now - updated.with_timezone(&chrono::Utc)).num_seconds() > 10)
            .unwrap_or(true);
        if stale {
            state.queue_refresh(summary.id, RefreshMode::Quick);
        }
    }
}

pub fn hide_popover(app: &AppHandle, state: &Arc<AppState>, destroy: bool) {
    if let Some(window) = app.get_webview_window("popover") {
        if destroy {
            let _ = window.destroy();
        } else {
            let _ = window.hide();
        }
    }
    apply_activation_policy(app, state);
}

pub fn main_is_open(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|window| window.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

pub fn any_window_open(app: &AppHandle) -> bool {
    app.webview_windows()
        .values()
        .any(|window| window.is_visible().unwrap_or(false))
}

pub fn apply_activation_policy(app: &AppHandle, state: &AppState) {
    #[cfg(target_os = "macos")]
    {
        let settings = state.settings();
        let policy = match settings.show_dock_icon {
            ShowDockIcon::Always => tauri::ActivationPolicy::Regular,
            ShowDockIcon::Never => tauri::ActivationPolicy::Accessory,
            ShowDockIcon::WhenWindowOpen => {
                if main_is_open(app) {
                    tauri::ActivationPolicy::Regular
                } else {
                    tauri::ActivationPolicy::Accessory
                }
            }
        };
        if app.set_activation_policy(policy).is_err() {
            tracing::debug!("could not update macOS activation policy");
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, state);
    }
}

pub fn handle_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    let app = window.app_handle();
    let state = match app.try_state::<Arc<AppState>>() {
        Some(state) => state.inner().clone(),
        None => return,
    };

    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            if window.label() == "main" {
                api.prevent_close();
                let _ = window.destroy();
                apply_activation_policy(app, &state);
            } else if window.label() == "popover" {
                let keep_warm = state.settings().keep_popover_warm;
                api.prevent_close();
                if keep_warm {
                    let _ = window.hide();
                } else {
                    let _ = window.destroy();
                }
                apply_activation_policy(app, &state);
            }
        }
        tauri::WindowEvent::Focused(false) if window.label() == "popover" => {
            let keep_warm = state.settings().keep_popover_warm;
            if keep_warm {
                let _ = window.hide();
            } else {
                let _ = window.destroy();
            }
            apply_activation_policy(app, &state);
        }
        tauri::WindowEvent::Destroyed if window.label() == "main" => {
            apply_activation_policy(app, &state);
        }
        _ => {}
    }
}
