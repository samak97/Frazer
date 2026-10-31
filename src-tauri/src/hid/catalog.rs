//! Identifies Razer USB devices from the product data Synapse 4 downloads from Razer's server
//! (`apps.razer.com/synapse/products/<id>/mw/`). That data names the model and the driver class
//! Synapse uses for it, so a headset whose chip family Frazer already speaks works without a new
//! release, and any other headset can at least be named. Results are cached on disk.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};

const BASE_URL: &str = "https://apps.razer.com/synapse/products";
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProductInfo {
    /// The PID the device enumerates with (the dongle's, for wireless headsets).
    pub usb_pid: u16,
    /// Synapse's product id; differs from `usb_pid` when the product lists a separate `dongleId`.
    pub product_id: u16,
    pub name: String,
    /// "AUDIO", "MOUSE", "KEYBOARD", …
    pub category: String,
    /// Synapse's `rzDeviceType`, e.g. `AudioMxicDevice`.
    pub class: String,
    /// Synapse's `rzDeviceName` subclass, e.g. `AudioMxicMabelT1`.
    pub variant: Option<String>,
    /// USB interface of the control channel (`claimInterface`).
    pub interface: Option<i32>,
}

impl ProductInfo {
    pub fn is_audio(&self) -> bool {
        self.category.eq_ignore_ascii_case("AUDIO")
    }
}

/// Reads a product's `main.js` and `manifest.json`. `None` if `main_js` doesn't describe product `id`.
pub fn parse_product(id: u16, main_js: &str, manifest: &str) -> Option<ProductInfo> {
    // e.g. {productId:1339,dongleId:1340,vendorId:5426,…}; a few other ids may sit in between.
    let config = Regex::new(&format!(r"productId:{id},((?:\w+:\d+,){{0,4}})vendorId:5426")).ok()?;
    let found = config.captures(main_js)?;
    let dongle: Option<u16> = Regex::new(r"dongleId:(\d+)").ok()?.captures(&found[1]).and_then(|c| c[1].parse().ok());
    // The rest of the product config follows within a few hundred characters.
    let start = found.get(0)?.end();
    let mut end = (start + 1500).min(main_js.len());
    while !main_js.is_char_boundary(end) {
        end -= 1;
    }
    let window = &main_js[start..end];
    let field = |re: &str| Regex::new(re).ok()?.captures(window).map(|c| c[1].to_string());
    let class = Regex::new(r#"useFeature\("rzDeviceType","(\w+)"(?:,\{rzDeviceName:"(\w+)")?"#).ok()?.captures(main_js);

    let manifest: serde_json::Value = serde_json::from_str(manifest).unwrap_or_default();
    let name = manifest["productTranslations"][format!("{id}_0")]["en"]["PRODUCT"]
        .as_str()
        .or_else(|| manifest["deviceName"].as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    Some(ProductInfo {
        usb_pid: dongle.unwrap_or(id),
        product_id: id,
        name,
        category: field(r#"category:"(\w+)""#).unwrap_or_default(),
        class: class.as_ref().map(|c| c[1].to_string()).unwrap_or_default(),
        variant: class.as_ref().and_then(|c| c.get(2)).map(|m| m.as_str().to_string()),
        interface: field(r"claimInterface:(\d+)").and_then(|v| v.parse().ok()),
    })
}

/// `Ok(None)` for a 404; `Err` for network trouble (worth retrying later).
fn fetch(url: &str) -> Result<Option<String>, String> {
    match ureq::get(url).timeout(TIMEOUT).call() {
        Ok(r) => r.into_string().map(Some).map_err(|e| e.to_string()),
        Err(ureq::Error::Status(404 | 403, _)) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn fetch_product(id: u16) -> Result<Option<ProductInfo>, String> {
    let base = format!("{BASE_URL}/{id}/mw");
    let Some(index) = fetch(&format!("{base}/index.html"))? else { return Ok(None) };
    let Some(main) = Regex::new(r"main\.[0-9a-f]+\.js").unwrap().find(&index).map(|m| m.as_str().to_string()) else {
        return Ok(None);
    };
    let Some(main_js) = fetch(&format!("{base}/{main}"))? else { return Ok(None) };
    let manifest = fetch(&format!("{base}/manifest.json"))?.unwrap_or_default();
    Ok(parse_product(id, &main_js, &manifest))
}

/// Finds the product a USB PID belongs to. Wireless dongles often enumerate one id away from
/// their product (Barracuda: product 0x053B, dongle 0x053C), so neighbours are tried and kept
/// only if they name this PID as their dongle.
pub fn lookup(usb_pid: u16) -> Result<Option<ProductInfo>, String> {
    if let Some(p) = fetch_product(usb_pid)? {
        return Ok(Some(ProductInfo { usb_pid, ..p }));
    }
    for id in [usb_pid.wrapping_sub(1), usb_pid.wrapping_add(1)] {
        if let Some(p) = fetch_product(id)? {
            if p.usb_pid == usb_pid {
                return Ok(Some(p));
            }
        }
    }
    Ok(None)
}

/// Lookup results by USB PID, persisted as `catalog.json`. `None` = Razer has no Synapse 4 data
/// for that PID (older or Synapse 3 devices).
pub struct Catalog {
    path: PathBuf,
    entries: Mutex<HashMap<u16, Option<ProductInfo>>>,
}

impl Catalog {
    pub fn load(path: PathBuf) -> Self {
        let entries = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Self { path, entries: Mutex::new(entries) }
    }

    /// `None` = never looked up; `Some(None)` = looked up, not a Synapse 4 product.
    pub fn get(&self, pid: u16) -> Option<Option<ProductInfo>> {
        self.entries.lock().unwrap().get(&pid).cloned()
    }

    pub fn all(&self) -> Vec<ProductInfo> {
        self.entries.lock().unwrap().values().flatten().cloned().collect()
    }

    pub fn insert(&self, pid: u16, info: Option<ProductInfo>) {
        let mut entries = self.entries.lock().unwrap();
        entries.insert(pid, info);
        match serde_json::to_string_pretty(&*entries) {
            Ok(text) => {
                if let Err(e) = std::fs::write(&self.path, text) {
                    eprintln!("saving catalog failed: {e}");
                }
            }
            Err(e) => eprintln!("saving catalog failed: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BARRACUDA_MAIN: &str = r#"x;const i=[],_="Razer Barracuda 2.4",a={productId:1339,dongleId:1340,vendorId:5426,deviceName:_,virtualRouteDeviceName:_,supportPage:"https://mysupport.razer.com/app/answers/detail/a_id/6034",category:"AUDIO",claimInterface:3},s=[0,128,129];a.A.useFeature("rzDeviceType","AudioMxicDevice",{rzDeviceName:"AudioMxicMabelT1",hardwareEventParserType:o.NQ.AUDIO_MXIC_MABELT1,remoteMode:!0})"#;
    const BARRACUDA_V2_PRO_MAIN: &str = r#"u={productId:1427,dongleId:1426,secondaryPID:1426,vendorId:5426,deviceName:s,category:"AUDIO",claimInterface:3}"#;
    const BARRACUDA_MANIFEST: &str = r#"{"deviceName":"Razer Barracuda 2.4","productTranslations":{"1339_0":{"en":{"PRODUCT":"Razer Barracuda"}}}}"#;
    const BLACKSHARK_MAIN: &str = r#"{productId:1365,vendorId:5426,deviceName:"Razer BlackShark V2 Pro",category:"AUDIO",family:"ODESSA",claimInterface:3,latestFirmwareInfo:{version:"2.2.0.0"}};_.A.useFeature("rzDeviceType","AudioMxicDevice",{remoteMode:!0})"#;

    #[test]
    fn reads_product_with_separate_dongle() {
        let p = parse_product(1339, BARRACUDA_MAIN, BARRACUDA_MANIFEST).unwrap();
        assert_eq!(p.usb_pid, 0x053C);
        assert_eq!(p.product_id, 0x053B);
        assert_eq!(p.name, "Razer Barracuda");
        assert!(p.is_audio());
        assert_eq!(p.class, "AudioMxicDevice");
        assert_eq!(p.variant.as_deref(), Some("AudioMxicMabelT1"));
        assert_eq!(p.interface, Some(3));
    }

    #[test]
    fn reads_product_without_subclass_or_translations() {
        let p = parse_product(1365, BLACKSHARK_MAIN, r#"{"deviceName":"Razer BlackShark V2 Pro"}"#).unwrap();
        assert_eq!(p.usb_pid, 0x0555);
        assert_eq!(p.name, "Razer BlackShark V2 Pro");
        assert_eq!(p.variant, None);
        assert_eq!(p.interface, Some(3));
        assert!(parse_product(1366, BLACKSHARK_MAIN, "{}").is_none());
        let v2 = parse_product(1427, BARRACUDA_V2_PRO_MAIN, r#"{"deviceName":"Razer Barracuda V2 Pro"}"#).unwrap();
        assert_eq!((v2.usb_pid, v2.name.as_str()), (0x0592, "Razer Barracuda V2 Pro"));
    }

    /// Hits Razer's server: `cargo test --lib live_lookup -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_lookup() {
        for pid in [0x0555u16, 0x053C, 0x0584, 0x0574, 0x056E, 0x0592, 0x052C, 0x00A5, 0x0001] {
            println!("{pid:04X}: {:?}", lookup(pid));
        }
        let barracuda = lookup(0x053C).unwrap().unwrap();
        assert_eq!((barracuda.product_id, barracuda.variant.as_deref()), (0x053B, Some("AudioMxicMabelT1")));
        assert_eq!(lookup(0x0001), Ok(None));
    }
}
