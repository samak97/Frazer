pub mod driver;
pub mod drivers;
pub mod mxic;
pub mod registry;
pub mod transport;

use std::sync::Mutex;

use hidapi::HidApi;

use driver::HeadsetDriver;

/// Owns the single `HidApi` instance and the currently open headset, if any.
pub struct HeadsetManager {
    inner: Mutex<Inner>,
}

struct Inner {
    api: HidApi,
    driver: Option<Box<dyn HeadsetDriver>>,
}

impl HeadsetManager {
    pub fn new() -> Result<Self, String> {
        let api = HidApi::new().map_err(|e| format!("hidapi init failed: {e}"))?;
        Ok(Self { inner: Mutex::new(Inner { api, driver: None }) })
    }

    /// Re-enumerates devices; returns whether a supported headset is plugged in.
    pub fn refresh(&self) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let _ = inner.api.refresh_devices();
        let present = registry::find_connected(&inner.api).is_some();
        if !present {
            inner.driver = None;
        }
        present
    }

    /// Runs `f` against the open headset, opening it first if needed. A failed call drops the
    /// handle so the next call reopens it (covers unplug/replug and dongle resets).
    pub fn with_driver<T>(&self, f: impl FnOnce(&mut dyn HeadsetDriver) -> Result<T, String>) -> Result<T, String> {
        let mut inner = self.inner.lock().unwrap();
        if inner.driver.is_none() {
            let _ = inner.api.refresh_devices();
            let entry = registry::find_connected(&inner.api).ok_or("No supported headset connected")?;
            inner.driver = Some((entry.open)(&inner.api, entry).inspect_err(|e| eprintln!("headset open failed: {e}"))?);
        }
        let result = f(inner.driver.as_deref_mut().unwrap());
        if let Err(e) = &result {
            eprintln!("headset command failed: {e}");
            inner.driver = None;
        }
        result
    }
}
