//! hidapi-backed transport: opens exactly one HID collection and adapts it to `HidIo`.

use hidapi::{HidApi, HidDevice};

use super::mxic::HidIo;

/// Vendor-defined usage pages start at 0xFF00; the control channel lives there.
const VENDOR_USAGE_PAGE: u16 = 0xFF00;

pub struct HidTransport(HidDevice);

impl HidTransport {
    /// Opens the vendor-defined collection on `interface`, falling back to any collection on it.
    pub fn open(api: &HidApi, vid: u16, pid: u16, interface: i32) -> Result<Self, String> {
        let mut candidates: Vec<_> = api
            .device_list()
            .filter(|d| d.vendor_id() == vid && d.product_id() == pid && d.interface_number() == interface)
            .collect();
        candidates.sort_by_key(|d| d.usage_page() < VENDOR_USAGE_PAGE);
        let info = candidates
            .first()
            .ok_or_else(|| format!("{vid:04X}:{pid:04X} interface {interface} not found"))?;
        let dev = info
            .open_device(api)
            .map_err(|e| format!("cannot open headset ({e}); is another app holding it exclusively?"))?;
        Ok(Self(dev))
    }
}

impl HidIo for HidTransport {
    fn write(&mut self, buf: &[u8]) -> Result<usize, String> {
        self.0.write(buf).map_err(|e| format!("HID write failed: {e}"))
    }
    fn get_input_report(&mut self, buf: &mut [u8]) -> Result<usize, String> {
        self.0.get_input_report(buf).map_err(|e| format!("HID get_input_report failed: {e}"))
    }
    fn read_timeout(&mut self, buf: &mut [u8], timeout_ms: i32) -> Result<usize, String> {
        self.0.read_timeout(buf, timeout_ms).map_err(|e| format!("HID read failed: {e}"))
    }
}
