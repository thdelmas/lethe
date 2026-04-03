/**
 * Record all animation × mood sprite sheets for the 2D tier.
 * Usage: node record-all-sprites.js
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const FPS = 15;
const FRAME_SIZE = 320;
const BASE_URL = 'http://localhost:9999/record-preview.html';
const OUT_DIR = path.join(__dirname);

// Animations to record — key ones for LETHE launcher
const anims = [
  { idx: 24, name: 'idle',           dur: 6,   speed: 1.0 },
  { idx: 52, name: 'standing_relax', dur: 9,   speed: 1.0 },
  { idx: 37, name: 'agree',          dur: 4,   speed: 1.0 },
  { idx: 19, name: 'afraid',         dur: 3,   speed: 1.0 },
  { idx: 14, name: 'angry_01',       dur: 4,   speed: 1.0 },
  { idx: 53, name: 'angry_02',       dur: 3,   speed: 1.0 },
  { idx: 57, name: 'bow',            dur: 6,   speed: 1.0 },
  { idx: 8,  name: 'clap',           dur: 4,   speed: 1.0 },
  { idx: 42, name: 'cry',            dur: 4,   speed: 1.0 },
  { idx: 27, name: 'depressed',      dur: 3,   speed: 1.0 },
  { idx: 29, name: 'frightened',     dur: 3,   speed: 1.0 },
  { idx: 40, name: 'fold_arms',      dur: 10,  speed: 1.0 },
  { idx: 43, name: 'greet_01',       dur: 4,   speed: 1.0 },
  { idx: 44, name: 'greet_02',       dur: 4,   speed: 1.0 },
  { idx: 33, name: 'hug',            dur: 3,   speed: 1.0 },
  { idx: 38, name: 'laugh_02',       dur: 6,   speed: 1.0 },
  { idx: 10, name: 'walk',           dur: 5,   speed: 1.0 },
  { idx: 54, name: 'run',            dur: 4,   speed: 1.0 },
  { idx: 39, name: 'swagger',        dur: 4,   speed: 1.0 },
  { idx: 4,  name: 'sit',            dur: 7,   speed: 1.0 },
  { idx: 3,  name: 'warm_up',        dur: 9,   speed: 1.0 },
  { idx: 50, name: 'defeat',         dur: 8,   speed: 1.0 },
  { idx: 9,  name: 'fall',           dur: 2,   speed: 1.0 },
  { idx: 23, name: 'jump',           dur: 6,   speed: 1.0 },
  { idx: 55, name: 'make_a_call_01', dur: 4,   speed: 1.0 },
  // Dances — with camera orbit
  { idx: 7,  name: 'dance_01',       dur: 7,   speed: 1.0, orbit: true },
  { idx: 25, name: 'dance_02',       dur: 8,   speed: 1.0, orbit: true },
  { idx: 26, name: 'dance_03',       dur: 8,   speed: 1.0, orbit: true },
  { idx: 30, name: 'dance_06',       dur: 8,   speed: 1.0, orbit: true },
];

const moods = ['green', 'blue', 'yellow', 'red'];

(async () => {
  const total = anims.length * moods.length;
  let done = 0;

  for (const mood of moods) {
    for (const anim of anims) {
      const frames = Math.ceil(FPS * anim.dur);
      const framesDir = `/tmp/sprites-${anim.name}-${mood}`;

      fs.mkdirSync(framesDir, { recursive: true });
      try { fs.readdirSync(framesDir).forEach(f => fs.unlinkSync(path.join(framesDir, f))); } catch(e) {}

      let url = `${BASE_URL}?anim=${anim.idx}&speed=${anim.speed}&mood=${mood}`;
      if (anim.orbit) url += '&orbit=1&orbitSpeed=0.3';

      const browser = await puppeteer.launch({
        headless: 'new',
        protocolTimeout: 600000,
        args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 480, height: 480, deviceScaleFactor: 2 });
      await page.goto(url, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window._modelLoaded === true, { timeout: 120000 });
      await new Promise(r => setTimeout(r, 2000));

      for (let i = 0; i < frames; i++) {
        await page.screenshot({
          path: path.join(framesDir, `f${String(i).padStart(4, '0')}.png`),
          omitBackground: true
        });
        await new Promise(r => setTimeout(r, Math.round(1000 / FPS)));
      }
      await browser.close();

      // Build sprite sheet
      const spritePath = path.join(OUT_DIR, `mascot-${anim.name}-${mood}.sprite.png`);
      fs.writeFileSync('/tmp/sprite_build.py', `
import sys
from PIL import Image
import os
d = sys.argv[1]
out = sys.argv[2]
size = int(sys.argv[3])
fs = sorted([f for f in os.listdir(d) if f.endswith('.png')])
if len(fs) > 1: fs = fs[:-1]
imgs = [Image.open(os.path.join(d,f)).convert('RGBA').resize((size,size),Image.LANCZOS) for f in fs]
sheet = Image.new('RGBA', (size, size*len(imgs)), (0,0,0,0))
for i,img in enumerate(imgs): sheet.paste(img, (0, i*size))
sheet.save(out, optimize=True)
print(f'{os.path.basename(out)}: {len(imgs)} frames, {os.path.getsize(out):,} bytes')
`);
      execSync(`python3 /tmp/sprite_build.py "${framesDir}" "${spritePath}" ${FRAME_SIZE}`, { stdio: 'inherit' });

      done++;
      console.log(`[${done}/${total}] ${anim.name}-${mood} done`);
    }
  }
  console.log(`\nAll ${total} sprite sheets recorded!`);
})();
