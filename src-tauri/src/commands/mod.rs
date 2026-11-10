pub mod git;
pub mod repos;
pub mod settings;
pub mod window;

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tokio::sync::Semaphore;

use crate::state::{AppState, RefreshMode};

pub async fn run_refresh_worker(app: AppHandle, state: Arc<AppState>) {
    let Some(mut receiver) = state.take_refresh_rx() else {
        return;
    };
    let semaphore = Arc::new(Semaphore::new(4));

    while let Some(request) = receiver.recv().await {
        if !state.try_begin_job(&request.repo_id) {
            state.mark_pending(&request.repo_id);
            continue;
        }
        let permit = match Arc::clone(&semaphore).acquire_owned().await {
            Ok(permit) => permit,
            Err(_) => {
                state.end_job(&request.repo_id);
                break;
            }
        };

        let job_app = app.clone();
        let job_state = Arc::clone(&state);
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            if let Err(error) = git::perform_refresh(
                job_app.clone(),
                Arc::clone(&job_state),
                request.repo_id.clone(),
                request.mode,
            )
            .await
            {
                tracing::warn!("refresh job for {} failed: {error}", request.repo_id);
                crate::events::app_error(&job_app, &error);
            }
            job_state.end_job(&request.repo_id);
            if job_state.take_pending(&request.repo_id) {
                job_state.queue_refresh(request.repo_id.clone(), request.mode);
            }
        });
    }
}

pub async fn run_scheduler(app: AppHandle, state: Arc<AppState>) {
    let mut tick = tokio::time::interval(Duration::from_secs(5));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last_reconcile = Instant::now();
    let mut last_poll = Instant::now();
    let mut last_retry = Instant::now();

    loop {
        tick.tick().await;
        if state.quitting.load(std::sync::atomic::Ordering::Relaxed) {
            break;
        }
        state.prune_if_due();

        let settings = state.settings();
        let windows_open = crate::windows::any_window_open(&app);
        let reconcile = if windows_open {
            Duration::from_secs(settings.reconcile_interval_sec)
        } else {
            Duration::from_secs(settings.idle_poll_interval_sec)
        };

        if last_reconcile.elapsed() >= reconcile {
            last_reconcile = Instant::now();
            for record in state.repos_snapshot() {
                state.queue_refresh(record.id, RefreshMode::Quick);
            }
        }

        if last_poll.elapsed() >= Duration::from_secs(15) {
            last_poll = Instant::now();
            for summary in state.summaries_snapshot() {
                if summary.watcher == crate::models::WatcherState::Polling {
                    state.queue_refresh(summary.id, RefreshMode::Quick);
                }
            }
        }

        if last_retry.elapsed() >= Duration::from_secs(60) {
            last_retry = Instant::now();
            for record in state.repos_snapshot() {
                let retry = state
                    .summary(&record.id)
                    .map(|summary| summary.watcher != crate::models::WatcherState::Active)
                    .unwrap_or(true);
                if retry && record.watch_mode == "auto" {
                    crate::watch::start_watcher(app.clone(), Arc::clone(&state), &record);
                }
            }
        }
    }
}
