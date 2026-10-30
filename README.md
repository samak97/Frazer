# Frazer

A lightweight replacement for Razer Synapse on Windows. Frazer talks to Razer headsets directly over USB HID, with no Razer services, account or background bloat.

## Supported headsets

| Headset | Battery | EQ (on-device) | Sidetone | Mic mute / mic EQ | Auto power-off |
|---|---|---|---|---|---|
| BlackShark V2 Pro (2023, `1532:0555`) | ✅ | ✅ 10-band + Synapse presets | ✅ | ✅ | ✅ |

To add another model, see [docs/adding-a-device.md](docs/adding-a-device.md).

Also included:
- **Headset EQ button:** each press steps through presets you choose in Frazer.
- **EQ restore:** your last EQ is re-applied whenever the headset or dongle reconnects.
- **Recommended EQ presets:** measured AutoEQ correction plus community curves.
- **Volume mixer:** per-app volume, with real app names and icons.
- **Tray and startup:** runs in the tray, with optional silent start with Windows.
- **Profiles:** saved locally.

THX Spatial Audio isn't supported. It's a Windows audio driver Synapse installs, not a headset setting.

**Quit Synapse completely** (tray icon → Exit) when using Frazer. Synapse also listens to the EQ button and switches the headset's hardware EQ off while THX is on.

## Run

You need [Bun](https://bun.sh), Rust, and WebView2.

```bash
bun install
bun run tauri dev
```

To build an installer: `bun run tauri build`. The app icon comes from `app-icon.svg`; regenerate it with `bun run tauri icon app-icon.svg`.

**Debugging the UI:** start the app with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`. Then `bun tools/debug/cdp-eval.ts "<js>"` runs code inside the app, and `bun tools/debug/cdp-shot.ts out.png` takes a screenshot.

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
