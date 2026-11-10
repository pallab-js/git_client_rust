use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::ErrorCode;
use crate::state::AppState;

const ALLOWED_CLI: &[&str] = &[
    "code",
    "code-insiders",
    "cursor",
    "zed",
    "subl",
    "idea",
    "webstorm",
    "goland",
    "pycharm",
    "nvim",
    "vim",
    "emacs",
    "micro",
];

pub fn open_in_editor(app: &AppHandle, state: &AppState, repo_id: &str) -> AppResult<()> {
    let _ = app;
    let record = state
        .repo(repo_id)
        .ok_or_else(|| AppError::new(ErrorCode::Unknown, "Unknown repository."))?;
    let canonical = dunce::canonicalize(Path::new(&record.path)).map_err(|error| {
        AppError::repo_not_found(Path::new(&record.path))
            .with_details(format!("Could not resolve repository path: {error}"))
    })?;
    if canonical.to_string_lossy() != record.path {
        return Err(AppError::invalid_path(
            "Refusing to open a path that does not match the monitored repository.",
        ));
    }

    let settings = state.settings();
    let editor = settings
        .editor
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let result = match editor {
        Some(editor) => spawn_configured(editor, &canonical),
        None => spawn_default(&canonical),
    };

    result.map_err(|error| {
        let detail = match editor {
            Some(editor) => format!("Tried to launch '{editor}': {error}"),
            None => format!("Tried to launch the default editor: {error}"),
        };
        AppError::new(
            ErrorCode::EditorNotFound,
            "Could not find an editor to open this repository. Set an editor path in Settings, then try again.",
        )
        .with_details(detail)
    })
}

fn spawn_configured(editor: &str, path: &PathBuf) -> std::io::Result<()> {
    let editor_path = Path::new(editor);
    if editor_path.is_absolute() || editor.contains(std::path::MAIN_SEPARATOR) {
        if !editor_path.is_file() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "configured editor executable does not exist",
            ));
        }
        return spawn_command(editor_path.as_os_str(), path);
    }

    if ALLOWED_CLI.contains(&editor) {
        return spawn_command(std::ffi::OsStr::new(editor), path);
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg("-a").arg(editor).arg(path);
        command.spawn().map(|_| ())
    }

    #[cfg(not(target_os = "macos"))]
    {
        spawn_command(std::ffi::OsStr::new(editor), path)
    }
}

fn spawn_default(path: &PathBuf) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(path);
        return command.spawn().map(|_| ());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer");
        command.arg(path);
        return command.spawn().map(|_| ());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        return command.spawn().map(|_| ());
    }

    #[allow(unreachable_code)]
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "no editor launcher for this platform",
    ))
}

fn spawn_command(program: &std::ffi::OsStr, path: &Path) -> std::io::Result<()> {
    let mut command = Command::new(program);
    command.arg(path);
    command.spawn().map(|_| ())
}
