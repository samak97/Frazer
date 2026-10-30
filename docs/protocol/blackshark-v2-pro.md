# Razer BlackShark V2 Pro (2023): HID protocol

**Source:** Synapse 4's own device code, read statically. Synapse 4 downloads a JavaScript "middleware" bundle for each product. For this headset it lives at `apps.razer.com/synapse/products/1365/mw/`. It is cached in `%LOCALAPPDATA%\Razer\RazerAppEngine\User Data\Default\Service Worker\CacheStorage`. The code that matters is the `AudioMxicDevice` class (chunk `AudioMxicDevice.*.js`), its protocol helpers (module `35910`) and the command table (module `56555`, chunk `6555.*.js`). [`tools/re/`](../../tools/re/README.md) explains how to re-extract them.

## Device

| What | Value |
|---|---|
| VID / PID | `0x1532` / `0x0555` (Synapse product id 1365) |
| Codename / family | Odessa T1R, `ODESSA`. Driver class: `AudioMxicDevice` (MXIC chip) |
| HID interface | **3** (`MI_03`). The control channel is the vendor-defined top-level collection (`COL02`). |
| Report ID | `0x02`, 64 bytes including the ID |
| Timing | 30 ms between write and read. Retry a write up to 3 times; read up to 64 input reports while looking for the reply. |

## How one command flows

```
host --(output report: "remote mode on")---------> dongle    every command except 0xE0/0xE1 is preceded by this
host --(output report: command)------------------> dongle
host --(GET_REPORT input 0x02)-------------------> dongle    first byte 0x4F ('O') = accepted; anything else = busy, back off and resend
host <-(input reports with 'PI' sub-frames)-------  dongle   find the sub-frame whose data starts with the expected reply header
```

## Request: output report, 64 bytes

| Byte | Value |
|---|---|
| 0 | `0x02` report ID |
| 1 | `0x80` |
| 2 | `len(cmd) + len(data) + 5` |
| 3–4 | `0x00 0x00` |
| 5–6 | `0x50 0x41` (`"PA"` sync) |
| 7 | `0x08` Razer command, or `0x0E` remote command (only for `0xE0`/`0xE1`) |
| 8 | `0x00` |
| 9 | `len(cmd) + len(data)` |
| 10.. | command header bytes, then data bytes, then zero padding |

The command header is `[code, 0x00, dataLen]`. A getter uses `[code, 0, 0]` and a setter uses `[code, 0, n]` followed by `n` data bytes. Remote-mode commands are a single byte (`0xE1` set, `0xE0` get).

## Reply: input report

The reply is `[0x02, payloadLen, sub-frame, sub-frame, ...]`. Each sub-frame is:

| Offset | Value |
|---|---|
| 0–1 | `0x50 0x49` (`"PI"`) |
| 2 | command type (`0x08` / `0x0E`) |
| 3 | control field |
| 8–9 | data length, big-endian (`[8]<<8 | [9]`) |
| 10.. | data. It starts with the reply header `[code, 0x01, valueLen]`, followed by the value bytes. |

## Command table

| Feature | Get (req → reply hdr) | Set (req, data) | Encoding |
|---|---|---|---|
| Remote mode | `E0` → `E0` | `E1` + `[1]` | must be on before any other command |
| Serial number | `00 00 00` → `00 01 0F` | | 15 ASCII bytes |
| Edition | `01 00 00` → `01 01 01` | | |
| Headset firmware | `02 00 00` → `02 01 18` | | 6 × 4-byte versions (MC, DC, D2, DP, CT, AD) |
| Product info | `03 00 00` → `03 01 02` | | product id, 2 bytes |
| Battery | `21 00 00` → `21 01 01` | | percent 0–100 |
| Charging | `2A 00 00` → `2A 01 01` | | 0 = no, 1 = charging, 2 = failed |
| Wireless link | `20 00 00` → `20 01 01` | | 0 = headset off/disconnected, 1 = connected |
| EQ preset index | `13 00 00` → `13 01 01` | `93 00 01` + `[idx]` | 0 default, 7 game, 8 music, 9 movie, 250 apex, 251 csgo, 252 valorant, 253 fortnite, 254 cod, 255 custom |
| EQ bands | `15 00 00` → `15 01 0A` | `95 00 0A` + 10 bytes | signed dB per band (i8 as u8), **−5…+5** (Synapse slider `minValue:-5,maxValue:5`), bands 31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz |
| EQ preset group | `1D 00 00` → `1D 01 01` | `9D 00 01` + `[g]` | 1 standard (7/8/9/255), 2 esports (250–254). Must match the slot. |
| Hardware EQ enabled | `1E 00 00` → `1E 01 01` | `9E 00 01` + `[0/1]` | 0 = EQ bypassed (Synapse sets this while THX Spatial is on) |
| Sidetone on/off | `18 00 00` → `18 01 01` | `98 00 01` + `[0/1]` | |
| Sidetone volume | `19 00 00` → `19 01 01` | `99 00 01` + `[v]` | device 0–15. UI % = ceil(v/15·100); device = floor(%/100·15) |
| Mic mute | `55 00 00` → `55 01 01` | `E9 00 01` + `[0/1]` | 1 = muted |
| Mic mode | `56 00 00` → `56 01 01` | `D6 00 01` + `[m]` | 0 off, 1 low, 2 high |
| Mic gain | `57 00 00` → `57 01 01` | `D7 00 01` + `[g]` | raw. Synapse doesn't call it for this model; mic volume goes through Windows. |
| Mic EQ preset | `16 00 00` → `16 01 01` | `96 00 01` + `[p]` | 0 default, 1 mic boost, 2 broadcast, 3 conference, 255 custom |
| Mic EQ bands | `17 00 00` → `17 01 0A` | `97 00 0A` + 10 bytes | UI −10..10 → device 0..10 via `[0,1,1,2,2,…,10,10]` |
| Auto power-off | `2C 00 00` → `2C 01 01` | `AC 00 01` + `[min]` | minutes, 0 = off (Synapse default 15) |
| Do not disturb | `27 00 00` → `27 01 01` | `A7 00 01` + `[0/1]` | |
| Dongle LED | `66 00 00` → `66 01 01` | `E6 00 01` + `[s]` | 0 off, 1–3 modes, 255 on |

**Not in the protocol:** THX Spatial Audio is a Windows audio processing object (APO) that Synapse installs (`THX-0555-…exe`). It is not a headset command, so Frazer doesn't control it.

## Synapse's built-in EQ presets (dB, 31 Hz → 16 kHz)

| Preset | Index | Bands |
|---|---|---|
| Game | 7 | -3 -3 -4 0 5 5 4 1 0 -1 |
| Movie | 9 | 4 4 3 0 -3 -1 3 5 2 1 |
| Music | 8 | 2 2 1 1 2 3 3 3 1 0 |
| Apex Legends | 250 | -1 0 0 0 -1 0 2 3 2 3 |
| Call of Duty | 254 | -2 0 3 3 3 3 0 0 0 0 |
| CS:GO | 251 | -5 -4 3 5 3 -2 1 5 4 -4 |
| Fortnite | 253 | -4 5 5 3 -2 3 4 4 -1 4 |
| Valorant | 252 | 0 0 0 0 0 1 4 4 4 -3 |
| Custom | 255 | user bands |

How Synapse applies an EQ (`setThxV3AudioEqualizer`):

```
setPresetEQIndex(idx) --> setSpeakerPresetEQGroup(1 standard | 2 esports) --> setCustomerEQBand(bands)  // bands only for slots 250–255
```

- **Fixed slots:** Game, Music and Movie (7/8/9) are curves built into the firmware. Only the esports slots and Custom (250–255, `useEqualizerOBM`) take band data.
- **Hardware EQ flag:** while THX Spatial is on, Synapse switches the hardware EQ off (`9E 00 01 00`) and applies the EQ in software through its THX audio driver. It switches it back on (`…01`) only when THX is off or when Synapse shuts down. If that flag is off, band writes are stored but nothing changes audibly.

## Not yet confirmed on hardware
- **Status byte position:** whether the GET_REPORT status byte `0x4F` lands at `buf[0]` or `buf[1]` once hidapi includes the report ID. The transport accepts either.
