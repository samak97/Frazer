# Reverse-engineering tools

Synapse 4 (RazerAppEngine) doesn't ship device logic in its installer. When a device is first plugged in, it downloads a JavaScript "middleware" bundle for that product from `apps.razer.com/synapse/products/<pid-decimal>/mw/`. Chromium stores the bundle in Synapse's service-worker cache. These scripts pull the bundle out and turn its command tables into plain JSON.

They are read-only and have no dependencies; run them with [Bun](https://bun.sh).

```
CacheStorage dir --(cache-index.ts)--> list of cached URLs, to find your product id
CacheStorage dir --(cache-extract.ts)--> mw/*.js for one product
mw/*.js --(read the device class)--> which driver class + claimInterface
mw/*.js --(webpack-dump.ts)--> command constants as JSON
```

The cache lives at:

```
%LOCALAPPDATA%\Razer\RazerAppEngine\User Data\Default\Service Worker\CacheStorage
```

| Script | What it does |
|---|---|
| `cache-index.ts <CacheStorage> [bodyRegex]` | Prints size, entry and URL for each cached response. Pipe it to `grep products/` to see the product ids Synapse has cached. |
| `cache-extract.ts <CacheStorage> <urlRegex> <outDir>` | Writes the newest cached copy of each matching file, e.g. `'synapse/products/1365/mw/.*\.(js|json)'`. |
| `webpack-dump.ts <out.json> <moduleIds> <chunk.js...>` | Runs only the webpack modules you name, with network access stubbed out, and dumps their exports. This turns minified constants into readable command bytes. |

## Example: BlackShark V2 Pro (product 1365)

```bash
C="$LOCALAPPDATA/Razer/RazerAppEngine/User Data/Default/Service Worker/CacheStorage"
bun tools/re/cache-extract.ts "$C" 'synapse/products/1365/mw/.*\.(js|json)' out/1365
grep -o 'useFeature("rzDeviceType","[A-Za-z0-9]*"' out/1365/main.js   # -> AudioMxicDevice
grep -o 'claimInterface:[0-9]*' out/1365/main.js                       # -> 3
bun tools/re/webpack-dump.ts out/consts.json 56555,42271 out/1365/6555.js out/1365/3487.js
```

The decoded result is in [`docs/protocol/blackshark-v2-pro.md`](../../docs/protocol/blackshark-v2-pro.md).

## About REA
The original plan used [REA](../../../rea) for this step. REA needs Node.js 22 or newer, and this machine only has Bun. It also turned out that Synapse 4's headset logic is plain cached JavaScript, not .NET or native code, so these small scripts were enough.

If you install Node, you can point REA's `analyze-javascript-application` at an extracted `out/<pid>` folder to map modules and imports.
