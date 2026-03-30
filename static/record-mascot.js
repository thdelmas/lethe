const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const WIDTH = 360;
const HEIGHT = 480;
const FPS = 15;
const DURATION_S = 18;  // Full idle loop (NlaTrack.002 = 18.29s)
const FRAMES = FPS * DURATION_S;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl-software-rasterizer',
      '--ignore-gpu-blocklist',
      `--window-size=${WIDTH},${HEIGHT}`
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });

  console.log('Loading...');
  await page.goto('http://localhost:9999/record-preview.html?anim=2', {
    waitUntil: 'networkidle0', timeout: 60000
  });

  console.log('Waiting for model...');
  await page.waitForFunction(() => window._modelLoaded === true, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  const framesDir = path.join(__dirname, '_frames');
  if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true });
  fs.mkdirSync(framesDir);

  console.log(`Recording ${FRAMES} frames...`);

  for (let i = 0; i < FRAMES; i++) {
    await page.screenshot({
      path: path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`),
      omitBackground: true
    });
    await new Promise(r => setTimeout(r, Math.round(1000 / FPS)));
    if (i % 24 === 0) console.log(`  ${i}/${FRAMES}`);
  }

  await browser.close();
  console.log(`Done. ${FRAMES} frames in ${framesDir}/`);
})();
