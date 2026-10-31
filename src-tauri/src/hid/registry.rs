//! Supported headsets. Adding a model = one entry here (plus a driver if it isn't MXIC-based).

use hidapi::HidApi;

use super::driver::{HeadsetDriver, HeadsetEvent};
use super::drivers::mxic_headset::{self, MxicHeadset, MxicModel, MABEL, MABEL_ECR, ODESSA};
use super::transport::HidTransport;

pub const RAZER_VID: u16 = 0x1532;

pub struct DeviceEntry {
    pub pid: u16,
    pub name: &'static str,
    /// USB interface that carries the control channel (Synapse's `claimInterface`).
    pub interface: i32,
    pub open: fn(&HidApi, &DeviceEntry) -> Result<Box<dyn HeadsetDriver>, String>,
    /// Decodes unsolicited input reports read from the control channel.
    pub parse_events: fn(&[u8]) -> Vec<HeadsetEvent>,
}

fn open_mxic(api: &HidApi, e: &DeviceEntry, model: MxicModel) -> Result<Box<dyn HeadsetDriver>, String> {
    let io = HidTransport::open(api, RAZER_VID, e.pid, e.interface)?;
    Ok(Box::new(MxicHeadset::new(e.name, io, model)))
}

fn open_odessa(api: &HidApi, e: &DeviceEntry) -> Result<Box<dyn HeadsetDriver>, String> {
    open_mxic(api, e, ODESSA)
}

fn open_mabel(api: &HidApi, e: &DeviceEntry) -> Result<Box<dyn HeadsetDriver>, String> {
    open_mxic(api, e, MABEL)
}

fn open_mabel_ecr(api: &HidApi, e: &DeviceEntry) -> Result<Box<dyn HeadsetDriver>, String> {
    open_mxic(api, e, MABEL_ECR)
}

/// The PID is the one the HyperSpeed dongle enumerates with: Synapse's `dongleId` where its
/// product config has one (Barracuda 2022: product 0x053B, dongle 0x053C), else its `productId`.
pub const DEVICES: &[DeviceEntry] = &[
    DeviceEntry {
        pid: 0x0555,
        name: "Razer BlackShark V2 Pro",
        interface: 3,
        open: open_odessa,
        parse_events: mxic_headset::parse_events,
    },
    DeviceEntry {
        pid: 0x053C,
        name: "Razer Barracuda",
        interface: 3,
        open: open_mabel,
        parse_events: mxic_headset::parse_events,
    },
    DeviceEntry {
        pid: 0x053B,
        name: "Razer Barracuda",
        interface: 3,
        open: open_mabel,
        parse_events: mxic_headset::parse_events,
    },
    DeviceEntry {
        pid: 0x0584,
        name: "Razer Barracuda",
        interface: 3,
        open: open_mabel_ecr,
        parse_events: mxic_headset::parse_events_report1,
    },
    DeviceEntry {
        pid: 0x053A,
        name: "Razer Barracuda Pro",
        interface: 3,
        open: open_mabel,
        parse_events: mxic_headset::parse_events,
    },
    DeviceEntry {
        pid: 0x0539,
        name: "Razer Barracuda Pro",
        interface: 3,
        open: open_mabel,
        parse_events: mxic_headset::parse_events,
    },
    DeviceEntry {
        pid: 0x0583,
        name: "Razer Barracuda Pro",
        interface: 3,
        open: open_mabel_ecr,
        parse_events: mxic_headset::parse_events_report1,
    },
];

/// The first supported headset currently enumerated, if any.
pub fn find_connected(api: &HidApi) -> Option<&'static DeviceEntry> {
    DEVICES.iter().find(|e| {
        api.device_list()
            .any(|d| d.vendor_id() == RAZER_VID && d.product_id() == e.pid && d.interface_number() == e.interface)
    })
}
