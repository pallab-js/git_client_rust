use std::path::{Path, PathBuf};

use globset::{Glob, GlobSet, GlobSetBuilder};

use crate::error::{AppError, AppResult};

pub const DEFAULT_IGNORED: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".venv",
    "vendor",
    ".cache",
];

pub struct DirWalk {
    pub dirs: Vec<PathBuf>,
    pub truncated: bool,
}

/// Collects directories for per-directory (non-recursive) watches on Linux.
/// Follows the repository's ignore rules, skips symlinks and heavy build
/// folders, and stops at the configured cap.
pub fn collect_dirs(root: &Path, cap: usize, user_patterns: &[String]) -> AppResult<DirWalk> {
    let ignored = build_ignored(user_patterns);
    let mut dirs = vec![root.to_path_buf()];
    let mut truncated = false;

    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .follow_links(false)
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if entry.depth() == 0 {
            continue;
        }
        let file_type = match entry.file_type() {
            Some(file_type) => file_type,
            None => continue,
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if name == ".git"
            || is_default_ignored(&name)
            || is_user_ignored(entry.path(), &name, &ignored)
        {
            continue;
        }
        if dirs.len() >= cap {
            truncated = true;
            break;
        }
        dirs.push(entry.into_path());
    }

    Ok(DirWalk { dirs, truncated })
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

fn is_default_ignored(name: &str) -> bool {
    DEFAULT_IGNORED.contains(&name)
}

fn is_user_ignored(path: &Path, name: &str, ignored: &Option<GlobSet>) -> bool {
    let Some(ignored) = ignored else {
        return false;
    };
    ignored.is_match(name) || ignored.is_match(path)
}

pub fn start_error(message: impl Into<String>) -> AppError {
    AppError::new(crate::models::ErrorCode::WatcherFailed, message)
}
