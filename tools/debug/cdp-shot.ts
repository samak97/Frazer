// Screenshots the running Frazer webview (see cdp-eval.ts for setup).
//   bun tools/debug/cdp-shot.ts <out.png> [jsToRunFirst] [waitMs]
import { writeFileSync } from "node:fs";

const [out, setup, waitArg] = process.argv.slice(2);
const targets: any[] = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page" && (t.url.includes("localhost:1420") || t.url.includes("tauri.localhost")) && !t.url.includes("#toast"));
if (!page) throw new Error("Frazer page not found");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map<number, (v: any) => void>();
const send = (method: string, params: object = {}) =>
  new Promise<any>((resolve) => {
    pending.set(++id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg);
};
await new Promise((r) => (ws.onopen = r));
if (setup) await send("Runtime.evaluate", { expression: setup, awaitPromise: true });
await new Promise((r) => setTimeout(r, Number(waitArg ?? 1500)));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log("saved", out);
ws.close();
