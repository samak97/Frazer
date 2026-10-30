//! Resolves an audio session's process to a friendly app name and icon (cached per executable).

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};

use base64::Engine;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HBITMAP, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::Shell::ExtractIconExW;
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

#[derive(Clone)]
pub struct AppInfo {
    /// Executable path when known, otherwise the bare exe name; used to group sessions.
    pub key: String,
    pub name: String,
    /// `data:image/png;base64,…`
    pub icon: Option<String>,
}

fn cache() -> &'static Mutex<HashMap<String, AppInfo>> {
    static CACHE: OnceLock<Mutex<HashMap<String, AppInfo>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// `None` when the process no longer exists (Windows keeps sessions of exited apps around).
pub fn app_info(pid: u32) -> Option<AppInfo> {
    let exe = exe_path(pid).or_else(|| snapshot_exe_name(pid))?;
    if let Some(hit) = cache().lock().unwrap().get(&exe) {
        return Some(hit.clone());
    }
    let file_name = exe.rsplit('\\').next().unwrap_or(&exe).to_string();
    let fallback = file_name.strip_suffix(".exe").unwrap_or(&file_name).to_string();
    let is_path = exe.contains('\\');
    let info = AppInfo {
        key: exe.clone(),
        name: is_path.then(|| file_description(&exe)).flatten().unwrap_or(fallback),
        icon: is_path.then(|| icon_png(&exe)).flatten(),
    };
    cache().lock().unwrap().insert(exe, info.clone());
    Some(info)
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn exe_path(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), PWSTR(buf.as_mut_ptr()), &mut size).is_ok();
        let _ = CloseHandle(handle);
        ok.then(|| String::from_utf16_lossy(&buf[..size as usize]))
    }
}

/// Works for processes we may not open (elevated, services), but only yields the exe name.
fn snapshot_exe_name(pid: u32) -> Option<String> {
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut found = None;
        let mut more = Process32FirstW(snap, &mut entry).is_ok();
        while more {
            if entry.th32ProcessID == pid {
                let len = entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(entry.szExeFile.len());
                found = Some(String::from_utf16_lossy(&entry.szExeFile[..len]));
                break;
            }
            more = Process32NextW(snap, &mut entry).is_ok();
        }
        let _ = CloseHandle(snap);
        found
    }
}

/// The "File description" from the exe's version resource, e.g. "Spotify" or "Microsoft Edge".
fn file_description(path: &str) -> Option<String> {
    unsafe {
        let wpath = wide(path);
        let size = GetFileVersionInfoSizeW(PCWSTR(wpath.as_ptr()), None);
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        GetFileVersionInfoW(PCWSTR(wpath.as_ptr()), None, size, data.as_mut_ptr() as *mut c_void).ok()?;

        let mut ptr: *mut c_void = std::ptr::null_mut();
        let mut len = 0u32;
        let query = wide("\\VarFileInfo\\Translation");
        if !VerQueryValueW(data.as_ptr() as *const c_void, PCWSTR(query.as_ptr()), &mut ptr, &mut len).as_bool() || len < 4 {
            return None;
        }
        let lang = *(ptr as *const u16);
        let codepage = *(ptr as *const u16).add(1);
        let query = wide(&format!("\\StringFileInfo\\{lang:04x}{codepage:04x}\\FileDescription"));
        if !VerQueryValueW(data.as_ptr() as *const c_void, PCWSTR(query.as_ptr()), &mut ptr, &mut len).as_bool() || len == 0 {
            return None;
        }
        let chars = std::slice::from_raw_parts(ptr as *const u16, len as usize);
        let end = chars.iter().position(|c| *c == 0).unwrap_or(chars.len());
        let text = String::from_utf16_lossy(&chars[..end]).trim().to_string();
        (!text.is_empty()).then_some(text)
    }
}

fn icon_png(path: &str) -> Option<String> {
    unsafe {
        let wpath = wide(path);
        let mut large = HICON::default();
        if ExtractIconExW(PCWSTR(wpath.as_ptr()), 0, Some(&mut large), None, 1) == 0 || large.is_invalid() {
            return None;
        }
        let png = hicon_to_png(large);
        let _ = DestroyIcon(large);
        png.map(|bytes| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
    }
}

/// Reads a bitmap as top-down 32-bit BGRA.
unsafe fn bitmap_bgra(bmp: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
    let mut info = BITMAP::default();
    if GetObjectW(HGDIOBJ(bmp.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut info as *mut _ as *mut c_void)) == 0 {
        return None;
    }
    let (w, h) = (info.bmWidth as u32, info.bmHeight as u32);
    let mut header = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w as i32,
            biHeight: -(h as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    let dc = GetDC(None);
    let lines = GetDIBits(dc, bmp, 0, h, Some(pixels.as_mut_ptr() as *mut c_void), &mut header, DIB_RGB_COLORS);
    ReleaseDC(None, dc);
    (lines > 0).then_some((w, h, pixels))
}

unsafe fn hicon_to_png(icon: HICON) -> Option<Vec<u8>> {
    let mut ii = ICONINFO::default();
    GetIconInfo(icon, &mut ii).ok()?;
    let color = bitmap_bgra(ii.hbmColor);
    let mask = bitmap_bgra(ii.hbmMask);
    let _ = DeleteObject(HGDIOBJ(ii.hbmColor.0));
    let _ = DeleteObject(HGDIOBJ(ii.hbmMask.0));
    let (w, h, mut px) = color?;

    // Old-style icons carry no alpha channel; derive it from the AND mask (white = transparent).
    let has_alpha = px.chunks(4).any(|p| p[3] != 0);
    for (i, p) in px.chunks_mut(4).enumerate() {
        p.swap(0, 2); // BGRA -> RGBA
        if !has_alpha {
            let transparent = mask.as_ref().map(|(_, _, m)| m[i * 4] != 0).unwrap_or(false);
            p[3] = if transparent { 0 } else { 255 };
        }
    }

    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, w, h);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header().ok()?.write_image_data(&px).ok()?;
    Some(out)
}
