use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};

use crate::error::{AppError, AppResult};
use crate::models::{ErrorCode, WatcherState};
use crate::watch::debounce::DebounceState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchKind {
    Workdir,
    Metadata,
}

impl WatchKind {
    fn merge(self, other: WatchKind) -> WatchKind {
        match (self, other) {
            (WatchKind::Metadata, _) | (_, WatchKind::Metadata) => WatchKind::Metadata,
            _ => WatchKind::Workdir,
        }
    }
}

pub struct WatchOptions {
    pub workdir: PathBuf,
    pub gitdirs: Vec<PathBuf>,
    pub force_polling: bool,
    pub linux_dir_cap: usize,
    pub ignored_patterns: Vec<String>,
}

#[derive(Default)]
pub struct WatchManager {
    entries: HashMap<String, WatchEntry>,
}

struct WatchEntry {
    control: Sender<WatchControl>,
    state: WatcherState,
}

enum WatchControl {
    Event(WatchKind),
    Stop,
}

impl WatchManager {
    pub fn start<F, G>(
        &mut self,
        repo_id: &str,
        options: WatchOptions,
        on_event: F,
        on_degrade: G,
    ) -> AppResult<WatcherState>
    where
        F: Fn(WatchKind) + Send + 'static,
        G: Fn() + Send + 'static,
    {
        self.stop(repo_id);

        if options.force_polling {
            return Ok(WatcherState::Polling);
        }

        let (control_tx, control_rx) = mpsc::channel();
        let (init_tx, init_rx) = mpsc::sync_channel(1);

        thread::Builder::new()
            .name(format!("gitpulse-watch-{repo_id}"))
            .spawn(move || {
                run_watcher_thread(options, control_rx, init_tx, on_event, on_degrade);
            })
            .map_err(|err| {
                AppError::new(
                    ErrorCode::WatcherFailed,
                    format!("Could not start the file watcher: {err}"),
                )
            })?;

        match init_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(state)) => {
                self.entries.insert(
                    repo_id.to_string(),
                    WatchEntry {
                        control: control_tx,
                        state,
                    },
                );
                Ok(state)
            }
            Ok(Err(message)) => Err(AppError::new(ErrorCode::WatcherFailed, message)),
            Err(_) => Err(AppError::new(
                ErrorCode::WatcherFailed,
                "The file watcher did not start in time.",
            )),
        }
    }

    pub fn stop(&mut self, repo_id: &str) {
        if let Some(entry) = self.entries.remove(repo_id) {
            let _ = entry.control.send(WatchControl::Stop);
        }
    }

    pub fn stop_all(&mut self) {
        let ids: Vec<String> = self.entries.keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }

    pub fn state(&self, repo_id: &str) -> Option<WatcherState> {
        self.entries.get(repo_id).map(|entry| entry.state)
    }
}

fn run_watcher_thread<F, G>(
    options: WatchOptions,
    control_rx: Receiver<WatchControl>,
    init_tx: mpsc::SyncSender<Result<WatcherState, String>>,
    on_event: F,
    on_degrade: G,
) where
    F: Fn(WatchKind) + Send + 'static,
    G: Fn() + Send + 'static,
{
    let gitdirs: Arc<Vec<PathBuf>> = Arc::new(options.gitdirs.clone());
    let metadata_paths = metadata_paths(&options.gitdirs);
    let mut wanted: Vec<PathBuf> = metadata_paths
        .iter()
        .map(|(path, _)| path.clone())
        .collect();

    let mut state = WatcherState::Active;
    #[cfg(target_os = "linux")]
    {
        let walk = crate::watch::fswalk::collect_dirs(
            &options.workdir,
            options.linux_dir_cap,
            &options.ignored_patterns,
        );
        match walk {
            Ok(walk) if !walk.truncated => wanted.extend(walk.dirs),
            Ok(_) => {
                state = WatcherState::Polling;
            }
            Err(_) => {
                state = WatcherState::Polling;
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        wanted.push(options.workdir.clone());
    }

    let callback_gitdirs = Arc::clone(&gitdirs);
    let (event_tx, event_rx) = mpsc::channel::<WatchControl>();
    let handler = move |result: notify::Result<Event>| {
        let Ok(event) = result else {
            return;
        };
        let kind = classify_event(&event.paths, &callback_gitdirs);
        if let Some(kind) = kind {
            let _ = event_tx.send(WatchControl::Event(kind));
        }
    };

    let mut watcher = match RecommendedWatcher::new(handler, Config::default()) {
        Ok(watcher) => watcher,
        Err(err) => {
            let _ = init_tx.send(Err(format!("Could not create the file watcher: {err}")));
            return;
        }
    };

    let mut watched_any = false;
    for (index, path) in wanted.iter().enumerate() {
        let recursive = index < metadata_paths.len() && metadata_paths[index].1;
        #[cfg(not(target_os = "linux"))]
        let recursive = recursive || path == &options.workdir;
        let mode = if recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };
        if watcher.watch(path, mode).is_ok() {
            watched_any = true;
        }
    }

    if !watched_any {
        let _ = init_tx.send(Err(
            "Could not watch this repository (no watch paths were available).".to_string(),
        ));
        return;
    }

    if state == WatcherState::Active {
        #[cfg(target_os = "linux")]
        let workdir_watch_ok = wanted.len() > metadata_paths.len();
        #[cfg(not(target_os = "linux"))]
        let workdir_watch_ok = true;
        if !workdir_watch_ok {
            state = WatcherState::Polling;
        }
    }

    let _ = init_tx.send(Ok(state));

    let mut debounce = DebounceState::default_timing();
    let mut aggregated: Option<WatchKind> = None;
    let mut window_start = Instant::now();
    let mut window_events = 0usize;

    loop {
        let message = if debounce.is_pending() {
            event_rx.recv_timeout(Duration::from_millis(75))
        } else {
            event_rx.recv_timeout(Duration::from_millis(500))
        };

        match message {
            Ok(WatchControl::Event(kind)) => {
                window_events = window_events.saturating_add(1);
                aggregated = Some(match aggregated {
                    Some(current) => current.merge(kind),
                    None => kind,
                });
                debounce.on_event(Instant::now());
            }
            Ok(WatchControl::Stop) | Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {}
        }

        let now = Instant::now();
        if now.saturating_duration_since(window_start) >= Duration::from_secs(5) {
            window_start = now;
            window_events = 0;
        }
        if window_events > 5_000 {
            on_degrade();
            break;
        }

        if debounce.poll(now) {
            if let Some(kind) = aggregated.take() {
                on_event(kind);
            }
        }

        if let Ok(WatchControl::Stop) = control_rx.try_recv() {
            break;
        }
        while let Ok(control) = control_rx.try_recv() {
            match control {
                WatchControl::Stop => return,
                WatchControl::Event(kind) => {
                    aggregated = Some(match aggregated {
                        Some(current) => current.merge(kind),
                        None => kind,
                    });
                    debounce.on_event(Instant::now());
                }
            }
        }
    }

    drop(watcher);
}

fn metadata_paths(gitdirs: &[PathBuf]) -> Vec<(PathBuf, bool)> {
    let mut paths = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for gitdir in gitdirs {
        for name in [
            "HEAD",
            "index",
            "packed-refs",
            "MERGE_HEAD",
            "ORIG_HEAD",
            "CHERRY_PICK_HEAD",
            "REVERT_HEAD",
            "BISECT_LOG",
            "FETCH_HEAD",
        ] {
            let path = gitdir.join(name);
            if path.exists() && seen.insert(path.clone()) {
                paths.push((path, false));
            }
        }
        for name in ["refs", "rebase-merge", "rebase-apply"] {
            let path = gitdir.join(name);
            if path.exists() && seen.insert(path.clone()) {
                paths.push((path, true));
            }
        }
    }
    paths
}

fn classify_event(paths: &[PathBuf], gitdirs: &[PathBuf]) -> Option<WatchKind> {
    let mut kind: Option<WatchKind> = None;
    for path in paths {
        if is_git_internal(path, gitdirs) {
            if is_metadata_file(path, gitdirs) {
                kind = Some(WatchKind::Metadata);
            }
            continue;
        }
        kind = Some(match kind {
            Some(WatchKind::Metadata) => WatchKind::Metadata,
            _ => WatchKind::Workdir,
        });
    }
    kind
}

fn is_git_internal(path: &Path, gitdirs: &[PathBuf]) -> bool {
    gitdirs.iter().any(|gitdir| path.starts_with(gitdir))
}

fn is_metadata_file(path: &Path, gitdirs: &[PathBuf]) -> bool {
    let Some(gitdir) = gitdirs.iter().find(|gitdir| path.starts_with(gitdir)) else {
        return false;
    };
    let Ok(relative) = path.strip_prefix(gitdir) else {
        return false;
    };
    let first = relative
        .components()
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .unwrap_or_default();
    matches!(
        first,
        "refs"
            | "HEAD"
            | "index"
            | "packed-refs"
            | "MERGE_HEAD"
            | "ORIG_HEAD"
            | "CHERRY_PICK_HEAD"
            | "REVERT_HEAD"
            | "BISECT_LOG"
            | "FETCH_HEAD"
            | "rebase-merge"
            | "rebase-apply"
    )
}
