use git2::{BranchType, Repository};

use crate::error::AppResult;
use crate::models::BranchEntry;

pub fn list_branches(repo: &Repository) -> AppResult<Vec<BranchEntry>> {
    let mut entries: Vec<(BranchEntry, i64, Option<git2::Oid>)> = Vec::new();

    let branches = repo
        .branches(Some(BranchType::Local))
        .map_err(|err| crate::error::AppError::from_git(&err, std::path::Path::new("")))?;

    for item in branches {
        let (branch, _) =
            item.map_err(|err| crate::error::AppError::from_git(&err, std::path::Path::new("")))?;
        let Some(name) = branch.name().ok().flatten().map(ToString::to_string) else {
            continue;
        };
        let is_head = branch.is_head();
        let upstream = branch
            .upstream()
            .ok()
            .and_then(|upstream| upstream.name().ok().flatten().map(ToString::to_string));

        let (timestamp, target) = match branch.get().peel_to_commit() {
            Ok(commit) => (commit.time().seconds(), Some(commit.id())),
            Err(_) => (0, None),
        };

        entries.push((
            BranchEntry {
                name,
                is_head,
                upstream,
                ahead: 0,
                behind: 0,
                last_commit_at: chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
            },
            timestamp,
            target,
        ));
    }

    entries.sort_by(|a, b| {
        b.0.is_head
            .cmp(&a.0.is_head)
            .then_with(|| b.1.cmp(&a.1))
            .then_with(|| a.0.name.cmp(&b.0.name))
    });

    for (index, (entry, _, target)) in entries.iter_mut().enumerate() {
        if index >= 50 {
            break;
        }
        let Some(upstream_name) = entry.upstream.as_deref() else {
            continue;
        };
        let Some(head_oid) = target else {
            continue;
        };
        let Ok(upstream) = repo.find_branch(upstream_name, BranchType::Local) else {
            continue;
        };
        let Some(upstream_oid) = upstream.get().target() else {
            continue;
        };
        if let Ok((ahead, behind)) = repo.graph_ahead_behind(*head_oid, upstream_oid) {
            entry.ahead = ahead;
            entry.behind = behind;
        }
    }

    Ok(entries.into_iter().map(|(entry, _, _)| entry).collect())
}
