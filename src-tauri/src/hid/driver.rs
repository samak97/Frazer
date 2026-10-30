//! Device-independent headset interface. Each supported model implements `HeadsetDriver`;
//! setters a model lacks keep the default "not supported" implementation.

use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, String>;

fn unsupported<T>(what: &str) -> Result<T> {
    Err(format!("{what} is not supported on this headset"))
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct Capabilities {
    pub battery: bool,
    pub eq: bool,
    pub sidetone: bool,
    pub mic_mute: bool,
    pub mic_eq: bool,
    pub auto_off: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Status {
    /// The dongle is present but the headset itself is off or out of range.
    pub headset_on: bool,
    pub battery_level: Option<u8>,
    pub charging: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    /// Hardware EQ active. Synapse switches it off while its THX Spatial is on.
    pub eq_enabled: Option<bool>,
    pub eq_group: Option<u8>,
    pub eq_preset: Option<u8>,
    pub eq_bands: Option<Vec<i8>>,
    pub sidetone_enabled: Option<bool>,
    /// 0–100 %
    pub sidetone_level: Option<u8>,
    pub mic_muted: Option<bool>,
    pub mic_eq_preset: Option<u8>,
    /// Minutes of silence before power-off; 0 disables.
    pub auto_off_minutes: Option<u8>,
    pub firmware: Option<String>,
    pub serial: Option<String>,
}

/// Something the headset reported on its own (button press, power, battery…).
#[derive(Debug, Clone, PartialEq)]
pub enum HeadsetEvent {
    /// The EQ button moved the headset to another preset slot.
    EqPreset(u8),
    /// Headset switched on/off or came into/out of range of the dongle.
    HeadsetPower(bool),
    Battery(u8),
    Charging(bool),
    MicMuted(bool),
    Sidetone(bool),
}

pub trait HeadsetDriver: Send {
    fn name(&self) -> &str;
    fn connection(&self) -> &str;
    fn capabilities(&self) -> Capabilities;
    fn status(&mut self) -> Result<Status>;
    fn settings(&mut self) -> Result<Settings>;

    fn set_eq(&mut self, _preset: u8, _bands: &[i8]) -> Result<()> {
        unsupported("EQ")
    }
    fn set_sidetone(&mut self, _enabled: bool, _level: u8) -> Result<()> {
        unsupported("Sidetone")
    }
    fn set_mic_mute(&mut self, _muted: bool) -> Result<()> {
        unsupported("Mic mute")
    }
    fn set_mic_eq_preset(&mut self, _preset: u8) -> Result<()> {
        unsupported("Mic EQ")
    }
    fn set_auto_off(&mut self, _minutes: u8) -> Result<()> {
        unsupported("Auto power-off")
    }
}
