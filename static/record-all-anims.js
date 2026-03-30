const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const WIDTH = 360;
const HEIGHT = 480;
const FPS = 15;

// Animation index → name mapping + duration (from GLB inspection)
const ANIMS = [
  { idx: 0, name: 'intro',     dur: 5.71 },
  { idx: 1, name: 'nod',       dur: 2.58 },
  { idx: 2, name: 'idle',      dur: 18.29 },
  { idx: 3, name: 'thinking',  dur: 15.38 },
  { idx: 4, name: 'alert',     dur: 2.17 },
  { idx: 5, name: 'listening', dur: 3.58 },
  { idx: 6, name: 'speaking',  dur: 6.00 },
  { idx: 7, name: 'confirm',   dur: 2.38 },
  { idx: 8, name: 'deny',      dur: 3.50 },
  { idx: 9, name: 'wave',      dur: 4.46 },
  { idx: 10, name: 'sleep',    dur: 3.88 },
  { idx: 11, name: 'wake',     dur: 4.00 },
];

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

  for (const anim of ANIMS) {
    const frames = Math.ceil(FPS * anim.dur);
    const framesDir = path.join(__dirname, '_frames');
    if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true });
    fs.mkdirSync(framesDir);

    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });

    console.log(`\n[${anim.name}] Loading anim ${anim.idx} (${anim.dur}s, ${frames} frames)...`);
    await page.goto(`http://localhost:9999/record-preview.html?anim=${anim.idx}`, {
      waitUntil: 'networkidle0', timeout: 60000
    });
    await page.waitForFunction(() => window._modelLoaded === true, { timeout: 60000 });
    await new Promise(r => setTimeout(r, 1000));

    for (let i = 0; i < frames; i++) {
      await page.screenshot({
        path: path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`),
        omitBackground: true
      });
      await new Promise(r => setTimeout(r, Math.round(1000 / FPS)));
    }

    await page.close();

    // Convert to WebP with Python
    console.log(`[${anim.name}] Converting ${frames} frames to WebP...`);
    execSync(`python3 -c "
from PIL import Image
import os
d='/home/mia/OSmosis/lethe/static/_frames'
fs=sorted([f for f in os.listdir(d) if f.endswith('.png')])
imgs=[Image.open(os.path.join(d,f)).convert('RGBA').resize((360,480),Image.LANCZOS) for f in fs]
imgs[0].save('/home/mia/OSmosis/lethe/static/mascot-${anim.name}.webp',
  save_all=True,append_images=imgs[1:],duration=${Math.round(1000/FPS)},loop=0,quality=70)
sz=os.path.getsize('/home/mia/OSmosis/lethe/static/mascot-${anim.name}.webp')
print(f'${anim.name}: {sz:,} bytes, {len(imgs)} frames')
"`, { stdio: 'inherit' });
  }

  await browser.close();
  console.log('\nAll done!');
})();
