use crate::models::RepoSummary;

pub fn fingerprint(summary: &RepoSummary) -> String {
    format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
        summary.branch.as_deref().unwrap_or(""),
        summary
            .last_commit
            .as_ref()
            .map(|c| c.sha.as_str())
            .unwrap_or(""),
        summary.flags.detached,
        summary.flags.unborn,
        summary.upstream.as_deref().unwrap_or(""),
        summary.ahead,
        summary.behind,
        summary.counts.staged,
        summary.counts.modified,
        summary.counts.untracked,
        summary.counts.conflicted,
        summary.counts.stashed
    )
}

pub fn transition_activity(
    previous: Option<&RepoSummary>,
    next: &RepoSummary,
) -> Vec<(&'static str, serde_json::Value)> {
    let mut events = Vec::new();
    let previous = match previous {
        Some(previous) => previous,
        None => {
            events.push(("repo_added", serde_json::json!({ "branch": next.branch })));
            return events;
        }
    };

    if previous.counts.conflicted == 0 && next.counts.conflicted > 0 {
        events.push((
            "conflict_added",
            serde_json::json!({ "count": next.counts.conflicted }),
        ));
    }
    if previous.counts.conflicted > 0 && next.counts.conflicted == 0 {
        events.push(("conflict_resolved", serde_json::json!({})));
    }
    if previous.branch != next.branch {
        events.push((
            "branch_changed",
            serde_json::json!({ "from": previous.branch, "to": next.branch }),
        ));
    }
    if previous.flags.dirty && !next.flags.dirty {
        events.push(("became_clean", serde_json::json!({})));
    }
    if !previous.flags.dirty && next.flags.dirty {
        events.push((
            "became_dirty",
            serde_json::json!({ "files": next.counts.staged + next.counts.modified + next.counts.untracked }),
        ));
    }
    events
}
