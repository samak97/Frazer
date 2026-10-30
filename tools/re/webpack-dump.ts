// Evaluate selected modules from webpack chunk files with a stub runtime and dump their exports as JSON.
// Only defines data; the chunks are Synapse's own code, run without DOM/network (fetch/XHR are stubbed out).
// Usage: bun webpack-dump.ts <outJson> <moduleId,...> <chunk.js> [chunk.js...]
import { readFileSync, writeFileSync } from "node:fs";

const [out, idList, ...chunks] = process.argv.slice(2);
const wanted = idList.split(",");
const modules: Record<string, Function> = {};
const g: any = globalThis;
g.self = g; g.window = g;
g.fetch = () => { throw new Error("network disabled"); };
g.XMLHttpRequest = class { constructor() { throw new Error("network disabled"); } };
for (const c of chunks) {
  const arrName = readFileSync(c, "utf8").match(/self\.(webpackChunk[\w$]+)/)?.[1];
  if (!arrName) continue;
  g[arrName] = [];
  new Function(readFileSync(c, "utf8"))();
  for (const [, mods] of g[arrName]) Object.assign(modules, mods);
}
const cache: Record<string, any> = {};
function req(id: string | number): any {
  id = String(id);
  if (cache[id]) return cache[id].exports;
  const fn = modules[id];
  if (!fn) return new Proxy({}, { get: () => undefined }); // unknown dependency -> inert stub
  const m = (cache[id] = { exports: {} });
  fn(m, m.exports, req);
  return m.exports;
}
req.d = (e: any, defs: any) => { for (const k in defs) Object.defineProperty(e, k, { enumerable: true, get: defs[k] }); };
req.r = (e: any) => Object.defineProperty(e, "__esModule", { value: true });
req.o = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
req.n = (m: any) => () => m.default ?? m;
req.g = g;

const result: Record<string, any> = {};
for (const id of wanted) {
  const ex = req(id);
  const plain: Record<string, any> = {};
  for (const k of Object.keys(ex)) {
    try { const v = ex[k]; plain[k] = v instanceof Uint8Array ? Array.from(v) : typeof v === "function" ? "[fn]" : v; } catch (e) { plain[k] = `[err ${e}]`; }
  }
  result[id] = plain;
}
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`dumped ${wanted.join(",")} -> ${out}`);
