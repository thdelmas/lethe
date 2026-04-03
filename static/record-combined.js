/**
 * Records a combined video: idle_pingpong → anim → idle_pingpong
 * with crossfades baked in, frame-perfect loop, encoded at 12fps.
 *
 * Usage: node record-combined.js <animIdx> <animSpeed> <mood> <animDuration>
 * Example: node record-combined.js 10 0.75 green 8
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CAPTURE_FPS = 24;
const ENCODE_FPS = 12;
const IDLE_IDX = 24;
const IDLE_SPEED = 0.5;
const IDLE_DURATION = 24; // one full pingpong cycle at 0.5x
const CROSSFADE = 0.5;

const animIdx = parseInt(process.argv[2] || '10');
const animSpeed = parseFloat(process.argv[3] || '0.75');
const mood = process.argv[4] || 'green';
const animDuration = parseFloat(process.argv[5] || '8');

const BASE_URL = 'http://localhost:9999/record-video-test.html';
const FRAMES_DIR = '/tmp/record-combined-frames';
const OUT_DIR = path.join(__dirname);

(async () => {
  // Clean frames dir
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  try { fs.readdirSync(FRAMES_DIR).forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f))); } catch(e) {}

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 480, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}?anim=${IDLE_IDX}&speed=${IDLE_SPEED}&mood=${mood}&pingpong=1`, {
    waitUntil: 'load', timeout: 120000
  });
  await page.waitForFunction(() => window._ready === true, { timeout: 120000 });
  await new Promise(r => setTimeout(r, 2000));

  // Reset idle to time 0
  await page.evaluate(() => {
    window._currentAction.time = 0;
    window._mixer.update(0);
  });
  await new Promise(r => setTimeout(r, 100));

  let totalFrames = 0;

  async function captureFrames(seconds) {
    const count = Math.round(seconds * CAPTURE_FPS);
    for (let i = 0; i < count; i++) {
      await page.screenshot({
        path: path.join(FRAMES_DIR, 'f' + String(totalFrames).padStart(5, '0') + '.png'),
        omitBackground: false
      });
      await new Promise(r => setTimeout(r, Math.round(1000 / CAPTURE_FPS)));
      totalFrames++;
      if (totalFrames % 100 === 0) process.stdout.write(totalFrames + ' ');
    }
  }

  console.log(`Recording: idle(${IDLE_DURATION}s) → anim#${animIdx}(${animDuration}s) → idle(${IDLE_DURATION}s)`);
  console.log(`Speed: idle=${IDLE_SPEED}x, anim=${animSpeed}x, mood=${mood}`);

  // Phase 1: Idle pingpong
  await captureFrames(IDLE_DURATION);
  console.log('\n→ switching to animation');

  // Phase 2: Crossfade to animation
  await page.evaluate((idx, speed, idleSpeed) => {
    var action = window._mixer.clipAction(window._anims[idx]);
    action.reset().fadeIn(0.5).setLoop(THREE.LoopRepeat).play();
    action.timeScale = speed / idleSpeed;
    window._currentAction.fadeOut(0.5);
    window._currentAction = action;
  }, animIdx, animSpeed, IDLE_SPEED);
  await captureFrames(animDuration);
  console.log('\n→ switching back to idle');

  // Phase 3: Crossfade back to idle pingpong
  await page.evaluate(() => {
    var action = window._mixer.clipAction(window._anims[24]);
    action.reset();
    action.time = 0;
    action.setLoop(THREE.LoopPingPong);
    action.fadeIn(0.5).play();
    window._currentAction.fadeOut(0.5);
    window._currentAction = action;
  });
  await captureFrames(IDLE_DURATION);

  console.log('\nTotal frames: ' + totalFrames);

  // Replace last frame with first for seamless loop
  const firstFrame = path.join(FRAMES_DIR, 'f00000.png');
  const lastFrame = path.join(FRAMES_DIR, 'f' + String(totalFrames - 1).padStart(5, '0') + '.png');
  fs.copyFileSync(firstFrame, lastFrame);
  console.log('Last frame replaced with first');

  await browser.close();

  // Encode to WebM via browser canvas
  console.log('Encoding ' + totalFrames + ' frames at ' + ENCODE_FPS + 'fps...');

  // Update symlink and encoder
  const symlinkPath = path.join(__dirname, 'idle-frames');
  try { fs.unlinkSync(symlinkPath); } catch(e) {}
  fs.symlinkSync(FRAMES_DIR, symlinkPath);

  // Update encode-webm.html frame count and FPS
  let encodeHtml = fs.readFileSync(path.join(__dirname, 'encode-webm.html'), 'utf8');
  encodeHtml = encodeHtml.replace(/var FPS = \d+/, 'var FPS = ' + ENCODE_FPS);
  encodeHtml = encodeHtml.replace(/var FRAMES = \d+/, 'var FRAMES = ' + totalFrames);
  fs.writeFileSync(path.join(__dirname, 'encode-webm.html'), encodeHtml);

  const browser2 = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page2 = await browser2.newPage();
  await page2.setViewport({ width: 480, height: 480 });
  await page2.goto('http://localhost:9999/encode-webm.html', { waitUntil: 'load', timeout: 60000 });
  await page2.waitForFunction(() => window._done === true, { timeout: 600000 });
  const videoData = await page2.evaluate(() => window._videoData);

  // Get animation name from the GLB
  const outName = 'mascot-anim' + animIdx + '-' + mood + '.webm';
  fs.writeFileSync(path.join(OUT_DIR, outName), Buffer.from(videoData));
  console.log('Saved: ' + outName + ' (' + (videoData.length / 1024 / 1024).toFixed(1) + 'MB)');

  await browser2.close();
})();
