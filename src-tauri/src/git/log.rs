use git2::{Repository, Sort};

use crate::error::AppResult;
use crate::models::{CommitEntry, CommitPage};

pub fn list_commits(
    repo: &Repository,
    cursor: Option<&str>,
    limit: usize,
) -> AppResult<CommitPage> {
    let offset = cursor
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let limit = limit.clamp(1, 200);

    let mut walk = match repo.revwalk() {
        Ok(walk) => walk,
        Err(err) => {
            return Err(crate::error::AppError::from_git(
                &err,
                std::path::Path::new(""),
            ))
        }
    };
    if walk.set_sorting(Sort::TIME).is_err() || walk.push_head().is_err() {
        return Ok(CommitPage {
            items: Vec::new(),
            next_cursor: None,
        });
    }

    let mut items = Vec::with_capacity(limit + 1);
    for (index, oid) in walk.enumerate() {
        if index < offset {
            continue;
        }
        if items.len() > limit {
            break;
        }
        let Ok(oid) = oid else {
            continue;
        };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        let sha = commit.id().to_string();
        let author = commit.author();
        items.push(CommitEntry {
            short_sha: sha.chars().take(7).collect(),
            summary: commit.summary().ok().flatten().unwrap_or("").to_string(),
            author: author.name().unwrap_or("Unknown").to_string(),
            email: author.email().unwrap_or("").to_string(),
            at: chrono::DateTime::<chrono::Utc>::from_timestamp(commit.time().seconds(), 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default(),
            sha,
        });
    }

    let next_cursor = if items.len() > limit {
        Some((offset + limit).to_string())
    } else {
        None
    };
    items.truncate(limit);

    Ok(CommitPage { items, next_cursor })
}
