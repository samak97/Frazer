pub mod audio;
pub mod config;
pub mod hid;
pub mod overlay;
pub mod synapse;

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

use audio::{get_audio_devices, get_audio_sessions, set_session_mute, set_session_volume, toggle_master_mute, AudioDevice, AudioSession};
use config::{AppConfig, ConfigStore, EqSetting};
use hid::driver::{Capabilities, HeadsetEvent, Settings};
use hid::HeadsetManager;

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const EVENT_READ_MS: i32 = 250;
/// If the headset echoes an EQ-slot event for a slot the host just set, ignore it.
const EQ_ECHO_WINDOW: Duration = Duration::from_secs(2);
/// Give the wireless link a moment after power-on before writing settings.
const RECONNECT_SETTLE: Duration = Duration::from_millis(1200);
/// After restoring, re-read the EQ this much later in case the firmware loaded its own slot.
const RESTORE_VERIFY_DELAY: Duration = Duration::from_secs(3);
const RESTORE_ATTEMPTS: usize = 3;
const SILENT_ARG: &str = "--silent";

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

/// Shared state for commands and the background device service.
pub struct AppState {
    headsets: Arc<HeadsetManager>,
    config: ConfigStore,
    /// Slot and time of Frazer's last EQ write, to tell its echo apart from a button press.
    last_host_eq: Mutex<Option<(u8, Instant)>>,
}

impl AppState {
    /// Writes an EQ, remembers it as the one to restore on reconnect, and arms the echo guard.
    fn apply_eq(&self, eq: &EqSetting) -> Result<(), String> {
        *self.last_host_eq.lock().unwrap() = Some((eq.preset, Instant::now()));
        self.headsets.with_driver(|d| d.set_eq(eq.preset, &eq.bands))?;
        self.config.update(|c| c.active_eq = Some(eq.clone()));
        Ok(())
    }

    /// An echo reports the slot we just wrote; a button press reports the firmware's next slot.
    fn is_eq_echo(&self, slot: u8) -> bool {
        self.last_host_eq.lock().unwrap().is_some_and(|(s, t)| s == slot && t.elapsed() < EQ_ECHO_WINDOW)
    }
}

type App<'a> = State<'a, Arc<AppState>>;

/// Shown in the on-top overlay toast.
#[derive(Serialize, Clone)]
struct EqApplied {
    name: Option<String>,
    /// "button" or "restore"
    source: &'static str,
}

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
async fn get_connected_headsets(app: App<'_>) -> Result<Vec<HeadsetInfo>, String> {
    Ok(read_headsets(&app.headsets))
}

#[tauri::command]
async fn get_headset_settings(app: App<'_>) -> Result<Settings, String> {
    app.headsets.with_driver(|d| d.settings())
}

#[tauri::command]
async fn set_headset_eq(app: App<'_>, preset: u8, bands: Vec<i8>, name: Option<String>) -> Result<(), String> {
    app.apply_eq(&EqSetting { name, preset, bands })
}

#[tauri::command]
async fn set_headset_sidetone(app: App<'_>, enabled: bool, level: u8) -> Result<(), String> {
    app.headsets.with_driver(|d| d.set_sidetone(enabled, level))
}

#[tauri::command]
async fn set_headset_mic_mute(app: App<'_>, muted: bool) -> Result<(), String> {
    app.headsets.with_driver(|d| d.set_mic_mute(muted))
}

#[tauri::command]
async fn set_headset_mic_eq_preset(app: App<'_>, preset: u8) -> Result<(), String> {
    app.headsets.with_driver(|d| d.set_mic_eq_preset(preset))
}

#[tauri::command]
async fn set_headset_auto_off(app: App<'_>, minutes: u8) -> Result<(), String> {
    app.headsets.with_driver(|d| d.set_auto_off(minutes))
}

#[tauri::command]
fn get_app_config(app: App<'_>) -> AppConfig {
    app.config.get()
}

#[tauri::command]
fn set_button_cycle(app: App<'_>, cycle: Vec<EqSetting>) {
    app.config.update(|c| {
        c.button_cycle = cycle;
        c.cycle_pos = 0;
    });
}

/// Shows the on-top toast with the current EQ, so the notification can be previewed from Settings.
#[tauri::command]
fn preview_toast(app: AppHandle, state: App<'_>) {
    let name = state.config.get().active_eq.and_then(|e| e.name);
    overlay::show(&app, EqApplied { name, source: "button" });
}

#[tauri::command]
fn get_synapse_status() -> synapse::SynapseStatus {
    synapse::status()
}

#[tauri::command]
fn stop_synapse() -> Result<synapse::SynapseStatus, String> {
    synapse::stop()?;
    Ok(synapse::status())
}

/// Turns Synapse's own "start with Windows" entry off (saving it) or back on (from the backup).
#[tauri::command]
fn set_synapse_autostart(app: App<'_>, enabled: bool) -> Result<synapse::SynapseStatus, String> {
    if enabled {
        let backup = app.config.get().synapse_autostart_backup.ok_or("No saved Synapse startup entry to restore")?;
        synapse::set_autostart(Some(&backup))?;
    } else if let Some(cmd) = synapse::autostart_command() {
        app.config.update(|c| c.synapse_autostart_backup = Some(cmd));
        synapse::set_autostart(None)?;
    }
    Ok(synapse::status())
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
fn update_session_volume(pids: Vec<u32>, volume: f32) -> Result<(), String> {
    set_session_volume(&pids, volume)
}

#[tauri::command]
fn toggle_mute() -> Result<bool, String> {
    toggle_master_mute()
}

#[tauri::command]
fn set_session_mute_state(pids: Vec<u32>, mute: bool) -> Result<(), String> {
    set_session_mute(&pids, mute)
}

/// Whether the headset is actually running `eq` (fixed slots carry no band data to compare).
fn eq_matches(s: &Settings, eq: &EqSetting) -> bool {
    let bands_ok = !matches!(eq.preset, 250..=255) || s.eq_bands.as_deref() == Some(eq.bands.as_slice());
    s.eq_preset == Some(eq.preset) && s.eq_enabled != Some(false) && bands_ok
}

/// Restores the last EQ Frazer applied (the headset doesn't keep it across power cycles), then
/// reads it back after a few seconds and re-applies if the firmware replaced it.
fn restore_eq(app: &AppHandle, state: &AppState) {
    let Some(eq) = state.config.get().active_eq else { return };
    for attempt in 1..=RESTORE_ATTEMPTS {
        if let Err(e) = state.apply_eq(&eq) {
            eprintln!("restoring EQ failed (attempt {attempt}): {e}");
            thread::sleep(RECONNECT_SETTLE);
            continue;
        }
        thread::sleep(RESTORE_VERIFY_DELAY);
        match state.headsets.with_driver(|d| d.settings()) {
            Ok(s) if eq_matches(&s, &eq) => {
                eprintln!("restored EQ {:?} (verified, attempt {attempt})", eq.name);
                overlay::show(app, EqApplied { name: eq.name.clone(), source: "restore" });
                return;
            }
            Ok(s) => eprintln!("EQ changed after restore (slot {:?}), re-applying", s.eq_preset),
            Err(e) => eprintln!("verifying restored EQ failed: {e}"),
        }
    }
}

/// EQ button pressed: step to the next preset in the user's cycle list.
fn advance_button_cycle(app: &AppHandle, state: &AppState) -> bool {
    let next = state.config.update(|c| {
        if c.button_cycle.is_empty() {
            return None;
        }
        c.cycle_pos = (c.cycle_pos + 1) % c.button_cycle.len();
        Some(c.button_cycle[c.cycle_pos].clone())
    });
    match next {
        Some(eq) => {
            eprintln!("EQ button -> {:?}", eq.name);
            match state.apply_eq(&eq) {
                Ok(()) => {
                    overlay::show(app, EqApplied { name: eq.name, source: "button" });
                }
                Err(e) => eprintln!("EQ button apply failed: {e}"),
            }
            true
        }
        None => false,
    }
}

fn handle_event(app: &AppHandle, state: &AppState, event: HeadsetEvent) {
    eprintln!("headset event: {event:?}");
    match event {
        HeadsetEvent::EqPreset(slot) if state.is_eq_echo(slot) => return,
        HeadsetEvent::EqPreset(_) => {
            advance_button_cycle(app, state);
        }
        HeadsetEvent::HeadsetPower(true) => {
            thread::sleep(RECONNECT_SETTLE);
            restore_eq(app, state);
            let _ = app.emit("device-changed", read_headsets(&state.headsets));
        }
        HeadsetEvent::HeadsetPower(false) | HeadsetEvent::Battery(_) | HeadsetEvent::Charging(_) => {
            let _ = app.emit("device-changed", read_headsets(&state.headsets));
        }
        HeadsetEvent::MicMuted(_) | HeadsetEvent::Sidetone(_) => {}
    }
    let _ = app.emit("headset-settings-changed", ());
}

/// Watches for the dongle (hotplug) and listens to headset events while it is present.
fn spawn_device_service(app: AppHandle, state: Arc<AppState>) {
    thread::spawn(move || {
        let mut was_present = None;
        let mut stream = None;
        let mut synapse_was = None;
        loop {
            let synapse_now = synapse::status();
            if synapse_was.as_ref() != Some(&synapse_now) {
                let _ = app.emit("synapse-changed", synapse_now.clone());
                synapse_was = Some(synapse_now);
            }

            let present = state.headsets.refresh();
            if was_present != Some(present) {
                was_present = Some(present);
                stream = None;
                if present {
                    restore_eq(&app, &state);
                    stream = state.headsets.open_event_stream().inspect_err(|e| eprintln!("event stream: {e}")).ok();
                }
                let _ = app.emit("device-changed", if present { read_headsets(&state.headsets) } else { Vec::new() });
                let _ = app.emit("headset-settings-changed", ());
            }

            let Some(events) = stream.as_mut() else {
                thread::sleep(POLL_INTERVAL);
                continue;
            };
            let deadline = Instant::now() + POLL_INTERVAL;
            while Instant::now() < deadline {
                match events.read(EVENT_READ_MS) {
                    Ok(list) => list.into_iter().for_each(|e| handle_event(&app, &state, e)),
                    Err(e) => {
                        eprintln!("event stream closed: {e}");
                        stream = None;
                        break;
                    }
                }
            }
        }
    });
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Frazer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main").tooltip("Frazer").menu(&menu).show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, e| match e.id.as_ref() {
        "open" => show_main_window(app),
        "quit" => app.exit(0),
        _ => {}
    })
    .on_tray_icon_event(|tray, e| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
            show_main_window(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

pub fn run() {
    let headsets = Arc::new(HeadsetManager::new().expect("HID subsystem unavailable"));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main_window(app)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![SILENT_ARG])))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_connected_headsets,
            get_headset_settings,
            set_headset_eq,
            set_headset_sidetone,
            set_headset_mic_mute,
            set_headset_mic_eq_preset,
            set_headset_auto_off,
            get_app_config,
            set_button_cycle,
            get_synapse_status,
            preview_toast,
            stop_synapse,
            set_synapse_autostart,
            load_profiles,
            save_profiles,
            list_audio_devices,
            list_audio_sessions,
            update_session_volume,
            set_session_mute_state,
            toggle_mute,
        ])
        // Closing the window keeps Frazer in the tray so the EQ button and reconnect restore keep working.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(move |app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let state = Arc::new(AppState {
                headsets,
                config: ConfigStore::load(dir.join("config.json")),
                last_host_eq: Mutex::new(None),
            });
            app.manage(state.clone());
            spawn_device_service(app.handle().clone(), state);
            build_tray(app)?;
            overlay::create(app.handle())?;

            // The autostart entry stores the exe path; refresh it so it follows the installed build.
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_autostart::ManagerExt;
                let launcher = app.autolaunch();
                if launcher.is_enabled().unwrap_or(false) {
                    let _ = launcher.disable().and_then(|_| launcher.enable());
                }
            }

            if !std::env::args().any(|a| a == SILENT_ARG) {
                show_main_window(app.handle());
            }
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(preset: u8, bands: &[i8], enabled: bool) -> Settings {
        Settings { eq_preset: Some(preset), eq_bands: Some(bands.to_vec()), eq_enabled: Some(enabled), ..Default::default() }
    }

    #[test]
    fn restored_eq_must_match_slot_bands_and_be_enabled() {
        let eq = EqSetting { name: None, preset: 255, bands: vec![1; 10] };
        assert!(eq_matches(&settings(255, &[1; 10], true), &eq));
        assert!(!eq_matches(&settings(7, &[1; 10], true), &eq), "firmware switched slot");
        assert!(!eq_matches(&settings(255, &[0; 10], true), &eq), "bands reset");
        assert!(!eq_matches(&settings(255, &[1; 10], false), &eq), "hardware EQ off");
        // Fixed firmware slots have no band data of ours to compare.
        let game = EqSetting { name: None, preset: 7, bands: vec![3; 10] };
        assert!(eq_matches(&settings(7, &[0; 10], true), &game));
    }
}
