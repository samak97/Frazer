use serde::{Serialize, Deserialize};
use windows::Win32::Media::Audio::{
    eRender, eConsole, IAudioSessionManager2, IAudioSessionEnumerator, IAudioSessionControl2, ISimpleAudioVolume,
    IMMDeviceEnumerator, MMDeviceEnumerator
};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::System::Com::{CoInitializeEx, CoCreateInstance, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::core::Interface;
use windows::Win32::Foundation::S_OK;

use super::app_info::app_info;

/// One row in the mixer: all audio sessions belonging to the same app.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioSession {
    pub id: String,
    pub name: String,
    /// PNG data URL of the app icon, when one could be extracted.
    pub icon: Option<String>,
    pub volume: f32,
    pub is_muted: bool,
    pub process_ids: Vec<u32>,
}

unsafe fn get_session_manager() -> windows::core::Result<IAudioSessionManager2> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
    let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
    Ok(manager)
}

unsafe fn get_endpoint_volume() -> windows::core::Result<IAudioEndpointVolume> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
    let endpoint_volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
    Ok(endpoint_volume)
}

/// Calls `f` with every session on the default output device and its process id.
unsafe fn for_each_session(mut f: impl FnMut(&IAudioSessionControl2, &ISimpleAudioVolume, u32)) -> Result<(), String> {
    let manager = get_session_manager().map_err(|e| format!("Failed to get session manager: {:?}", e))?;
    let sessions: IAudioSessionEnumerator = manager.GetSessionEnumerator().map_err(|e| format!("Failed to get enumerator: {:?}", e))?;
    for i in 0..sessions.GetCount().unwrap_or(0) {
        let Ok(control) = sessions.GetSession(i) else { continue };
        let (Ok(control2), Ok(volume)) = (control.cast::<IAudioSessionControl2>(), control.cast::<ISimpleAudioVolume>()) else { continue };
        let Ok(pid) = control2.GetProcessId() else { continue };
        f(&control2, &volume, pid);
    }
    Ok(())
}

pub fn get_audio_sessions() -> Result<Vec<AudioSession>, String> {
    let mut rows: Vec<AudioSession> = Vec::new();
    unsafe {
        for_each_session(|control, volume, pid| {
            let (Ok(level), Ok(muted)) = (volume.GetMasterVolume(), volume.GetMute()) else { return };
            let (id, name, icon) = if control.IsSystemSoundsSession() == S_OK {
                ("system".to_string(), "System sounds".to_string(), None)
            } else {
                let Some(info) = app_info(pid) else { return };
                (info.key, info.name, info.icon)
            };
            match rows.iter_mut().find(|r| r.id == id) {
                Some(row) => row.process_ids.push(pid),
                None => rows.push(AudioSession { id, name, icon, volume: level, is_muted: muted.as_bool(), process_ids: vec![pid] }),
            }
        })?;
    }
    Ok(rows)
}

pub fn set_session_volume(pids: &[u32], level: f32) -> Result<(), String> {
    let mut hit = false;
    unsafe {
        for_each_session(|_, volume, pid| {
            if pids.contains(&pid) {
                hit |= volume.SetMasterVolume(level, std::ptr::null()).is_ok();
            }
        })?;
    }
    hit.then_some(()).ok_or_else(|| "Session not found".to_string())
}

pub fn set_session_mute(pids: &[u32], mute: bool) -> Result<(), String> {
    let mut hit = false;
    unsafe {
        for_each_session(|_, volume, pid| {
            if pids.contains(&pid) {
                hit |= volume.SetMute(mute, std::ptr::null()).is_ok();
            }
        })?;
    }
    hit.then_some(()).ok_or_else(|| "Session not found".to_string())
}

pub fn toggle_master_mute() -> Result<bool, String> {
    unsafe {
        let endpoint_volume = get_endpoint_volume().map_err(|e| format!("Failed to get endpoint volume: {:?}", e))?;
        let muted = endpoint_volume.GetMute().map_err(|e| format!("Failed to get mute status: {:?}", e))?;
        let new_mute = !muted.as_bool();
        endpoint_volume.SetMute(new_mute, std::ptr::null()).map_err(|e| format!("Failed to set mute: {:?}", e))?;
        Ok(new_mute)
    }
}
