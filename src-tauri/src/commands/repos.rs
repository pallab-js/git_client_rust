use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::git;
use crate::models::{
    AddRepoResult, AddReposResult, RepoSummary, ScanCompleted, ScanHandle, ScanProgress, WatchMode,
};
use crate::state::{AppState, RefreshMode};
use crate::store::RepoRecord;

#[tauri::command]
pub async fn list_repos(state: State<'_, Arc<AppState>>) -> Result<Vec<RepoSummary>, AppError> {
    Ok(state.sorted_repos())
}

pub async fn add_repo_inner(app: &AppHandle, state: &Arc<AppState>, path: &str) -> AddRepoResult {
    match add_repo_validated(app, state, path).await {
        Ok(summary) => AddRepoResult {
            path: summary.path.clone(),
            ok: true,
            repo: Some(summary),
            error: None,
        },
        Err(error) => AddRepoResult {
            path: path.to_string(),
            ok: false,
            repo: None,
            error: Some(error),
        },
    }
}

async fn add_repo_validated(
    app: &AppHandle,
    state: &Arc<AppState>,
    path: &str,
) -> AppResult<RepoSummary> {
    let root = git::repo_root(Path::new(path))?;
    let canonical = root.to_string_lossy().to_string();

    if let Some(existing) = state.repo_by_path(&canonical) {
        let summary = crate::commands::git::perform_refresh(
            app.clone(),
            Arc::clone(state),
            existing.id.clone(),
            RefreshMode::Full,
        )
        .await?;
        crate::windows::show_main(app, state);
        return Ok(summary);
    }

    let name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.clone());
    let sort_order = state
        .repos_snapshot()
        .iter()
        .map(|record| record.sort_order)
        .max()
        .unwrap_or(-1)
        .saturating_add(1);
    let record = RepoRecord {
        id: uuid::Uuid::now_v7().to_string(),
        path: canonical,
        name,
        pinned: false,
        sort_order,
        watch_mode: "auto".to_string(),
        added_at: chrono::Utc::now().timestamp(),
        last_seen_at: None,
        cached_summary: None,
    };
    state.db.insert_repo(&record)?;
    state.upsert_record(record.clone());
    crate::watch::start_watcher(app.clone(), Arc::clone(state), &record);

    let summary = crate::commands::git::perform_refresh(
        app.clone(),
        Arc::clone(state),
        record.id.clone(),
        RefreshMode::Full,
    )
    .await?;
    crate::tray::refresh(app, state);
    Ok(summary)
}

#[tauri::command]
pub async fn add_repo(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<RepoSummary, AppError> {
    let state = Arc::clone(state.inner());
    let result = add_repo_inner(&app, &state, &path).await;
    match (result.ok, result.repo, result.error) {
        (true, Some(repo), _) => Ok(repo),
        (_, _, Some(error)) => Err(error),
        _ => Err(AppError::new(
            crate::models::ErrorCode::Unknown,
            "Could not add this repository.",
        )),
    }
}

#[tauri::command]
pub async fn add_repos(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
) -> Result<AddReposResult, AppError> {
    let state = Arc::clone(state.inner());
    let mut results = Vec::with_capacity(paths.len());
    for path in paths {
        results.push(add_repo_inner(&app, &state, &path).await);
    }
    crate::tray::refresh(&app, &state);
    Ok(AddReposResult { results })
}

#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    root: String,
    max_depth: Option<usize>,
) -> Result<ScanHandle, AppError> {
    let state = Arc::clone(state.inner());
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(AppError::invalid_path(
            "Choose an existing folder to scan for Git repositories.",
        ));
    }
    let root_path = git::canonicalize(root_path)?;
    let scan_id = uuid::Uuid::now_v7().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    state.add_scan(scan_id.clone(), Arc::clone(&cancel));

    let depth = max_depth.unwrap_or(3).clamp(1, 8);
    let settings = state.settings();
    let options = git::scan::ScanOptions {
        max_depth: depth,
        cap: 500,
        ignored_patterns: settings.ignored_patterns,
    };
    let worker_app = app.clone();
    let worker_state = Arc::clone(&state);
    let worker_id = scan_id.clone();

    std::thread::Builder::new()
        .name("gitpulse-scan".to_string())
        .spawn(move || {
            let progress_app = worker_app.clone();
            let progress_id = worker_id.clone();
            let result = git::scan::scan_repositories(
                &root_path,
                options,
                &cancel,
                |scanned, found, current| {
                    crate::events::scan_progress(
                        &progress_app,
                        &ScanProgress {
                            scan_id: progress_id.clone(),
                            scanned,
                            found,
                            current_path: current.to_string_lossy().to_string(),
                        },
                    );
                },
            );

            match result {
                Ok((candidates, truncated)) => {
                    crate::events::scan_completed(
                        &worker_app,
                        &ScanCompleted {
                            scan_id: worker_id.clone(),
                            candidates,
                            truncated,
                        },
                    );
                }
                Err(error) if error.code == crate::models::ErrorCode::ScanCancelled => {
                    tracing::debug!("scan {worker_id} cancelled");
                }
                Err(error) => {
                    crate::events::app_error(&worker_app, &error);
                }
            }
            worker_state.finish_scan(&worker_id);
        })
        .map_err(|error| {
            state.finish_scan(&scan_id);
            AppError::new(
                crate::models::ErrorCode::Unknown,
                format!("Could not start the folder scan: {error}"),
            )
        })?;

    Ok(ScanHandle { scan_id })
}

#[tauri::command]
pub async fn cancel_scan(state: State<'_, Arc<AppState>>, scan_id: String) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    state.cancel_scan(&scan_id);
    Ok(())
}

#[tauri::command]
pub async fn remove_repo(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    crate::watch::stop_watcher(&state, &id);
    state.db.remove_repo(&id)?;
    state.remove_record(&id);
    crate::events::repo_removed(&app, &id);
    crate::tray::refresh(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn locate_repo(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    new_path: String,
) -> Result<RepoSummary, AppError> {
    let state = Arc::clone(state.inner());
    let existing = state
        .repo(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))?;

    let root = git::repo_root(Path::new(&new_path))?;
    let canonical = root.to_string_lossy().to_string();
    if let Some(other) = state.repo_by_path(&canonical) {
        if other.id != id {
            return Err(AppError::invalid_path(
                "That folder is already monitored as another repository.",
            ));
        }
    }

    let name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.clone());
    state.db.update_path(&id, &canonical, &name)?;
    let mut updated = existing;
    updated.path = canonical;
    updated.name = name;
    state.upsert_record(updated.clone());

    crate::watch::start_watcher(app.clone(), Arc::clone(&state), &updated);
    let summary = crate::commands::git::perform_refresh(
        app.clone(),
        Arc::clone(&state),
        id,
        RefreshMode::Full,
    )
    .await?;
    Ok(summary)
}

#[tauri::command]
pub async fn set_repo_pinned(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    pinned: bool,
) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    state.db.set_pinned(&id, pinned)?;
    if let Some(mut record) = state.repo(&id) {
        record.pinned = pinned;
        state.upsert_record(record);
    }
    if let Some(mut summary) = state.summary(&id) {
        summary.pinned = pinned;
        state.put_summary(summary.clone());
        crate::events::repo_updated(&app, &summary);
    }
    Ok(())
}

#[tauri::command]
pub async fn reorder_repos(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    state.db.reorder(&ids)?;
    if let Ok(mut repos) = state.repos.write() {
        for (index, id) in ids.iter().enumerate() {
            if let Some(record) = repos.iter_mut().find(|record| &record.id == id) {
                record.sort_order = index as i64;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_repo_watch_mode(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    mode: WatchMode,
) -> Result<RepoSummary, AppError> {
    let state = Arc::clone(state.inner());
    let mode_string = match mode {
        WatchMode::Auto => "auto",
        WatchMode::Polling => "polling",
    };
    state.db.set_watch_mode(&id, mode_string)?;
    let record = state
        .repo(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))?;
    let mut updated = record;
    updated.watch_mode = mode_string.to_string();
    state.upsert_record(updated.clone());

    crate::watch::stop_watcher(&state, &id);
    if matches!(mode, WatchMode::Polling) {
        if let Some(summary) = state.set_watcher_state(&id, crate::models::WatcherState::Polling) {
            crate::events::repo_updated(&app, &summary);
        }
    } else {
        crate::watch::start_watcher(app.clone(), Arc::clone(&state), &updated);
    }
    crate::tray::refresh(&app, &state);
    state
        .summary(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))
}
