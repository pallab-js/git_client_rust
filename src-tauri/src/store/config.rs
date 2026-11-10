use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::Settings;

const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigFile {
    schema_version: u32,
    settings: Settings,
}

pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new(app_data: &Path) -> Self {
        Self {
            path: app_data.join("config.json"),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> (Settings, Option<String>) {
        let content = match fs::read_to_string(&self.path) {
            Ok(content) => content,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                return (Settings::default(), None);
            }
            Err(err) => {
                return (
                    Settings::default(),
                    Some(format!("Could not read config.json: {err}")),
                );
            }
        };

        match serde_json::from_str::<ConfigFile>(&content) {
            Ok(file) if file.schema_version == SCHEMA_VERSION => {
                if let Err(err) = file.settings.validate() {
                    return (
                        Settings::default(),
                        Some(format!(
                            "config.json is invalid ({err}); defaults restored."
                        )),
                    );
                }
                (file.settings, None)
            }
            Ok(_) => (
                Settings::default(),
                Some("config.json uses an unsupported schema; defaults restored.".to_string()),
            ),
            Err(err) => {
                let backup = self.backup_corrupt();
                (
                    Settings::default(),
                    Some(format!(
                        "config.json was corrupt ({err}). A backup was saved to {}.",
                        backup
                            .map(|path| path.display().to_string())
                            .unwrap_or_else(|| "the app data folder".to_string())
                    )),
                )
            }
        }
    }

    pub fn save(&self, settings: &Settings) -> AppResult<()> {
        settings.validate().map_err(AppError::config)?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let file = ConfigFile {
            schema_version: SCHEMA_VERSION,
            settings: settings.clone(),
        };
        let json = serde_json::to_string_pretty(&file)?;
        let temp = self.path.with_extension("json.tmp");
        fs::write(&temp, json)?;

        if let Err(first_error) = fs::rename(&temp, &self.path) {
            // Windows cannot replace an existing file with rename.
            if self.path.exists() {
                fs::remove_file(&self.path)?;
                fs::rename(&temp, &self.path)?;
            } else {
                return Err(AppError::config(format!(
                    "Could not write config.json: {first_error}"
                )));
            }
        }
        Ok(())
    }

    fn backup_corrupt(&self) -> Option<PathBuf> {
        if !self.path.exists() {
            return None;
        }
        let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let backup = self
            .path
            .with_file_name(format!("config.corrupt-{stamp}.json"));
        fs::rename(&self.path, &backup).ok().map(|_| backup)
    }
}
