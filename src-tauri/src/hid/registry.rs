//! Supported headsets: a few built in (so they work offline), plus any headset whose Synapse data
//! (see `catalog`) names a chip family Frazer has a driver for. A new family = a driver plus one
//! arm in `Family::from_synapse`.

use hidapi::HidApi;

use super::catalog::ProductInfo;
use super::driver::{HeadsetDriver, HeadsetEvent};
use super::drivers::mxic_headset::{self, MxicHeadset, MxicModel, MABEL, MABEL_ECR, ODESSA};
use super::transport::HidTransport;

pub const RAZER_VID: u16 = 0x1532;

/// A protocol family Frazer implements, with the per-model details it needs.
#[derive(Debug, Clone, Copy)]
pub enum Family {
    Mxic(MxicModel),
}

impl Family {
    /// Maps Synapse's driver class (`rzDeviceType`) and subclass (`rzDeviceName`) to a family.
    pub fn from_synapse(class: &str, variant: Option<&str>) -> Option<Family> {
        match (class, variant) {
            ("AudioMxicDevice", None) => Some(Family::Mxic(ODESSA)),
            ("AudioMxicDevice", Some("AudioMxicMabelT1")) => Some(Family::Mxic(MABEL)),
            ("AudioMxicDevice", Some("AudioMxicMabelT1_ecr")) => Some(Family::Mxic(MABEL_ECR)),
            _ => None,
        }
    }

    /// Decodes unsolicited input reports read from the control channel.
    pub fn parse_events(self, report: &[u8]) -> Vec<HeadsetEvent> {
        match self {
            Family::Mxic(m) => mxic_headset::parse_events(report, m.event_report_id),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DeviceEntry {
    pub pid: u16,
    pub name: String,
    /// USB interface that carries the control channel (Synapse's `claimInterface`).
    pub interface: i32,
    pub family: Family,
}

impl DeviceEntry {
    pub fn open(&self, api: &HidApi) -> Result<Box<dyn HeadsetDriver>, String> {
        let io = HidTransport::open(api, RAZER_VID, self.pid, self.interface)?;
        Ok(match self.family {
            Family::Mxic(model) => Box::new(MxicHeadset::new(self.name.clone(), io, model)),
        })
    }

    /// A catalog product Frazer can drive, if its family is implemented.
    pub fn from_catalog(p: &ProductInfo) -> Option<DeviceEntry> {
        Some(DeviceEntry {
            pid: p.usb_pid,
            name: p.name.clone(),
            interface: p.interface?,
            family: Family::from_synapse(&p.class, p.variant.as_deref())?,
        })
    }
}

/// Models known without looking anything up. The PID is the one the HyperSpeed dongle
/// enumerates with: Synapse's `dongleId` where its product config has one, else its `productId`.
pub fn builtin() -> Vec<DeviceEntry> {
    let entry = |pid, name: &str, model| DeviceEntry { pid, name: name.into(), interface: 3, family: Family::Mxic(model) };
    vec![
        entry(0x0555, "Razer BlackShark V2 Pro", ODESSA),
        entry(0x053C, "Razer Barracuda", MABEL),
        entry(0x0584, "Razer Barracuda", MABEL_ECR),
        entry(0x053A, "Razer Barracuda Pro", MABEL),
        entry(0x0583, "Razer Barracuda Pro", MABEL_ECR),
    ]
}

/// Razer devices currently enumerated, as `(pid, interface numbers)`, sorted by PID.
pub fn razer_devices(api: &HidApi) -> Vec<(u16, Vec<i32>)> {
    let mut out: Vec<(u16, Vec<i32>)> = Vec::new();
    for d in api.device_list().filter(|d| d.vendor_id() == RAZER_VID) {
        match out.iter_mut().find(|(pid, _)| *pid == d.product_id()) {
            Some((_, ifs)) if !ifs.contains(&d.interface_number()) => ifs.push(d.interface_number()),
            Some(_) => {}
            None => out.push((d.product_id(), vec![d.interface_number()])),
        }
    }
    out.iter_mut().for_each(|(_, ifs)| ifs.sort());
    out.sort_by_key(|(pid, _)| *pid);
    out
}

/// The first supported headset currently enumerated, if any, from `entries`.
pub fn find_connected(api: &HidApi, entries: &[DeviceEntry]) -> Option<DeviceEntry> {
    entries
        .iter()
        .find(|e| {
            api.device_list()
                .any(|d| d.vendor_id() == RAZER_VID && d.product_id() == e.pid && d.interface_number() == e.interface)
        })
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn product(class: &str, variant: Option<&str>, interface: Option<i32>) -> ProductInfo {
        ProductInfo {
            usb_pid: 0x0999,
            product_id: 0x0998,
            name: "Razer Test".into(),
            category: "AUDIO".into(),
            class: class.into(),
            variant: variant.map(Into::into),
            interface,
        }
    }

    #[test]
    fn catalog_products_of_known_families_become_entries() {
        let e = DeviceEntry::from_catalog(&product("AudioMxicDevice", Some("AudioMxicMabelT1"), Some(3))).unwrap();
        assert_eq!((e.pid, e.interface, e.name.as_str()), (0x0999, 3, "Razer Test"));
        assert!(matches!(e.family, Family::Mxic(m) if m.framing == MABEL.framing));
        assert!(DeviceEntry::from_catalog(&product("AudioMxicDevice", None, Some(3))).is_some());
    }

    #[test]
    fn unknown_families_and_missing_interfaces_are_not_supported() {
        assert!(DeviceEntry::from_catalog(&product("AudioMabelT3C", None, Some(3))).is_none());
        assert!(DeviceEntry::from_catalog(&product("AudioMxicDevice", Some("AudioMxicNewThing"), Some(3))).is_none());
        assert!(DeviceEntry::from_catalog(&product("AudioMxicDevice", None, None)).is_none());
    }
}
