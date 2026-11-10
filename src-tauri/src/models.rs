use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    RepoNotFound,
    NotARepo,
    BareRepo,
    PermissionDenied,
    InvalidPath,
    UnsafeOwnership,
    UnsupportedRepoFormat,
    WatcherFailed,
    ScanCancelled,
    DbError,
    ConfigError,
    EditorNotFound,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum PrimaryStatus {
    Clean,
    Ahead,
    Dirty,
    Behind,
    Diverged,
    Conflicted,
    Unavailable,
    Error,
    Scanning,
}

impl PrimaryStatus {
    pub fn priority(self) -> u8 {
        match self {
            Self::Conflicted => 5,
            Self::Diverged => 4,
            Self::Behind => 3,
            Self::Dirty => 2,
            Self::Ahead => 1,
            Self::Clean => 0,
            Self::Unavailable | Self::Error | Self::Scanning => 0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum WatcherState {
    Active,
    Polling,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ChangeCounts {
    pub staged: usize,
    pub modified: usize,
    pub untracked: usize,
    pub conflicted: usize,
    pub stashed: usize,
}

impl ChangeCounts {
    pub fn dirty(&self) -> bool {
        self.staged + self.modified + self.untracked > 0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct RepoFlags {
    pub dirty: bool,
    pub conflicted: bool,
    pub detached: bool,
    pub unborn: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct LastCommit {
    pub sha: String,
    pub summary: String,
    pub author: String,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct RepoSummary {
    pub id: String,
    pub name: String,
    pub path: String,
    pub pinned: bool,
    pub primary_status: PrimaryStatus,
    pub flags: RepoFlags,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub counts: ChangeCounts,
    pub last_commit: Option<LastCommit>,
    pub last_fetch_at: Option<String>,
    pub watcher: WatcherState,
    #[ts(type = "number")]
    pub revision: u64,
    pub updated_at: String,
    pub error: Option<crate::error::AppError>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Typechange,
    Conflicted,
    Untracked,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub staged: bool,
    pub insertions: Option<usize>,
    pub deletions: Option<usize>,
    pub binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ChangeList {
    pub items: Vec<FileChange>,
    pub total: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub staged: bool,
    pub patch: String,
    pub binary: bool,
    pub truncated: bool,
    pub language_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CommitEntry {
    pub sha: String,
    pub short_sha: String,
    pub summary: String,
    pub author: String,
    pub email: String,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CommitPage {
    pub items: Vec<CommitEntry>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct BranchEntry {
    pub name: String,
    pub is_head: bool,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub last_commit_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ActivityEntry {
    #[ts(type = "number")]
    pub id: i64,
    pub repo_id: String,
    pub kind: String,
    #[ts(type = "unknown")]
    pub payload: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ScanCandidate {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ScanHandle {
    pub scan_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ScanCompleted {
    pub scan_id: String,
    pub candidates: Vec<ScanCandidate>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AddRepoResult {
    pub path: String,
    pub ok: bool,
    pub repo: Option<RepoSummary>,
    pub error: Option<crate::error::AppError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AddReposResult {
    pub results: Vec<AddRepoResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TrayStats {
    pub repos: usize,
    pub dirty: usize,
    pub conflicts: usize,
    pub behind: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ShowDockIcon {
    #[default]
    WhenWindowOpen,
    Always,
    Never,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum TrayBadgeBasis {
    #[default]
    Attention,
    Dirty,
    Conflicted,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum WatchMode {
    #[default]
    Auto,
    Polling,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct NotificationSettings {
    pub enabled: bool,
    pub conflicts: bool,
    pub behind_threshold: usize,
    pub dirty_threshold: usize,
    #[ts(type = "number")]
    pub rate_limit_minutes: u64,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            conflicts: true,
            behind_threshold: 5,
            dirty_threshold: 100,
            rate_limit_minutes: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct Settings {
    pub theme: Theme,
    pub start_minimized: bool,
    pub launch_at_login: bool,
    pub show_dock_icon: ShowDockIcon,
    pub keep_popover_warm: bool,
    pub tray_badge_basis: TrayBadgeBasis,
    #[ts(type = "number")]
    pub reconcile_interval_sec: u64,
    #[ts(type = "number")]
    pub idle_poll_interval_sec: u64,
    pub watch_mode: WatchMode,
    pub linux_watch_dir_cap: usize,
    pub notifications: NotificationSettings,
    #[ts(type = "number")]
    pub retention_days: i64,
    #[ts(type = "number")]
    pub snapshot_cap_per_repo: i64,
    pub ignored_patterns: Vec<String>,
    pub editor: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            start_minimized: false,
            launch_at_login: false,
            show_dock_icon: ShowDockIcon::WhenWindowOpen,
            keep_popover_warm: true,
            tray_badge_basis: TrayBadgeBasis::Attention,
            reconcile_interval_sec: 30,
            idle_poll_interval_sec: 120,
            watch_mode: WatchMode::Auto,
            linux_watch_dir_cap: 2000,
            notifications: NotificationSettings::default(),
            retention_days: 30,
            snapshot_cap_per_repo: 500,
            ignored_patterns: vec![
                "node_modules".into(),
                "target".into(),
                "dist".into(),
                ".next".into(),
                ".venv".into(),
                "vendor".into(),
            ],
            editor: None,
        }
    }
}

impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !(5..=300).contains(&self.reconcile_interval_sec) {
            return Err("reconcileIntervalSec must be between 5 and 300".into());
        }
        if !(30..=3600).contains(&self.idle_poll_interval_sec) {
            return Err("idlePollIntervalSec must be between 30 and 3600".into());
        }
        if !(100..=10_000).contains(&self.linux_watch_dir_cap) {
            return Err("linuxWatchDirCap must be between 100 and 10000".into());
        }
        if !(1..=365).contains(&self.retention_days) {
            return Err("retentionDays must be between 1 and 365".into());
        }
        if !(50..=5000).contains(&self.snapshot_cap_per_repo) {
            return Err("snapshotCapPerRepo must be between 50 and 5000".into());
        }
        if !(1..=10_000).contains(&self.notifications.behind_threshold) {
            return Err("notifications.behindThreshold must be between 1 and 10000".into());
        }
        if !(1..=100_000).contains(&self.notifications.dirty_threshold) {
            return Err("notifications.dirtyThreshold must be between 1 and 100000".into());
        }
        if !(1..=1440).contains(&self.notifications.rate_limit_minutes) {
            return Err("notifications.rateLimitMinutes must be between 1 and 1440".into());
        }
        for pattern in &self.ignored_patterns {
            if pattern.starts_with('/') || pattern.contains("..") || pattern.trim().is_empty() {
                return Err(format!("Invalid ignore pattern: {pattern}"));
            }
        }
        if let Some(editor) = &self.editor {
            if editor.trim().is_empty() {
                return Err("Editor must not be empty".into());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum RefreshModeArg {
    Quick,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scan_id: String,
    pub scanned: usize,
    pub found: usize,
    pub current_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub theme: Option<Theme>,
    pub start_minimized: Option<bool>,
    pub launch_at_login: Option<bool>,
    pub show_dock_icon: Option<ShowDockIcon>,
    pub keep_popover_warm: Option<bool>,
    pub tray_badge_basis: Option<TrayBadgeBasis>,
    #[ts(type = "number | null")]
    pub reconcile_interval_sec: Option<u64>,
    #[ts(type = "number | null")]
    pub idle_poll_interval_sec: Option<u64>,
    pub watch_mode: Option<WatchMode>,
    pub linux_watch_dir_cap: Option<usize>,
    pub notifications: Option<NotificationSettings>,
    #[ts(type = "number | null")]
    pub retention_days: Option<i64>,
    #[ts(type = "number | null")]
    pub snapshot_cap_per_repo: Option<i64>,
    pub ignored_patterns: Option<Vec<String>>,
    pub editor: Option<String>,
}

impl Settings {
    pub fn apply_patch(&mut self, patch: SettingsPatch) {
        if let Some(v) = patch.theme {
            self.theme = v;
        }
        if let Some(v) = patch.start_minimized {
            self.start_minimized = v;
        }
        if let Some(v) = patch.launch_at_login {
            self.launch_at_login = v;
        }
        if let Some(v) = patch.show_dock_icon {
            self.show_dock_icon = v;
        }
        if let Some(v) = patch.keep_popover_warm {
            self.keep_popover_warm = v;
        }
        if let Some(v) = patch.tray_badge_basis {
            self.tray_badge_basis = v;
        }
        if let Some(v) = patch.reconcile_interval_sec {
            self.reconcile_interval_sec = v;
        }
        if let Some(v) = patch.idle_poll_interval_sec {
            self.idle_poll_interval_sec = v;
        }
        if let Some(v) = patch.watch_mode {
            self.watch_mode = v;
        }
        if let Some(v) = patch.linux_watch_dir_cap {
            self.linux_watch_dir_cap = v;
        }
        if let Some(v) = patch.notifications {
            self.notifications = v;
        }
        if let Some(v) = patch.retention_days {
            self.retention_days = v;
        }
        if let Some(v) = patch.snapshot_cap_per_repo {
            self.snapshot_cap_per_repo = v;
        }
        if let Some(v) = patch.ignored_patterns {
            self.ignored_patterns = v;
        }
        if let Some(v) = patch.editor {
            self.editor = if v.trim().is_empty() { None } else { Some(v) };
        }
    }
}
