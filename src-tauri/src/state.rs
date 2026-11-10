use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use crate::error::{AppError, AppResult};
use crate::models::{
    ChangeCounts, PrimaryStatus, RepoFlags, RepoSummary, Settings, Theme, TrayStats, WatcherState,
};
use crate::store::{ConfigStore, Db, RepoRecord};
use crate::watch::manager::WatchManager;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefreshMode {
    Quick,
    Full,
}

#[derive(Debug, Clone)]
pub struct RefreshRequest {
    pub repo_id: String,
    pub mode: RefreshMode,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TrayRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub struct Paths {
    pub app_data: PathBuf,
    pub db_path: PathBuf,
    pub log_dir: PathBuf,
}

pub struct AppState {
    pub paths: Paths,
    pub config_store: ConfigStore,
    pub settings: RwLock<Settings>,
    pub config_warning: RwLock<Option<String>>,
    pub db: Arc<Db>,
    pub repos: RwLock<Vec<RepoRecord>>,
    pub summaries: RwLock<HashMap<String, RepoSummary>>,
    pub revisions: Mutex<HashMap<String, u64>>,
    pub refresh_tx: tokio::sync::mpsc::Sender<RefreshRequest>,
    refresh_rx: Mutex<Option<tokio::sync::mpsc::Receiver<RefreshRequest>>>,
    pub inflight: Mutex<HashSet<String>>,
    pub pending: Mutex<HashSet<String>>,
    pub repo_locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    pub scans: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub watchers: Mutex<WatchManager>,
    pub tray_rect: Mutex<Option<TrayRect>>,
    pub pending_selection: Mutex<Option<String>>,
    pub quitting: AtomicBool,
    last_prune: Mutex<std::time::Instant>,
    revision_seq: AtomicU64,
}

impl AppState {
    pub fn load(app_data: &Path) -> AppResult<Self> {
        let config_store = ConfigStore::new(app_data);
        let (settings, warning) = config_store.load();
        let db_path = app_data.join("gitpulse.db");
        let db = Arc::new(Db::open(&db_path)?);

        let records = db.load_repos()?;
        let mut summaries = HashMap::with_capacity(records.len());
        for record in &records {
            let summary = record
                .cached_summary
                .as_deref()
                .and_then(|json| serde_json::from_str::<RepoSummary>(json).ok())
                .map(|mut summary| {
                    summary.id = record.id.clone();
                    summary.name = record.name.clone();
                    summary.path = record.path.clone();
                    summary
                })
                .unwrap_or_else(|| placeholder_summary(record));
            summaries.insert(record.id.clone(), summary);
        }

        let _ = db.prune(settings.retention_days, settings.snapshot_cap_per_repo);
        let (refresh_tx, refresh_rx) = tokio::sync::mpsc::channel::<RefreshRequest>(256);

        Ok(Self {
            paths: Paths {
                app_data: app_data.to_path_buf(),
                db_path,
                log_dir: app_data.join("logs"),
            },
            config_store,
            settings: RwLock::new(settings),
            config_warning: RwLock::new(warning),
            db,
            repos: RwLock::new(records),
            summaries: RwLock::new(summaries),
            revisions: Mutex::new(HashMap::new()),
            refresh_tx,
            refresh_rx: Mutex::new(Some(refresh_rx)),
            inflight: Mutex::new(HashSet::new()),
            pending: Mutex::new(HashSet::new()),
            repo_locks: Mutex::new(HashMap::new()),
            scans: Mutex::new(HashMap::new()),
            watchers: Mutex::new(WatchManager::default()),
            tray_rect: Mutex::new(None),
            pending_selection: Mutex::new(None),
            quitting: AtomicBool::new(false),
            last_prune: Mutex::new(std::time::Instant::now()),
            revision_seq: AtomicU64::new(1),
        })
    }

    pub fn take_refresh_rx(&self) -> Option<tokio::sync::mpsc::Receiver<RefreshRequest>> {
        self.refresh_rx
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    }

    pub fn settings(&self) -> Settings {
        self.settings
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn theme(&self) -> Theme {
        self.settings().theme
    }

    pub fn config_warning(&self) -> Option<String> {
        self.config_warning
            .read()
            .ok()
            .and_then(|guard| guard.clone())
    }

    pub fn replace_settings(&self, settings: Settings) {
        if let Ok(mut guard) = self.settings.write() {
            *guard = settings;
        }
    }

    pub fn repos_snapshot(&self) -> Vec<RepoRecord> {
        self.repos
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn repo(&self, id: &str) -> Option<RepoRecord> {
        self.repos
            .read()
            .ok()
            .and_then(|guard| guard.iter().find(|record| record.id == id).cloned())
    }

    pub fn repo_by_path(&self, path: &str) -> Option<RepoRecord> {
        self.repos
            .read()
            .ok()
            .and_then(|guard| guard.iter().find(|record| record.path == path).cloned())
    }

    pub fn summary(&self, id: &str) -> Option<RepoSummary> {
        self.summaries
            .read()
            .ok()
            .and_then(|guard| guard.get(id).cloned())
    }

    pub fn summaries_snapshot(&self) -> Vec<RepoSummary> {
        self.summaries
            .read()
            .map(|guard| guard.values().cloned().collect())
            .unwrap_or_default()
    }

    pub fn sorted_repos(&self) -> Vec<RepoSummary> {
        let records = self.repos_snapshot();
        let summaries = self
            .summaries
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default();
        let mut rows: Vec<(bool, i64, RepoSummary)> = records
            .into_iter()
            .filter_map(|record| {
                summaries
                    .get(&record.id)
                    .map(|summary| (record.pinned, record.sort_order, summary.clone()))
            })
            .collect();

        rows.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.cmp(&b.1))
                .then_with(|| {
                    b.2.primary_status
                        .priority()
                        .cmp(&a.2.primary_status.priority())
                })
                .then_with(|| last_commit_millis(&b.2).cmp(&last_commit_millis(&a.2)))
                .then_with(|| a.2.name.to_lowercase().cmp(&b.2.name.to_lowercase()))
        });

        rows.into_iter().map(|(_, _, summary)| summary).collect()
    }

    pub fn upsert_record(&self, record: RepoRecord) {
        if let Ok(mut guard) = self.repos.write() {
            if let Some(existing) = guard.iter_mut().find(|item| item.id == record.id) {
                *existing = record;
            } else {
                guard.push(record);
            }
        }
    }

    pub fn remove_record(&self, id: &str) {
        if let Ok(mut guard) = self.repos.write() {
            guard.retain(|record| record.id != id);
        }
        if let Ok(mut guard) = self.summaries.write() {
            guard.remove(id);
        }
        if let Ok(mut guard) = self.revisions.lock() {
            guard.remove(id);
        }
        if let Ok(mut guard) = self.repo_locks.lock() {
            guard.remove(id);
        }
    }

    pub fn put_summary(&self, summary: RepoSummary) {
        if let Ok(mut guard) = self.summaries.write() {
            guard.insert(summary.id.clone(), summary);
        }
    }

    pub fn bump_revision(&self, id: &str) -> u64 {
        if let Ok(mut guard) = self.revisions.lock() {
            let entry = guard.entry(id.to_string()).or_insert(0);
            *entry = entry.saturating_add(1);
            return *entry;
        }
        self.revision_seq.fetch_add(1, Ordering::Relaxed)
    }

    pub fn revision(&self, id: &str) -> u64 {
        self.revisions
            .lock()
            .ok()
            .and_then(|guard| guard.get(id).copied())
            .unwrap_or(0)
    }

    pub fn repo_lock(&self, id: &str) -> Arc<tokio::sync::Mutex<()>> {
        if let Ok(mut guard) = self.repo_locks.lock() {
            return guard
                .entry(id.to_string())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone();
        }
        Arc::new(tokio::sync::Mutex::new(()))
    }

    pub fn try_begin_job(&self, id: &str) -> bool {
        match self.inflight.lock() {
            Ok(mut guard) => guard.insert(id.to_string()),
            Err(_) => false,
        }
    }

    pub fn end_job(&self, id: &str) {
        if let Ok(mut guard) = self.inflight.lock() {
            guard.remove(id);
        }
    }

    pub fn mark_pending(&self, id: &str) {
        if let Ok(mut guard) = self.pending.lock() {
            guard.insert(id.to_string());
        }
    }

    pub fn take_pending(&self, id: &str) -> bool {
        self.pending
            .lock()
            .map(|mut guard| guard.remove(id))
            .unwrap_or(false)
    }

    pub fn queue_refresh(&self, repo_id: impl Into<String>, mode: RefreshMode) {
        let request = RefreshRequest {
            repo_id: repo_id.into(),
            mode,
        };
        let _ = self.refresh_tx.try_send(request);
    }

    pub fn queue_all(&self, mode: RefreshMode) {
        for record in self.repos_snapshot() {
            self.queue_refresh(record.id, mode);
        }
    }

    pub fn set_watcher_state(&self, id: &str, watcher: WatcherState) -> Option<RepoSummary> {
        let mut guard = self.summaries.write().ok()?;
        let summary = guard.get_mut(id)?;
        if summary.watcher == watcher {
            return None;
        }
        summary.watcher = watcher;
        summary.revision = summary.revision.saturating_add(1);
        summary.updated_at = chrono::Utc::now().to_rfc3339();
        Some(summary.clone())
    }

    pub fn tray_stats(&self) -> TrayStats {
        let summaries = self.summaries_snapshot();
        let mut dirty = 0usize;
        let mut conflicts = 0usize;
        let mut behind = 0usize;
        for summary in &summaries {
            if summary.flags.conflicted {
                conflicts += 1;
            }
            if summary.flags.dirty {
                dirty += 1;
            }
            if summary.behind > 0 {
                behind += 1;
            }
        }
        TrayStats {
            repos: summaries.len(),
            dirty,
            conflicts,
            behind,
        }
    }

    pub fn tray_badge_count(&self) -> usize {
        let summaries = self.summaries_snapshot();
        let settings = self.settings();
        match settings.tray_badge_basis {
            crate::models::TrayBadgeBasis::Conflicted => summaries
                .iter()
                .filter(|summary| summary.flags.conflicted)
                .count(),
            crate::models::TrayBadgeBasis::Dirty => summaries
                .iter()
                .filter(|summary| summary.flags.dirty)
                .count(),
            crate::models::TrayBadgeBasis::Attention => summaries
                .iter()
                .filter(|summary| {
                    summary.flags.conflicted || summary.flags.dirty || summary.behind > 0
                })
                .count(),
        }
    }

    pub fn set_tray_rect(&self, rect: TrayRect) {
        if let Ok(mut guard) = self.tray_rect.lock() {
            *guard = Some(rect);
        }
    }

    pub fn tray_rect(&self) -> Option<TrayRect> {
        self.tray_rect.lock().ok().and_then(|guard| *guard)
    }

    pub fn set_pending_selection(&self, id: Option<String>) {
        if let Ok(mut guard) = self.pending_selection.lock() {
            *guard = id;
        }
    }

    pub fn take_pending_selection(&self) -> Option<String> {
        self.pending_selection
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    }

    pub fn add_scan(&self, id: String, flag: Arc<AtomicBool>) {
        if let Ok(mut guard) = self.scans.lock() {
            guard.insert(id, flag);
        }
    }

    pub fn finish_scan(&self, id: &str) {
        if let Ok(mut guard) = self.scans.lock() {
            guard.remove(id);
        }
    }

    pub fn cancel_scan(&self, id: &str) -> bool {
        let guard = match self.scans.lock() {
            Ok(guard) => guard,
            Err(_) => return false,
        };
        match guard.get(id) {
            Some(flag) => {
                flag.store(true, Ordering::Relaxed);
                true
            }
            None => false,
        }
    }

    pub fn prune_if_due(&self) {
        let due = self
            .last_prune
            .lock()
            .map(|guard| guard.elapsed() >= std::time::Duration::from_secs(24 * 60 * 60))
            .unwrap_or(false);
        if !due {
            return;
        }
        let settings = self.settings();
        if self
            .db
            .prune(settings.retention_days, settings.snapshot_cap_per_repo)
            .is_ok()
        {
            if let Ok(mut guard) = self.last_prune.lock() {
                *guard = std::time::Instant::now();
            }
        }
    }
}

pub fn placeholder_summary(record: &RepoRecord) -> RepoSummary {
    RepoSummary {
        id: record.id.clone(),
        name: record.name.clone(),
        path: record.path.clone(),
        pinned: record.pinned,
        primary_status: PrimaryStatus::Scanning,
        flags: RepoFlags::default(),
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        counts: ChangeCounts::default(),
        last_commit: None,
        last_fetch_at: None,
        watcher: WatcherState::Unavailable,
        revision: 0,
        updated_at: chrono::Utc::now().to_rfc3339(),
        error: None,
    }
}

pub fn summary_from_status(
    record: &RepoRecord,
    status: &crate::git::status::GitStatus,
    last_fetch_at: Option<String>,
    watcher: WatcherState,
) -> RepoSummary {
    let flags = RepoFlags {
        dirty: status.counts.dirty(),
        conflicted: status.counts.conflicted > 0,
        detached: status.head.detached,
        unborn: status.head.unborn,
    };
    let primary_status = if flags.conflicted {
        PrimaryStatus::Conflicted
    } else if status.head.ahead > 0 && status.head.behind > 0 {
        PrimaryStatus::Diverged
    } else if status.head.behind > 0 {
        PrimaryStatus::Behind
    } else if flags.dirty {
        PrimaryStatus::Dirty
    } else if status.head.ahead > 0 {
        PrimaryStatus::Ahead
    } else {
        PrimaryStatus::Clean
    };

    RepoSummary {
        id: record.id.clone(),
        name: record.name.clone(),
        path: record.path.clone(),
        pinned: record.pinned,
        primary_status,
        flags,
        branch: status.head.branch.clone(),
        upstream: status.head.upstream.clone(),
        ahead: status.head.ahead,
        behind: status.head.behind,
        counts: status.counts.clone(),
        last_commit: status.last_commit.clone(),
        last_fetch_at,
        watcher,
        revision: 0,
        updated_at: chrono::Utc::now().to_rfc3339(),
        error: None,
    }
}

pub fn unavailable_summary(record: &RepoRecord, error: AppError) -> RepoSummary {
    RepoSummary {
        id: record.id.clone(),
        name: record.name.clone(),
        path: record.path.clone(),
        pinned: record.pinned,
        primary_status: if error.code == crate::models::ErrorCode::RepoNotFound {
            PrimaryStatus::Unavailable
        } else {
            PrimaryStatus::Error
        },
        flags: RepoFlags::default(),
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        counts: ChangeCounts::default(),
        last_commit: None,
        last_fetch_at: None,
        watcher: WatcherState::Unavailable,
        revision: 0,
        updated_at: chrono::Utc::now().to_rfc3339(),
        error: Some(error),
    }
}

fn last_commit_millis(summary: &RepoSummary) -> i64 {
    summary
        .last_commit
        .as_ref()
        .and_then(|commit| chrono::DateTime::parse_from_rfc3339(&commit.at).ok())
        .map(|value| value.timestamp_millis())
        .unwrap_or(0)
}
