# Adding a friend's Razer headset

**Most of this happens automatically.** When a Razer device is plugged in, Frazer looks up its USB ID on Razer's server (`src-tauri/src/hid/catalog.rs`) and caches the result in `%APPDATA%\com.frazer.app\catalog.json`.
- If Synapse's driver class for it maps to a family in `Family::from_synapse` (`src-tauri/src/hid/registry.rs`), Frazer drives it with no code change.
- If not, the dashboard names the model and offers **Request support**. That opens a GitHub issue with the USB ID, interfaces and Synapse driver class.

The steps below are for that second case: adding a new family, or a subclass of a known one.

Frazer talks to a headset with the same commands Synapse 4 uses. Synapse downloads those commands per product from Razer's server, so adding a model means fetching them once. You don't need the headset for that; only the final check runs on real hardware.

```
bun tools/re/fetch-product.ts <pid-decimal> out/<pid>
      |
      v
find its driver class --> registry entry (+ driver if new family)
      |
      v
cargo run --bin probe  --> reads battery + settings, no changes
```

## 1. Find the product id
In Device Manager, the dongle shows up as `USB\VID_1532&PID_xxxx`. Synapse uses the PID in **decimal**: `0x0555` becomes `1365`.

Some products are listed under a different id than their dongle. The Barracuda is product `0x053B`, while its dongle enumerates as `0x053C`. To find a product without the PID, scan Razer's server; each line shows the product, its dongle id when it differs, the driver class and the name:

```bash
bun tools/re/fetch-product.ts --scan 0500 05b0
```

## 2. Get the bundle

```bash
bun tools/re/fetch-product.ts <pid-decimal> out/<pid-decimal>
```

If Razer's server ever stops serving it, extract it from a PC where Synapse 4 has seen the headset (see [`tools/re/README.md`](../tools/re/README.md)):

```bash
C="$LOCALAPPDATA/Razer/RazerAppEngine/User Data/Default/Service Worker/CacheStorage"
bun tools/re/cache-extract.ts "$C" 'synapse/products/<pid-decimal>/mw/.*\.(js|json)' out/<pid-decimal>
```

The `out/<pid-decimal>` folder contains only Razer's code for that product, not account data.

## 3. Find the driver class

```bash
grep -o 'useFeature("rzDeviceType","[A-Za-z0-9]*",{[^}]*}' out/<pid>/main.js
grep -o 'claimInterface:[0-9]*' out/<pid>/main.js
grep -o 'productId:<pid>,\(dongleId:[0-9]*,\)\?vendorId:5426' out/<pid>/main.js
```

The `{...}` after the class can name a subclass in `rzDeviceName`, for example `AudioMxicMabelT1`. That subclass lives in `out/<pid>/<rzDeviceName>.js` and overrides a few methods of the base class.

- **`AudioMxicDevice`:** the protocol is already implemented. With no subclass, or with `AudioMxicMabelT1` or `AudioMxicMabelT1_ecr`, the catalog picks the model up automatically. To make a model work offline too, add it to `builtin()` in [`src-tauri/src/hid/registry.rs`](../src-tauri/src/hid/registry.rs), using the dongle's PID.

  For any other subclass, compare its `_createDataSend`, `_parseMxicResponse`, `REPORT_ID` and EQ preset table with [`docs/protocol/barracuda.md`](protocol/barracuda.md), then add an `MxicModel` for it and an arm in `Family::from_synapse`.

  Not every MXIC model has every feature. Check the `useFeature(...)` list in `main.js`; for example, no `useHardwareEqualizer` means Synapse doesn't use the on-device EQ. The UI hides controls for any setting the headset fails to read.

- **Any other class** (for example `AudioBillieT1Dongle`, `AudioAvneraDevice`, `rzDevice25`): read `out/<pid>/<Class>.js` the same way as [`docs/protocol/blackshark-v2-pro.md`](protocol/blackshark-v2-pro.md). Dump its command module with `webpack-dump.ts`, write `src-tauri/src/hid/drivers/<family>.rs` implementing `HeadsetDriver`, then add a `Family` variant (with `open` and `parse_events` arms) and map its Synapse class in `Family::from_synapse`. Every headset of that class then works automatically.

## 4. Verify on hardware

```bash
cd src-tauri
cargo run --bin probe              # read-only
cargo run --bin probe -- --rewrite # writes back the same values; proves the setters work
```

Write a `docs/protocol/<model>.md` with the command table, and add unit tests for any new framing in the driver.
