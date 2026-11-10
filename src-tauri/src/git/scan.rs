use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use globset::{Glob, GlobSet, GlobSetBuilder};

use crate::error::{AppError, AppResult};
use crate::models::{ErrorCode, ScanCandidate};

pub struct ScanOptions {
    pub max_depth: usize,
    pub cap: usize,
    pub ignored_patterns: Vec<String>,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            max_depth: 3,
            cap: 500,
            ignored_patterns: vec![
                "node_modules".into(),
                "target".into(),
                "dist".into(),
                ".next".into(),
                ".venv".into(),
                "vendor".into(),
            ],
        }
    }
}

struct ScanState {
    root: PathBuf,
    options: ScanOptions,
    ignored: Option<GlobSet>,
    candidates: Vec<ScanCandidate>,
    scanned: usize,
    truncated: bool,
    cancelled: bool,
    last_reported: usize,
}

pub fn scan_repositories(
    root: &Path,
    options: ScanOptions,
    cancel: &AtomicBool,
    mut progress: impl FnMut(usize, usize, &Path),
) -> AppResult<(Vec<ScanCandidate>, bool)> {
    let root = crate::git::canonicalize(root)?;
    let ignored = build_ignored(&options.ignored_patterns);
    let mut state = ScanState {
        root: root.clone(),
        options,
        ignored,
        candidates: Vec::new(),
        scanned: 0,
        truncated: false,
        cancelled: false,
        last_reported: 0,
    };

    visit_dir(&root, 0, &mut state, cancel, &mut progress);

    if state.cancelled {
        return Err(AppError::new(ErrorCode::ScanCancelled, "Scan cancelled."));
    }

    Ok((state.candidates, state.truncated))
}

fn visit_dir(
    dir: &Path,
    depth: usize,
    state: &mut ScanState,
    cancel: &AtomicBool,
    progress: &mut impl FnMut(usize, usize, &Path),
) {
    if state.cancelled || state.truncated {
        return;
    }
    if cancel.load(Ordering::Relaxed) {
        state.cancelled = true;
        return;
    }

    state.scanned += 1;
    if state.scanned - state.last_reported >= 25 {
        state.last_reported = state.scanned;
        progress(state.scanned, state.candidates.len(), dir);
    }

    if dir.join(".git").exists() {
        let name = dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| dir.display().to_string());
        state.candidates.push(ScanCandidate {
            path: dir.to_string_lossy().to_string(),
            name,
        });
        if state.candidates.len() >= state.options.cap {
            state.truncated = true;
        }
        return;
    }

    if depth >= state.options.max_depth {
        return;
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        if state.cancelled || state.truncated {
            return;
        }
        if cancel.load(Ordering::Relaxed) {
            state.cancelled = true;
            return;
        }

        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".git" || is_ignored(&state.root, &entry.path(), &name, &state.ignored) {
            continue;
        }

        visit_dir(&entry.path(), depth + 1, state, cancel, progress);
    }
}

fn build_ignored(patterns: &[String]) -> Option<GlobSet> {
    if patterns.is_empty() {
        return None;
    }
    let mut builder = GlobSetBuilder::new();
    for pattern in patterns {
        if let Ok(glob) = Glob::new(pattern) {
            builder.add(glob);
        }
    }
    builder.build().ok()
}

fn is_ignored(root: &Path, path: &Path, name: &str, ignored: &Option<GlobSet>) -> bool {
    if name == "node_modules"
        || name == "target"
        || name == "dist"
        || name == "build"
        || name == ".next"
        || name == ".venv"
        || name == "vendor"
        || name == ".cache"
    {
        return true;
    }
    let Some(ignored) = ignored else {
        return false;
    };
    if ignored.is_match(name) {
        return true;
    }
    if let Ok(relative) = path.strip_prefix(root) {
        return ignored.is_match(relative);
    }
    false
}
