// capture-reel60.mjs — drives the LIVE, redesigned "glass" Textify and records a smooth 60fps demo reel.
//
// It walks the exact showcase flow of the redesign-glass UI against the public deployment:
//   1. the Retrieve workspace (02 · Retrieve) in its locked, private state,
//   2. the ⌘K command palette,
//   3. the numbered Index screen (01 · Index),
//   4. the access-code unlock, and
//   5. the Ask → answer-with-evidence flow (question → cited answer → source excerpt panel).
//
// HONESTY NOTE — the live workspace is a PRIVATE, single-user index gated by a secret
// `TEXTIFY_ACCESS_CODE` that is deliberately never stored anywhere retrievable (see MEMORY.md's
// sensitive-data rule), and every wrong code returns 401. So the two PRIVATE endpoints
// (`GET /api/documents` and `POST /api/ask`) are fulfilled here with a small, REPRESENTATIVE demo
// workspace so the answer-with-evidence beat renders. Everything you see — the glass shell, the
// command palette, the unlock state machine, the chunk→semantic→cited pipeline rendering and the
// citation detail panel — is the real shipped frontend served live; only the private document
// payloads are seeded, and their evidence sentences are drawn verbatim from a real source document
// (tools/demo-assets/antikythera-mechanism.txt). Set TEXTIFY_ACCESS_CODE + TEXTIFY_LIVE_DATA=1 to
// instead drive a real unlocked workspace with no seeding.
//
// Run:  node tools/capture-reel60.mjs
//       TEXTIFY_URL=http://127.0.0.1:8000 node tools/capture-reel60.mjs      (against a local server)
//       FFMPEG=/path/to/ffmpeg node tools/capture-reel60.mjs                 (if ffmpeg is not on PATH)
//
// Output: docs/media/textify-reel.mp4  (H.264, ~1280px wide, 60fps via minterpolate)
//         docs/media/textify-demo.gif  (looping, ~900px wide, for the README)

import { chromium } from 'playwright';
import { mkdirSync, statSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MEDIA = join(ROOT, 'docs', 'media');
const BASE = (process.env.TEXTIFY_URL ?? 'https://textify-abheet19.fly.dev').replace(/\/$/, '');
const VIEWPORT = { width: 1280, height: 800 };
const DSF = 2;
const MP4 = join(MEDIA, 'textify-reel.mp4');
const GIF = join(MEDIA, 'textify-demo.gif');
const LIVE_DATA = process.env.TEXTIFY_LIVE_DATA === '1';
const ACCESS_CODE = process.env.TEXTIFY_ACCESS_CODE || 'textify-demo-2026';

mkdirSync(MEDIA, { recursive: true });

/** Find an ffmpeg binary. Prefers $FFMPEG, then PATH, then the known winget install path. */
function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    /* not on PATH */
  }
  const winget =
    'C:/Users/abhee/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin/ffmpeg.exe';
  if (existsSync(winget)) return winget;
  throw new Error('ffmpeg not found — set $FFMPEG to its full path.');
}

/* ---- representative demo workspace (only used when not driving real live data) -------------- */
const DOC_ID = '3f2b7a10-8c4e-4d1a-9b6f-2e5c9a7d0e11';
const DEMO_DOCS = [
  { id: DOC_ID, name: 'antikythera-mechanism.pdf', chunks: 22 },
  { id: 'a91c4d55-2f8b-47e0-8c3a-6d1f9b2e4a70', name: 'privacy-boundary-spec.docx', chunks: 14 },
];
const DEMO_ANSWER = {
  answer:
    'The mechanism predicted eclipses with the Saros dial on its back face — a pointer geared to ' +
    'the eighteen-year cycle that governs when eclipses repeat [S1]. Foretelling eclipse dates was ' +
    'one of its core purposes, alongside placing the sun, moon, and planets on any chosen date [S2]. ' +
    'Turning the hand crank advanced the date and drove at least thirty bronze gears across the ' +
    'dials [S4], and the engraved inscriptions even recorded the colours and sizes attributed to ' +
    'each predicted eclipse [S3].',
  generation_mode: 'grounded-openai',
  citations: [
    {
      source: 'S1',
      chunk: 3,
      text: 'The Metonic dial on the back is a five-turn spiral tracking the nineteen-year cycle over which lunar months realign with solar years, and the Saros dial beside it tracks the eighteen-year cycle that governs the repetition of eclipses.',
    },
    {
      source: 'S2',
      chunk: 2,
      text: 'Its job was to predict where the sun, the moon, and very probably the five planets known to antiquity would sit in the sky on any date the user chose, and to say when eclipses would fall.',
    },
    {
      source: 'S3',
      chunk: 6,
      text: 'The inscriptions name the dials, describe what each pointer shows, and record the colours and sizes attributed to eclipses. They confirm that the device was meant to be read by someone who was not its maker.',
    },
    {
      source: 'S4',
      chunk: 3,
      text: 'Turning the crank advanced a date, and a train of at least thirty interlocking bronze gears drove pointers across dials on the front and back faces.',
    },
  ],
};

/** Seed only the two PRIVATE endpoints; everything else loads from the live deployment. */
async function seedPrivateWorkspace(context) {
  await context.route('**/api/documents', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(DEMO_DOCS),
      });
    }
    return route.continue();
  });
  await context.route('**/api/ask', async (route) => {
    await sleep(650); // let the "Retrieving supported evidence…" beat breathe
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DEMO_ANSWER),
    });
  });
}

async function main() {
  const ffmpeg = findFfmpeg();
  console.log(`Textify 60fps reel → ${BASE}  (ffmpeg: ${ffmpeg}, mode: ${LIVE_DATA ? 'live-data' : 'seeded-demo'})`);

  const tmp = mkdtempSync(join(tmpdir(), 'textify-reel-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DSF,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    recordVideo: { dir: tmp, size: VIEWPORT },
  });
  if (!LIVE_DATA) await seedPrivateWorkspace(context);

  const t0 = Date.now();
  const page = await context.newPage();

  // Wake the scale-to-zero Fly machine and warm the CSS/font cache before recording anything real.
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('#app', { timeout: 30_000 });
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
      localStorage.setItem('textify-theme', 'dark');
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#askLockCard', { timeout: 30_000 });
  await sleep(900);

  const tStart = Date.now(); // interesting motion starts here

  // --- 1. Retrieve workspace, locked/private -------------------------------------------------
  await page.waitForSelector('.topbar-title');
  await sleep(1400);

  // --- 2. Command palette --------------------------------------------------------------------
  await page.locator('#cmdkTrigger').click();
  await page.waitForSelector('#cmdkOverlay:not([hidden])', { timeout: 5000 });
  await sleep(900);
  await page.locator('#cmdkInput').type('unlock', { delay: 85 });
  await sleep(1100);
  await page.locator('#cmdkInput').fill('');
  await page.locator('#cmdkInput').type('source', { delay: 85 });
  await sleep(1000);
  await page.keyboard.press('Escape');
  await sleep(600);

  // --- 3. Numbered Index screen (01 · Index) -------------------------------------------------
  await page.locator('.rail-btn[data-nav="sources"]').click();
  await page.waitForFunction(() => document.querySelector('#topbarEyebrow')?.textContent.includes('01'));
  await sleep(1400);
  await page.locator('#dropzone').hover({ force: true }).catch(() => {});
  await sleep(1100);

  // --- 4. Access-code unlock -----------------------------------------------------------------
  await page.locator('.rail-btn[data-nav="ask"]').click();
  await sleep(500);
  const code = page.locator('#access-code');
  await code.click();
  await code.type(ACCESS_CODE, { delay: 90 });
  await sleep(500);
  await page.locator('#askLockUnlock').click();
  await page.waitForSelector('#sourceList .source-item', { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector('#lockChipText')?.textContent.trim() === 'Unlocked');
  await sleep(1200);

  // --- 5. Ask → answer-with-evidence ---------------------------------------------------------
  await page.locator('#sourceList .source-item').first().click();
  await sleep(500);
  const composer = page.locator('#composerInput');
  await composer.click();
  await composer.type('How did the Antikythera mechanism predict eclipses?', { delay: 32 });
  await sleep(900);
  await page.locator('#askBtn').click();
  await page.waitForSelector('.answer-card', { timeout: 20_000 });
  // wait for the real answer (not the "Retrieving…" placeholder)
  await page.waitForFunction(
    () => {
      const cards = document.querySelectorAll('.answer-card p');
      const last = cards[cards.length - 1];
      return last && !last.textContent.includes('Retrieving');
    },
    { timeout: 20_000 },
  );
  await sleep(1600);

  // --- 6. Open a citation → source excerpt panel (the answer-with-evidence money shot) --------
  const cite = page.locator('.cite').first();
  if (await cite.count()) {
    await cite.click();
    await page.waitForFunction(() => document.querySelector('#askGrid')?.classList.contains('detail-open'), {
      timeout: 8000,
    });
    await sleep(2000);
  }

  const tEnd = Date.now();
  const video = page.video();
  await context.close(); // flush the .webm
  await browser.close();
  const webm = await video.path();

  const trimStart = Math.max(0, (tStart - t0) / 1000 - 0.3);
  const duration = (tEnd - tStart) / 1000 + 0.5;
  console.log(`  webm ${webm} — trim from ${trimStart.toFixed(2)}s for ${duration.toFixed(2)}s`);

  // --- MP4: smooth 60fps via motion interpolation, H.264, ~1280px ----------------------------
  const mp4Filter =
    "minterpolate='fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',scale=1280:-2:flags=lanczos,format=yuv420p";
  const mp4Args = [
    '-y', '-ss', trimStart.toFixed(2), '-t', duration.toFixed(2), '-i', webm,
    '-vf', mp4Filter, '-r', '60',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', MP4,
  ];
  console.log('  ffmpeg → mp4 (minterpolate fps=60)…');
  let r = spawnSync(ffmpeg, mp4Args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg (mp4) exited ${r.status}`);

  // --- GIF: looping, smaller, generated palette ----------------------------------------------
  const gifFilter =
    'fps=20,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3';
  const gifArgs = [
    '-y', '-ss', trimStart.toFixed(2), '-t', duration.toFixed(2), '-i', webm,
    '-filter_complex', gifFilter, '-loop', '0', GIF,
  ];
  console.log('  ffmpeg → gif…');
  r = spawnSync(ffmpeg, gifArgs, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg (gif) exited ${r.status}`);

  rmSync(tmp, { recursive: true, force: true });
  const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(2);
  console.log(`  wrote ${MP4} (${mb(MP4)} MB) and ${GIF} (${mb(GIF)} MB)`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
