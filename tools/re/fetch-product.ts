// Download a product's Synapse 4 middleware bundle straight from Razer's server: no headset or
// Synapse install needed. Files are saved without their content hash, like cache-extract.ts.
// Usage: bun fetch-product.ts <pid-decimal> <outDir>
//        bun fetch-product.ts --scan <fromPidHex> <toPidHex>   (lists products that have a bundle)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = (pid: number) => `https://apps.razer.com/synapse/products/${pid}/mw/`;

async function get(url: string, tries = 3): Promise<string | null> {
  try {
    const r = await fetch(url);
    return r.ok ? r.text() : null;
  } catch (e) {
    if (tries <= 1) throw e;
    await Bun.sleep(1000);
    return get(url, tries - 1);
  }
}

/** Name (from manifest.json), dongle id, driver class and interface (from main.js). */
function describe(main: string, manifest: string | null) {
  let name = "";
  try {
    name = JSON.parse(manifest ?? "{}").deviceName ?? "";
  } catch {}
  const dongleId = main.match(/productId:\d+,dongleId:(\d+),vendorId:5426/)?.[1];
  return {
    name,
    dongleId: dongleId ? Number(dongleId) : undefined,
    class: main.match(/useFeature\("rzDeviceType","(\w+)"(?:,\{rzDeviceName:"(\w+)")?/)?.slice(1).filter(Boolean).join(" / ") ?? "",
    claimInterface: main.match(/claimInterface:(\d+)/)?.[1],
  };
}

async function mainJs(pid: number): Promise<string | null> {
  const index = await get(base(pid) + "index.html");
  const main = index?.match(/main\.[0-9a-f]+\.js/)?.[0];
  return main ? get(base(pid) + main) : null;
}

const args = process.argv.slice(2);
if (args[0] === "--scan") {
  const [from, to] = args.slice(1).map((h) => parseInt(h, 16));
  for (let pid = from; pid <= to; pid++) {
    const main = await mainJs(pid);
    if (!main) continue;
    const d = describe(main, await get(base(pid) + "manifest.json"));
    const dongle = d.dongleId ? ` dongle 0x${d.dongleId.toString(16).padStart(4, "0")}` : "";
    console.log(`0x${pid.toString(16).padStart(4, "0")} (${pid})${dongle}\t${d.class}\tif=${d.claimInterface ?? "?"}\t${d.name}`);
  }
} else {
  const [pidArg, outDir] = args;
  const pid = Number(pidArg);
  const main = await mainJs(pid);
  if (!main) throw new Error(`no bundle for product ${pid}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "main.js"), main);
  const manifest = await get(base(pid) + "manifest.json");
  writeFileSync(join(outDir, "manifest.json"), manifest ?? "{}");
  // webpack's chunk filename map: .u=e=>(({id:"name",…})[e]||e)+"."+{id:"hash",…}[e]+".js"
  const m = main.match(/\.u=e=>\(\((\{[^}]*\})\[e\]\|\|e\)\+"\."\+(\{[^}]*\})\[e\]\+"\.js"/);
  if (!m) throw new Error("chunk map not found in main.js");
  // object literals with numeric keys: quote the keys and read them as JSON (never evaluate them)
  const parse = (literal: string): Record<string, string> => JSON.parse(literal.replace(/(\d+):/g, '"$1":'));
  const names = parse(m[1]);
  const hashes = parse(m[2]);
  for (const id of Object.keys(hashes)) {
    const name = names[id] ?? id;
    const body = await get(`${base(pid)}${name}.${hashes[id]}.js`);
    if (body) writeFileSync(join(outDir, `${name}.js`), body);
  }
  console.log(JSON.stringify(describe(main, manifest)), `-> ${outDir} (${Object.keys(hashes).length} chunks)`);
}
