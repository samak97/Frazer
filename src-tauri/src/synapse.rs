//! Detects and stops Razer Synapse's background engine, which otherwise reacts to the headset's
//! EQ button and re-applies its own EQ (or switches the hardware EQ off) on every reconnect.

use std::os::windows::process::CommandExt;
use std::process::Command;

use serde::Serialize;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

/// The monitor restarts the engine, so it has to go first.
const PROCESSES: [&str; 2] = ["RzEngineMon.exe", "RazerAppEngine.exe"];
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "RazerAppEngine";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SynapseStatus {
    pub running: bool,
    /// Synapse's own "start with Windows" entry is present.
    pub autostart: bool,
}

fn process_ids(names: &[&str]) -> Vec<(String, u32)> {
    let mut found = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return found };
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut more = Process32FirstW(snap, &mut entry).is_ok();
        while more {
            let len = entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(entry.szExeFile.len());
            let exe = String::from_utf16_lossy(&entry.szExeFile[..len]);
            if names.iter().any(|n| n.eq_ignore_ascii_case(&exe)) {
                found.push((exe, entry.th32ProcessID));
            }
            more = Process32NextW(snap, &mut entry).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    found
}

fn reg(args: &[&str]) -> std::io::Result<std::process::Output> {
    Command::new("reg").args(args).creation_flags(CREATE_NO_WINDOW).output()
}

/// The command line Synapse registered to start with Windows, if any.
pub fn autostart_command() -> Option<String> {
    let out = reg(&["query", RUN_KEY, "/v", RUN_VALUE]).ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().find(|l| l.trim_start().starts_with(RUN_VALUE))?;
    line.split_once("REG_SZ").map(|(_, v)| v.trim().to_string())
}

pub fn status() -> SynapseStatus {
    SynapseStatus { running: !process_ids(&PROCESSES).is_empty(), autostart: autostart_command().is_some() }
}

pub fn stop() -> Result<(), String> {
    for name in PROCESSES {
        for (exe, pid) in process_ids(&[name]) {
            unsafe {
                let handle = OpenProcess(PROCESS_TERMINATE, false, pid).map_err(|e| format!("can't close {exe}: {e}"))?;
                let result = TerminateProcess(handle, 0);
                let _ = CloseHandle(handle);
                result.map_err(|e| format!("can't close {exe}: {e}"))?;
            }
        }
    }
    Ok(())
}

/// Removes Synapse's startup entry, or puts `command` (the saved original) back.
pub fn set_autostart(command: Option<&str>) -> Result<(), String> {
    let out = match command {
        Some(cmd) => reg(&["add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d", cmd, "/f"]),
        None => reg(&["delete", RUN_KEY, "/v", RUN_VALUE, "/f"]),
    }
    .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}
