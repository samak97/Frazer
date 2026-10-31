pub mod catalog;
pub mod driver;
pub mod drivers;
pub mod mxic;
pub mod registry;
pub mod transport;

use std::sync::Mutex;

use hidapi::HidApi;

use driver::HeadsetDriver;
use registry::{DeviceEntry, Family};

pub struct EventStream {
    io: transport::HidTransport,
    family: Family,
}

impl EventStream {
    /// Waits up to `timeout_ms` for one input report; an error means the device went away.
    pub fn read(&mut self, timeout_ms: i32) -> Result<Vec<driver::HeadsetEvent>, String> {
        use mxic::HidIo;
        let mut buf = [0u8; mxic::REPORT_LEN];
        let n = self.io.read_timeout(&mut buf, timeout_ms)?;
        Ok(if n == 0 { Vec::new() } else { self.family.parse_events(&buf[..n]) })
    }
}

/// Owns the single `HidApi` instance and the currently open headset, if any.
pub struct HeadsetManager {
    inner: Mutex<Inner>,
}

struct Inner {
    api: HidApi,
    driver: Option<Box<dyn HeadsetDriver>>,
    /// Built-in models first, then models identified through the catalog.
    entries: Vec<DeviceEntry>,
}

impl HeadsetManager {
    pub fn new() -> Result<Self, String> {
        let api = HidApi::new().map_err(|e| format!("hidapi init failed: {e}"))?;
        Ok(Self { inner: Mutex::new(Inner { api, driver: None, entries: registry::builtin() }) })
    }

    /// Adds models identified through the catalog; built-in entries keep priority.
    pub fn set_catalog_entries(&self, extra: Vec<DeviceEntry>) {
        let mut inner = self.inner.lock().unwrap();
        let builtin = registry::builtin();
        let extra: Vec<DeviceEntry> = extra.into_iter().filter(|e| !builtin.iter().any(|b| b.pid == e.pid)).collect();
        let entries = builtin.into_iter().chain(extra).collect();
        inner.entries = entries;
    }

    /// Whether `pid` is a model Frazer can drive.
    pub fn supports(&self, pid: u16) -> Option<String> {
        self.inner.lock().unwrap().entries.iter().find(|e| e.pid == pid).map(|e| e.name.clone())
    }

    /// Re-enumerates devices; returns whether a supported headset is plugged in.
    pub fn refresh(&self) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let _ = inner.api.refresh_devices();
        let present = registry::find_connected(&inner.api, &inner.entries).is_some();
        if !present {
            inner.driver = None;
        }
        present
    }

    /// Razer devices seen by the last `refresh`, as `(pid, interface numbers)`.
    pub fn razer_devices(&self) -> Vec<(u16, Vec<i32>)> {
        registry::razer_devices(&self.inner.lock().unwrap().api)
    }

    /// Opens a second handle on the control channel for reading headset events. Windows gives
    /// every handle its own copy of input reports, so this doesn't steal command replies.
    pub fn open_event_stream(&self) -> Result<EventStream, String> {
        let inner = self.inner.lock().unwrap();
        let entry = registry::find_connected(&inner.api, &inner.entries).ok_or("No supported headset connected")?;
        let io = transport::HidTransport::open(&inner.api, registry::RAZER_VID, entry.pid, entry.interface)?;
        Ok(EventStream { io, family: entry.family })
    }

    /// Runs `f` against the open headset, opening it first if needed. A failed call drops the
    /// handle so the next call reopens it (covers unplug/replug and dongle resets).
    pub fn with_driver<T>(&self, f: impl FnOnce(&mut dyn HeadsetDriver) -> Result<T, String>) -> Result<T, String> {
        let mut inner = self.inner.lock().unwrap();
        if inner.driver.is_none() {
            let _ = inner.api.refresh_devices();
            let entry = registry::find_connected(&inner.api, &inner.entries).ok_or("No supported headset connected")?;
            inner.driver = Some(entry.open(&inner.api).inspect_err(|e| eprintln!("headset open failed: {e}"))?);
        }
        let result = f(inner.driver.as_deref_mut().unwrap());
        if let Err(e) = &result {
            eprintln!("headset command failed: {e}");
            inner.driver = None;
        }
        result
    }
}
