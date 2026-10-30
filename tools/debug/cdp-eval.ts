// Evaluates JS inside the running Frazer webview over the Chrome DevTools Protocol and prints
// the result plus any console output/exceptions seen meanwhile.
// Start the app with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222, then:
//   bun tools/debug/cdp-eval.ts "<expression>" [waitMs]
const [expr, waitArg] = process.argv.slice(2);
const waitMs = Number(waitArg ?? 1500);

const targets: any[] = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page" && (t.url.includes("localhost:1420") || t.url.includes("tauri.localhost")));
if (!page) throw new Error("Frazer page not found: " + JSON.stringify(targets.map((t) => t.url)));

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
  if (msg.id && pending.has(msg.id)) return pending.get(msg.id)!(msg);
  if (msg.method === "Runtime.consoleAPICalled")
    console.log(`[console.${msg.params.type}]`, msg.params.args.map((a: any) => a.value ?? a.description).join(" "));
  if (msg.method === "Runtime.exceptionThrown")
    console.log("[exception]", msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
};
await new Promise((r) => (ws.onopen = r));
await send("Runtime.enable");
const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
console.log("[result]", JSON.stringify(res.result?.result?.value ?? res.result?.exceptionDetails?.exception?.description ?? res.result));
await new Promise((r) => setTimeout(r, waitMs));
ws.close();
