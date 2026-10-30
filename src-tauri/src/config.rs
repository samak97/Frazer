//! App settings persisted as `config.json` in the app data folder.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EqSetting {
    /// Display name (preset or recommendation name), if any.
    pub name: Option<String>,
    pub preset: u8,
    pub bands: Vec<i8>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    /// Last EQ Frazer applied; re-applied whenever the headset (re)connects.
    pub active_eq: Option<EqSetting>,
    /// Presets the headset's EQ button steps through. Empty = leave the button to the firmware.
    pub button_cycle: Vec<EqSetting>,
    #[serde(default)]
    pub cycle_pos: usize,
}

pub struct ConfigStore {
    path: PathBuf,
    data: Mutex<AppConfig>,
}

impl ConfigStore {
    pub fn load(path: PathBuf) -> Self {
        let data = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Self { path, data: Mutex::new(data) }
    }

    pub fn get(&self) -> AppConfig {
        self.data.lock().unwrap().clone()
    }

    /// Applies `f` to the config and writes it back to disk.
    pub fn update<T>(&self, f: impl FnOnce(&mut AppConfig) -> T) -> T {
        let mut data = self.data.lock().unwrap();
        let out = f(&mut data);
        if let Ok(text) = serde_json::to_string_pretty(&*data) {
            if let Err(e) = std::fs::write(&self.path, text) {
                eprintln!("saving config failed: {e}");
            }
        }
        out
    }
}
