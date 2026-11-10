use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, AppResult};
use crate::models::{ActivityEntry, RepoSummary};
use crate::store::migrations;
use crate::store::snapshots::fingerprint;

#[derive(Debug, Clone)]
pub struct RepoRecord {
    pub id: String,
    pub path: String,
    pub name: String,
    pub pinned: bool,
    pub sort_order: i64,
    pub watch_mode: String,
    pub added_at: i64,
    pub last_seen_at: Option<i64>,
    pub cached_summary: Option<String>,
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut conn = Connection::open(path)?;
        configure(&conn)?;
        migrations::migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        let mut conn = Connection::open_in_memory()?;
        configure(&conn)?;
        migrations::migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn load_repos(&self) -> AppResult<Vec<RepoRecord>> {
        let conn = self.lock()?;
        let mut statement = conn.prepare(
            "SELECT id, path, name, pinned, sort_order, watch_mode, added_at, last_seen_at, cached_summary
             FROM repos ORDER BY pinned DESC, sort_order ASC, added_at ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(RepoRecord {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                pinned: row.get::<_, i64>(3)? != 0,
                sort_order: row.get(4)?,
                watch_mode: row.get(5)?,
                added_at: row.get(6)?,
                last_seen_at: row.get(7)?,
                cached_summary: row.get(8)?,
            })
        })?;
        let mut repos = Vec::new();
        for row in rows {
            repos.push(row?);
        }
        Ok(repos)
    }

    pub fn insert_repo(&self, repo: &RepoRecord) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO repos (id, path, name, pinned, sort_order, watch_mode, added_at, last_seen_at, cached_summary)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                repo.id,
                repo.path,
                repo.name,
                repo.pinned as i64,
                repo.sort_order,
                repo.watch_mode,
                repo.added_at,
                repo.last_seen_at,
                repo.cached_summary
            ],
        )?;
        Ok(())
    }

    pub fn remove_repo(&self, id: &str) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM repos WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_pinned(&self, id: &str, pinned: bool) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE repos SET pinned = ?1 WHERE id = ?2",
            params![pinned as i64, id],
        )?;
        Ok(())
    }

    pub fn set_watch_mode(&self, id: &str, mode: &str) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE repos SET watch_mode = ?1 WHERE id = ?2",
            params![mode, id],
        )?;
        Ok(())
    }

    pub fn reorder(&self, ids: &[String]) -> AppResult<()> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        for (index, id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE repos SET sort_order = ?1 WHERE id = ?2",
                params![index as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn update_path(&self, id: &str, path: &str, name: &str) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE repos SET path = ?1, name = ?2 WHERE id = ?3",
            params![path, name, id],
        )?;
        Ok(())
    }

    pub fn touch(&self, id: &str) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE repos SET last_seen_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp(), id],
        )?;
        Ok(())
    }

    pub fn update_cached_summary(&self, summary: &RepoSummary) -> AppResult<()> {
        let json = serde_json::to_string(summary)?;
        let conn = self.lock()?;
        conn.execute(
            "UPDATE repos SET cached_summary = ?1, last_seen_at = ?2 WHERE id = ?3",
            params![json, chrono::Utc::now().timestamp(), summary.id],
        )?;
        Ok(())
    }

    pub fn insert_snapshot(&self, summary: &RepoSummary) -> AppResult<bool> {
        let now = chrono::Utc::now().timestamp();
        let conn = self.lock()?;
        let previous: Option<(String, i64)> = conn
            .query_row(
                "SELECT fingerprint, captured_at FROM snapshots
                 WHERE repo_id = ?1 ORDER BY captured_at DESC LIMIT 1",
                params![summary.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let current = fingerprint(summary);
        if let Some((previous_fingerprint, captured_at)) = previous {
            if previous_fingerprint == current && now - captured_at < 900 {
                return Ok(false);
            }
        }

        conn.execute(
            "INSERT INTO snapshots (
                repo_id, captured_at, branch, head_sha, detached, upstream, ahead, behind,
                staged, modified, untracked, conflicted, stashed, fingerprint
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                summary.id.as_str(),
                now,
                summary.branch.as_deref(),
                summary
                    .last_commit
                    .as_ref()
                    .map(|commit| commit.sha.as_str()),
                summary.flags.detached as i64,
                summary.upstream.as_deref(),
                summary.ahead as i64,
                summary.behind as i64,
                summary.counts.staged as i64,
                summary.counts.modified as i64,
                summary.counts.untracked as i64,
                summary.counts.conflicted as i64,
                summary.counts.stashed as i64,
                current
            ],
        )?;
        Ok(true)
    }

    pub fn insert_activity(
        &self,
        repo_id: &str,
        kind: &str,
        payload: &serde_json::Value,
    ) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO activity (repo_id, kind, payload, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![
                repo_id,
                kind,
                serde_json::to_string(payload)?,
                chrono::Utc::now().timestamp()
            ],
        )?;
        Ok(())
    }

    pub fn list_activity(
        &self,
        repo_id: Option<&str>,
        limit: usize,
    ) -> AppResult<Vec<ActivityEntry>> {
        let conn = self.lock()?;
        let limit = limit.clamp(1, 500) as i64;
        let mut entries = Vec::new();
        if let Some(repo_id) = repo_id {
            let mut statement = conn.prepare(
                "SELECT id, repo_id, kind, payload, created_at FROM activity
                 WHERE repo_id = ?1 ORDER BY created_at DESC LIMIT ?2",
            )?;
            let rows = statement.query_map(params![repo_id, limit], map_activity)?;
            for row in rows {
                entries.push(row?);
            }
        } else {
            let mut statement = conn.prepare(
                "SELECT id, repo_id, kind, payload, created_at FROM activity
                 ORDER BY created_at DESC LIMIT ?1",
            )?;
            let rows = statement.query_map(params![limit], map_activity)?;
            for row in rows {
                entries.push(row?);
            }
        }
        Ok(entries)
    }

    pub fn prune(&self, retention_days: i64, snapshot_cap: i64) -> AppResult<()> {
        let now = chrono::Utc::now().timestamp();
        let cutoff = now - retention_days.max(1) * 86_400;
        let conn = self.lock()?;
        conn.execute(
            "DELETE FROM snapshots WHERE captured_at < ?1",
            params![cutoff],
        )?;
        conn.execute(
            "DELETE FROM snapshots WHERE id IN (
                SELECT id FROM snapshots s
                WHERE (SELECT COUNT(*) FROM snapshots s2
                       WHERE s2.repo_id = s.repo_id AND s2.captured_at >= s.captured_at) > ?1
             )",
            params![snapshot_cap.max(50)],
        )?;
        conn.execute(
            "DELETE FROM activity WHERE created_at < ?1",
            params![now - 90 * 86_400],
        )?;
        let _ = conn.execute_batch("PRAGMA optimize;");
        Ok(())
    }

    fn lock(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::db("Database lock was poisoned."))
    }
}

fn configure(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
}

fn map_activity(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityEntry> {
    let payload: String = row.get(3)?;
    let created_at: i64 = row.get(4)?;
    Ok(ActivityEntry {
        id: row.get(0)?,
        repo_id: row.get(1)?,
        kind: row.get(2)?,
        payload: serde_json::from_str(&payload).unwrap_or(serde_json::Value::Null),
        created_at: chrono::DateTime::<chrono::Utc>::from_timestamp(created_at, 0)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    })
}
