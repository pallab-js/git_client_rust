use rusqlite::Connection;

pub fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version < 1 {
        let tx = conn.transaction()?;
        tx.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS repos (
              id             TEXT PRIMARY KEY,
              path           TEXT NOT NULL UNIQUE,
              name           TEXT NOT NULL,
              pinned         INTEGER NOT NULL DEFAULT 0,
              sort_order     INTEGER NOT NULL DEFAULT 0,
              watch_mode     TEXT NOT NULL DEFAULT 'auto',
              added_at       INTEGER NOT NULL,
              last_seen_at   INTEGER,
              cached_summary TEXT
            );

            CREATE TABLE IF NOT EXISTS snapshots (
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
              captured_at   INTEGER NOT NULL,
              branch        TEXT,
              head_sha      TEXT,
              detached      INTEGER NOT NULL DEFAULT 0,
              upstream      TEXT,
              ahead         INTEGER NOT NULL DEFAULT 0,
              behind        INTEGER NOT NULL DEFAULT 0,
              staged        INTEGER NOT NULL DEFAULT 0,
              modified      INTEGER NOT NULL DEFAULT 0,
              untracked     INTEGER NOT NULL DEFAULT 0,
              conflicted    INTEGER NOT NULL DEFAULT 0,
              stashed       INTEGER NOT NULL DEFAULT 0,
              fingerprint   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS activity (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
              kind        TEXT NOT NULL,
              payload     TEXT NOT NULL,
              created_at  INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_snapshots_repo_time
              ON snapshots(repo_id, captured_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_repo_time
              ON activity(repo_id, created_at DESC);
            "#,
        )?;
        tx.pragma_update(None, "user_version", 1)?;
        tx.commit()?;
    }
    Ok(())
}
