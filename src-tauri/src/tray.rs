use std::sync::{Arc, Mutex, OnceLock};

use tauri::image::Image;
use tauri::menu::{Menu, MenuBuilder, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::models::{TrayBadgeBasis, TrayStats};
use crate::state::{AppState, RefreshMode, TrayRect};

const TRAY_ID: &str = "main";

fn last_menu_signature() -> &'static Mutex<Option<String>> {
    static SIGNATURE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SIGNATURE.get_or_init(|| Mutex::new(None))
}

pub fn build(app: &AppHandle, state: &Arc<AppState>) -> tauri::Result<()> {
    let menu = build_menu(app, state)?;
    let icon = icon_for(&state.tray_stats(), state)?;
    let template = cfg!(target_os = "macos") && !has_attention(state);
    let tooltip = tooltip_for(&state.tray_stats());

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(template)
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "linux") {
                return;
            }
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                let state = app.state::<Arc<AppState>>().inner().clone();
                let scale = app
                    .primary_monitor()
                    .ok()
                    .flatten()
                    .map(|monitor| monitor.scale_factor())
                    .unwrap_or(1.0);
                state.set_tray_rect(rect_to_physical(&rect, scale));
                crate::windows::toggle_popover(app, &state);
            }
        })
        .build(app)?;

    update_menu_if_changed(app, state)?;
    Ok(())
}

pub fn refresh(app: &AppHandle, state: &Arc<AppState>) {
    let stats = state.tray_stats();
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(icon) = icon_for(&stats, state) {
            let template = cfg!(target_os = "macos") && !has_attention(state);
            let _ = tray.set_icon_with_as_template(Some(icon), template);
        }
        let _ = tray.set_tooltip(Some(tooltip_for(&stats)));
        #[cfg(target_os = "macos")]
        {
            let badge = state.tray_badge_count();
            let title = if badge > 0 {
                Some(badge.to_string())
            } else {
                None
            };
            let _ = tray.set_title(title);
        }
    }
    let _ = update_menu_if_changed(app, state);
    crate::events::tray_stats(app, &stats);
}

fn update_menu_if_changed(app: &AppHandle, state: &Arc<AppState>) -> tauri::Result<()> {
    let signature = menu_signature(state);
    {
        let Ok(mut last) = last_menu_signature().lock() else {
            return Ok(());
        };
        if last.as_deref() == Some(signature.as_str()) {
            return Ok(());
        }
        *last = Some(signature);
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = build_menu(app, state)?;
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

fn menu_signature(state: &AppState) -> String {
    let stats = state.tray_stats();
    let mut signature = format!(
        "{}:{}:{}:{}",
        stats.repos, stats.dirty, stats.conflicts, stats.behind
    );
    for summary in state.sorted_repos().into_iter().take(8) {
        signature.push('|');
        signature.push_str(&summary.id);
        signature.push(':');
        signature.push_str(&summary.name);
        signature.push(':');
        signature.push_str(&format!("{:?}", summary.primary_status));
    }
    signature
}

fn build_menu(app: &AppHandle, state: &Arc<AppState>) -> tauri::Result<Menu<tauri::Wry>> {
    let stats = state.tray_stats();
    let header_text = if stats.repos == 0 {
        "No repositories yet".to_string()
    } else {
        format!(
            "{} repos · {} dirty · {} conflict{} · {} behind",
            stats.repos,
            stats.dirty,
            stats.conflicts,
            if stats.conflicts == 1 { "" } else { "s" },
            stats.behind
        )
    };
    let header = MenuItem::with_id(app, "header", header_text, false, None::<&str>)?;

    let mut builder = MenuBuilder::new(app).item(&header).separator();

    for summary in state.sorted_repos().into_iter().take(8) {
        let status = summary_label(&summary);
        let label = format!("{} — {}", summary.name, status);
        let id = format!("repo:{}", summary.id);
        let item = MenuItem::with_id(app, id.as_str(), label, true, None::<&str>)?;
        builder = builder.item(&item);
    }
    if stats.repos > 0 {
        builder = builder.separator();
    }

    let refresh = MenuItem::with_id(app, "refresh_all", "Refresh all", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open GitPulse", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit GitPulse", true, None::<&str>)?;
    builder = builder.item(&refresh).item(&open).separator().item(&quit);
    builder.build()
}

fn handle_menu(app: &AppHandle, id: &str) {
    let state = match app.try_state::<Arc<AppState>>() {
        Some(state) => state.inner().clone(),
        None => return,
    };
    match id {
        "quit" => {
            state
                .quitting
                .store(true, std::sync::atomic::Ordering::Relaxed);
            crate::watch::stop_all(&state);
            app.exit(0);
        }
        "open" => crate::windows::show_main(app, &state),
        "refresh_all" => {
            state.queue_all(RefreshMode::Quick);
            refresh(app, &state);
        }
        _ => {
            if let Some(repo_id) = id.strip_prefix("repo:") {
                state.set_pending_selection(Some(repo_id.to_string()));
                crate::windows::show_main(app, &state);
                crate::events::repo_select(app, repo_id);
            }
        }
    }
}

fn summary_label(summary: &crate::models::RepoSummary) -> String {
    if summary.flags.conflicted {
        return format!(
            "{} conflict{}",
            summary.counts.conflicted,
            plural(summary.counts.conflicted)
        );
    }
    if summary.behind > 0 && summary.ahead > 0 {
        return format!("↑{} ↓{}", summary.ahead, summary.behind);
    }
    if summary.behind > 0 {
        return format!("↓{}", summary.behind);
    }
    if summary.flags.dirty {
        let changed = summary.counts.staged + summary.counts.modified + summary.counts.untracked;
        return format!("{changed} changed");
    }
    if summary.ahead > 0 {
        return format!("↑{}", summary.ahead);
    }
    if summary.primary_status == crate::models::PrimaryStatus::Unavailable {
        return "unavailable".to_string();
    }
    if summary.primary_status == crate::models::PrimaryStatus::Error {
        return "error".to_string();
    }
    "clean".to_string()
}

fn plural(count: usize) -> &'static str {
    if count == 1 {
        ""
    } else {
        "s"
    }
}

fn has_attention(state: &AppState) -> bool {
    let settings = state.settings();
    match settings.tray_badge_basis {
        TrayBadgeBasis::Conflicted => state
            .summaries_snapshot()
            .iter()
            .any(|summary| summary.flags.conflicted),
        TrayBadgeBasis::Dirty => state
            .summaries_snapshot()
            .iter()
            .any(|summary| summary.flags.dirty),
        TrayBadgeBasis::Attention => state
            .summaries_snapshot()
            .iter()
            .any(|summary| summary.flags.conflicted || summary.flags.dirty || summary.behind > 0),
    }
}

fn icon_for(stats: &TrayStats, state: &AppState) -> tauri::Result<Image<'static>> {
    let variant = if stats.conflicts > 0 {
        include_bytes!("../icons/tray-conflict.png").as_slice()
    } else if has_attention(state) {
        include_bytes!("../icons/tray-attention.png").as_slice()
    } else {
        include_bytes!("../icons/tray-clean.png").as_slice()
    };
    Image::from_bytes(variant)
}

fn tooltip_for(stats: &TrayStats) -> String {
    if stats.repos == 0 {
        return "GitPulse — no repositories".to_string();
    }
    format!(
        "GitPulse — {} repos · {} dirty · {} conflicts · {} behind",
        stats.repos, stats.dirty, stats.conflicts, stats.behind
    )
}

fn rect_to_physical(rect: &tauri::Rect, scale: f64) -> TrayRect {
    let (x, y) = match rect.position {
        tauri::Position::Physical(position) => (position.x as f64, position.y as f64),
        tauri::Position::Logical(position) => (position.x * scale, position.y * scale),
    };
    let (width, height) = match rect.size {
        tauri::Size::Physical(size) => (size.width as f64, size.height as f64),
        tauri::Size::Logical(size) => (size.width * scale, size.height * scale),
    };
    TrayRect {
        x,
        y,
        width,
        height,
    }
}
