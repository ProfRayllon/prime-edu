#!/usr/bin/env node
// Gera assets/PrimeEdu-Proposta-Comercial.pdf (o arquivo do botão "PDF").
//
// Rode depois de editar os slides (e de rodar tools/build_deck.py):  node tools/build_pdf.mjs
// Usa o Edge ou o Chrome instalado: abre index.html?print (todos os slides prontos), tira uma imagem
// JPEG de cada slide e monta um PDF leve, uma página por slide. O vídeo do slide 20 vira a capa com
// um link clicável para assistir em PUBLIC_URL. Requer Node 22+ (sem dependências).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PUBLIC_URL = "https://profrayllon.github.io/prime-edu/";
const QUALITY = 85;              // qualidade JPEG das páginas (0–100)
const SETTLE_MS = 9000;          // espera as animações internas (contador do mapa) terminarem
const W = 1920, H = 1080, PT = 0.75; // página em pontos: 1440 × 810

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets", "PrimeEdu-Proposta-Comercial.pdf");

const browserPath = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => fs.existsSync(p));
if (!browserPath) { console.error("Não encontrei o Edge nem o Chrome instalados."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- abre o navegador e conecta pelo DevTools ----------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "primeedu-pdf-"));
spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${W},${H}`, "about:blank"],
  { stdio: "ignore", detached: true }).unref();

const portFile = path.join(profile, "DevToolsActivePort");
for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
if (!fs.existsSync(portFile)) { console.error("O navegador não respondeu."); process.exit(1); }
await sleep(200);
const [port, wsPath] = fs.readFileSync(portFile, "utf8").trim().split("\n");
const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });

let seq = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { ok, fail } = pending.get(m.id); pending.delete(m.id);
    m.error ? fail(new Error(m.error.message)) : ok(m.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
  const id = ++seq; pending.set(id, { ok, fail });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (m, p) => send(m, p, sessionId);
  const evaluate = async (expr) => (await page("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

  await page("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const url = pathToFileURL(path.join(ROOT, "index.html")).href + "?print&base=" + encodeURIComponent(PUBLIC_URL);
  await page("Page.navigate", { url });
  for (let i = 0; i < 100 && (await evaluate("document.readyState")) !== "complete"; i++) await sleep(100);
  await evaluate("document.fonts.ready.then(() => true)");
  await sleep(SETTLE_MS);

  const slides = await evaluate(`[...document.querySelectorAll("#stage > section")].map((s) =>
    [...s.querySelectorAll("a.pdf-video-link")].map((a) => a.href))`);

  const pages = [];
  for (let i = 0; i < slides.length; i++) {
    // rola até o slide: animações dentro de iframes só rodam quando estão visíveis
    await evaluate(`window.scrollTo(0, ${i * H})`);
    await sleep(400);
    const shot = await page("Page.captureScreenshot", { format: "jpeg", quality: QUALITY });
    pages.push({ jpeg: Buffer.from(shot.data, "base64"), links: slides[i] });
    process.stdout.write(`\rslide ${i + 1}/${slides.length}`);
  }
  process.stdout.write("\n");
  fs.writeFileSync(OUT, buildPdf(pages));
  console.log(`${path.relative(ROOT, OUT)}: ${pages.length} páginas, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
} finally {
  try { await send("Browser.close"); } catch {}
  ws.close();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}

// ---------- PDF mínimo: uma imagem JPEG por página + links ----------
function buildPdf(pages) {
  const pw = W * PT, ph = H * PT;
  const objs = []; // índice = número do objeto - 1
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null), pagesObj = add(null);
  const kids = [];
  for (const p of pages) {
    const img = add([`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, "\nendstream"]);
    const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im Do Q`;
    const content = add(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    const annots = p.links.map((href) => add(`<< /Type /Annot /Subtype /Link /Rect [0 0 ${pw} ${ph}] /Border [0 0 0] /A << /S /URI /URI (${href.replace(/[()\\]/g, "\\$&")}) >> >>`));
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im ${img} 0 R >> >> /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  let size = chunks[0].length;
  const offsets = [];
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"); chunks.push(buf); size += buf.length; };
  objs.forEach((body, i) => {
    offsets.push(size);
    push(`${i + 1} 0 obj\n`);
    (Array.isArray(body) ? body : [body]).forEach(push);
    push("\nendobj\n");
  });
  const xref = size;
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach((o) => push(`${String(o).padStart(10, "0")} 00000 n \n`));
  push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info << /Title (PrimeEdu - Proposta Comercial) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
