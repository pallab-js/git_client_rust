use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use git2::{DiffFormat, DiffOptions, Repository};

use crate::error::{AppError, AppResult};
use crate::models::FileDiff;

const MAX_PATCH_LINES: usize = 5_000;
const MAX_PATCH_BYTES: usize = 1_000_000;
const MAX_UNTRACKED_BYTES: u64 = 256 * 1024;

pub fn file_diff(repo: &Repository, path: &str, staged: bool) -> AppResult<FileDiff> {
    let language_hint = language_hint(path);
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::bare_repo(Path::new(path)))?;
    let relative = Path::new(path);

    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(AppError::invalid_path("Invalid file path."));
    }

    let candidate = workdir.join(relative);
    let metadata = fs::symlink_metadata(&candidate).ok();
    let is_symlink = metadata
        .as_ref()
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false);

    if is_symlink {
        let target = fs::read_link(&candidate)
            .map(|target| target.display().to_string())
            .unwrap_or_else(|_| "<unreadable>".to_string());
        return Ok(FileDiff {
            path: path.to_string(),
            staged,
            patch: format!("symlink -> {target}\n"),
            binary: false,
            truncated: false,
            language_hint,
        });
    }

    if candidate.exists() {
        let canonical_workdir = dunce::canonicalize(workdir).map_err(|err| {
            AppError::invalid_path(format!("Could not resolve repository: {err}"))
        })?;
        let canonical_candidate = dunce::canonicalize(&candidate)
            .map_err(|err| AppError::invalid_path(format!("Could not resolve file: {err}")))?;
        if !canonical_candidate.starts_with(&canonical_workdir) {
            return Err(AppError::invalid_path(
                "Refusing to read a file outside the repository.",
            ));
        }
    }

    let status = repo.status_file(relative).unwrap_or(git2::Status::CURRENT);
    if !staged && status.is_wt_new() {
        return read_untracked(&candidate, path, language_hint);
    }

    let mut opts = DiffOptions::new();
    opts.context_lines(3).pathspec(relative);

    let diff = if staged {
        let index = repo
            .index()
            .map_err(|err| AppError::from_git(&err, workdir))?;
        let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), Some(&index), Some(&mut opts))
            .map_err(|err| AppError::from_git(&err, workdir))?
    } else {
        let index = repo
            .index()
            .map_err(|err| AppError::from_git(&err, workdir))?;
        repo.diff_index_to_workdir(Some(&index), Some(&mut opts))
            .map_err(|err| AppError::from_git(&err, workdir))?
    };

    let target: PathBuf = relative.to_path_buf();
    let mut patch = String::new();
    let mut binary = false;
    let mut truncated = false;
    let mut lines = 0usize;
    let mut bytes = 0usize;

    diff.print(DiffFormat::Patch, |delta, _hunk, line| {
        let delta_path = delta.new_file().path().or_else(|| delta.old_file().path());
        if delta_path != Some(target.as_path()) {
            return true;
        }
        if delta.flags().is_binary() {
            binary = true;
            return true;
        }

        let content = String::from_utf8_lossy(line.content());
        let mut piece = String::new();
        match line.origin() {
            '+' | '-' | ' ' => {
                piece.push(line.origin());
                piece.push_str(&content);
            }
            'H' | 'F' => piece.push_str(&content),
            _ => {}
        }

        if lines >= MAX_PATCH_LINES || bytes.saturating_add(piece.len()) > MAX_PATCH_BYTES {
            truncated = true;
            return true;
        }
        lines += 1;
        bytes += piece.len();
        patch.push_str(&piece);
        true
    })
    .map_err(|err| AppError::from_git(&err, workdir))?;

    if binary {
        patch = "Binary file\n".to_string();
    }

    Ok(FileDiff {
        path: path.to_string(),
        staged,
        patch,
        binary,
        truncated,
        language_hint,
    })
}

fn read_untracked(
    candidate: &Path,
    path: &str,
    language_hint: Option<String>,
) -> AppResult<FileDiff> {
    let metadata = fs::symlink_metadata(candidate)?;
    if metadata.is_dir() {
        return Ok(FileDiff {
            path: path.to_string(),
            staged: false,
            patch: "Directory (not expanded)\n".to_string(),
            binary: false,
            truncated: false,
            language_hint,
        });
    }

    let mut file = fs::File::open(candidate)?;
    let mut buffer = Vec::new();
    file.by_ref()
        .take(MAX_UNTRACKED_BYTES + 1)
        .read_to_end(&mut buffer)?;

    let binary = buffer.iter().take(8192).any(|byte| *byte == 0);
    if binary {
        return Ok(FileDiff {
            path: path.to_string(),
            staged: false,
            patch: "Binary file\n".to_string(),
            binary: true,
            truncated: buffer.len() as u64 > MAX_UNTRACKED_BYTES,
            language_hint,
        });
    }

    let text = String::from_utf8_lossy(&buffer);
    let mut patch = String::new();
    let mut lines = 0usize;
    for line in text.lines() {
        if lines >= MAX_PATCH_LINES {
            break;
        }
        patch.push('+');
        patch.push_str(line);
        patch.push('\n');
        lines += 1;
    }

    Ok(FileDiff {
        path: path.to_string(),
        staged: false,
        patch,
        binary: false,
        truncated: buffer.len() as u64 > MAX_UNTRACKED_BYTES || lines >= MAX_PATCH_LINES,
        language_hint,
    })
}

fn language_hint(path: &str) -> Option<String> {
    let extension = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    let language = match extension.as_str() {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "json" => "json",
        "md" | "mdx" => "markdown",
        "css" => "css",
        "html" => "html",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "c",
        "cpp" | "cc" | "hpp" => "cpp",
        "sh" | "zsh" | "bash" => "shell",
        "yml" | "yaml" => "yaml",
        "toml" => "toml",
        _ => return None,
    };
    Some(language.to_string())
}
