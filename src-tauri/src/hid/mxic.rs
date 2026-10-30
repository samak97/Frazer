//! Framing and command client for Razer's MXIC-family headset protocol.
//! Byte layouts are documented in `docs/protocol/blackshark-v2-pro.md`.

use std::thread::sleep;
use std::time::Duration;

pub const REPORT_ID: u8 = 0x02;
pub const REPORT_LEN: usize = 64;
const STATUS_OK: u8 = 0x4F;
const TYPE_RAZER: u8 = 0x08;
const TYPE_REMOTE: u8 = 0x0E;
const STEP_DELAY: Duration = Duration::from_millis(30);
const MAX_WRITES: usize = 3;
const MAX_READS: usize = 64;
const MAX_EMPTY_READS: usize = 3;
const READ_TIMEOUT_MS: i32 = 100;

/// Getter: request `[code, 0, 0]`, reply header `[code, 1, reply_len]`.
#[derive(Debug, Clone, Copy)]
pub struct Get(pub u8, pub u8);
/// Setter: request `[code, 0, len]` + data, reply header `[code, 1, 1]`.
#[derive(Debug, Clone, Copy)]
pub struct Set(pub u8, pub u8);

pub mod cmd {
    use super::{Get, Set};
    pub const REMOTE_SET: u8 = 0xE1;

    pub const SERIAL: Get = Get(0x00, 15);
    pub const FIRMWARE: Get = Get(0x02, 24);
    pub const WIRELESS: Get = Get(0x20, 1);
    pub const BATTERY: Get = Get(0x21, 1);
    pub const CHARGING: Get = Get(0x2A, 1);
    pub const EQ_PRESET: Get = Get(0x13, 1);
    pub const EQ_BANDS: Get = Get(0x15, 10);
    pub const MIC_EQ_PRESET: Get = Get(0x16, 1);
    /// Whether the on-device EQ is applied at all; Synapse turns it off while THX Spatial is on.
    pub const EQ_ENABLED: Get = Get(0x1E, 1);
    /// Preset group the EQ slot belongs to: 1 standard (7/8/9/255), 2 esports (250–254).
    pub const EQ_GROUP: Get = Get(0x1D, 1);
    pub const SIDETONE: Get = Get(0x18, 1);
    pub const SIDETONE_VOLUME: Get = Get(0x19, 1);
    pub const AUTO_OFF: Get = Get(0x2C, 1);
    pub const MIC_MUTE: Get = Get(0x55, 1);

    pub const SET_EQ_PRESET: Set = Set(0x93, 1);
    pub const SET_EQ_BANDS: Set = Set(0x95, 10);
    pub const SET_MIC_EQ_PRESET: Set = Set(0x96, 1);
    pub const SET_EQ_ENABLED: Set = Set(0x9E, 1);
    pub const SET_EQ_GROUP: Set = Set(0x9D, 1);
    pub const SET_SIDETONE: Set = Set(0x98, 1);
    pub const SET_SIDETONE_VOLUME: Set = Set(0x99, 1);
    pub const SET_AUTO_OFF: Set = Set(0xAC, 1);
    pub const SET_MIC_MUTE: Set = Set(0xE9, 1);
}

/// Builds one 64-byte output report (report ID included).
pub fn encode(header: &[u8], data: &[u8], remote: bool) -> [u8; REPORT_LEN] {
    let len = header.len() + data.len();
    let mut out = [0u8; REPORT_LEN];
    out[0] = REPORT_ID;
    out[1] = 0x80;
    out[2] = (len + 5) as u8;
    out[5] = b'P';
    out[6] = b'A';
    out[7] = if remote { TYPE_REMOTE } else { TYPE_RAZER };
    out[9] = len as u8;
    for (i, b) in header.iter().chain(data).enumerate().take(REPORT_LEN - 10) {
        out[10 + i] = *b;
    }
    out
}

/// Splits an input report into its "PI" sub-frames and returns each frame's data.
pub fn parse_frames(report: &[u8]) -> Vec<Vec<u8>> {
    let mut frames = Vec::new();
    if report.len() < 2 || report[0] != REPORT_ID || report[1] as usize + 2 > report.len() {
        return frames;
    }
    let mut rest = &report[2..];
    while rest.len() >= 10 && rest[0] == b'P' && rest[1] == b'I' {
        let len = ((rest[8] as usize) << 8) | rest[9] as usize;
        let end = (10 + len).min(rest.len());
        frames.push(rest[10..end].to_vec());
        rest = &rest[end..];
    }
    frames
}

/// Returns the value bytes of the frame whose data starts with `expected` header.
pub fn find_reply(report: &[u8], expected: &[u8]) -> Option<Vec<u8>> {
    parse_frames(report)
        .into_iter()
        .find(|d| d.starts_with(expected))
        .map(|d| d[expected.len()..].to_vec())
}

/// Unsolicited notifications in an input report, as `(record id, payload)`. The headset sends
/// these on its own (EQ button, power, battery, mic button); they share the "PI" framing with
/// replies but carry `0x02` instead of `0x01` in the second data byte.
pub fn parse_events(report: &[u8]) -> Vec<(u8, Vec<u8>)> {
    parse_frames(report)
        .into_iter()
        .filter(|d| d.len() >= 3 && d[1] == 2)
        .map(|d| (d[0], d[3..].to_vec()))
        .collect()
}

pub mod event {
    pub const PRESET_EQ_INDEX: u8 = 0x13;
    pub const SIDETONE: u8 = 0x18;
    pub const WIRELESS: u8 = 0x20;
    pub const BATTERY: u8 = 0x21;
    pub const CHARGING: u8 = 0x2A;
    pub const MIC: u8 = 0x55;
}

/// The three HID operations the protocol needs; implemented by hidapi and by test fakes.
pub trait HidIo: Send {
    fn write(&mut self, buf: &[u8]) -> Result<usize, String>;
    fn get_input_report(&mut self, buf: &mut [u8]) -> Result<usize, String>;
    fn read_timeout(&mut self, buf: &mut [u8], timeout_ms: i32) -> Result<usize, String>;
}

pub struct MxicClient<I: HidIo> {
    io: I,
}

impl<I: HidIo> MxicClient<I> {
    pub fn new(io: I) -> Self {
        Self { io }
    }

    pub fn get(&mut self, c: Get) -> Result<Vec<u8>, String> {
        self.set_remote_mode()?;
        let reply = self.transact(&encode(&[c.0, 0, 0], &[], false), Some(&[c.0, 1, c.1]))?;
        Ok(reply.into_iter().take(c.1 as usize).collect())
    }

    pub fn get_u8(&mut self, c: Get) -> Result<u8, String> {
        self.get(c)?.first().copied().ok_or_else(|| format!("empty reply to 0x{:02X}", c.0))
    }

    pub fn set(&mut self, c: Set, data: &[u8]) -> Result<(), String> {
        if data.len() != c.1 as usize {
            return Err(format!("command 0x{:02X} takes {} bytes, got {}", c.0, c.1, data.len()));
        }
        self.set_remote_mode()?;
        self.transact(&encode(&[c.0, 0, c.1], data, false), Some(&[c.0, 1, 1]))?;
        Ok(())
    }

    /// Synapse switches the dongle to remote (host-controlled) mode before every command.
    fn set_remote_mode(&mut self) -> Result<(), String> {
        self.transact(&encode(&[cmd::REMOTE_SET], &[1], true), None).map(|_| ())
    }

    fn transact(&mut self, report: &[u8; REPORT_LEN], expect: Option<&[u8]>) -> Result<Vec<u8>, String> {
        self.drain_pending()?;
        let mut last_err = String::from("no attempt made");
        for attempt in 0..MAX_WRITES {
            if self.io.write(report)? != REPORT_LEN {
                last_err = "short write".into();
                continue;
            }
            sleep(STEP_DELAY);
            if !self.accepted()? {
                last_err = "device busy".into();
                sleep(STEP_DELAY * (attempt as u32 + 1));
                continue;
            }
            let Some(expected) = expect else { return Ok(Vec::new()) };
            sleep(STEP_DELAY);
            match self.read_reply(expected)? {
                Some(value) => return Ok(value),
                None => last_err = format!("no reply for command 0x{:02X}", expected[0]),
            }
        }
        Err(last_err)
    }

    /// Drops input reports queued while idle (events, late replies) so they can't be read as
    /// the answer to the next command.
    fn drain_pending(&mut self) -> Result<(), String> {
        let mut buf = [0u8; REPORT_LEN];
        for _ in 0..MAX_READS {
            if self.io.read_timeout(&mut buf, 0)? == 0 {
                break;
            }
        }
        Ok(())
    }

    /// The status flag sits at [0] if the report ID is stripped, [1] if it is kept.
    fn accepted(&mut self) -> Result<bool, String> {
        let mut buf = [0u8; REPORT_LEN];
        buf[0] = REPORT_ID;
        let n = self.io.get_input_report(&mut buf)?;
        Ok(n == 0 || buf[0] == STATUS_OK || buf[1] == STATUS_OK)
    }

    fn read_reply(&mut self, expected: &[u8]) -> Result<Option<Vec<u8>>, String> {
        let mut empty = 0;
        for _ in 0..MAX_READS {
            let mut buf = [0u8; REPORT_LEN];
            let n = self.io.read_timeout(&mut buf, READ_TIMEOUT_MS)?;
            if n == 0 {
                empty += 1;
                if empty >= MAX_EMPTY_READS {
                    break;
                }
                continue;
            }
            empty = 0;
            if let Some(value) = find_reply(&buf[..n], expected) {
                return Ok(Some(value));
            }
        }
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    fn reply(header: &[u8], value: &[u8]) -> Vec<u8> {
        let data: Vec<u8> = header.iter().chain(value).copied().collect();
        let mut frame = vec![b'P', b'I', TYPE_RAZER, 0, 0, 0, 0, 0, 0, data.len() as u8];
        frame.extend(&data);
        let mut r = vec![REPORT_ID, frame.len() as u8];
        r.extend(frame);
        r.resize(REPORT_LEN, 0);
        r
    }

    #[derive(Default)]
    struct FakeIo {
        writes: Vec<Vec<u8>>,
        reads: VecDeque<Vec<u8>>,
    }

    impl HidIo for FakeIo {
        fn write(&mut self, buf: &[u8]) -> Result<usize, String> {
            self.writes.push(buf.to_vec());
            Ok(buf.len())
        }
        fn get_input_report(&mut self, buf: &mut [u8]) -> Result<usize, String> {
            buf[1] = STATUS_OK;
            Ok(REPORT_LEN)
        }
        /// Queued reports model replies arriving after the write, so the pre-command drain
        /// (timeout 0) sees an empty queue.
        fn read_timeout(&mut self, buf: &mut [u8], timeout_ms: i32) -> Result<usize, String> {
            if timeout_ms == 0 {
                return Ok(0);
            }
            match self.reads.pop_front() {
                Some(r) => {
                    buf[..r.len()].copy_from_slice(&r);
                    Ok(r.len())
                }
                None => Ok(0),
            }
        }
    }

    #[test]
    fn encodes_battery_request() {
        let r = encode(&[0x21, 0, 0], &[], false);
        assert_eq!(&r[..13], &[0x02, 0x80, 0x08, 0, 0, b'P', b'A', 0x08, 0, 0x03, 0x21, 0, 0]);
        assert!(r[13..].iter().all(|b| *b == 0));
    }

    #[test]
    fn encodes_remote_mode_request() {
        let r = encode(&[cmd::REMOTE_SET], &[1], true);
        assert_eq!(&r[..12], &[0x02, 0x80, 0x07, 0, 0, b'P', b'A', 0x0E, 0, 0x02, 0xE1, 0x01]);
    }

    #[test]
    fn encodes_eq_bands_as_signed_bytes() {
        let bands: Vec<u8> = [-3i8, -3, -4, 0, 5, 5, 4, 1, 0, -1].iter().map(|b| *b as u8).collect();
        let r = encode(&[0x95, 0, 10], &bands, false);
        assert_eq!(r[2], 18);
        assert_eq!(r[9], 13);
        assert_eq!(&r[10..23], &[0x95, 0, 10, 0xFD, 0xFD, 0xFC, 0, 5, 5, 4, 1, 0, 0xFF]);
    }

    #[test]
    fn finds_reply_among_frames_and_ignores_others() {
        let mut r = reply(&[0x13, 1, 1], &[7]);
        assert_eq!(find_reply(&r, &[0x21, 1, 1]), None);
        assert_eq!(find_reply(&r, &[0x13, 1, 1]), Some(vec![7]));
        r[2] = b'X';
        assert!(parse_frames(&r).is_empty());
    }

    #[test]
    fn get_sends_remote_mode_then_command_and_decodes_value() {
        let mut io = FakeIo::default();
        io.reads.push_back(reply(&[0x55, 1, 1], &[1])); // unrelated event first
        io.reads.push_back(reply(&[0x21, 1, 1], &[83]));
        let mut c = MxicClient::new(io);
        assert_eq!(c.get_u8(cmd::BATTERY), Ok(83));
        assert_eq!(c.io.writes.len(), 2);
        assert_eq!(c.io.writes[0][10], cmd::REMOTE_SET);
        assert_eq!(&c.io.writes[1][10..13], &[0x21, 0, 0]);
    }

    #[test]
    fn parses_notify_frames_but_not_replies() {
        // EQ button press: record 0x13, notify flag 2, payload len 1, new slot 8
        let notify = reply(&[event::PRESET_EQ_INDEX, 2, 1], &[8]);
        assert_eq!(parse_events(&notify), vec![(event::PRESET_EQ_INDEX, vec![8])]);
        assert!(parse_events(&reply(&[0x13, 1, 1], &[8])).is_empty());
    }

    #[test]
    fn set_rejects_wrong_length() {
        let mut c = MxicClient::new(FakeIo::default());
        assert!(c.set(cmd::SET_EQ_BANDS, &[0; 3]).is_err());
    }
}
