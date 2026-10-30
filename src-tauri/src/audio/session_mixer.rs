use serde::{Serialize, Deserialize};
use windows::Win32::Media::Audio::{
    eRender, eConsole, IAudioSessionManager2, IAudioSessionEnumerator, IAudioSessionControl2, ISimpleAudioVolume,
    IMMDeviceEnumerator, MMDeviceEnumerator
};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::System::Com::{CoInitializeEx, CoCreateInstance, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::core::Interface;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT};
use windows::Win32::Foundation::CloseHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioSession {
    pub name: String,
    pub volume: f32,
    pub is_muted: bool,
    pub process_id: u32,
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

fn get_process_name(pid: u32) -> String {
    if pid == 0 {
        return "System Sounds".to_string();
    }
    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => return format!("PID {}", pid),
        };
        
        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), windows::core::PWSTR(buffer.as_mut_ptr()), &mut size);
        let _ = CloseHandle(handle);
        
        if result.is_ok() {
            let full_path = String::from_utf16_lossy(&buffer[..size as usize]);
            if let Some(name) = full_path.split('\\').last() {
                return name.to_string();
            }
            full_path
        } else {
            format!("PID {}", pid)
        }
    }
}

pub fn get_audio_sessions() -> Result<Vec<AudioSession>, String> {
    unsafe {
        let manager = get_session_manager().map_err(|e| format!("Failed to get session manager: {:?}", e))?;
        let session_enumerator: IAudioSessionEnumerator = manager.GetSessionEnumerator().map_err(|e| format!("Failed to get enumerator: {:?}", e))?;
        
        let count = session_enumerator.GetCount().unwrap_or(0);
        let mut result = Vec::new();
        
        for i in 0..count {
            if let Ok(session_control) = session_enumerator.GetSession(i) {
                if let Ok(control2) = session_control.cast::<IAudioSessionControl2>() {
                    if let Ok(pid) = control2.GetProcessId() {
                        if let Ok(simple_vol) = session_control.cast::<ISimpleAudioVolume>() {
                            if let Ok(vol) = simple_vol.GetMasterVolume() {
                                if let Ok(muted) = simple_vol.GetMute() {
                                    let is_muted = muted.as_bool();
                                    let name = get_process_name(pid);
                                    result.push(AudioSession {
                                        name,
                                        volume: vol,
                                        is_muted,
                                        process_id: pid,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        println!("Enumerated {} sessions", result.len());
        Ok(result)
    }
}

pub fn set_session_volume(pid: u32, volume: f32) -> Result<(), String> {
    unsafe {
        let manager = get_session_manager().map_err(|e| format!("Failed to get session manager: {:?}", e))?;
        let session_enumerator: IAudioSessionEnumerator = manager.GetSessionEnumerator().map_err(|e| format!("Failed to get enumerator: {:?}", e))?;
        
        let count = session_enumerator.GetCount().unwrap_or(0);
        for i in 0..count {
            if let Ok(session_control) = session_enumerator.GetSession(i) {
                if let Ok(control2) = session_control.cast::<IAudioSessionControl2>() {
                    if let Ok(session_pid) = control2.GetProcessId() {
                        if session_pid == pid {
                            if let Ok(simple_vol) = session_control.cast::<ISimpleAudioVolume>() {
                                simple_vol.SetMasterVolume(volume, std::ptr::null()).map_err(|e| format!("Failed to set volume: {:?}", e))?;
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }
        Err("Session not found".to_string())
    }
}

pub fn set_session_mute(pid: u32, mute: bool) -> Result<(), String> {
    unsafe {
        let manager = get_session_manager().map_err(|e| format!("Failed to get session manager: {:?}", e))?;
        let session_enumerator: IAudioSessionEnumerator = manager.GetSessionEnumerator().map_err(|e| format!("Failed to get enumerator: {:?}", e))?;
        
        let count = session_enumerator.GetCount().unwrap_or(0);
        for i in 0..count {
            if let Ok(session_control) = session_enumerator.GetSession(i) {
                if let Ok(control2) = session_control.cast::<IAudioSessionControl2>() {
                    if let Ok(session_pid) = control2.GetProcessId() {
                        if session_pid == pid {
                            if let Ok(simple_vol) = session_control.cast::<ISimpleAudioVolume>() {
                                simple_vol.SetMute(mute, std::ptr::null()).map_err(|e| format!("Failed to set mute: {:?}", e))?;
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }
        Err("Session not found".to_string())
    }
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
