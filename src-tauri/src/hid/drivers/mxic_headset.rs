//! Driver for headsets Synapse 4 drives with its `AudioMxicDevice` class
//! (BlackShark V2 Pro 2023, Barracuda and other MXIC-chip models).

use crate::hid::driver::{Capabilities, HeadsetDriver, HeadsetEvent, Result, Settings, Status};
use crate::hid::mxic::{cmd, event, parse_events as parse_frames, Framing, HidIo, MxicClient};

/// How one MXIC model differs from the others. Everything else (command codes, value encodings)
/// is shared by the whole family.
#[derive(Debug, Clone, Copy)]
pub struct MxicModel {
    pub framing: Framing,
    /// Input report ID of the headset's unsolicited notifications.
    pub event_report_id: u8,
    pub eq: EqLayout,
}

/// Which on-device EQ slot numbers a model uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EqLayout {
    /// BlackShark V2 Pro: Default 0, Game 7, Music 8, Movie 9, esports 250–254 and Custom 255, with
    /// preset groups and a hardware-EQ switch (Synapse's `useHardwareEqualizer`).
    Odessa,
    /// Barracuda (`protocolAudioMabelT1`): Default 0, Game 1, Music 2, Movie 3, Custom 255, and no
    /// groups or EQ switch.
    Mabel,
}

/// BlackShark V2 Pro 2023 (Synapse's base `AudioMxicDevice`).
pub const ODESSA: MxicModel = MxicModel { framing: Framing::Standard, event_report_id: 0x02, eq: EqLayout::Odessa };
/// Barracuda / Barracuda Pro, 2022 dongles (`AudioMxicMabelT1`, events on report 2).
pub const MABEL: MxicModel = MxicModel { framing: Framing::Mabel, event_report_id: 0x02, eq: EqLayout::Mabel };
/// Barracuda / Barracuda Pro, 2024 revision (`AudioMxicMabelT1_ecr`: base framing, events on report 1).
pub const MABEL_ECR: MxicModel = MxicModel { framing: Framing::Standard, event_report_id: 0x01, eq: EqLayout::Mabel };

/// Maps MXIC notify frames (Synapse's `rzHardwareEventsAudioMxicParser`) to headset events.
fn events(report: &[u8], report_id: u8) -> Vec<HeadsetEvent> {
    parse_frames(report, report_id)
        .into_iter()
        .filter_map(|(record, payload)| {
            let v = *payload.first()?;
            Some(match record {
                event::PRESET_EQ_INDEX => HeadsetEvent::EqPreset(v),
                event::WIRELESS => HeadsetEvent::HeadsetPower(v == 1),
                event::BATTERY => HeadsetEvent::Battery(v.min(100)),
                event::CHARGING => HeadsetEvent::Charging(v == 1),
                event::MIC => HeadsetEvent::MicMuted(v == 1),
                event::SIDETONE => HeadsetEvent::Sidetone(v == 1),
                _ => return None,
            })
        })
        .collect()
}

/// Notifications from models that send them on report 2 (`ODESSA`, `MABEL`).
pub fn parse_events(report: &[u8]) -> Vec<HeadsetEvent> {
    events(report, ODESSA.event_report_id)
}

/// Notifications from `MABEL_ECR` models.
pub fn parse_events_report1(report: &[u8]) -> Vec<HeadsetEvent> {
    events(report, MABEL_ECR.event_report_id)
}

pub struct MxicHeadset<I: HidIo> {
    name: &'static str,
    client: MxicClient<I>,
    eq: EqLayout,
    /// Mabel models have one writable slot, so Frazer's esports slots (250–254) are all stored in
    /// Custom; this remembers which one was written so read-back reports it unchanged.
    custom_alias: Option<u8>,
}

impl<I: HidIo> MxicHeadset<I> {
    pub fn new(name: &'static str, io: I, model: MxicModel) -> Self {
        Self { name, client: MxicClient::new(io, model.framing), eq: model.eq, custom_alias: None }
    }
}

/// Slots whose bands live in onboard memory (Synapse's `useEqualizerOBM`): the five esports
/// presets and Custom. Game/Music/Movie (7/8/9) are fixed curves in the firmware.
const WRITABLE_EQ_SLOTS: [u8; 6] = [250, 251, 252, 253, 254, 255];
const CUSTOM_SLOT: u8 = 255;

/// Band gain limit in dB. Synapse's speaker EQ slider for this model is -5…+5 in 1 dB steps.
const EQ_RANGE_DB: i8 = 5;

/// Synapse's `useHardwareEqualizer` groups: esports presets are group 2, everything else group 1.
fn eq_group(preset: u8) -> u8 {
    if (250..=254).contains(&preset) { 2 } else { 1 }
}

/// Frazer (and the UI) number EQ slots the BlackShark way; Mabel models store Game/Music/Movie
/// at 1/2/3 and everything user-defined in Custom.
fn mabel_slot(preset: u8) -> u8 {
    match preset {
        0 => 0,
        7 => 1,
        8 => 2,
        9 => 3,
        _ => CUSTOM_SLOT,
    }
}

fn from_mabel_slot(slot: u8) -> u8 {
    match slot {
        1 => 7,
        2 => 8,
        3 => 9,
        s => s,
    }
}

/// Synapse maps the UI percentage onto the device's 0–15 sidetone scale.
pub fn sidetone_to_device(percent: u8) -> u8 {
    (percent.min(100) as u32 * 15 / 100) as u8
}

pub fn sidetone_from_device(raw: u8) -> u8 {
    ((raw.min(15) as u32 * 100 + 14) / 15) as u8
}

fn ascii(bytes: &[u8]) -> String {
    bytes.iter().filter(|b| (32..127).contains(*b)).map(|b| *b as char).collect()
}

fn raw_bands(bands: &[i8]) -> Vec<u8> {
    bands.iter().map(|b| (*b).clamp(-EQ_RANGE_DB, EQ_RANGE_DB) as u8).collect()
}

impl<I: HidIo> HeadsetDriver for MxicHeadset<I> {
    fn name(&self) -> &str {
        self.name
    }

    fn connection(&self) -> &str {
        "2.4GHz HyperSpeed"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities { battery: true, eq: true, sidetone: true, mic_mute: true, mic_eq: true, auto_off: true }
    }

    fn status(&mut self) -> Result<Status> {
        let headset_on = self.client.get_u8(cmd::WIRELESS)? == 1;
        if !headset_on {
            return Ok(Status { headset_on, battery_level: None, charging: false });
        }
        Ok(Status {
            headset_on,
            battery_level: Some(self.client.get_u8(cmd::BATTERY)?.min(100)),
            charging: self.client.get_u8(cmd::CHARGING)? == 1,
        })
    }

    /// Reads each setting independently so one unsupported query doesn't hide the rest.
    fn settings(&mut self) -> Result<Settings> {
        let odessa = self.eq == EqLayout::Odessa;
        let alias = self.custom_alias;
        let c = &mut self.client;
        let eq_preset = c.get_u8(cmd::EQ_PRESET).ok().map(|slot| match slot {
            _ if odessa => slot,
            CUSTOM_SLOT => alias.unwrap_or(CUSTOM_SLOT),
            _ => from_mabel_slot(slot),
        });
        Ok(Settings {
            eq_enabled: if odessa { c.get_u8(cmd::EQ_ENABLED).ok().map(|v| v == 1) } else { None },
            eq_group: if odessa { c.get_u8(cmd::EQ_GROUP).ok() } else { None },
            eq_preset,
            eq_bands: c.get(cmd::EQ_BANDS).ok().map(|b| b.into_iter().map(|v| v as i8).collect()),
            sidetone_enabled: c.get_u8(cmd::SIDETONE).ok().map(|v| v == 1),
            sidetone_level: c.get_u8(cmd::SIDETONE_VOLUME).ok().map(sidetone_from_device),
            mic_muted: c.get_u8(cmd::MIC_MUTE).ok().map(|v| v == 1),
            mic_eq_preset: c.get_u8(cmd::MIC_EQ_PRESET).ok(),
            auto_off_minutes: c.get_u8(cmd::AUTO_OFF).ok(),
            firmware: c.get(cmd::FIRMWARE).ok().filter(|v| v.len() >= 4).map(|v| format!("{}.{}.{}.{}", v[0], v[1], v[2], v[3])),
            serial: c.get(cmd::SERIAL).ok().map(|v| ascii(&v)),
        })
    }

    /// BlackShark: mirrors Synapse's `setThxV3AudioEqualizer`: select the slot, select its group,
    /// write bands only to the user-writable slots, then make sure the hardware EQ is switched on
    /// (Synapse leaves it off while its THX Spatial is active).
    /// Barracuda: select the slot (`protocolAudioMabelT1.setPresetEQIndex`), and write bands when
    /// it is Custom.
    fn set_eq(&mut self, preset: u8, bands: &[i8]) -> Result<()> {
        if bands.len() != 10 {
            return Err(format!("expected 10 EQ bands, got {}", bands.len()));
        }
        match self.eq {
            EqLayout::Odessa => {
                self.client.set(cmd::SET_EQ_PRESET, &[preset])?;
                self.client.set(cmd::SET_EQ_GROUP, &[eq_group(preset)])?;
                if WRITABLE_EQ_SLOTS.contains(&preset) {
                    self.client.set(cmd::SET_EQ_BANDS, &raw_bands(bands))?;
                }
                self.client.set(cmd::SET_EQ_ENABLED, &[1])
            }
            EqLayout::Mabel => {
                let slot = mabel_slot(preset);
                self.client.set(cmd::SET_EQ_PRESET, &[slot])?;
                if slot == CUSTOM_SLOT {
                    self.client.set(cmd::SET_EQ_BANDS, &raw_bands(bands))?;
                }
                self.custom_alias = (slot == CUSTOM_SLOT).then_some(preset);
                Ok(())
            }
        }
    }

    fn set_sidetone(&mut self, enabled: bool, level: u8) -> Result<()> {
        self.client.set(cmd::SET_SIDETONE, &[enabled as u8])?;
        self.client.set(cmd::SET_SIDETONE_VOLUME, &[sidetone_to_device(level)])
    }

    fn set_mic_mute(&mut self, muted: bool) -> Result<()> {
        self.client.set(cmd::SET_MIC_MUTE, &[muted as u8])
    }

    fn set_mic_eq_preset(&mut self, preset: u8) -> Result<()> {
        self.client.set(cmd::SET_MIC_EQ_PRESET, &[preset])
    }

    fn set_auto_off(&mut self, minutes: u8) -> Result<()> {
        self.client.set(cmd::SET_AUTO_OFF, &[minutes])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::mxic::{REPORT_ID, REPORT_LEN};
    use std::sync::{Arc, Mutex};

    /// Acknowledges every setter (standard framing) and records `(code, first data byte)` of each
    /// non-remote write.
    #[derive(Clone, Default)]
    struct AckIo {
        writes: Arc<Mutex<Vec<(u8, u8)>>>,
        last: Option<u8>,
    }

    impl HidIo for AckIo {
        fn write(&mut self, buf: &[u8]) -> std::result::Result<usize, String> {
            if buf[7] == 0x08 {
                self.writes.lock().unwrap().push((buf[10], buf[13]));
                self.last = Some(buf[10]);
            }
            Ok(buf.len())
        }
        fn get_input_report(&mut self, buf: &mut [u8]) -> std::result::Result<usize, String> {
            buf[1] = 0x4F;
            Ok(REPORT_LEN)
        }
        fn read_timeout(&mut self, buf: &mut [u8], _: i32) -> std::result::Result<usize, String> {
            let Some(code) = self.last.take() else { return Ok(0) };
            let frame = [b'P', b'I', 0x08, 0, 0, 0, 0, 0, 0, 3, code, 1, 1];
            buf[0] = REPORT_ID;
            buf[1] = frame.len() as u8;
            buf[2..2 + frame.len()].copy_from_slice(&frame);
            Ok(REPORT_LEN)
        }
    }

    fn eq_writes(model: MxicModel, preset: u8) -> Vec<(u8, u8)> {
        let io = AckIo::default();
        let writes = io.writes.clone();
        MxicHeadset::new("test", io, model).set_eq(preset, &[0; 10]).unwrap();
        let v = writes.lock().unwrap().clone();
        v
    }

    fn codes(writes: Vec<(u8, u8)>) -> Vec<u8> {
        writes.into_iter().map(|(c, _)| c).collect()
    }

    #[test]
    fn eq_follows_synapse_order() {
        // index, group, bands (writable slot), enable
        assert_eq!(codes(eq_writes(ODESSA, 255)), vec![0x93, 0x9D, 0x95, 0x9E]);
        assert_eq!(codes(eq_writes(ODESSA, 251)), vec![0x93, 0x9D, 0x95, 0x9E]);
        // built-in Game/Music/Movie: no band write
        assert_eq!(codes(eq_writes(ODESSA, 8)), vec![0x93, 0x9D, 0x9E]);
        assert_eq!(eq_group(252), 2);
        assert_eq!(eq_group(7), 1);
    }

    #[test]
    fn mabel_eq_uses_its_own_slots_without_group_or_switch() {
        // MABEL_ECR shares the standard framing, so AckIo can answer it.
        assert_eq!(eq_writes(MABEL_ECR, 8), vec![(0x93, 2)]);
        assert_eq!(eq_writes(MABEL_ECR, 255), vec![(0x93, 255), (0x95, 0)]);
        assert_eq!(eq_writes(MABEL_ECR, 251), vec![(0x93, 255), (0x95, 0)]);
        for p in [0, 7, 8, 9] {
            assert_eq!(from_mabel_slot(mabel_slot(p)), p);
        }
    }

    #[test]
    fn events_are_read_from_the_model_report_id() {
        let frame = [b'P', b'I', 0x08, 0, 0, 0, 0, 0, 0, 4, event::BATTERY, 2, 1, 42];
        let mut r = vec![0x01, frame.len() as u8];
        r.extend(frame);
        assert_eq!(parse_events_report1(&r), vec![HeadsetEvent::Battery(42)]);
        assert!(parse_events(&r).is_empty());
        r[0] = 0x02;
        assert_eq!(parse_events(&r), vec![HeadsetEvent::Battery(42)]);
    }

    #[test]
    fn sidetone_scale_matches_synapse() {
        assert_eq!(sidetone_to_device(50), 7);
        assert_eq!(sidetone_to_device(100), 15);
        assert_eq!(sidetone_from_device(7), 47);
        assert_eq!(sidetone_from_device(15), 100);
        assert_eq!(sidetone_from_device(0), 0);
    }
}
