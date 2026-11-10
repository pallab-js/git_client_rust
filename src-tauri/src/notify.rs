use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::models::{RepoSummary, Settings};

fn rate_limiter() -> &'static Mutex<HashMap<String, Instant>> {
    static LIMITER: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    LIMITER.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn maybe_notify(
    app: &AppHandle,
    previous: Option<&RepoSummary>,
    next: &RepoSummary,
    settings: &Settings,
) {
    if !settings.notifications.enabled || next.error.is_some() {
        return;
    }
    let Some(previous) = previous else {
        return;
    };

    let mut events: Vec<(&str, String)> = Vec::new();

    if settings.notifications.conflicts
        && previous.counts.conflicted == 0
        && next.counts.conflicted > 0
    {
        events.push((
            "conflict",
            format!(
                "{} has {} merge conflict{}.",
                next.name,
                next.counts.conflicted,
                plural(next.counts.conflicted)
            ),
        ));
    }

    let threshold = settings.notifications.behind_threshold;
    if threshold > 0 && previous.behind < threshold && next.behind >= threshold {
        let upstream = next.upstream.as_deref().unwrap_or("the upstream branch");
        events.push((
            "behind",
            format!(
                "{} is {} commit{} behind {}.",
                next.name,
                next.behind,
                plural(next.behind),
                upstream
            ),
        ));
    }

    let dirty_threshold = settings.notifications.dirty_threshold;
    let previous_dirty =
        previous.counts.staged + previous.counts.modified + previous.counts.untracked;
    let next_dirty = next.counts.staged + next.counts.modified + next.counts.untracked;
    if dirty_threshold > 0 && previous_dirty < dirty_threshold && next_dirty >= dirty_threshold {
        events.push((
            "dirty",
            format!(
                "{} has {} changed file{}.",
                next.name,
                next_dirty,
                plural(next_dirty)
            ),
        ));
    }

    for (kind, body) in events {
        if !allow(&next.id, kind, settings.notifications.rate_limit_minutes) {
            continue;
        }
        let result = app
            .notification()
            .builder()
            .title("GitPulse")
            .body(&body)
            .show();
        if let Err(error) = result {
            tracing::warn!("could not show notification: {error}");
        }
    }
}

fn allow(repo_id: &str, kind: &str, minutes: u64) -> bool {
    let key = format!("{repo_id}:{kind}");
    let window = Duration::from_secs(minutes.max(1) * 60);
    let Ok(mut limiter) = rate_limiter().lock() else {
        return false;
    };
    let now = Instant::now();
    if let Some(last) = limiter.get(&key) {
        if now.saturating_duration_since(*last) < window {
            return false;
        }
    }
    limiter.insert(key, now);
    true
}

fn plural(count: usize) -> &'static str {
    if count == 1 {
        ""
    } else {
        "s"
    }
}
