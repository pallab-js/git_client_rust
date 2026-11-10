use crate::error::AppResult;
use crate::models::ActivityEntry;
use crate::store::Db;

pub fn record_transitions(
    db: &Db,
    previous: Option<&crate::models::RepoSummary>,
    next: &crate::models::RepoSummary,
) -> AppResult<()> {
    for (kind, payload) in crate::store::snapshots::transition_activity(previous, next) {
        db.insert_activity(&next.id, kind, &payload)?;
    }
    Ok(())
}

pub fn list(db: &Db, repo_id: Option<&str>, limit: usize) -> AppResult<Vec<ActivityEntry>> {
    db.list_activity(repo_id, limit)
}
