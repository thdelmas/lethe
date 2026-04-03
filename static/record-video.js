#!/usr/bin/env node
/**
 * Record a single animation video (raw, no bookends — crossfade handles transitions).
 *
 * Usage:
 *   node record-video.js <animIdx> <speed> <mood> <duration> <outName> [--idle]
 *
 * Examples:
 *   node record-video.js 24 0.1 green 4 mascot-idle-green.webm --idle
 *   node record-video.js 10 0.75 blue 8 mascot-walk-blue.webm
 *   node record-video.js 54 0.75 red 6 mascot-run-red.webm
 *
 * Batch:
 *   node record-video.js --batch
 *
 * Config at top of file.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CAPTURE_FPS = 24;
const ENCODE_FPS = 16;
const NEUTRAL_WEIGHT = 0.95; // idle weight for idle recordings
const BASE_URL = 'http://localhost:9999/record-video-test.html';
const OUT_DIR = __dirname;

// Batch config — all animations to record
const BATCH = [
  { idx: 24, speed: 0.1,  mood: 'green',  dur: 4,  out: 'mascot-idle-green.webm',    idle: true },
  { idx: 24, speed: 0.1,  mood: 'blue',   dur: 4,  out: 'mascot-idle-blue.webm',     idle: true },
  { idx: 24, speed: 0.1,  mood: 'yellow', dur: 4,  out: 'mascot-idle-yellow.webm',   idle: true },
  { idx: 24, speed: 0.1,  mood: 'red',    dur: 4,  out: 'mascot-idle-red.webm',      idle: true },
  { idx: 52, speed: 0.5,  mood: 'green',  dur: 6,  out: 'mascot-thinking-green.webm' },
  { idx: 10, speed: 0.75, mood: 'blue',   dur: 8,  out: 'mascot-walk-blue.webm' },
  { idx: 54, speed: 0.75, mood: 'red',    dur: 6,  out: 'mascot-run-red.webm' },
  { idx: 59, speed: 0.5,  mood: 'blue',   dur: 8,  out: 'mascot-swim-blue.webm' },
  { idx: 3,  speed: 0.5,  mood: 'green',  dur: 8,  out: 'mascot-warmup-green.webm' },
  { idx: 7,  speed: 0.5,  mood: 'green',  dur: 8,  out: 'mascot-dance01-green.webm' },
  { idx: 25, speed: 0.5,  mood: 'green',  dur: 8,  out: 'mascot-dance02-green.webm' },
  { idx: 26, speed: 0.5,  mood: 'green',  dur: 8,  out: 'mascot-dance03-green.webm' },
  { idx: 30, speed: 0.5,  mood: 'green',  dur: 8,  out: 'mascot-dance06-green.webm' },
  { idx: 31, speed: 0.5,  mood: 'blue',   dur: 8,  out: 'mascot-pushup-blue.webm' },
  { idx: 37, speed: 0.75, mood: 'green',  dur: 6,  out: 'mascot-agree-green.webm' },
  { idx: 19, speed: 0.75, mood: 'yellow', dur: 6,  out: 'mascot-afraid-yellow.webm' },
  { idx: 29, speed: 0.75, mood: 'yellow', dur: 6,  out: 'mascot-frightened-yellow.webm' },
  { idx: 40, speed: 0.5,  mood: 'red',    dur: 8,  out: 'mascot-foldarms-red.webm' },
];

async function recordOne(animIdx, speed, mood, duration, outName, isIdle) {
  const dirName = outName.replace('.webm', '').replace(/[^a-z0-9-]/g, '-');
  const dir = path.join('/tmp', 'rec-' + dirName);
  fs.mkdirSync(dir, { recursive: true });
  try { fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f))); } catch(e) {}

  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 480, deviceScaleFactor: 1 });
  await page.goto(BASE_URL + '?anim=24&speed=0.1&mood=' + mood + '&pingpong=1', {
    waitUntil: 'load', timeout: 120000
  });
  await page.waitForFunction(() => window._ready === true, { timeout: 120000 });
  await new Promise(r => setTimeout(r, 2000));

  let total = 0;
  async function capture(seconds) {
    const count = Math.round(seconds * CAPTURE_FPS);
    for (let i = 0; i < count; i++) {
      await page.screenshot({
        path: path.join(dir, 'f' + String(total).padStart(5, '0') + '.png'),
        omitBackground: false
      });
      await new Promise(r => setTimeout(r, Math.round(1000 / CAPTURE_FPS)));
      total++;
    }
  }

  // Start animation directly — no neutral bookends
  // The canvas crossfade in launcher.js handles transitions
  if (isIdle) {
    await page.evaluate((w) => {
      window._currentAction.setEffectiveWeight(w);
      window._currentAction.setLoop(THREE.LoopPingPong);
    }, NEUTRAL_WEIGHT);
  } else {
    await page.evaluate((idx, spd) => {
      var a = window._mixer.clipAction(window._anims[idx]);
      a.reset().setLoop(THREE.LoopRepeat).play();
      a.timeScale = spd / 0.1;
      window._currentAction.stop();
      window._currentAction = a;
    }, animIdx, speed);
    // Let animation settle for 1 frame before capturing
    await new Promise(r => setTimeout(r, 100));
  }
  await capture(duration);

  // Frame-perfect loop: first = last
  fs.copyFileSync(
    path.join(dir, 'f00000.png'),
    path.join(dir, 'f' + String(total - 1).padStart(5, '0') + '.png')
  );

  await browser.close();

  // Encode
  const symlinkPath = path.join(__dirname, 'idle-frames');
  try { fs.unlinkSync(symlinkPath); } catch(e) {}
  fs.symlinkSync(dir, symlinkPath);
  let html = fs.readFileSync(path.join(__dirname, 'encode-webm.html'), 'utf8');
  html = html.replace(/var FPS = \d+/, 'var FPS = ' + ENCODE_FPS);
  html = html.replace(/var FRAMES = \d+/, 'var FRAMES = ' + total);
  fs.writeFileSync(path.join(__dirname, 'encode-webm.html'), html);

  const browser2 = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page2 = await browser2.newPage();
  await page2.setViewport({ width: 480, height: 480 });
  await page2.goto('http://localhost:9999/encode-webm.html', { waitUntil: 'load', timeout: 60000 });
  await page2.waitForFunction(() => window._done === true, { timeout: 600000 });
  const data = await page2.evaluate(() => window._videoData);
  const outPath = path.join(OUT_DIR, outName);
  fs.writeFileSync(outPath, Buffer.from(data));
  await browser2.close();

  const sizeMB = (data.length / 1024 / 1024).toFixed(1);
  console.log(`  ${outName}: ${total} frames → ${sizeMB}MB`);
  return outPath;
}

(async () => {
  const args = process.argv.slice(2);

  if (args[0] === '--batch') {
    console.log(`Recording ${BATCH.length} videos...`);
    for (let i = 0; i < BATCH.length; i++) {
      const b = BATCH[i];
      console.log(`[${i + 1}/${BATCH.length}] ${b.out}`);
      await recordOne(b.idx, b.speed, b.mood, b.dur, b.out, !!b.idle);
    }
    console.log('All done!');
  } else if (args.length >= 5) {
    const animIdx = parseInt(args[0]);
    const speed = parseFloat(args[1]);
    const mood = args[2];
    const duration = parseFloat(args[3]);
    const outName = args[4];
    const isIdle = args.includes('--idle');
    console.log(`Recording ${outName}...`);
    await recordOne(animIdx, speed, mood, duration, outName, isIdle);
    console.log('Done!');
  } else {
    console.log('Usage:');
    console.log('  node record-video.js <animIdx> <speed> <mood> <duration> <outName> [--idle]');
    console.log('  node record-video.js --batch');
  }
})();
