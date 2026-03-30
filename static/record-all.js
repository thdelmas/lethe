const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const FPS = 15;

const ANIMS = [
  { idx: 0, name: 'intro',     dur: 5.71,  glow: false },
  { idx: 1, name: 'nod',       dur: 2.58,  glow: false },
  { idx: 2, name: 'idle',      dur: 18.29, glow: false },
  { idx: 3, name: 'thinking',  dur: 15.38, glow: true  },
  { idx: 4, name: 'alert',     dur: 2.17,  glow: true  },
  { idx: 5, name: 'listening', dur: 3.58,  glow: true  },
  { idx: 6, name: 'speaking',  dur: 6.00,  glow: true  },
  { idx: 7, name: 'confirm',   dur: 2.38,  glow: false },
  { idx: 8, name: 'deny',      dur: 3.50,  glow: false },
  { idx: 9, name: 'wave',      dur: 4.46,  glow: false },
  { idx: 10, name: 'sleep',    dur: 3.88,  glow: false },
  { idx: 11, name: 'wake',     dur: 4.00,  glow: false },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });

  for (const anim of ANIMS) {
    const frames = Math.ceil(FPS * anim.dur);
    const glowParam = anim.glow ? '&glow=1' : '';
    const url = `http://localhost:9999/record-preview.html?anim=${anim.idx}${glowParam}`;

    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 480, deviceScaleFactor: 2 });

    console.log(`\n[${anim.name}] ${frames} frames, glow=${anim.glow}`);
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window._modelLoaded === true, { timeout: 120000 });
    await new Promise(r => setTimeout(r, 2000));

    execSync('rm -rf /tmp/anim-frames && mkdir /tmp/anim-frames');

    for (let i = 0; i < frames; i++) {
      await page.screenshot({
        path: `/tmp/anim-frames/frame_${String(i).padStart(4, '0')}.png`,
        omitBackground: true
      });
      await new Promise(r => setTimeout(r, Math.round(1000 / FPS)));
      if (i % 30 === 0) process.stdout.write(`  ${i}/${frames}\r`);
    }

    await page.close();

    console.log(`[${anim.name}] Encoding WebP...`);
    execSync(`python3 /tmp/encode-webp.py ${anim.name}`, { stdio: 'inherit', cwd: '/tmp' });
  }

  await browser.close();
  console.log('\nAll animations recorded!');
})();
