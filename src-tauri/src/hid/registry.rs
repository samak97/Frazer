//! Supported headsets. Adding a model = one entry here (plus a driver if it isn't MXIC-based).

use hidapi::HidApi;

use super::driver::HeadsetDriver;
use super::drivers::mxic_headset::MxicHeadset;
use super::transport::HidTransport;

pub const RAZER_VID: u16 = 0x1532;

pub struct DeviceEntry {
    pub pid: u16,
    pub name: &'static str,
    /// USB interface that carries the control channel (Synapse's `claimInterface`).
    pub interface: i32,
    pub open: fn(&HidApi, &DeviceEntry) -> Result<Box<dyn HeadsetDriver>, String>,
}

fn open_mxic(api: &HidApi, e: &DeviceEntry) -> Result<Box<dyn HeadsetDriver>, String> {
    let io = HidTransport::open(api, RAZER_VID, e.pid, e.interface)?;
    Ok(Box::new(MxicHeadset::new(e.name, io)))
}

pub const DEVICES: &[DeviceEntry] = &[DeviceEntry {
    pid: 0x0555,
    name: "Razer BlackShark V2 Pro",
    interface: 3,
    open: open_mxic,
}];

/// The first supported headset currently enumerated, if any.
pub fn find_connected(api: &HidApi) -> Option<&'static DeviceEntry> {
    DEVICES.iter().find(|e| {
        api.device_list()
            .any(|d| d.vendor_id() == RAZER_VID && d.product_id() == e.pid && d.interface_number() == e.interface)
    })
}
