# Adding a friend's Razer headset

Frazer talks to a headset with the same commands Synapse 4 uses. Synapse downloads those commands per product, so adding a model means extracting them once from a PC where Synapse 4 has seen the headset.

```
friend's PC: plug headset in, open Synapse 4 once
      |
      v
extract that product's mw/ bundle --> find its driver class --> registry entry (+ driver if new family)
      |
      v
cargo run --bin probe  --> reads battery + settings, no changes
```

## 1. Find the product id
In Device Manager, the headset shows up as `USB\VID_1532&PID_xxxx`. Synapse uses the PID in **decimal**: `0x0555` becomes `1365`.

## 2. Extract the bundle
On a PC with Synapse 4 and that headset, follow [`tools/re/README.md`](../tools/re/README.md):

```bash
C="$LOCALAPPDATA/Razer/RazerAppEngine/User Data/Default/Service Worker/CacheStorage"
bun tools/re/cache-extract.ts "$C" 'synapse/products/<pid-decimal>/mw/.*\.(js|json)' out/<pid-decimal>
```

The `out/<pid-decimal>` folder contains only Razer's code for that product, not account data. A friend can zip it and send it over.

## 3. Find the driver class

```bash
grep -o 'useFeature("rzDeviceType","[A-Za-z0-9]*"' out/<pid>/main.js
grep -o 'claimInterface:[0-9]*' out/<pid>/main.js
grep -o 'productId:<pid>,vendorId:5426,deviceName:"[^"]*"' out/<pid>/main.js
```

- **`AudioMxicDevice`:** the protocol is already implemented. Add a single entry to `DEVICES` in [`src-tauri/src/hid/registry.rs`](../src-tauri/src/hid/registry.rs):

  ```rust
  DeviceEntry { pid: 0x0xxx, name: "Razer …", interface: <claimInterface>, open: open_mxic },
  ```

  Not every MXIC model has every feature. Check the `useFeature(...)` list in `main.js`; for example, no `useHardwareEqualizer` means no on-device EQ. The UI hides controls for any setting the headset fails to read.

- **Any other class** (for example `AudioBillieT1Dongle`, `AudioAvneraDevice`, `rzDevice25`): read `out/<pid>/<Class>.js` the same way as [`docs/protocol/blackshark-v2-pro.md`](protocol/blackshark-v2-pro.md). Dump its command module with `webpack-dump.ts`, write `src-tauri/src/hid/drivers/<family>.rs` implementing `HeadsetDriver`, then add the registry entry.

## 4. Verify on hardware

```bash
cd src-tauri
cargo run --bin probe              # read-only
cargo run --bin probe -- --rewrite # writes back the same values; proves the setters work
```

Write a `docs/protocol/<model>.md` with the command table, and add unit tests for any new framing in the driver.
