use git2::{BranchType, Repository, Status, StatusOptions};
use std::path::Path;

use crate::error::AppResult;
use crate::git::open::short_sha;
use crate::models::{ChangeCounts, FileChange, FileStatus, LastCommit};

pub const MAX_CHANGES: usize = 2000;

#[derive(Debug, Clone)]
pub struct HeadInfo {
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    pub detached: bool,
    pub unborn: bool,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Clone)]
pub struct GitStatus {
    pub head: HeadInfo,
    pub counts: ChangeCounts,
    pub changes: Vec<FileChange>,
    pub total_changes: usize,
    pub truncated: bool,
    pub last_commit: Option<LastCommit>,
}

pub fn read_head(repo: &Repository) -> AppResult<HeadInfo> {
    let mut info = HeadInfo {
        branch: None,
        head_sha: None,
        detached: false,
        unborn: false,
        upstream: None,
        ahead: 0,
        behind: 0,
    };

    match repo.head() {
        Ok(head) => {
            info.detached = repo.head_detached().unwrap_or(false);
            info.head_sha = head.target().map(|oid| oid.to_string());
            if info.detached {
                info.branch = info.head_sha.as_deref().map(short_sha);
            } else {
                info.branch = head.shorthand().ok().map(ToString::to_string);
            }
        }
        Err(err) if err.code() == git2::ErrorCode::UnbornBranch => {
            info.unborn = true;
            if let Ok(head_ref) = repo.find_reference("HEAD") {
                if let Ok(Some(target)) = head_ref.symbolic_target() {
                    info.branch = Some(
                        target
                            .strip_prefix("refs/heads/")
                            .unwrap_or(target)
                            .to_string(),
                    );
                }
            }
        }
        Err(err) => return Err(crate::error::AppError::from_git(&err, Path::new(""))),
    }

    if !info.detached {
        if let (Some(branch_name), Some(head_sha)) =
            (info.branch.as_deref(), info.head_sha.as_ref())
        {
            if let Ok(branch) = repo.find_branch(branch_name, BranchType::Local) {
                if let Ok(upstream) = branch.upstream() {
                    info.upstream = upstream.name().ok().flatten().map(ToString::to_string);
                    if let (Ok(head_oid), Some(upstream_oid)) =
                        (head_sha.parse::<git2::Oid>(), upstream.get().target())
                    {
                        if let Ok((ahead, behind)) = repo.graph_ahead_behind(head_oid, upstream_oid)
                        {
                            info.ahead = ahead;
                            info.behind = behind;
                        }
                    }
                }
            }
        }
    }

    Ok(info)
}

pub fn read_last_commit(repo: &Repository) -> Option<LastCommit> {
    let head = repo.head().ok()?;
    let commit = head.peel_to_commit().ok()?;
    let sha = commit.id().to_string();
    let author = commit.author();
    Some(LastCommit {
        sha: sha.clone(),
        summary: commit.summary().ok().flatten().unwrap_or("").to_string(),
        author: author.name().unwrap_or("Unknown").to_string(),
        at: chrono::DateTime::<chrono::Utc>::from_timestamp(commit.time().seconds(), 0)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    })
}

pub fn read_status(repo: &mut Repository, include_changes: bool) -> AppResult<GitStatus> {
    let head = read_head(repo)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .renames_head_to_index(true)
        .include_ignored(false)
        .update_index(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|err| crate::error::AppError::from_git(&err, Path::new("")))?;

    let mut counts = ChangeCounts::default();
    let mut changes = Vec::new();
    let mut total_changes = 0usize;

    for entry in statuses.iter() {
        let status = entry.status();
        let path = entry.path().unwrap_or_default().replace('\\', "/");
        let old_path = entry
            .head_to_index()
            .and_then(|delta| delta.old_file().path().map(path_string))
            .or_else(|| {
                entry
                    .index_to_workdir()
                    .and_then(|delta| delta.old_file().path().map(path_string))
            })
            .filter(|old| old != &path);

        if status.is_conflicted() {
            counts.conflicted += 1;
            total_changes += 1;
            if include_changes && changes.len() < MAX_CHANGES {
                changes.push(FileChange {
                    path: path.clone(),
                    old_path: old_path.clone(),
                    status: FileStatus::Conflicted,
                    staged: false,
                    insertions: None,
                    deletions: None,
                    binary: false,
                });
            }
            continue;
        }

        if has_index_change(status) {
            counts.staged += 1;
            total_changes += 1;
            if include_changes && changes.len() < MAX_CHANGES {
                changes.push(FileChange {
                    path: path.clone(),
                    old_path: old_path.clone(),
                    status: index_status(status),
                    staged: true,
                    insertions: None,
                    deletions: None,
                    binary: false,
                });
            }
        }

        if has_worktree_change(status) {
            if status.is_wt_new() {
                counts.untracked += 1;
            } else {
                counts.modified += 1;
            }
            total_changes += 1;
            if include_changes && changes.len() < MAX_CHANGES {
                changes.push(FileChange {
                    path: path.clone(),
                    old_path,
                    status: worktree_status(status),
                    staged: false,
                    insertions: None,
                    deletions: None,
                    binary: false,
                });
            }
        }
    }

    drop(statuses);

    let mut stashed = 0usize;
    let _ = repo.stash_foreach(|_, _, _| {
        stashed += 1;
        true
    });
    counts.stashed = stashed;

    Ok(GitStatus {
        head,
        counts,
        truncated: total_changes > changes.len(),
        changes,
        total_changes,
        last_commit: read_last_commit(repo),
    })
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn has_index_change(status: Status) -> bool {
    status.is_index_new()
        || status.is_index_modified()
        || status.is_index_deleted()
        || status.is_index_renamed()
        || status.is_index_typechange()
}

fn has_worktree_change(status: Status) -> bool {
    status.is_wt_new()
        || status.is_wt_modified()
        || status.is_wt_deleted()
        || status.is_wt_renamed()
        || status.is_wt_typechange()
}

fn index_status(status: Status) -> FileStatus {
    if status.is_index_new() {
        FileStatus::Added
    } else if status.is_index_deleted() {
        FileStatus::Deleted
    } else if status.is_index_renamed() {
        FileStatus::Renamed
    } else if status.is_index_typechange() {
        FileStatus::Typechange
    } else {
        FileStatus::Modified
    }
}

fn worktree_status(status: Status) -> FileStatus {
    if status.is_wt_new() {
        FileStatus::Untracked
    } else if status.is_wt_deleted() {
        FileStatus::Deleted
    } else if status.is_wt_renamed() {
        FileStatus::Renamed
    } else if status.is_wt_typechange() {
        FileStatus::Typechange
    } else {
        FileStatus::Modified
    }
}
