pub mod audio;
pub mod hid;

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use audio::{get_audio_devices, get_audio_sessions, set_session_mute, set_session_volume, toggle_master_mute, AudioDevice, AudioSession};
use hid::driver::{Capabilities, Settings};
use hid::HeadsetManager;

const HOTPLUG_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Serialize, Clone)]
pub struct HeadsetInfo {
    name: String,
    battery_level: Option<u8>,
    is_charging: bool,
    /// Dongle plugged in and the headset itself powered on.
    is_connected: bool,
    connection_type: String,
    capabilities: Capabilities,
}

type Headsets<'a> = State<'a, Arc<HeadsetManager>>;

fn read_headsets(mgr: &HeadsetManager) -> Vec<HeadsetInfo> {
    mgr.with_driver(|d| {
        let s = d.status()?;
        Ok(HeadsetInfo {
            name: d.name().to_string(),
            battery_level: s.battery_level,
            is_charging: s.charging,
            is_connected: s.headset_on,
            connection_type: d.connection().to_string(),
            capabilities: d.capabilities(),
        })
    })
    .map(|h| vec![h])
    .unwrap_or_default()
}

#[tauri::command]
async fn get_connected_headsets(mgr: Headsets<'_>) -> Result<Vec<HeadsetInfo>, String> {
    Ok(read_headsets(&mgr))
}

#[tauri::command]
async fn get_headset_settings(mgr: Headsets<'_>) -> Result<Settings, String> {
    mgr.with_driver(|d| d.settings())
}

#[tauri::command]
async fn set_headset_eq(mgr: Headsets<'_>, preset: u8, bands: Vec<i8>) -> Result<(), String> {
    mgr.with_driver(|d| d.set_eq(preset, &bands))
}

#[tauri::command]
async fn set_headset_sidetone(mgr: Headsets<'_>, enabled: bool, level: u8) -> Result<(), String> {
    mgr.with_driver(|d| d.set_sidetone(enabled, level))
}

#[tauri::command]
async fn set_headset_mic_mute(mgr: Headsets<'_>, muted: bool) -> Result<(), String> {
    mgr.with_driver(|d| d.set_mic_mute(muted))
}

#[tauri::command]
async fn set_headset_mic_eq_preset(mgr: Headsets<'_>, preset: u8) -> Result<(), String> {
    mgr.with_driver(|d| d.set_mic_eq_preset(preset))
}

#[tauri::command]
async fn set_headset_auto_off(mgr: Headsets<'_>, minutes: u8) -> Result<(), String> {
    mgr.with_driver(|d| d.set_auto_off(minutes))
}

fn profiles_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("profiles.json"))
}

#[tauri::command]
fn load_profiles(app: AppHandle) -> Result<serde_json::Value, String> {
    match std::fs::read_to_string(profiles_path(&app)?) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(serde_json::json!([])),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_profiles(app: AppHandle, profiles: serde_json::Value) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?;
    std::fs::write(profiles_path(&app)?, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    get_audio_devices()
}

#[tauri::command]
fn list_audio_sessions() -> Result<Vec<AudioSession>, String> {
    get_audio_sessions()
}

#[tauri::command]
fn update_session_volume(pid: u32, volume: f32) -> Result<(), String> {
    set_session_volume(pid, volume)
}

#[tauri::command]
fn toggle_mute() -> Result<bool, String> {
    toggle_master_mute()
}

#[tauri::command]
fn set_session_mute_state(pid: u32, mute: bool) -> Result<(), String> {
    set_session_mute(pid, mute)
}

/// Emits `device-changed` whenever a supported headset appears or disappears.
fn spawn_hotplug_watcher(app: AppHandle, mgr: Arc<HeadsetManager>) {
    thread::spawn(move || {
        let mut was_present = None;
        loop {
            let present = mgr.refresh();
            if was_present != Some(present) {
                let headsets = if present { read_headsets(&mgr) } else { Vec::new() };
                let _ = app.emit("device-changed", headsets);
                was_present = Some(present);
            }
            thread::sleep(HOTPLUG_INTERVAL);
        }
    });
}

pub fn run() {
    let mgr = Arc::new(HeadsetManager::new().expect("HID subsystem unavailable"));
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--silent"])))
        .plugin(tauri_plugin_opener::init())
        .manage(mgr.clone())
        .invoke_handler(tauri::generate_handler![
            get_connected_headsets,
            get_headset_settings,
            set_headset_eq,
            set_headset_sidetone,
            set_headset_mic_mute,
            set_headset_mic_eq_preset,
            set_headset_auto_off,
            load_profiles,
            save_profiles,
            list_audio_devices,
            list_audio_sessions,
            update_session_volume,
            set_session_mute_state,
            toggle_mute,
        ])
        .setup(move |app| {
            spawn_hotplug_watcher(app.handle().clone(), mgr);
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
