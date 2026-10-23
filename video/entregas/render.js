// Gera entregas.mp4 a partir de video.html (82 s, 1920×1080, 30 fps).
// Requisitos: Node 18+, `npm install` nesta pasta (instala o Playwright) e ffmpeg no PATH.
// Uso:  node render.js            → frames em ./frames e entregas.mp4
//       node render.js 12.5 40    → só tira prints desses segundos (preview_12.5.jpg ...)
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log('ERRO na página:', e.message));
  await page.goto('file://' + path.join(__dirname, 'video.html'));
  await page.waitForFunction('window.READY');
  const shots = process.argv.slice(2).map(Number);
  if (shots.length) {
    for (const t of shots) { await page.evaluate(t => render(t), t); await page.screenshot({ path: `preview_${t}.jpg`, type: 'jpeg', quality: 85 }); }
    await browser.close(); return;
  }
  const FPS = 30, DUR = 82.0, N = Math.round(DUR * FPS);
  fs.rmSync('frames', { recursive: true, force: true }); fs.mkdirSync('frames');
  for (let i = 0; i < N; i++) {
    await page.evaluate(t => render(t), i / FPS);
    await page.screenshot({ path: `frames/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 300 === 0) console.log(`frame ${i}/${N}`);
  }
  await browser.close();
  execSync('ffmpeg -y -loglevel error -framerate 30 -i frames/f%05d.jpg -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart entregas.mp4', { stdio: 'inherit' });
  console.log('Pronto: entregas.mp4 — copie para ../../assets/video-entregas.mp4.');
})();
