//! Names every Razer audio device that's plugged in. Unknown PIDs are looked up in the catalog in
//! the background, so a newly identified headset of a supported family starts working right away,
//! and any other headset at least shows its model so the user can ask for support.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::hid::catalog::{self, Catalog, ProductInfo};
use crate::hid::registry::DeviceEntry;
use crate::hid::HeadsetManager;

/// After a failed lookup (offline, server down), wait this long before trying that PID again.
const RETRY_AFTER: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DetectStatus {
    /// Frazer can drive it.
    Supported,
    /// A Razer headset whose chip family Frazer has no driver for yet.
    Unsupported,
    /// Lookup in progress.
    Identifying,
    /// No product data: not a Synapse 4 device, or the lookup failed (offline).
    Unidentified,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DetectedDevice {
    pid: u16,
    interfaces: Vec<i32>,
    name: Option<String>,
    /// Synapse's driver class, plus its subclass when there is one.
    family: Option<String>,
    status: DetectStatus,
}

pub struct Detector {
    catalog: Catalog,
    list: Mutex<Vec<DetectedDevice>>,
    busy: AtomicBool,
    failed: Mutex<HashMap<u16, Instant>>,
}

fn family(p: &ProductInfo) -> String {
    match &p.variant {
        Some(v) => format!("{} / {v}", p.class),
        None => p.class.clone(),
    }
}

impl Detector {
    pub fn new(catalog: Catalog) -> Self {
        Self { catalog, list: Mutex::new(Vec::new()), busy: AtomicBool::new(false), failed: Mutex::new(HashMap::new()) }
    }

    /// Cached products Frazer can drive.
    pub fn catalog_entries(&self) -> Vec<DeviceEntry> {
        self.catalog.all().iter().filter_map(DeviceEntry::from_catalog).collect()
    }

    pub fn list(&self) -> Vec<DetectedDevice> {
        self.list.lock().unwrap().clone()
    }

    /// Rebuilds the list from the devices seen by the last `HeadsetManager::refresh`, starts
    /// lookups for unknown PIDs, and returns the list if it changed.
    pub fn update(self: &Arc<Self>, headsets: &Arc<HeadsetManager>) -> Option<Vec<DetectedDevice>> {
        let mut pending = Vec::new();
        let mut list = Vec::new();
        for (pid, interfaces) in headsets.razer_devices() {
            let known = self.catalog.get(pid);
            let product = known.clone().flatten();
            let status = if headsets.supports(pid).is_some() {
                DetectStatus::Supported
            } else {
                match &known {
                    Some(Some(p)) if !p.is_audio() => continue,
                    Some(Some(_)) => DetectStatus::Unsupported,
                    Some(None) => DetectStatus::Unidentified,
                    None if self.failed.lock().unwrap().get(&pid).is_some_and(|t| t.elapsed() < RETRY_AFTER) => {
                        DetectStatus::Unidentified
                    }
                    None => {
                        pending.push(pid);
                        DetectStatus::Identifying
                    }
                }
            };
            let name = headsets.supports(pid).or_else(|| product.as_ref().map(|p| p.name.clone()));
            list.push(DetectedDevice { pid, interfaces, name, family: product.as_ref().map(family), status });
        }

        if !pending.is_empty() && !self.busy.swap(true, Ordering::SeqCst) {
            let this = self.clone();
            let headsets = headsets.clone();
            thread::spawn(move || {
                for pid in pending {
                    match catalog::lookup(pid) {
                        Ok(info) => this.catalog.insert(pid, info),
                        Err(e) => {
                            eprintln!("identifying 1532:{pid:04X} failed: {e}");
                            this.failed.lock().unwrap().insert(pid, Instant::now());
                        }
                    }
                }
                headsets.set_catalog_entries(this.catalog_entries());
                this.busy.store(false, Ordering::SeqCst);
            });
        }

        let mut current = self.list.lock().unwrap();
        (*current != list).then(|| {
            *current = list.clone();
            list
        })
    }
}
