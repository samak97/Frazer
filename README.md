# Frazer

A lightweight replacement for Razer Synapse on Windows. Frazer talks to Razer headsets directly over USB HID, with no Razer services, account or background bloat.

## Supported headsets

| Headset | Battery | EQ (on-device) | Sidetone | Mic mute / mic EQ | Auto power-off |
|---|---|---|---|---|---|
| BlackShark V2 Pro (2023, `1532:0555`) | ✅ | ✅ 10-band + Synapse presets | ✅ | ✅ | ✅ |

To add another model, see [docs/adding-a-device.md](docs/adding-a-device.md).

Also included: a per-app Windows volume mixer and local profiles.

THX Spatial Audio isn't supported. It's a Windows audio driver Synapse installs, not a headset setting.

## Run

You need [Bun](https://bun.sh), Rust, and WebView2.

```bash
bun install
bun run tauri dev
```

To build an installer: `bun run tauri build`.

Closing Synapse isn't required, but if both apps change settings at once, the last write wins.

## How it works

```
React UI --(invoke)--> Tauri commands --> HeadsetManager --> HeadsetDriver (per model)
                                                               |
                                                     MxicClient (framing) --> hidapi --> dongle (interface 3)
```

- **Protocol:** extracted from Synapse 4's own device code. See [docs/protocol/blackshark-v2-pro.md](docs/protocol/blackshark-v2-pro.md) and [tools/re](tools/re/README.md).
- **`src-tauri/src/hid/mxic.rs`:** frame encoding and decoding, and the request/reply loop, with unit tests.
- **`src-tauri/src/hid/registry.rs`:** the list of supported headsets.
- **Hardware check:** `cd src-tauri && cargo run --bin probe`. Add `-- --rewrite` to also test the setters by writing back the current values.

## Claude skill

`skills/sha3bolly` is an "explain like a junior engineer" Claude Code skill. Copy it into `~/.claude/skills/` to use it.
