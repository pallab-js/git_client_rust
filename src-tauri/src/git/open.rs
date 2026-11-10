use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use git2::{Repository, RepositoryOpenFlags};

use crate::error::{AppError, AppResult};

pub fn canonicalize(path: &Path) -> AppResult<PathBuf> {
    if !path.exists() {
        return Err(AppError::repo_not_found(path));
    }
    dunce::canonicalize(path).map_err(|err| {
        if err.kind() == std::io::ErrorKind::PermissionDenied {
            AppError::new(
                crate::models::ErrorCode::PermissionDenied,
                "GitPulse does not have permission to read this folder.",
            )
            .with_details(err.to_string())
        } else {
            AppError::repo_not_found(path).with_details(err.to_string())
        }
    })
}

pub fn open_repo(path: &Path) -> AppResult<Repository> {
    let canonical = canonicalize(path)?;
    let repo = Repository::open_ext(&canonical, RepositoryOpenFlags::empty(), &[] as &[&OsStr])
        .map_err(|err| AppError::from_git(&err, &canonical))?;

    if repo.is_bare() {
        return Err(AppError::bare_repo(&canonical));
    }
    Ok(repo)
}

pub fn repo_root(path: &Path) -> AppResult<PathBuf> {
    let repo = open_repo(path)?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::bare_repo(path))?
        .to_path_buf();
    canonicalize(&workdir)
}

pub fn last_fetch_at(repo: &Repository) -> Option<String> {
    let candidates = [
        repo.path().join("FETCH_HEAD"),
        repo.commondir().join("FETCH_HEAD"),
    ];
    let mut newest: Option<std::time::SystemTime> = None;
    for path in candidates {
        if let Ok(meta) = std::fs::metadata(&path) {
            if let Ok(modified) = meta.modified() {
                newest = Some(match newest {
                    Some(current) if current > modified => current,
                    _ => modified,
                });
            }
        }
    }
    newest.and_then(|time| {
        let duration = time.duration_since(std::time::UNIX_EPOCH).ok()?;
        DateTime::<Utc>::from_timestamp(duration.as_secs() as i64, 0).map(|dt| dt.to_rfc3339())
    })
}

pub fn short_sha(sha: &str) -> String {
    sha.chars().take(7).collect()
}
