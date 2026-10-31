//! System-level toast: a small always-on-top, click-through window in the bottom-right corner
//! that never takes focus (so it can't pull you out of a game) and hides itself after a moment.

use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE,
};

const LABEL: &str = "toast";
const WIDTH: f64 = 340.0;
const HEIGHT: f64 = 96.0;
const MARGIN: i32 = 16;
/// Includes the fade-in/out the overlay page animates.
const VISIBLE_FOR: Duration = Duration::from_millis(1900);

static GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#toast".into()))
        .title("Frazer notification")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()?;
    window.set_ignore_cursor_events(true)?;
    Ok(())
}

/// Bottom-right of the monitor's work area (above the taskbar).
fn place(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let Ok(Some(monitor)) = window.primary_monitor() else { return };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let (w, h) = ((WIDTH * scale) as i32, (HEIGHT * scale) as i32);
    let x = area.position.x + area.size.width as i32 - w - MARGIN;
    let y = area.position.y + area.size.height as i32 - h - MARGIN;
    let _ = window.set_size(LogicalSize::new(WIDTH, HEIGHT));
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Shows `payload` in the overlay, then hides it unless a newer toast replaced it meanwhile.
pub fn show<P: Serialize + Clone>(app: &AppHandle, payload: P) {
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    place(app);
    let _ = window.emit_to(LABEL, "overlay-toast", payload);
    // Shown and hidden through Win32 directly: Tauri's show() would activate (focus) the window,
    // and its hide() is a no-op for a window it didn't show itself.
    let Ok(raw) = window.hwnd() else { return };
    let hwnd = raw.0 as isize;
    unsafe {
        let h = HWND(hwnd as _);
        let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
    thread::spawn(move || {
        thread::sleep(VISIBLE_FOR);
        if GENERATION.load(Ordering::SeqCst) == generation {
            unsafe {
                let _ = ShowWindow(HWND(hwnd as _), SW_HIDE);
            }
        }
    });
}
