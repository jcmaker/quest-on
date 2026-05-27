// Renders deck.html → per-slide PNGs + a combined PDF using the system Chromium
// via the Chrome DevTools Protocol (Node built-in WebSocket/fetch only — no npm deps).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.CHROME_BIN ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DECK = "file://" + resolve(__dirname, "deck.html");
const OUT_PNG = resolve(__dirname, "slides");
const OUT_PDF = resolve(__dirname, "Quest-On_MBA_Guide.pdf");
const PORT = 9333;
const N_SLIDES = 20;
const W = 1280, H = 720, SCALE = 2;

mkdirSync(OUT_PNG, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none",
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "about:blank",
]);
chrome.stderr.on("data", () => {}); // quiet

async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint not reachable");
}

function makeClient(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", (e) => rej(e.error || new Error("ws error")));
  });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msg = { id: ++id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      pending.set(msg.id, { resolve, reject });
      ws.send(JSON.stringify(msg));
    });
  return { ws, ready, send };
}

(async () => {
  const c = makeClient(await wsUrl());
  await c.ready;

  // attach to the about:blank page target (flatten → use sessionId on all calls)
  const { targetInfos } = await c.send("Target.getTargets");
  const page = targetInfos.find((t) => t.type === "page");
  const { sessionId } = await c.send("Target.attachToTarget", {
    targetId: page.targetId, flatten: true,
  });
  const S = (method, params) => c.send(method, params, sessionId);

  await S("Page.enable");
  await S("Runtime.enable");
  await S("Emulation.setDeviceMetricsOverride", {
    width: W, height: H * N_SLIDES, deviceScaleFactor: SCALE, mobile: false,
  });

  // navigate + wait for load
  const loaded = new Promise((res) => {
    const h = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Page.loadEventFired") { c.ws.removeEventListener("message", h); res(); }
    };
    c.ws.addEventListener("message", h);
  });
  await S("Page.navigate", { url: DECK });
  await loaded;

  // wait for fonts + images to settle
  await S("Runtime.evaluate", {
    expression:
      "Promise.all([document.fonts.ready, ...[...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))])",
    awaitPromise: true,
  });
  await sleep(600);

  // per-slide PNGs
  for (let i = 0; i < N_SLIDES; i++) {
    const { data } = await S("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: i * H, width: W, height: H, scale: 1 },
      captureBeyondViewport: true,
    });
    const n = String(i + 1).padStart(2, "0");
    writeFileSync(`${OUT_PNG}/slide-${n}.png`, Buffer.from(data, "base64"));
    process.stdout.write(`slide-${n}.png `);
  }
  console.log("");

  // combined PDF (honor @page 1280x720)
  const { data: pdf } = await S("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
  });
  writeFileSync(OUT_PDF, Buffer.from(pdf, "base64"));
  console.log("PDF →", OUT_PDF);

  c.ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => {
  console.error("RENDER ERROR:", e);
  chrome.kill();
  process.exit(1);
});
