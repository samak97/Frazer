// Extract response bodies from a Chromium "simple cache" (CacheStorage) dir whose URL matches a regex.
// Usage: bun cache-extract.ts <CacheStorage dir> <urlRegex> <outDir>
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const [root, urlFilter, outDir] = process.argv.slice(2);
const re = new RegExp(urlFilter);
const EOF_MAGIC = Buffer.from([0xd8, 0x41, 0x0d, 0x97, 0x45, 0x6f, 0xfa, 0xf4]);

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (e.name.endsWith("_0")) yield p;
  }
}

mkdirSync(outDir, { recursive: true });
const newest = new Map<string, { mtime: number; body: Buffer; url: string }>();
for (const f of files(root)) {
  const buf = readFileSync(f);
  const keyLen = buf.readUInt32LE(12);
  const key = buf.subarray(24, 24 + keyLen).toString("latin1");
  const url = key.match(/https:\/\/\S+/)?.[0] ?? key;
  if (!re.test(url)) continue;
  const bodyStart = 24 + keyLen;
  const eof = buf.indexOf(EOF_MAGIC, bodyStart);
  const body = buf.subarray(bodyStart, eof < 0 ? buf.length : eof);
  // keep the most recently written copy per file name (stripped of the content hash)
  const name = basename(new URL(url).pathname).replace(/\.[0-9a-f]{8,}\./, ".");
  const mtime = statSync(f).mtimeMs;
  const prev = newest.get(name);
  if (!prev || prev.mtime < mtime) newest.set(name, { mtime, body, url });
}
for (const [name, { body, url }] of newest) {
  writeFileSync(join(outDir, name), body);
  console.log(`${body.length}\t${name}\t${url}`);
}
