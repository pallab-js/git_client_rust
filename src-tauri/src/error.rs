use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::models::ErrorCode;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    pub details: Option<String>,
    pub retryable: bool,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        let retryable = matches!(
            code,
            ErrorCode::PermissionDenied
                | ErrorCode::WatcherFailed
                | ErrorCode::DbError
                | ErrorCode::Unknown
        );
        Self {
            code,
            message: message.into(),
            details: None,
            retryable,
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    pub fn repo_not_found(path: &std::path::Path) -> Self {
        Self::new(
            ErrorCode::RepoNotFound,
            format!(
                "Repository not found at {}. Check that the folder still exists.",
                path.display()
            ),
        )
    }

    pub fn not_a_repo(path: &std::path::Path) -> Self {
        Self::new(
            ErrorCode::NotARepo,
            format!(
                "This folder is not a Git repository: {}. Choose a folder containing a .git directory.",
                path.display()
            ),
        )
    }

    pub fn bare_repo(path: &std::path::Path) -> Self {
        Self::new(
            ErrorCode::BareRepo,
            format!(
                "Bare repositories are not supported: {}. Add a working copy instead.",
                path.display()
            ),
        )
    }

    pub fn invalid_path(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidPath, message)
    }

    pub fn db(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::DbError, message)
    }

    pub fn config(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ConfigError, message)
    }

    pub fn from_git(err: &git2::Error, path: &std::path::Path) -> Self {
        match err.code() {
            git2::ErrorCode::Owner => Self::new(
                ErrorCode::UnsafeOwnership,
                "Git refused to open this repository because of its ownership. Only repositories owned by your user can be monitored.",
            )
            .with_details(err.message().to_string()),
            git2::ErrorCode::NotFound => {
                if path.exists() {
                    Self::not_a_repo(path).with_details(err.message().to_string())
                } else {
                    Self::repo_not_found(path)
                }
            }
            git2::ErrorCode::BareRepo => Self::bare_repo(path),
            git2::ErrorCode::UnbornBranch => Self::new(
                ErrorCode::Unknown,
                "This repository has no commits yet.",
            )
            .with_details(err.message().to_string()),
            _ => {
                let message = err.message().to_ascii_lowercase();
                if message.contains("permission denied") || message.contains("access denied") {
                    Self::new(
                        ErrorCode::PermissionDenied,
                        "GitPulse does not have permission to read this repository.",
                    )
                    .with_details(err.message().to_string())
                } else {
                    Self::new(ErrorCode::Unknown, "Could not read this repository.")
                        .with_details(err.message().to_string())
                }
            }
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        let code = match err.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::RepoNotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::PermissionDenied,
            _ => ErrorCode::Unknown,
        };
        Self::new(code, err.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        Self::db(format!("Database error: {err}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::config(format!("Could not read or write JSON: {err}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
