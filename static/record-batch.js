const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:9999/record-video-test.html';
const OUT_DIR = path.join(__dirname);

// Animations to record with fade in/out from idle
const anims = [
  { idx: 24, name: 'idle',       dur: 20, speed: 0.3 },
  { idx: 52, name: 'thinking',   dur: 12, speed: 0.5 },
  { idx: 10, name: 'walk',       dur: 10, speed: 0.5 },
  { idx: 54, name: 'run',        dur: 8,  speed: 0.5 },
  { idx: 59, name: 'swim',       dur: 12, speed: 0.5 },
  { idx: 3,  name: 'warm_up',    dur: 12, speed: 0.5 },
  { idx: 7,  name: 'dance_01',   dur: 12, speed: 0.5 },
  { idx: 25, name: 'dance_02',   dur: 12, speed: 0.5 },
  { idx: 26, name: 'dance_03',   dur: 12, speed: 0.5 },
  { idx: 30, name: 'dance_06',   dur: 12, speed: 0.5 },
  { idx: 31, name: 'pushup',     dur: 12, speed: 0.5 },
  { idx: 37, name: 'agree',      dur: 8,  speed: 0.5 },
  { idx: 19, name: 'afraid',     dur: 8,  speed: 0.5 },
  { idx: 29, name: 'frightened', dur: 8,  speed: 0.5 },
  { idx: 40, name: 'fold_arms',  dur: 12, speed: 0.5 },
];

const moods = ['green', 'blue', 'yellow', 'red'];

(async () => {
  const total = anims.length * moods.length;
  let done = 0;

  for (const mood of moods) {
    for (const anim of anims) {
      const outFile = path.join(OUT_DIR, `mascot-${anim.name}-${mood}.webm`);

      const browser = await puppeteer.launch({
        headless: 'new',
        protocolTimeout: 600000,
        args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 480, height: 480, deviceScaleFactor: 1 });

      const url = `${BASE_URL}?anim=${anim.idx}&speed=${anim.speed}&mood=${mood}&dur=${anim.dur}`;
      await page.goto(url, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window._ready === true, { timeout: 120000 });
      await new Promise(r => setTimeout(r, 3000));

      const dur = anim.dur * 1000;
      const videoData = await page.evaluate(async (recordMs) => {
        var canvas = document.querySelector('canvas');
        var stream = canvas.captureStream(24);
        var recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 4000000
        });
        var chunks = [];
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        return new Promise((resolve) => {
          recorder.onstop = async () => {
            var blob = new Blob(chunks, { type: 'video/webm' });
            var buf = await blob.arrayBuffer();
            resolve(Array.from(new Uint8Array(buf)));
          };
          recorder.start(1000);
          setTimeout(() => recorder.stop(), recordMs);
        });
      }, dur);

      fs.writeFileSync(outFile, Buffer.from(videoData));
      await browser.close();

      done++;
      const sizeMB = (videoData.length / 1024 / 1024).toFixed(1);
      console.log(`[${done}/${total}] ${anim.name}-${mood}: ${sizeMB}MB`);
    }
  }
  console.log(`\nAll ${total} videos recorded!`);
})();
