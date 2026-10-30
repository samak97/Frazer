// Index a Chromium CacheStorage dir: prints size, entry path and URL for every cached response.
// Usage: bun cache-index.ts <CacheStorage dir> [bodyRegex]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const [root, bodyFilter] = process.argv.slice(2);
const re = bodyFilter ? new RegExp(bodyFilter) : null;

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (e.name.endsWith("_0")) yield p;
  }
}

for (const f of files(root)) {
  const buf = readFileSync(f);
  const head = buf.subarray(0, 4096).toString("latin1");
  const url = head.match(/https:\/\/[\x21-\x7e]+/)?.[0] ?? "";
  if (re && !re.test(buf.toString("latin1"))) continue;
  console.log(`${statSync(f).size}\t${f.slice(root.length + 1)}\t${url}`);
}
